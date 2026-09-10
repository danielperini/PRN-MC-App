import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const COOKIE = 'appgestor_session';
const APP_ORIGIN = process.env.PUBLIC_BASE_URL || 'https://appgestor.periniprojetos.com.br';

async function sendPendingWorkReminder(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !process.env.SMTP_HOST || !process.env.SMTP_USER) return;
  const [notes, reports, sent] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int count FROM document_intakes WHERE lower(COALESCE(created_by,''))=$1 AND status_processamento IN ('ENVIADO','ANALISANDO_IA','AGUARDANDO_REVISAO','RASCUNHO','ERRO_PROCESSAMENTO')`, [email]).catch(() => ({ rows:[{ count:0 }] })),
    pool.query(`SELECT COUNT(*)::int count FROM reports WHERE lower(COALESCE(created_by,''))=$1 AND upper(COALESCE(status,'')) IN ('DRAFT','RASCUNHO','DEVOLVIDO')`, [email]).catch(() => ({ rows:[{ count:0 }] })),
    pool.query(`SELECT 1 FROM notifications WHERE lower(COALESCE(user_email,''))=$1 AND type='PENDING_WORK_EMAIL' AND created_at >= CURRENT_DATE LIMIT 1`, [email]).catch(() => ({ rowCount:0 }))
  ]);
  const noteCount = Number(notes.rows[0]?.count || 0);
  const reportCount = Number(reports.rows[0]?.count || 0);
  if ((!noteCount && !reportCount) || sent.rowCount) return;
  const firstName = String(user?.full_name || user?.name || email.split('@')[0]).trim().split(/\s+/)[0];
  const items = [
    noteCount ? `${noteCount} nota(s) fiscal(is) aguardando conclusão do envio` : '',
    reportCount ? `${reportCount} relatório(s) mensal(is) em rascunho` : ''
  ].filter(Boolean);
  const password = process.env.SMTP_PASS_B64 ? Buffer.from(process.env.SMTP_PASS_B64, 'base64').toString('utf8') : process.env.SMTP_PASS;
  const transport = nodemailer.createTransport({
    host:process.env.SMTP_HOST,
    port:Number(process.env.SMTP_PORT || 465),
    secure:String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth:{ user:process.env.SMTP_USER, pass:password }
  });
  const text = `${firstName}, você deixou ${items.join(' e ')} no Gestor Museus Centro. Acesse ${APP_ORIGIN} e conclua o preenchimento e o envio para aprovação.`;
  await transport.sendMail({
    from:`Gestor Museus Centro <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to:email,
    subject:'Pendência no Gestor Museus Centro',
    text,
    html:`<p>Olá, ${firstName}.</p><p>Você deixou <strong>${items.join(' e ')}</strong>.</p><p>Conclua o preenchimento e envie para aprovação.</p><p><a href="${APP_ORIGIN}">Acessar o Gestor Museus Centro</a></p>`
  });
  await pool.query(`INSERT INTO notifications (user_email,type,title,message,action_url,is_read,resolved,email_sent) VALUES ($1,'PENDING_WORK_EMAIL','Pendência de preenchimento',$2,$3,FALSE,FALSE,TRUE)`, [email,text,APP_ORIGIN]).catch(() => {});
}

const randomToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function cookies(req) {
  const raw = String(req.headers.cookie || '');
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [i < 0 ? v : v.slice(0, i), i < 0 ? '' : decodeURIComponent(v.slice(i + 1))];
  }));
}

function publicUser(row) {
  if (!row) return null;
  const out = { ...row };
  delete out.password;
  delete out.password_hash;
  return out;
}

async function ensureAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_hash ON auth_sessions(session_token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
  `);
}

async function createSession(res, userId) {
  const accessToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await pool.query(
    `INSERT INTO auth_sessions(user_id, session_token_hash, expires_at) VALUES($1,$2,$3)`,
    [String(userId), hashToken(accessToken), expiresAt]
  );
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
  return accessToken;
}

async function installAuth(app) {
  await ensureAuthSchema().catch(e => console.error('AUTH_SCHEMA_INIT_ERROR', e));

  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || !/^\/api\/apps\/[^/]+\/entities\/User\/me$/.test(req.path)) return next();
    try {
      const raw = cookies(req)[COOKIE];
      if (!raw) return res.status(401).json({ error: 'unauthorized' });
      const session = await pool.query(
        `SELECT user_id FROM auth_sessions WHERE session_token_hash=$1 AND expires_at>NOW() LIMIT 1`,
        [hashToken(raw)]
      );
      if (!session.rowCount) return res.status(401).json({ error: 'session_invalid' });
      const user = await pool.query(`SELECT * FROM users WHERE id=$1 LIMIT 1`, [session.rows[0].user_id]);
      if (!user.rowCount) return res.status(401).json({ error: 'user_not_found' });
      return res.json(publicUser(user.rows[0]));
    } catch (e) {
      console.error('AUTH_ME_ERROR', e);
      return res.status(500).json({ error: 'authentication_error', message: e.message });
    }
  });

  app.post(/^\/api\/apps\/[^/]+\/auth\/login$/, async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });
      const result = await pool.query(`SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
      if (!result.rowCount) return res.status(401).json({ error: 'invalid_credentials' });
      const user = result.rows[0];
      const stored = String(user.password_hash || '');
      let valid = false;
      if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) valid = await bcrypt.compare(password, stored);
      else if (stored.startsWith('sha256:')) valid = crypto.createHash('sha256').update(password).digest('hex') === stored.slice(7);
      if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
      const accessToken = await createSession(res, user.id);
      return res.json({ access_token: accessToken, user: publicUser(user) });
    } catch (e) {
      console.error('AUTH_LOGIN_ERROR', e);
      return res.status(500).json({ error: 'authentication_error', message: e.message });
    }
  });

  app.get('/api/apps/auth/logout', async (req, res) => {
    try {
      const raw = cookies(req)[COOKIE];
      if (raw) {
        const session = await pool.query(`SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.session_token_hash=$1 LIMIT 1`, [hashToken(raw)]);
        if (session.rowCount) await sendPendingWorkReminder(session.rows[0]).catch(e => console.error('PENDING_WORK_EMAIL_ERROR', e.message));
        await pool.query(`DELETE FROM auth_sessions WHERE session_token_hash=$1`, [hashToken(raw)]);
      }
    } catch (e) { console.error('AUTH_LOGOUT_ERROR', e); }
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    const from = String(req.query?.from_url || '/login');
    const safe = from.startsWith(APP_ORIGIN) ? from : '/login';
    res.redirect(safe);
  });

  console.log('Local auth compatibility installed');
}

const originalGet = express.application.get;
let installed = false;
express.application.get = function patchedGet(path, ...handlers) {
  const result = originalGet.call(this, path, ...handlers);
  if (!installed && path === '/health') {
    installed = true;
    void installAuth(this);
  }
  return result;
};
