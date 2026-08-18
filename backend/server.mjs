import express from 'express';
import pg from 'pg';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 100);

fs.mkdirSync(uploadDir, { recursive: true });

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD,
});

app.use(express.json({ limit: '10mb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const base = path.basename(file.originalname || 'arquivo', ext)
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}._ -]/gu, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'arquivo';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${base}${ext}`);
    },
  }),
  limits: { fileSize: maxUploadMb * 1024 * 1024, files: 20 },
});

async function tableExists(name) {
  const r = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [name]
  );
  return r.rows[0].exists;
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [i < 0 ? v : v.slice(0, i), i < 0 ? '' : decodeURIComponent(v.slice(i + 1))];
  }));
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function requireSession(req, res, next) {
  try {
    if (!(await tableExists('auth_sessions'))) return next();
    const token = parseCookies(req).appgestor_session;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const r = await pool.query(
      `SELECT user_id FROM auth_sessions
       WHERE session_token_hash = $1 AND expires_at > NOW()
       LIMIT 1`,
      [hashToken(token)]
    );
    if (!r.rowCount) return res.status(401).json({ error: 'session_invalid' });
    req.userId = r.rows[0].user_id;
    next();
  } catch (e) {
    console.error('upload auth error:', e);
    res.status(500).json({ error: 'authentication_error' });
  }
}

function fileUrl(req, storedName) {
  if (publicBaseUrl) return `${publicBaseUrl}/api/files/${encodeURIComponent(storedName)}`;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  const host = req.get('host');
  return `${proto}://${host}/api/files/${encodeURIComponent(storedName)}`;
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      base44_id TEXT UNIQUE,
      user_email TEXT,
      type TEXT,
      title TEXT,
      message TEXT,
      entity_type TEXT,
      entity_id TEXT,
      action_url TEXT,
      is_read BOOLEAN DEFAULT FALSE,
      resolved BOOLEAN DEFAULT FALSE,
      email_sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'appgestor-api' });
});

app.get('/db-health', async (_req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS now');
    res.json({ status: 'ok', database: 'connected', now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// Base44-compatible Core.UploadFile / Core.UploadPrivateFile.
// Entrada Única uses these methods for PDFs, XMLs and other attachments.
app.post('/api/apps/:appId/integrations/Core/:operation', requireSession, (req, res) => {
  const operation = String(req.params.operation || '').toLowerCase();
  if (!['uploadfile', 'uploadprivatefile'].includes(operation)) {
    return res.status(404).json({ error: 'integration_not_found' });
  }

  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `Arquivo excede o limite de ${maxUploadMb} MB`
        : err.message;
      return res.status(413).json({ error: 'upload_failed', message, code: err.code });
    }
    if (err) return res.status(400).json({ error: 'upload_failed', message: err.message });
    if (!req.file) return res.status(400).json({ error: 'upload_failed', message: 'Nenhum arquivo recebido no campo file' });

    try {
      const url = fileUrl(req, req.file.filename);
      const response = {
        file_url: url,
        file_name: req.file.originalname,
        file_name_original: req.file.originalname,
        file_name_stored: req.file.filename,
        mime_type: req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
        operation: operation === 'uploadprivatefile' ? 'UploadPrivateFile' : 'UploadFile',
      };
      console.log('FILE_UPLOAD_OK', JSON.stringify({
        user_id: req.userId || null,
        original: req.file.originalname,
        stored: req.file.filename,
        mime: req.file.mimetype,
        size: req.file.size,
      }));
      return res.status(200).json(response);
    } catch (e) {
      console.error('FILE_UPLOAD_RESPONSE_ERROR:', e);
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(500).json({ error: 'upload_failed', message: e.message });
    }
  });
});

app.get('/api/files/:name', async (req, res) => {
  try {
    const name = path.basename(decodeURIComponent(req.params.name));
    const target = path.join(uploadDir, name);
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'file_not_found' });
    return res.sendFile(target);
  } catch (e) {
    return res.status(400).json({ error: 'invalid_file_name' });
  }
});

app.get('/notifications', async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC, id DESC');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/notifications', async (req, res) => {
  try {
    const { base44_id, user_email, type, title, message, entity_type, entity_id, action_url, is_read, resolved, email_sent } = req.body;
    const r = await pool.query(
      `INSERT INTO notifications
       (base44_id, user_email, type, title, message, entity_type, entity_id, action_url, is_read, resolved, email_sent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,FALSE),COALESCE($10,FALSE),COALESCE($11,FALSE))
       RETURNING *`,
      [base44_id || null, user_email || null, type || null, title || null, message || null,
       entity_type || null, entity_id || null, action_url || null, is_read ?? null, resolved ?? null, email_sent ?? null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/notifications/:id', async (req, res) => {
  try {
    const { title, message, is_read, resolved, email_sent } = req.body;
    const r = await pool.query(
      `UPDATE notifications SET title = COALESCE($1,title), message = COALESCE($2,message),
       is_read = COALESCE($3,is_read), resolved = COALESCE($4,resolved),
       email_sent = COALESCE($5,email_sent), updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [title ?? null, message ?? null, is_read ?? null, resolved ?? null, email_sent ?? null, req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/notifications/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM notifications WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, id: r.rows[0].id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

initDb()
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`AppGestor API listening on port ${port}`)))
  .catch(e => { console.error('Database init failed:', e.message); process.exit(1); });
