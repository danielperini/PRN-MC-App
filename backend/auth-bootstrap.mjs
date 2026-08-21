import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

const APP_ID = process.env.APP_ID || '6a11dbeecf8f7a5977ffc750';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const cookieName = 'appgestor_session';

function token() { return crypto.randomBytes(32).toString('hex'); }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function safeUser(row) {
  if (!row) return null;
  const out = { ...row };
  delete out.password_hash;
  delete out.password;
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
function setSession(res, userId) {
  const raw = token();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  return pool.query(
    `INSERT INTO auth_sessions(user_id, session_token_hash, expires_at) VALUES($1,$2,$3)`,
    [String(userId), hash(raw), expires]
  ).then(() => {
    res.cookie = res.cookie || (() => {});
    res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(raw)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
    return raw;
  });
}
function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  return Object.fromEntries(raw.split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf('=');
    return [x.slice(0, i), i >= 0 ? decodeURIComponent(x.slice(i + 1)) : ''];
  }));
}

function installAuth(app) {
  app.use(async (req, res, next) => {
    if (req.path === `/api/apps/${APP_ID}/entities/User/me` && req.method === 'GET') {
      try {
        await ensureAuthSchema();
        const raw = parseCookies(req)[cookieName];
        if (!raw) return res.status(401).json({ error: 'unauthorized' });
        const s = await pool.query(`SELECT user_id FROM auth_sessions WHERE session_token_hash=$1 AND expires_at>NOW() LIMIT 1`, [hash(raw)]);
        if (!s.rowCount) return res.status(401).json({ error: 'session_invalid' });
        const user = await pool.query(`SELECT * FROM users WHERE id=$1 LIMIT 1`, [s.rows[0].user_id]);
        if (!user.rowCount) return res.status(401).json({ error: 'user_not_found' });
        return res.json(safeUser(user.rows[0]));
      } catch (e) {
        console.error('AUTH_ME_ERROR', e);
        return res.status(500).json({ error: 'authentication_error', message: e.message });
      }
    }
    next();
  });

  app.post(`/api/apps/${APP_ID}/auth/login`, async (req, res) => {
    try {
      await ensureAuthSchema();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });
      const result = await pool.query(`SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
      if (!result.rowCount) return res.status(401).json({ error: 'invalid_credentials' });
      const user = result.rows[0];
      const stored = String(user.password_hash || user.password || '');
      let valid = false;
      if (stored.startsWith('sha256:')) valid = hash(password) === stored.slice(7);
      else if (stored) valid = stored === password;
      if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
      const accessToken = token();
      const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
      await pool.query(`INSERT INTO auth_sessions(user_id, session_token_hash, expires_at) VALUES($1,$2,$3)`, [String(user.id), hash(accessToken), expires]);
      res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
      return res.json({ access_token: accessToken, user: safeUser(user) });
    } catch (e) {
      console.error('AUTH_LOGIN_ERROR', e);
      return res.status(500).json({ error: 'authentication_error', message: e.message });
    }
  });

  app.get('/api/apps/auth/logout', async (req, res) => {
    try {
      await ensureAuthSchema();
      const raw = parseCookies(req)[cookieName];
      if (raw) await pool.query(`DELETE FROM auth_sessions WHERE session_token_hash=$1`, [hash(raw)]);
    } catch (e) { console.error('AUTH_LOGOUT_ERROR', e); }
    res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    const from = String(req.query?.from_url || '/');
    const target = /^https:\/\/appgestor\.periniprojetos\.com\.br(\/|$)/.test(from) ? from : '/login';
    res.redirect(target);
  });
}

const originalGet = express.application.get;
let installed = false;
express.application.get = function patchedGet(path, ...handlers) {
  const result = originalGet.call(this, path, ...handlers);
  if (!installed && path === '/health') {
    installed = true;
    installAuth(this);
    console.log('Local auth compatibility installed');
  }
  return result;
};
