import pg from 'pg';
import nodemailer from 'nodemailer';
import { brandedEmailHtml, brandedEmailText, publicAppUrl, reportSubmissionSteps } from './email-layout.mjs';
import { COMPLETE_STATUSES, emailOf, isProfessional, shouldSubmit, requiredMonths, reportMonths, localDateKey } from './monthly-report-reminder-rules.mjs';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

const APP_ORIGIN = publicAppUrl(process.env.PUBLIC_BASE_URL);
async function mailTransport() {
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

export async function runMonthlyReportReminders({ dryRun = false, now = new Date() } = {}) {
  const months = requiredMonths(now);
  if (!months.length) return { skipped: 'no_completed_months', sent: 0 };

  const [usersResult, reportsResult] = await Promise.all([
    pool.query(`SELECT u.*,up.must_submit_monthly_reports AS permission_must_submit_monthly_reports
      FROM users u LEFT JOIN user_permissions up ON lower(up.user_email)=lower(u.email)`),
    // Production databases created by earlier migrations do not all have the
    // same optional author columns. Select the record and read supported
    // fields below instead of failing the entire scheduled job.
    pool.query('SELECT * FROM reports'),
  ]);
  const completedByEmail = new Map();
  for (const report of reportsResult.rows) {
    if (!COMPLETE_STATUSES.has(String(report.status || '').trim().toUpperCase())) continue;
    const keys = reportMonths(report);
    if (!keys.length) continue;
    for (const email of [report.created_by, report.author_email].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)) {
      if (!completedByEmail.has(email)) completedByEmail.set(email, new Set());
      for (const key of keys) completedByEmail.get(email).add(key);
    }
  }

  const transport = dryRun ? null : await mailTransport();
  const runKey = `MONTHLY_REPORT_MISSING_EMAIL_${localDateKey(now)}`;
  const result = { eligible: 0, sent: 0, skippedAlreadySent: 0, skippedSmtp: 0, recipients: [] };
  for (const user of usersResult.rows.filter((row) => isProfessional(row) && shouldSubmit(row))) {
    const email = emailOf(user);
    if (!email) continue;
    const completed = completedByEmail.get(email) || new Set();
    const missing = months.filter(({ year, month }) => !completed.has(`${year}-${month}`));
    if (!missing.length) continue;
    result.eligible += 1;
    result.recipients.push({ email, missing: missing.map((item) => item.label) });
    if (dryRun) continue;
    const previous = await pool.query(
      `SELECT 1 FROM notifications WHERE lower(COALESCE(user_email,''))=$1 AND type=$2 LIMIT 1`,
      [email, runKey],
    );
    if (previous.rowCount) { result.skippedAlreadySent += 1; continue; }
    if (!transport) { result.skippedSmtp += 1; continue; }
    const firstName = String(user.full_name || user.name || email.split('@')[0]).trim().split(/\s+/)[0];
    const list = missing.map((item) => item.label).join(', ');
    const message = `Identificamos relatório(s) mensal(is) pendente(s): ${list}. Acesse o Gestor Museus Centro, complete o preenchimento e envie para aprovação.`;
    await transport.sendMail({
      from: `Gestor Museus Centro <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Relatórios mensais pendentes — Gestor Museus Centro',
      text: brandedEmailText({ greeting:`Olá, ${firstName}`, message, steps:reportSubmissionSteps, ctaLabel:'Abrir meus relatórios', ctaUrl:`${APP_ORIGIN}/Relatorios`, recipientEmail:email }),
      html: brandedEmailHtml({ appUrl:APP_ORIGIN, title:'Relatórios mensais pendentes', greeting:`Olá, ${firstName}`, message, steps:reportSubmissionSteps, ctaLabel:'Abrir meus relatórios', ctaUrl:`${APP_ORIGIN}/Relatorios`, recipientEmail:email }),
    });
    await pool.query(
      `INSERT INTO notifications (user_email,type,title,message,action_url,is_read,resolved,email_sent) VALUES ($1,$2,$3,$4,$5,FALSE,FALSE,TRUE)`,
      [email, runKey, 'Relatórios mensais pendentes', message, `${APP_ORIGIN}/Relatorios`],
    ).catch(() => {});
    result.sent += 1;
  }
  return result;
}

function parseTargetSpecs(value) {
  return String(value || '').split(';').map((entry) => {
    const [email, start, fullName] = entry.split('|').map((part) => String(part || '').trim());
    const match = start?.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
    return email && match ? { email: email.toLowerCase(), year: Number(match[1]), month: Number(match[2]), fullName } : null;
  }).filter(Boolean);
}

// Used for an explicitly requested, one-off reminder. Unlike the recurring
// reminder, explicit recipients may include a registered administrator when
// the request names that person directly.
export async function runTargetedMonthlyReportReminders({ targets = [], dryRun = false, now = new Date() } = {}) {
  const completedMonths = requiredMonths(now);
  const [usersResult, reportsResult] = await Promise.all([
    pool.query('SELECT * FROM users'),
    pool.query('SELECT * FROM reports'),
  ]);
  const completedByEmail = new Map();
  for (const report of reportsResult.rows) {
    if (!COMPLETE_STATUSES.has(String(report.status || '').trim().toUpperCase())) continue;
    const keys = reportMonths(report);
    if (!keys.length) continue;
    for (const email of [report.created_by, report.author_email].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)) {
      if (!completedByEmail.has(email)) completedByEmail.set(email, new Set());
      for (const key of keys) completedByEmail.get(email).add(key);
    }
  }

  const transport = dryRun ? null : await mailTransport();
  const runKey = `TARGETED_MONTHLY_REPORT_MISSING_EMAIL_${localDateKey(now)}`;
  const usersByEmail = new Map(usersResult.rows.map((user) => [emailOf(user), user]));
  const result = { eligible: 0, sent: 0, skippedAlreadySent: 0, skippedSmtp: 0, skippedNotFound: [], recipients: [] };
  for (const target of targets) {
    const user = usersByEmail.get(target.email);
    const missing = completedMonths.filter(({ year, month }) => year > target.year || (year === target.year && month >= target.month))
      .filter(({ year, month }) => !(completedByEmail.get(target.email) || new Set()).has(`${year}-${month}`));
    if (!missing.length) continue;
    result.eligible += 1;
    result.recipients.push({ email: target.email, missing: missing.map((item) => item.label) });
    if (dryRun) continue;
    const previous = await pool.query(
      `SELECT 1 FROM notifications WHERE lower(COALESCE(user_email,''))=$1 AND type=$2 LIMIT 1`,
      [target.email, runKey],
    );
    if (previous.rowCount) { result.skippedAlreadySent += 1; continue; }
    if (!transport) { result.skippedSmtp += 1; continue; }
    // Some legacy report authors have a verified work email before their user
    // account is created. A named, explicit reminder must still reach them.
    const firstName = String(user?.full_name || user?.name || target.fullName || target.email.split('@')[0]).trim().split(/\s+/)[0];
    const list = missing.map((item) => item.label).join(', ');
    const message = `É necessário concluir imediatamente o(s) relatório(s) mensal(is) pendente(s): ${list}. Acesse o Gestor Museus Centro, complete o preenchimento e envie para aprovação.`;
    await transport.sendMail({
      from: `Gestor Museus Centro <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: target.email,
      subject: 'Ação necessária: relatórios mensais pendentes',
      text: brandedEmailText({ greeting:`Olá, ${firstName}`, message, steps:reportSubmissionSteps, ctaLabel:'Abrir meus relatórios', ctaUrl:`${APP_ORIGIN}/Relatorios`, recipientEmail:target.email }),
      html: brandedEmailHtml({ appUrl:APP_ORIGIN, title:'Ação necessária: relatórios mensais pendentes', greeting:`Olá, ${firstName}`, message, steps:reportSubmissionSteps, ctaLabel:'Abrir meus relatórios', ctaUrl:`${APP_ORIGIN}/Relatorios`, recipientEmail:target.email }),
    });
    await pool.query(
      `INSERT INTO notifications (user_email,type,title,message,action_url,is_read,resolved,email_sent) VALUES ($1,$2,$3,$4,$5,FALSE,FALSE,TRUE)`,
      [target.email, runKey, 'Relatórios mensais pendentes', message, `${APP_ORIGIN}/Relatorios`],
    ).catch(() => {});
    result.sent += 1;
  }
  return result;
}

if (process.argv[1]?.endsWith('monthly-report-reminders.mjs')) {
  const dryRun = process.argv.includes('--dry-run');
  const targeted = process.argv.includes('--targeted');
  const run = targeted
    ? runTargetedMonthlyReportReminders({ dryRun, targets: parseTargetSpecs(process.env.REPORT_REMINDER_TARGETS) })
    : runMonthlyReportReminders({ dryRun });
  run.then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  }).catch((error) => { console.error(error); process.exit(1); });
}
