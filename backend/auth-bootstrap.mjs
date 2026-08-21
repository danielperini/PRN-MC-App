import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

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
      if (raw) await pool.query(`DELETE FROM auth_sessions WHERE session_token_hash=$1`, [hashToken(raw)]);
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
