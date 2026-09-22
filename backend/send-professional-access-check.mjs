import pg from 'pg';
import nodemailer from 'nodemailer';
import { brandedEmailHtml, brandedEmailText, publicAppUrl, reportSubmissionSteps } from './email-layout.mjs';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

const APP_ORIGIN = publicAppUrl(process.env.PUBLIC_BASE_URL);
const RUN_KEY = `ACCESS_AND_REPORTS_CHECK_${new Date().toISOString().slice(0, 10)}`;

function isProfessional(user) {
  const role = String(user?.role || user?.perfil || '').trim().toUpperCase();
  return ['PROFISSIONAL', 'PROFESSIONAL', 'COLABORADOR', 'USUARIO', 'USER'].includes(role);
}

function transport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
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
  const dryRun = process.argv.includes('--dry-run');
  const mailer = dryRun ? null : transport();
  if (!dryRun && !mailer) throw new Error('SMTP não configurado');

  const users = (await pool.query('SELECT * FROM users')).rows
    .filter((user) => user.ativo !== false && isProfessional(user) && String(user.email || '').trim());
  const result = { eligible: users.length, sent: 0, already_sent: 0, errors: [] };

  for (const user of users) {
    const email = String(user.email).trim().toLowerCase();
    const previous = await pool.query(
      'SELECT id,email_sent FROM notifications WHERE lower(COALESCE(user_email,\'\'))=$1 AND type=$2 LIMIT 1',
      [email, RUN_KEY],
    );
    if (previous.rows[0]?.email_sent) { result.already_sent += 1; continue; }

    const firstName = String(user.full_name || user.name || email.split('@')[0]).trim().split(/\s+/)[0];
    const message = 'Corrigimos o erro que impedia a criação e a edição de relatórios. O fluxo foi validado: você já consegue acessar, criar, editar, salvar e enviar seu relatório para aprovação. Se encontrar qualquer problema, use “Reportar problema” no canto inferior direito.';
    const text = brandedEmailText({ greeting:`Olá, ${firstName}`, message, steps:reportSubmissionSteps, ctaLabel:'Abrir o Gestor Museus', ctaUrl:APP_ORIGIN, recipientEmail:email });
    if (!dryRun) {
      let notificationId = previous.rows[0]?.id || null;
      if (!notificationId) {
        const notification = await pool.query(
          'INSERT INTO notifications (user_email,type,title,message,action_url,is_read,resolved,email_sent) VALUES ($1,$2,$3,$4,$5,FALSE,FALSE,FALSE) RETURNING id',
          [email, RUN_KEY, 'Acesso ao app e envio de relatórios', 'Acesso a relatórios corrigido; valide o app e envie os relatórios mensais pendentes para aprovação.', APP_ORIGIN],
        );
        notificationId = notification.rows[0]?.id || null;
      }
      try {
        await mailer.sendMail({
          from: `Gestor Museus Centro <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: email,
          subject: 'Acesso corrigido — confira o app e envie seus relatórios',
          text,
          html: brandedEmailHtml({ appUrl:APP_ORIGIN, title:'Acesso e relatórios disponíveis', greeting:`Olá, ${firstName}`, message, steps:reportSubmissionSteps, ctaLabel:'Abrir o Gestor Museus', ctaUrl:APP_ORIGIN, recipientEmail:email }),
        });
        if (notificationId) await pool.query('UPDATE notifications SET email_sent=TRUE,updated_at=NOW() WHERE id=$1',[notificationId]);
        result.sent += 1;
      } catch (error) {
        result.errors.push({ email, error: error.message });
      }
    }
  }
  console.log('PROFESSIONAL_ACCESS_CHECK_RESULT', JSON.stringify(result));
  if (result.errors.length) process.exitCode = 1;
}

main().catch((error) => { console.error('PROFESSIONAL_ACCESS_CHECK_ERROR', error); process.exit(1); }).finally(() => pool.end());
