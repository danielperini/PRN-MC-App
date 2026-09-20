import pg from 'pg';
import nodemailer from 'nodemailer';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

const APP_ORIGIN = process.env.PUBLIC_BASE_URL || 'https://appgestor.periniprojetos.com.br';
const FIRST_REQUIRED_MONTH = { year: 2026, month: 3 };
const COMPLETE_STATUSES = new Set(['SUBMITTED', 'IN_REVIEW', 'APPROVED']);
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const emailOf = (row) => String(row?.email || row?.user_email || '').trim().toLowerCase();
const isProfessional = (row) => {
  const role = String(row?.role || row?.perfil || row?.user_role || '').trim().toUpperCase();
  if (!role) return false;
  if (['ADMIN', 'COORDENADOR', 'COORDINATOR', 'PATROCINADOR', 'OBSERVADOR'].includes(role)) return false;
  return ['PROFISSIONAL', 'PROFESSIONAL', 'COLABORADOR', 'USUARIO', 'USER'].includes(role);
};
const shouldSubmit = (row) => row?.must_submit_monthly_reports !== false && row?.must_submit_monthly_report !== false;

function requiredMonths(now = new Date()) {
  // The current month remains open. The reminder covers completed months only,
  // avoiding a false charge before the monthly period ends.
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const result = [];
  for (let year = FIRST_REQUIRED_MONTH.year, month = FIRST_REQUIRED_MONTH.month;
    year < last.getFullYear() || (year === last.getFullYear() && month <= last.getMonth() + 1);) {
    result.push({ year, month, label: `${MONTH_NAMES[month - 1]}/${year}` });
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return result;
}

function reportMonth(record) {
  const year = Number(record?.ano);
  const raw = String(record?.mes_referencia || '').trim();
  const month = MONTH_NAMES.findIndex((name) => name.toLowerCase() === raw.toLowerCase()) + 1;
  return year && month ? `${year}-${month}` : null;
}

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
    pool.query('SELECT * FROM users'),
    pool.query('SELECT created_by, author_email, mes_referencia, ano, status FROM reports'),
  ]);
  const completedByEmail = new Map();
  for (const report of reportsResult.rows) {
    if (!COMPLETE_STATUSES.has(String(report.status || '').trim().toUpperCase())) continue;
    const key = reportMonth(report);
    if (!key) continue;
    for (const email of [report.created_by, report.author_email].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)) {
      if (!completedByEmail.has(email)) completedByEmail.set(email, new Set());
      completedByEmail.get(email).add(key);
    }
  }

  const transport = dryRun ? null : await mailTransport();
  const runKey = `MONTHLY_REPORT_MISSING_EMAIL_${now.toISOString().slice(0, 10)}`;
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
      text: `Olá, ${firstName}.\n\n${message}\n\n${APP_ORIGIN}/Relatorios`,
      html: `<p>Olá, ${firstName}.</p><p>${message}</p><p><a href="${APP_ORIGIN}/Relatorios">Abrir relatórios no Gestor Museus Centro</a></p>`,
    });
    await pool.query(
      `INSERT INTO notifications (user_email,type,title,message,action_url,is_read,resolved,email_sent) VALUES ($1,$2,$3,$4,$5,FALSE,FALSE,TRUE)`,
      [email, runKey, 'Relatórios mensais pendentes', message, `${APP_ORIGIN}/Relatorios`],
    ).catch(() => {});
    result.sent += 1;
  }
  return result;
}

function shouldRunNow(now = new Date()) {
  return now.getDay() === 1 && now.getHours() === 6;
}

async function scheduledRun() {
  if (!shouldRunNow()) return;
  try {
    console.log('MONTHLY_REPORT_REMINDER_RESULT', JSON.stringify(await runMonthlyReportReminders()));
  } catch (error) {
    console.error('MONTHLY_REPORT_REMINDER_ERROR', error);
  }
}

if (process.argv[1]?.endsWith('monthly-report-reminders.mjs')) {
  const dryRun = process.argv.includes('--dry-run');
  runMonthlyReportReminders({ dryRun }).then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  }).catch((error) => { console.error(error); process.exit(1); });
} else {
  scheduledRun();
  setInterval(scheduledRun, 60_000);
}
