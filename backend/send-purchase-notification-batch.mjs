import pg from 'pg';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { brandedEmailHtml, brandedEmailText, paymentNotificationSteps, publicAppUrl } from './email-layout.mjs';

const { Pool } = pg;
const appUrl = publicAppUrl(process.env.PUBLIC_APP_URL || process.env.APP_URL);
const allPending = process.argv.includes('--all-pending');
const paymentDigest = process.argv.includes('--payment-digest');
const FINANCE_RECIPIENTS = Object.freeze([
  'adm@viadutodasartes.org.br',
  'notasfiscais@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
  'josianeamancio@viadutodasartes.org.br',
  'daniel@periniprojetos.com.br',
]);

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'valor não informado';
}

function smtpTransport() {
  const password = process.env.SMTP_PASS_B64
    ? Buffer.from(process.env.SMTP_PASS_B64, 'base64').toString('utf8')
    : process.env.SMTP_PASS;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: password },
  });
}

async function main() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) throw new Error('smtp_not_configured');
  const pool = new Pool({
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB || 'appgestor',
    user: process.env.POSTGRES_USER || 'appgestor',
    password: process.env.POSTGRES_PASSWORD || '',
  });
  try {
    if (paymentDigest) {
      const { rows } = await pool.query(`
        SELECT id, nf_numero, nf_emitente_nome, descricao_item,
          COALESCE(valor_aprovado_admin, valor_aprovado, valor_final, valor_solicitado, valor_total, valor, 0) AS valor,
          status, status_pagamento, COALESCE(nf_data_emissao, data_nf) AS data_nf
        FROM purchase_requests
        WHERE UPPER(COALESCE(status, '')) IN ('APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADA')
          AND UPPER(COALESCE(status_pagamento, 'AGUARDANDO_PAGAMENTO')) NOT IN ('PAGO', 'PAGAMENTO_CONFIRMADO', 'CONFIRMADO')
        ORDER BY COALESCE(nf_data_emissao, data_nf) NULLS LAST, created_at ASC
      `);
      const lines = rows.map((purchase, index) => {
        const supplier = String(purchase.nf_emitente_nome || 'Fornecedor a revisar').trim();
        const invoice = String(purchase.nf_numero || 'sem NF').trim();
        const description = String(purchase.descricao_item || '').trim();
        const detail = [supplier, `NF ${invoice}`, money(purchase.valor), description].filter(Boolean).join(' — ');
        return `${index + 1}. ${detail}\n   ${appUrl}/Compras?id=${encodeURIComponent(purchase.id)}`;
      });
      const title = rows.length
        ? `${rows.length} solicitação(ões) aguardando pagamento`
        : 'Nenhuma solicitação aguardando pagamento';
      const message = rows.length
        ? `Há solicitações aprovadas pendentes de pagamento. Cada item abaixo possui link direto para a respectiva solicitação:\n\n${lines.join('\n\n')}`
        : 'Não há solicitações aprovadas aguardando pagamento neste momento.';
      const transport = smtpTransport();
      const failures = [];
      let delivered = 0;
      for (const email of FINANCE_RECIPIENTS) {
        try {
          await transport.sendMail({
            from: `Gestor Museus Centro <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: email,
            subject: title,
            text: brandedEmailText({ greeting: 'Olá', message, steps: paymentNotificationSteps, ctaLabel: 'Abrir solicitações pendentes', ctaUrl: `${appUrl}/Compras`, recipientEmail: email }),
            html: brandedEmailHtml({ appUrl, title, greeting: 'Olá', message, steps: paymentNotificationSteps, ctaLabel: 'Abrir solicitações pendentes', ctaUrl: `${appUrl}/Compras`, recipientEmail: email }),
          });
          delivered += 1;
        } catch (error) {
          failures.push(`${email}: ${error.message}`);
        }
      }
      const status = failures.length ? (delivered ? 'PARTIAL' : 'FAILED') : 'SENT';
      await pool.query(`INSERT INTO notification_logs (id,status,notification_type,recipients,sent_at,provider,error_message,batch_slot,item_count)
        VALUES ($1,$2,'purchase.pending_digest',$3,NOW(),'smtp',$4,'morning',$5)`, [
        crypto.randomUUID(), status, JSON.stringify(FINANCE_RECIPIENTS), failures.join(' | ') || null, rows.length,
      ]);
      console.log(JSON.stringify({ status, pending: rows.length, delivered, recipients: FINANCE_RECIPIENTS.length, failures }));
      if (failures.length) process.exitCode = 1;
      return;
    }
    const since = allPending
      ? 'TRUE'
      : "created_at >= (date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')";
    const { rows } = await pool.query(`
      SELECT id, user_email, title, message, action_url, entity_id
      FROM notifications
      WHERE email_sent=FALSE
        AND entity_type='PurchaseRequest'
        AND title='Solicitação pronta para pagamento'
        AND ${since}
      ORDER BY user_email, created_at, id
    `);
    const groups = new Map();
    for (const row of rows) {
      const email = String(row.user_email || '').trim().toLowerCase();
      if (!email) continue;
      const list = groups.get(email) || [];
      list.push(row);
      groups.set(email, list);
    }
    const transport = smtpTransport();
    let sent = 0;
    const failures = [];
    for (const [email, entries] of groups) {
      const count = entries.length;
      const title = count === 1 ? 'Nova solicitação pronta para pagamento' : `${count} novas solicitações prontas para pagamento`;
      const body = entries.map((entry, index) => `${index + 1}. ${entry.message || `Solicitação ${entry.entity_id}`}`).join('\n');
      const ctaUrl = `${appUrl}/Compras`;
      try {
        await transport.sendMail({
          from: `Gestor Museus Centro <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: email,
          subject: title,
          text: brandedEmailText({ greeting: 'Olá', message: body, steps: paymentNotificationSteps, ctaLabel: 'Abrir solicitações', ctaUrl, recipientEmail: email }),
          html: brandedEmailHtml({ appUrl, title, greeting: 'Olá', message: body, steps: paymentNotificationSteps, ctaLabel: 'Abrir solicitações', ctaUrl, recipientEmail: email }),
        });
        await pool.query('UPDATE notifications SET email_sent=TRUE, updated_at=NOW() WHERE id = ANY($1::bigint[])', [entries.map((entry) => entry.id)]);
        sent += entries.length;
      } catch (error) {
        failures.push(`${email}: ${error.message}`);
      }
    }
    const status = failures.length ? (sent ? 'PARTIAL' : 'FAILED') : 'SENT';
    await pool.query(`INSERT INTO notification_logs (id,status,notification_type,recipients,sent_at,provider,error_message,batch_slot,item_count)
      VALUES ($1,$2,'purchase.ready', $3, NOW(), 'smtp', $4, 'afternoon', $5)`, [
      crypto.randomUUID(),
      status,
      JSON.stringify([...groups.keys()]),
      failures.join(' | ') || null,
      rows.length,
    ]);
    console.log(JSON.stringify({ status, notifications: rows.length, sent, recipients: groups.size, failures }));
    if (failures.length) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error('PURCHASE_NOTIFICATION_BATCH_FAILED', error); process.exit(1); });
