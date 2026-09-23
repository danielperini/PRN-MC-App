import pg from 'pg';
import nodemailer from 'nodemailer';
import { brandedEmailHtml, brandedEmailText, paymentNotificationSteps, publicAppUrl } from './email-layout.mjs';

const { Pool } = pg;
const appUrl = publicAppUrl(process.env.PUBLIC_APP_URL || process.env.APP_URL);
const allPending = process.argv.includes('--all-pending');

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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
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
    await pool.query(`INSERT INTO notification_logs (status,notification_type,recipients,sent_at,provider,error_message,batch_slot,item_count)
      VALUES ($1,'purchase.ready', $2, NOW(), 'smtp', $3, 'afternoon', $4)`, [
      status,
      [...groups.keys()].join(','),
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
