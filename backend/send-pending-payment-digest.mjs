import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import nodemailer from 'nodemailer';
import { brandedEmailHtml, brandedEmailText, publicAppUrl } from './email-layout.mjs';

const RECIPIENTS = Object.freeze([
  'notasfiscais@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
  'adm@viadutodasartes.org.br',
]);
const appUrl = publicAppUrl(process.env.PUBLIC_APP_URL || process.env.APP_URL);
const dryRun = process.argv.includes('--dry-run');
const sendToday = process.argv.includes('--send-today');
const zone = 'America/Sao_Paulo';
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function brasilClock(now = new Date()) {
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false, hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return {
    slot: `${fields.year}-${fields.month}-${fields.day}`,
    label: `${fields.day}/${fields.month}/${fields.year}`,
    weekday: fields.weekday,
    hour: Number(fields.hour),
  };
}

function driveLink(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && url.hostname === 'drive.google.com'
      && /^\/file\/d\/[A-Za-z0-9_-]{10,}/.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}

const query = `SELECT id, nf_numero, COALESCE(NULLIF(nf_emitente_nome,''),NULLIF(fornecedor_nome,''),'Fornecedor a revisar') AS fornecedor,
  descricao_item, nf_data_emissao, drive_backup_nf_pdf_link, nota_fiscal_pdf_url, nota_fiscal_url, nf_pdf_url, arquivo_url,
  CASE WHEN nf_valor_total>0 THEN nf_valor_total WHEN valor_aprovado>0 THEN valor_aprovado
       WHEN valor_total>0 THEN valor_total ELSE COALESCE(valor_solicitado,0) END AS valor
  FROM purchase_requests
  WHERE UPPER(COALESCE(status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','APROVADA')
    AND COALESCE(pago,FALSE)=FALSE
    AND UPPER(COALESCE(status_pagamento,'')) NOT IN ('PAGO','PAGA','PAGAMENTO_CONFIRMADO','CONFIRMADO')
  ORDER BY nf_data_emissao NULLS LAST, created_at, id`;

const steps = [
  'Abra cada solicitação pelo link individual e confirme fornecedor, número da nota, valor e dados de pagamento.',
  'Abra “Nota no Drive” e confira o documento fiscal antes de pagar. Se o backup estiver pendente, consulte o PDF na solicitação e regularize o arquivo.',
  'Depois de efetuar o pagamento, volte à solicitação e anexe o comprovante correspondente.',
  'Registre o pagamento no aplicativo e confirme que o status mudou para “Pago”. A solicitação sairá do próximo compilado.',
];

function itemLinks(row) {
  return {
    purchase: `${appUrl}/Compras?id=${encodeURIComponent(row.id)}`,
    drive: driveLink(row.drive_backup_nf_pdf_link),
  };
}

function itemCards(rows) {
  const cards = rows.map((row, index) => {
    const links = itemLinks(row);
    const nf = String(row.nf_numero || 'sem número').trim();
    const description = String(row.descricao_item || 'Descrição não informada').trim();
    return `<div style="border:1px solid #dbe8e1;border-radius:12px;padding:16px 18px;margin:0 0 12px;background:#fff">
      <div style="font-size:12px;color:#557065;font-weight:700;margin-bottom:5px">PENDÊNCIA ${index + 1}</div>
      <div style="font-size:16px;font-weight:700;color:#172033">NF ${escapeHtml(nf)} · ${escapeHtml(row.fornecedor)}</div>
      <div style="font-size:13px;line-height:1.5;color:#43574d;margin-top:6px">${escapeHtml(description)}</div>
      <div style="font-size:14px;font-weight:700;color:#172033;margin-top:8px">${escapeHtml(money(row.valor))}</div>
      <div style="font-size:13px;margin-top:12px"><a href="${escapeHtml(links.purchase)}" style="color:#176c4e;font-weight:700">Abrir solicitação</a>
      <span style="color:#9caaa2"> · </span>${links.drive
        ? `<a href="${escapeHtml(links.drive)}" style="color:#176c4e;font-weight:700">Nota no Drive</a>`
        : `<span style="color:#9a5a10">Backup da nota no Drive pendente</span>`}</div></div>`;
  }).join('');
  return `<tr><td style="padding:4px 32px 24px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#49705d;margin:0 0 12px">Solicitações abertas</div>${cards}</td></tr>`;
}

function itemText(rows) {
  return rows.map((row, index) => {
    const links = itemLinks(row);
    return `${index + 1}. NF ${row.nf_numero || 'sem número'} — ${row.fornecedor} — ${money(row.valor)}\n` +
      `   ${row.descricao_item || 'Descrição não informada'}\n` +
      `   Solicitação: ${links.purchase}\n` +
      `   Nota no Drive: ${links.drive || 'backup pendente; consulte o PDF na solicitação'}`;
  }).join('\n\n');
}

async function main() {
  const clock = brasilClock();
  if (!dryRun && !sendToday && (['Sat','Sun'].includes(clock.weekday) || clock.hour !== 6)) {
    console.log('PENDING_PAYMENT_DIGEST_SKIPPED', JSON.stringify({ reason:'outside_weekday_06h', slot:clock.slot }));
    return;
  }
  const pool = new pg.Pool({
    host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB || 'appgestor', user: process.env.POSTGRES_USER || 'appgestor',
    password: process.env.POSTGRES_PASSWORD || '',
  });
  const client = await pool.connect();
  let locked = false;
  try {
    if (!dryRun) {
      const { rows:[lock] } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', ['purchase.pending_digest']);
      if (!lock.locked) throw new Error('pending_digest_already_running');
      locked = true;
      const { rows:[previous] } = await client.query(
        `SELECT id,status FROM notification_logs WHERE notification_type='purchase.pending_digest' AND batch_slot=$1 LIMIT 1`,
        [clock.slot],
      );
      if (previous) {
        console.log('PENDING_PAYMENT_DIGEST_SKIPPED', JSON.stringify({ reason:'already_attempted_today', slot:clock.slot, status:previous.status }));
        return;
      }
    }

    let { rows } = await client.query(query);
    if (!dryRun) {
      for (const row of rows.filter((item) => !driveLink(item.drive_backup_nf_pdf_link))) {
        if (!row.nf_numero || !row.nf_data_emissao || !row.fornecedor || Number(row.valor) <= 0) continue;
        const result = spawnSync(process.execPath, ['/app/backup-pending-drive.mjs', `--purchase-id=${row.id}`], {
          cwd:'/app', env:process.env, encoding:'utf8', timeout:90000,
        });
        if (result.status !== 0 || result.error) console.warn('PENDING_PAYMENT_BACKUP_FAILED', row.id, result.error?.message || result.stderr?.slice(-300));
      }
      ({ rows } = await client.query(query));
    }
    const missingDrive = rows.filter((row) => !driveLink(row.drive_backup_nf_pdf_link)).map((row) => row.id);
    if (dryRun) {
      console.log('PENDING_PAYMENT_DIGEST_PREVIEW', JSON.stringify({ slot:clock.slot, pending:rows.length, missingDrive, recipients:RECIPIENTS }));
      return;
    }
    if (!rows.length) {
      console.log('PENDING_PAYMENT_DIGEST_SKIPPED', JSON.stringify({ reason:'no_pending_purchases', slot:clock.slot }));
      return;
    }
    const password = process.env.SMTP_PASS_B64
      ? Buffer.from(process.env.SMTP_PASS_B64, 'base64').toString('utf8') : process.env.SMTP_PASS;
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !password) throw new Error('smtp_not_configured');
    const title = `${rows.length} solicitações aguardando pagamento`;
    const total = rows.reduce((sum,row) => sum + Number(row.valor || 0), 0);
    const intro = `Confira as ${rows.length} solicitações aprovadas ainda abertas em ${clock.label}. Total: ${money(total)}. Após cada pagamento, anexe o comprovante e marque a solicitação como paga no aplicativo.`;
    const message = `${intro}\n\n${itemText(rows)}`;
    const html = brandedEmailHtml({ appUrl, title, greeting:'Olá', message:intro, detailHtml:itemCards(rows),
      steps, ctaLabel:'Abrir todas as solicitações', ctaUrl:`${appUrl}/Compras` });
    const text = brandedEmailText({ greeting:'Olá', message, steps,
      ctaLabel:'Abrir todas as solicitações', ctaUrl:`${appUrl}/Compras` });
    const logId = crypto.randomUUID();
    await client.query(`INSERT INTO notification_logs
      (id,status,notification_type,recipients,sent_at,provider,error_message,batch_slot,item_count)
      VALUES ($1,'PROCESSING','purchase.pending_digest',$2,NOW(),'smtp',NULL,$3,$4)`,
      [logId, JSON.stringify(RECIPIENTS), clock.slot, rows.length]);
    try {
      const transport = nodemailer.createTransport({
        host:process.env.SMTP_HOST, port:Number(process.env.SMTP_PORT || 465),
        secure:String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth:{ user:process.env.SMTP_USER, pass:password },
      });
      const result = await transport.sendMail({
        from:`Gestor Museus Centro <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to:RECIPIENTS.join(', '), subject:`[Museus Centro] ${title} — ${clock.label}`, text, html,
      });
      const accepted = new Set((result.accepted || []).map((email) => String(email).toLowerCase()));
      const rejected = RECIPIENTS.filter((email) => !accepted.has(email));
      const status = rejected.length ? 'PARTIAL' : 'SENT';
      await client.query('UPDATE notification_logs SET status=$1,error_message=$2 WHERE id=$3',
        [status, rejected.length ? `Destinatários recusados: ${rejected.join(', ')}` : missingDrive.length ? `Notas sem link no Drive: ${missingDrive.join(', ')}` : null, logId]);
      console.log('PENDING_PAYMENT_DIGEST_RESULT', JSON.stringify({ status, slot:clock.slot, pending:rows.length,
        recipients:RECIPIENTS, accepted:[...accepted], rejected, missingDrive, messageId:result.messageId }));
      if (rejected.length) process.exitCode = 1;
    } catch (error) {
      await client.query('UPDATE notification_logs SET status=$1,error_message=$2 WHERE id=$3',
        ['FAILED', String(error.message || error), logId]);
      throw error;
    }
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['purchase.pending_digest']);
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error('PENDING_PAYMENT_DIGEST_FAILED', error); process.exitCode = 1; });
