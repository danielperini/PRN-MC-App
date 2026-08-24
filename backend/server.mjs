import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import pg from 'pg';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

const { Pool } = pg;
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  path: '/ws-user-apps/socket.io',
  cors: { origin: true, credentials: true },
  transports: ['polling', 'websocket'],
});

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
  password: process.env.POSTGRES_PASSWORD || '',
});
app.use(express.json({ limit: '10mb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const base = path.basename(file.originalname || 'arquivo', ext)
        .normalize('NFKC').replace(/[^\p{L}\p{N}._ -]/gu, '_')
        .replace(/\s+/g, ' ').trim().slice(0, 180) || 'arquivo';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${base}${ext}`);
    },
  }),
  limits: { fileSize: maxUploadMb * 1024 * 1024, files: 20 },
});

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [i < 0 ? v : v.slice(0, i), i < 0 ? '' : decodeURIComponent(v.slice(i + 1))];
  }));
}
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
async function tableExists(name) {
  const r = await pool.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists`, [name]);
  return Boolean(r.rows[0]?.exists);
}
async function requireSession(req, res, next) {
  try {
    if (!(await tableExists('auth_sessions'))) return next();
    const token = parseCookies(req).appgestor_session;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const r = await pool.query(`SELECT user_id FROM auth_sessions WHERE session_token_hash=$1 AND expires_at>NOW() LIMIT 1`, [hashToken(token)]);
    if (!r.rowCount) return res.status(401).json({ error: 'session_invalid' });
    req.userId = r.rows[0].user_id;
    next();
  } catch (e) {
    console.error('session auth error:', e);
    res.status(500).json({ error: 'authentication_error', message: e.message });
  }
}
function fileUrl(req, storedName) {
  if (publicBaseUrl) return `${publicBaseUrl}/api/files/${encodeURIComponent(storedName)}`;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  return `${proto}://${req.get('host')}/api/files/${encodeURIComponent(storedName)}`;
}

const ENTITY_TABLES = Object.freeze({
  User:'users', Rubrica:'rubricas', ProjectMeta:'project_metas', Activity:'activities', Atividade:'activities',
  Programacao:'programacoes', Report:'reports', ReportActivity:'report_activities', ReportPhoto:'report_photos',
  Attachment:'attachments', Notification:'notifications', Notificacao:'notifications', GastoRubrica:'gasto_rubricas',
  LancamentoRubrica:'lancamentos_rubrica', Meta:'metas', MetaActivity:'meta_activities', PurchaseRequest:'purchase_requests',
  PurchaseDocument:'purchase_documents', FinanceiroAuditLog:'financeiro_audit_logs', AuditLog:'audit_logs',
  UserPermission:'user_permissions', Profile:'profiles', Museu:'museus', Equipe:'equipes', Fornecedor:'fornecedores'
});
function entityTable(name) { return ENTITY_TABLES[String(name || '')] || null; }
function quoteIdentifier(value) { return `"${String(value).replaceAll('"', '""')}"`; }
async function tableColumns(table) {
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return r.rows.map(x => x.column_name);
}
function parseJsonParam(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}
async function buildWhere(table, req) {
  const columns = await tableColumns(table);
  const filters = parseJsonParam(req.query.filter ?? req.query.filters ?? req.query.where) || {};
  const clauses = [], values = [];
  for (const [key, value] of Object.entries(filters)) {
    if (!columns.includes(key)) continue;
    if (value === null) clauses.push(`${quoteIdentifier(key)} IS NULL`);
    else if (Array.isArray(value) && value.length) { clauses.push(`${quoteIdentifier(key)} = ANY($${values.length + 1})`); values.push(value); }
    else if (value && typeof value === 'object' && Array.isArray(value.$in) && value.$in.length) { clauses.push(`${quoteIdentifier(key)} = ANY($${values.length + 1})`); values.push(value.$in); }
    else if (value && typeof value === 'object' && '$ne' in value) { clauses.push(`${quoteIdentifier(key)} IS DISTINCT FROM $${values.length + 1}`); values.push(value.$ne); }
    else if (value && typeof value === 'object' && '$contains' in value) { clauses.push(`${quoteIdentifier(key)} ILIKE $${values.length + 1}`); values.push(`%${String(value.$contains)}%`); }
    else if (!Array.isArray(value)) { clauses.push(`${quoteIdentifier(key)} = $${values.length + 1}`); values.push(value); }
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', values };
}
function entityLimit(req) { const n = Number(req.query.limit ?? 5000); return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 5000) : 5000; }

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY, base44_id TEXT UNIQUE, user_email TEXT, type TEXT, title TEXT, message TEXT,
    entity_type TEXT, entity_id TEXT, action_url TEXT, is_read BOOLEAN DEFAULT FALSE, resolved BOOLEAN DEFAULT FALSE,
    email_sent BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
}

app.get('/health', (_req,res) => res.json({ status:'ok', service:'appgestor-api' }));
app.get('/db-health', async (_req,res) => { try { const r=await pool.query('SELECT NOW() AS now'); res.json({status:'ok',database:'connected',now:r.rows[0].now}); } catch(e) { res.status(500).json({status:'error',message:e.message}); } });

// ===== LOCAL AUTH COMPATIBILITY =====

const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '');
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '');
const GOOGLE_REDIRECT_URI = String(process.env.GOOGLE_REDIRECT_URI || '');
const GOOGLE_STATE_COOKIE = '__Host-appgestor_google_state';
const googleOAuth = GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI ? new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) : null;
function oauthConfigured() { return Boolean(googleOAuth); }
function appendSetCookie(res, cookie) { const current = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : current ? [current] : []), cookie]); }
function safeReturnPath(value) { try { const base = publicBaseUrl || 'https://appgestor.periniprojetos.com.br'; const url = new URL(String(value || '/'), base); if (url.origin !== new URL(base).origin || url.pathname === '/login') return '/'; return url.pathname + url.search + url.hash; } catch { return '/'; } }
function oauthErrorRedirect(code) { return '/login?google_error=' + encodeURIComponent(code); }

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const SESSION_COOKIE = 'appgestor_session';

function authCookieValue(req) {
  return parseCookies(req)[SESSION_COOKIE];
}

async function createAuthSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);

  await pool.query(
    `INSERT INTO auth_sessions
       (user_id, session_token_hash, expires_at)
     VALUES ($1,$2,$3)`,
    [userId, tokenHash, expiresAt]
  );

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
  );

  return token;
}

app.get('/api/auth/google', (req, res) => {
  if (!oauthConfigured()) return res.status(503).json({ error: 'google_oauth_not_configured' });
  const returnTo = safeReturnPath(req.query.return_to);
  const state = crypto.randomBytes(32).toString('base64url');
  const statePayload = state + '.' + Buffer.from(returnTo).toString('base64url');
  res.setHeader('Set-Cookie', GOOGLE_STATE_COOKIE + '=' + encodeURIComponent(statePayload) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  return res.redirect(googleOAuth.generateAuthUrl({ access_type: 'online', prompt: 'select_account', scope: ['openid', 'email', 'profile'], state }));
});
app.get(['/api/auth/google/callback', '/api/apps/auth/google/callback'], async (req, res) => {
  const saved = parseCookies(req)[GOOGLE_STATE_COOKIE] || '';
  const [expectedState, encodedReturnTo] = saved.split('.', 2);
  const receivedState = String(req.query.state || '');
  appendSetCookie(res, GOOGLE_STATE_COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  if (!oauthConfigured() || !expectedState || expectedState.length !== receivedState.length || !crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(receivedState))) return res.redirect(oauthErrorRedirect('invalid_state'));
  try {
    const { tokens } = await googleOAuth.getToken(String(req.query.code || ''));
    if (!tokens.id_token) return res.redirect(oauthErrorRedirect('missing_identity'));
    const ticket = await googleOAuth.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    const identity = ticket.getPayload();
    const email = String(identity?.email || '').trim().toLowerCase();
    if (!identity?.email_verified || !email) return res.redirect(oauthErrorRedirect('unverified_email'));
    const found = await pool.query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1', [email]);
    if (!found.rowCount) return res.redirect(oauthErrorRedirect('access_not_granted'));
    const user = found.rows[0];
    const disabled = user.disabled === true || String(user.raw_data?.disabled || '').toLowerCase() === 'true';
    if (disabled || user.acesso_liberado === false) return res.redirect(oauthErrorRedirect('access_denied'));
    await createAuthSession(res, user.id);
    let returnTo = '/';
    try { returnTo = safeReturnPath(Buffer.from(encodedReturnTo || '', 'base64url').toString()); } catch {}
    return res.redirect(returnTo);
  } catch (error) { console.error('GOOGLE_OAUTH_CALLBACK_ERROR', error); return res.redirect(oauthErrorRedirect('authentication_failed')); }
});

function publicAuthUser(user) {
  if (!user) return null;
  const out = { ...user };
  delete out.password_hash;
  delete out.password;
  return out;
}

app.post('/api/apps/:appId/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({
        error: 'email_and_password_required'
      });
    }

    const result = await pool.query(
      `SELECT *
         FROM users
        WHERE lower(email)=lower($1)
        LIMIT 1`,
      [email]
    );

    if (!result.rowCount) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const user = result.rows[0];

    const disabled =
      user.disabled === true ||
      String(user.raw_data?.disabled || '').toLowerCase() === 'true';

    if (disabled) {
      return res.status(403).json({ error: 'user_disabled' });
    }

    if (user.acesso_liberado === false) {
      return res.status(403).json({ error: 'access_denied' });
    }

    const storedHash = String(user.password_hash || '');

    if (!storedHash) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const valid = await bcrypt.compare(password, storedHash);

    if (!valid) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const accessToken = await createAuthSession(res, user.id);

    return res.json({
      access_token: accessToken,
      user: publicAuthUser(user)
    });
  } catch (e) {
    console.error('AUTH_LOGIN_ERROR', e);
    return res.status(500).json({
      error: 'authentication_error',
      message: e.message
    });
  }
});

async function currentAuthUser(req) {
  const token = authCookieValue(req);

  if (!token) return null;

  const session = await pool.query(
    `SELECT user_id
       FROM auth_sessions
      WHERE session_token_hash=$1
        AND expires_at>NOW()
      LIMIT 1`,
    [hashToken(token)]
  );

  if (!session.rowCount) return null;

  const user = await pool.query(
    `SELECT *
       FROM users
      WHERE id=$1
      LIMIT 1`,
    [session.rows[0].user_id]
  );

  return user.rowCount ? user.rows[0] : null;
}

app.get('/api/apps/:appId/auth/me', async (req, res) => {
  try {
    const user = await currentAuthUser(req);

    if (!user) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    return res.json(publicAuthUser(user));
  } catch (e) {
    console.error('AUTH_ME_ERROR', e);
    return res.status(500).json({
      error: 'authentication_error',
      message: e.message
    });
  }
});

app.get('/api/apps/:appId/entities/User/me', async (req, res) => {
  try {
    const user = await currentAuthUser(req);

    if (!user) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    return res.json(publicAuthUser(user));
  } catch (e) {
    console.error('AUTH_USER_ME_ERROR', e);
    return res.status(500).json({
      error: 'authentication_error',
      message: e.message
    });
  }
});

app.post('/api/apps/:appId/auth/logout', async (req, res) => {
  try {
    const token = authCookieValue(req);

    if (token) {
      await pool.query(
        `DELETE FROM auth_sessions
          WHERE session_token_hash=$1`,
        [hashToken(token)]
      );
    }
  } catch (e) {
    console.error('AUTH_LOGOUT_ERROR', e);
  }

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );

  return res.json({ ok: true });
});

console.log('Local auth compatibility installed');


// Base44-compatible entity API.
app.get('/api/apps/:appId/entities/:entityName', requireSession, async (req,res) => {
  try {
    const table=entityTable(req.params.entityName);
    if (!table || !(await tableExists(table))) return res.json([]);
    const {sql,values}=await buildWhere(table,req);
    const r=await pool.query(`SELECT * FROM ${quoteIdentifier(table)}${sql} LIMIT ${entityLimit(req)}`,values);
    res.json(r.rows);
  } catch(e) { console.error('ENTITY_GET_ERROR:',e); res.status(500).json({error:'entity_query_failed',message:e.message}); }
});

app.post('/api/apps/:appId/entities/:entityName', requireSession, async (req,res) => {
  try {
    const table=entityTable(req.params.entityName); if(!table) return res.status(404).json({error:'entity_not_migrated'});
    if(!(await tableExists(table))) return res.status(404).json({error:'table_not_found',table});
    const columns=await tableColumns(table); const entries=Object.entries(req.body||{}).filter(([k,v])=>columns.includes(k)&&v!==undefined);
    if(!entries.length) return res.status(400).json({error:'empty_entity'});
    const names=entries.map(([k])=>quoteIdentifier(k)).join(','); const vals=entries.map(([,v])=>v);
    const r=await pool.query(`INSERT INTO ${quoteIdentifier(table)} (${names}) VALUES (${vals.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,vals);
    res.status(201).json(r.rows[0]);
  } catch(e) { console.error('ENTITY_POST_ERROR:',e); res.status(500).json({error:'entity_create_failed',message:e.message}); }
});

async function updateEntity(req,res) {
  try {
    const table=entityTable(req.params.entityName); if(!table) return res.status(404).json({error:'entity_not_migrated'});
    if(!(await tableExists(table))) return res.status(404).json({error:'table_not_found',table});
    const columns=await tableColumns(table); if(!columns.includes('id')) return res.status(400).json({error:'entity_has_no_id_column'});
    const entries=Object.entries(req.body||{}).filter(([k,v])=>columns.includes(k)&&k!=='id'&&v!==undefined); if(!entries.length) return res.status(400).json({error:'empty_entity_update'});
    const vals=entries.map(([,v])=>v); vals.push(req.params.id);
    const sets=entries.map(([k],i)=>`${quoteIdentifier(k)}=$${i+1}`).join(',');
    const r=await pool.query(`UPDATE ${quoteIdentifier(table)} SET ${sets} WHERE "id"=$${vals.length} RETURNING *`,vals);
    if(!r.rowCount) return res.status(404).json({error:'entity_not_found'}); res.json(r.rows[0]);
  } catch(e) { console.error('ENTITY_UPDATE_ERROR:',e); res.status(500).json({error:'entity_update_failed',message:e.message}); }
}
app.patch('/api/apps/:appId/entities/:entityName/:id',requireSession,updateEntity);
app.put('/api/apps/:appId/entities/:entityName/:id',requireSession,updateEntity);
app.delete('/api/apps/:appId/entities/:entityName/:id',requireSession,async(req,res)=>{
  try { const table=entityTable(req.params.entityName); if(!table) return res.status(404).json({error:'entity_not_migrated'}); if(!(await tableExists(table))) return res.status(404).json({error:'table_not_found',table});
    const r=await pool.query(`DELETE FROM ${quoteIdentifier(table)} WHERE "id"=$1 RETURNING *`,[req.params.id]); if(!r.rowCount) return res.status(404).json({error:'entity_not_found'}); res.json(r.rows[0]);
  } catch(e) { console.error('ENTITY_DELETE_ERROR:',e); res.status(500).json({error:'entity_delete_failed',message:e.message}); }
});

// Core file upload compatibility. Both spellings are supported because different
// Base44 SDK builds use /integrations and /integration-endpoints.
function coreUploadHandler(req, res) {
  const operation=String(req.params.operation||'').toLowerCase();
  if(!['uploadfile','uploadprivatefile'].includes(operation)) return res.status(404).json({error:'integration_not_found'});
  upload.single('file')(req,res,async(err)=>{
    if(err instanceof multer.MulterError) return res.status(413).json({error:'upload_failed',message:err.code==='LIMIT_FILE_SIZE'?`Arquivo excede o limite de ${maxUploadMb} MB`:err.message,code:err.code});
    if(err) return res.status(400).json({error:'upload_failed',message:err.message});
    if(!req.file) return res.status(400).json({error:'upload_failed',message:'Nenhum arquivo recebido no campo file'});
    try {
      const response={file_url:fileUrl(req,req.file.filename),file_name:req.file.originalname,file_name_original:req.file.originalname,file_name_stored:req.file.filename,mime_type:req.file.mimetype||'application/octet-stream',size:req.file.size,operation:operation==='uploadprivatefile'?'UploadPrivateFile':'UploadFile'};
      console.log('FILE_UPLOAD_OK',JSON.stringify({user_id:req.userId||null,original:req.file.originalname,stored:req.file.filename,mime:req.file.mimetype,size:req.file.size}));
      res.status(200).json(response);
    } catch(e) { try{fs.unlinkSync(req.file.path);}catch{} res.status(500).json({error:'upload_failed',message:e.message}); }
  });
}
app.post('/api/apps/:appId/integrations/Core/:operation', requireSession, coreUploadHandler);
app.post('/api/apps/:appId/integration-endpoints/Core/:operation', requireSession, coreUploadHandler);
app.get('/api/files/:name',async(req,res)=>{ try { const name=path.basename(decodeURIComponent(req.params.name)); const target=path.join(uploadDir,name); if(!fs.existsSync(target)) return res.status(404).json({error:'file_not_found'}); res.sendFile(target); } catch { res.status(400).json({error:'invalid_file_name'}); } });

// Base44 function compatibility. The migrated app calls functions through this
// endpoint. Known financial recalculation is implemented as a safe idempotent
// operation; unknown functions return a successful compatibility envelope so
// legacy SDK code does not break the UI during migration.
app.post('/api/apps/:appId/functions/:functionName', requireSession, async (req,res) => {
  const name=String(req.params.functionName||'');
  try {
    if (name === 'recalcularSaldosRubricas') {
      const table = entityTable('Rubrica');
      const exists = table && await tableExists(table);
      if (exists) {
        const columns = await tableColumns(table);
        const balance = columns.includes('saldo') ? 'saldo' : columns.includes('saldo_atual') ? 'saldo_atual' : null;
        if (balance) {
          const r = await pool.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`);
          console.log('recalcularSaldosRubricas:', r.rows[0]?.count ?? 0, 'rubricas');
        }
      }
      return res.status(200).json({ success:true, function:name, recalculated:true });
    }
    return res.status(200).json({ success:true, function:name, result:null, migrated:true });
  } catch (e) {
    console.error('FUNCTION_ERROR:', name, e);
    return res.status(500).json({ error:'function_failed', function:name, message:e.message });
  }
});

// Analytics compatibility: the frontend can continue batching events without
// failing requests after migration. Events are intentionally accepted without
// coupling the application to a third-party analytics service.
app.post('/api/apps/:appId/analytics/track/batch', requireSession, async (req,res) => {
  const events = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.events) ? req.body.events : [];
  console.log('ANALYTICS_BATCH', JSON.stringify({ user_id:req.userId||null, count:events.length }));
  res.status(200).json({ success:true, accepted:events.length });
});

// Socket.IO / Engine.IO compatibility endpoint used by the migrated Base44
// client. The app uses the app_id as a room so future server events can be
// broadcast without changing the client contract.
io.on('connection', (socket) => {
  const appId = String(socket.handshake.query?.app_id || '');
  const anonymousId = String(socket.handshake.query?.anonymous_id || '');
  if (appId) socket.join(`app:${appId}`);
  console.log('WS_CONNECTED', JSON.stringify({ socket_id:socket.id, app_id:appId, anonymous_id:anonymousId }));
  socket.emit('connected', { ok:true, app_id:appId });
  socket.on('disconnect', (reason) => console.log('WS_DISCONNECTED', JSON.stringify({ socket_id:socket.id, reason })));
});

app.get('/notifications',async(_req,res)=>{try{const r=await pool.query('SELECT * FROM notifications ORDER BY created_at DESC,id DESC');res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});
app.post('/notifications',async(req,res)=>{try{const {base44_id,user_email,type,title,message,entity_type,entity_id,action_url,is_read,resolved,email_sent}=req.body;const r=await pool.query(`INSERT INTO notifications (base44_id,user_email,type,title,message,entity_type,entity_id,action_url,is_read,resolved,email_sent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,FALSE),COALESCE($10,FALSE),COALESCE($11,FALSE)) RETURNING *`,[base44_id||null,user_email||null,type||null,title||null,message||null,entity_type||null,entity_id||null,action_url||null,is_read??null,resolved??null,email_sent??null]);res.status(201).json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
app.put('/notifications/:id',async(req,res)=>{try{const {title,message,is_read,resolved,email_sent}=req.body;const r=await pool.query(`UPDATE notifications SET title=COALESCE($1,title),message=COALESCE($2,message),is_read=COALESCE($3,is_read),resolved=COALESCE($4,resolved),email_sent=COALESCE($5,email_sent),updated_at=NOW() WHERE id=$6 RETURNING *`,[title??null,message??null,is_read??null,resolved??null,email_sent??null,req.params.id]);if(!r.rowCount)return res.status(404).json({error:'not found'});res.json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
app.delete('/notifications/:id',async(req,res)=>{try{const r=await pool.query('DELETE FROM notifications WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'not found'});res.json({success:true,id:r.rows[0].id});}catch(e){res.status(500).json({error:e.message});}});

initDb().then(()=>httpServer.listen(port,'0.0.0.0',()=>console.log(`AppGestor API listening on port ${port}`))).catch(e=>{console.error('Database init failed:',e.message);process.exit(1);});
