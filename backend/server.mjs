import express from 'express';
import pg from 'pg';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { syncProgramacao } from './programacao-sync.mjs';
import nodemailer from 'nodemailer';

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
  PurchaseDocument:'purchase_documents', DocumentIntake:'document_intakes', FinanceiroAuditLog:'financeiro_audit_logs', AuditLog:'audit_logs',
  UserPermission:'user_permissions', Profile:'profiles', Museu:'museus', Equipe:'equipes', Fornecedor:'fornecedores'
});
function entityTable(name) { return ENTITY_TABLES[String(name || '')] || null; }
function quoteIdentifier(value) { return `"${String(value).replaceAll('"', '""')}"`; }
async function tableColumns(table) {
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return r.rows.map(x => x.column_name);
}
async function tableColumnTypes(table) {
  const r = await pool.query(`SELECT column_name,data_type,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return new Map(r.rows.map(x => [x.column_name, { dataType:x.data_type, udtName:x.udt_name }]));
}
function parseJsonParam(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}
const JSON_ID_LIST_FIELDS = new Set(['meta_manual_ids']);
function normalizeJsonValue(field, value) {
  if (value == null) return value;
  if (Array.isArray(value) || typeof value === 'object') return value;
  if (typeof value !== 'string') throw new TypeError(`Campo JSON ${field} recebeu ${typeof value}`);
  const trimmed = value.trim();
  if (!trimmed) return JSON_ID_LIST_FIELDS.has(field) ? [] : null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) return parsed;
    if (JSON_ID_LIST_FIELDS.has(field)) return [String(parsed)];
    throw new TypeError(`Campo JSON ${field} deve ser array ou objeto`);
  } catch (error) {
    if (error instanceof TypeError) throw error;
    if (JSON_ID_LIST_FIELDS.has(field)) {
      const legacySet = trimmed.match(/^\{\s*"([^"]+)"\s*(?:,\s*"([^"]+)"\s*)*\}$/);
      if (legacySet) return [...trimmed.matchAll(/"([^"]+)"/g)].map(match => match[1]);
      if (/^[A-Za-z0-9_.:-]+$/.test(trimmed)) return [trimmed];
    }
    throw new TypeError(`JSON inválido no campo ${field}`);
  }
}
function normalizeEntityEntriesForDb(entries, columnTypes) {
  return entries.map(([key,value]) => {
    const type = columnTypes.get(key);
    const isJson = type && (type.dataType === 'json' || type.dataType === 'jsonb' || type.udtName === 'json' || type.udtName === 'jsonb');
    if (!isJson) return [key, value];
    return [key, JSON.stringify(normalizeJsonValue(key, value))];
  });
}
function entityLimit(req) { const n = Number(req.query.limit ?? 5000); return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 5000) : 5000; }
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

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY, base44_id TEXT UNIQUE, user_email TEXT, type TEXT, title TEXT, message TEXT,
    entity_type TEXT, entity_id TEXT, action_url TEXT, is_read BOOLEAN DEFAULT FALSE, resolved BOOLEAN DEFAULT FALSE,
    email_sent BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
}

app.get('/health', (_req,res) => res.json({ status:'ok', service:'appgestor-api' }));
app.get('/db-health', async (_req,res) => { try { const r=await pool.query('SELECT NOW() AS now'); res.json({status:'ok',database:'connected',now:r.rows[0].now}); } catch(e) { res.status(500).json({status:'error',message:e.message}); } });

app.get('/api/drive-reconcile/status',requireSession,async(req,res)=>{
  try {
    const user=(await pool.query('SELECT role FROM users WHERE id=$1 LIMIT 1',[req.userId])).rows[0];
    if(!['admin','ADMIN'].includes(user?.role)) return res.status(403).json({error:'admin_required'});
    if(!(await tableExists('drive_reconcile_runs'))) return res.json({active:false,run:null});
    const run=(await pool.query(`SELECT *,CASE WHEN source_files>0 THEN round(processed_files*100.0/source_files,1) ELSE 0 END progress_percent FROM drive_reconcile_runs ORDER BY started_at DESC LIMIT 1`)).rows[0]||null;
    const xml=run && await tableExists('drive_reconcile_xml_staging') ? (await pool.query(`SELECT source_scope,is_duplicate,count(*)::int total FROM drive_reconcile_xml_staging WHERE run_id=$1 GROUP BY 1,2 ORDER BY 1,2`,[run.run_id])).rows : [];
    res.json({active:run?.status==='RUNNING',run,xml});
  }catch(e){res.status(500).json({error:'drive_reconcile_status_failed',message:e.message});}
});

app.get('/api/apps/:appId/entities/:entityName', requireSession, async (req,res) => {
  try {
    const table=entityTable(req.params.entityName);
    if (!table || !(await tableExists(table))) return res.json([]);
    const {sql,values}=await buildWhere(table,req);
    const columns=await tableColumns(table);
    const activeClause=table==='programacoes'&&columns.includes('source_active')
      ? `${sql?' AND':' WHERE'} source_active IS DISTINCT FROM FALSE`
      : '';
    const r=await pool.query(`SELECT * FROM ${quoteIdentifier(table)}${sql}${activeClause} LIMIT ${entityLimit(req)}`,values);
    res.json(r.rows);
  } catch(e) { console.error('ENTITY_GET_ERROR:',e); res.status(500).json({error:'entity_query_failed',message:e.message}); }
});

function normalizePurchaseFiscalPayload(entityName, body = {}) {
  if (entityName !== 'PurchaseRequest') return body;
  const next = { ...body };
  const first = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  next.nf_data_emissao = first(next.nf_data_emissao,next.data_emissao,next.data_emissao_nf,next.emission_date);
  next.nf_numero = first(next.nf_numero,next.numero_nf,next.numero_nota,next.nota_numero);
  next.nf_emitente_nome = first(next.nf_emitente_nome,next.fornecedor_nome,next.emitente_nome);
  next.fornecedor_nome = first(next.fornecedor_nome,next.nf_emitente_nome,next.emitente_nome);
  next.nf_emitente_cpf_cnpj = first(next.nf_emitente_cpf_cnpj,next.fornecedor_cnpj,next.fornecedor_cpf_cnpj,next.cnpj,next.cpf_cnpj);
  return next;
}

app.post('/api/apps/:appId/entities/:entityName', requireSession, async (req,res) => {
  try {
    const table=entityTable(req.params.entityName); if(!table) return res.status(404).json({error:'entity_not_migrated'});
    if(!(await tableExists(table))) return res.status(404).json({error:'table_not_found',table});
    const columns=await tableColumns(table); const columnTypes=await tableColumnTypes(table);
    const normalizedBody=normalizePurchaseFiscalPayload(req.params.entityName,req.body||{});
    let entries=Object.entries(normalizedBody).filter(([k,v])=>columns.includes(k)&&v!==undefined);
    if (columns.includes('id') && !entries.some(([key]) => key === 'id')) {
      const idMeta = await pool.query(`SELECT data_type,column_default,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='id' LIMIT 1`,[table]);
      const idColumn = idMeta.rows[0];
      if (idColumn && !idColumn.column_default && idColumn.is_identity !== 'YES' && ['text','character varying','uuid'].includes(idColumn.data_type)) {
        entries.unshift(['id', crypto.randomUUID()]);
      }
    }
    entries=normalizeEntityEntriesForDb(entries,columnTypes);
    if(!entries.length) return res.status(400).json({error:'empty_entity'});
    const names=entries.map(([k])=>quoteIdentifier(k)).join(','); const vals=entries.map(([,v])=>v);
    const r=await pool.query(`INSERT INTO ${quoteIdentifier(table)} (${names}) VALUES (${vals.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,vals);
    res.status(201).json(r.rows[0]);
  } catch(e) { console.error('ENTITY_POST_ERROR:',e); res.status(500).json({error:'entity_create_failed',message:e.message}); }
});

async function updateEntity(req,res) {
  let table=null, entries=[], currentField=null;
  try {
    table=entityTable(req.params.entityName); if(!table) return res.status(404).json({error:'entity_not_migrated'});
    if(!(await tableExists(table))) return res.status(404).json({error:'table_not_found',table});
    const columns=await tableColumns(table); if(!columns.includes('id')) return res.status(400).json({error:'entity_has_no_id_column'});
    const columnTypes=await tableColumnTypes(table);
    const normalizedBody=normalizePurchaseFiscalPayload(req.params.entityName,req.body||{});
    entries=Object.entries(normalizedBody).filter(([k,v])=>columns.includes(k)&&k!=='id'&&v!==undefined);
    currentField=entries[0]?.[0]||null;
    entries=normalizeEntityEntriesForDb(entries,columnTypes);
    if(!entries.length) return res.status(400).json({error:'empty_entity_update'});
    const vals=entries.map(([,v])=>v); vals.push(req.params.id);
    const sets=entries.map(([k],i)=>`${quoteIdentifier(k)}=$${i+1}`).join(',');
    const r=await pool.query(`UPDATE ${quoteIdentifier(table)} SET ${sets} WHERE "id"=$${vals.length} RETURNING *`,vals);
    if(!r.rowCount) return res.status(404).json({error:'entity_not_found'}); res.json(r.rows[0]);
  } catch(e) {
    const bodyKeys=Object.keys(req.body||{});
    const parameter=String(e.where||'').match(/parameter \$(\d+)/i);
    const failedField=parameter ? entries[Number(parameter[1])-1]?.[0] : currentField;
    const received=req.body?.[failedField];
    console.error('ENTITY_UPDATE_ERROR:', {
      entity:req.params.entityName, table, id:req.params.id, fields:bodyKeys,
      failedField:failedField||null, receivedType:Array.isArray(received)?'array':typeof received,
      receivedShape:Array.isArray(received)?{length:received.length}:received&&typeof received==='object'?{keys:Object.keys(received).slice(0,20)}:null,
      code:e.code, message:e.message, detail:e.detail
    });
    res.status(400).json({error:'entity_update_failed',field:failedField||null,message:e.message});
  }
}
app.patch('/api/apps/:appId/entities/:entityName/:id',requireSession,updateEntity);
app.put('/api/apps/:appId/entities/:entityName/:id',requireSession,updateEntity);
app.delete('/api/apps/:appId/entities/:entityName/:id',requireSession,async(req,res)=>{
  try { const table=entityTable(req.params.entityName); if(!table) return res.status(404).json({error:'entity_not_migrated'}); if(!(await tableExists(table))) return res.status(404).json({error:'table_not_found',table});
    const r=await pool.query(`DELETE FROM ${quoteIdentifier(table)} WHERE "id"=$1 RETURNING *`,[req.params.id]); if(!r.rowCount) return res.status(404).json({error:'entity_not_found'}); res.json(r.rows[0]);
  } catch(e) { console.error('ENTITY_DELETE_ERROR:',e); res.status(500).json({error:'entity_delete_failed',message:e.message}); }
});

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

app.post('/api/apps/:appId/functions/:functionName', requireSession, async (req,res) => {
  const name=String(req.params.functionName||'');
  try {
    if (['sendContextualEmailNotification','sendEmailNotification','sendNotificationEmail'].includes(name)) {
      const to = String(req.body?.to || req.body?.recipientEmail || '').trim();
      if (!to || !process.env.SMTP_HOST || !process.env.SMTP_USER) {
        return res.status(503).json({ success:false, error:'smtp_not_configured' });
      }
      const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g,(char)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
      const actionUrl = String(req.body?.action_url || '');
      const buttonLabel = req.body?.event_type === 'purchase.paid' && !req.body?.has_payment_proof ? 'Solicitar comprovante de depósito' : 'Abrir no Gestor Museus';
      const password = process.env.SMTP_PASS_B64 ? Buffer.from(process.env.SMTP_PASS_B64,'base64').toString('utf8') : process.env.SMTP_PASS;
      const transport = nodemailer.createTransport({
        host:process.env.SMTP_HOST,
        port:Number(process.env.SMTP_PORT || 465),
        secure:String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth:{ user:process.env.SMTP_USER, pass:password }
      });
      const attachments = [];
      if (req.body?.attachment_url) {
        try {
          const rawUrl = String(req.body.attachment_url);
          const attachmentUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `${req.protocol}://${req.get('host')}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
          const attachmentResponse = await fetch(attachmentUrl,{ signal:AbortSignal.timeout(30000) });
          if (!attachmentResponse.ok) throw new Error(`HTTP ${attachmentResponse.status}`);
          const content = Buffer.from(await attachmentResponse.arrayBuffer());
          if (content.length > 30 * 1024 * 1024) throw new Error('comprovante excede 30 MB');
          attachments.push({ filename:String(req.body.attachment_name || 'comprovante-de-pagamento.pdf'), content });
        } catch (error) {
          console.warn('PAYMENT_EMAIL_ATTACHMENT_FAILED',error.message);
        }
      }
      await transport.sendMail({
        from:`Gestor Museus Centro <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to,
        subject:String(req.body?.subject || req.body?.title || 'Gestor Museus Centro'),
        text:`${String(req.body?.message || '')}${actionUrl ? `\n\n${buttonLabel}: ${actionUrl}` : ''}`,
        html:`<div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033"><h2>${escapeHtml(req.body?.title || req.body?.subject)}</h2><p>${escapeHtml(req.body?.message)}</p>${actionUrl ? `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${escapeHtml(buttonLabel)}</a></p>` : ''}</div>`,
        attachments
      });
      return res.status(200).json({ success:true });
    }
    if (name === 'purchaseActions') {
      const purchaseId = String(req.body?.purchaseId || req.body?.purchase_id || '').trim();
      const action = String(req.body?.action || '').trim().toLowerCase();
      if (!purchaseId || !action) return res.status(400).json({ success:false, error:'purchase_action_invalid' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const currentResult = await client.query('SELECT * FROM purchase_requests WHERE id=$1 FOR UPDATE',[purchaseId]);
        if (!currentResult.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success:false, error:'purchase_not_found' });
        }

        const current = currentResult.rows[0];
        const columns = await tableColumns('purchase_requests');
        const updates = {};
        if (action === 'aprovar') {
          updates.status = 'APROVADO_COORD';
          if (columns.includes('status_pagamento')) updates.status_pagamento = 'AGUARDANDO_PAGAMENTO';
          if (columns.includes('pago')) updates.pago = false;
          if (columns.includes('aprov_coord_data')) updates.aprov_coord_data = new Date();
          if (columns.includes('aprov_coord_nome')) {
            const user = (await client.query('SELECT email FROM users WHERE id=$1 LIMIT 1',[req.userId])).rows[0];
            updates.aprov_coord_nome = user?.email || String(req.userId || 'Sistema');
          }
          if (columns.includes('rubrica_debitada_em') && !current.rubrica_debitada_em) updates.rubrica_debitada_em = new Date();
          if (columns.includes('financeiro_lancado_em') && !current.financeiro_lancado_em) updates.financeiro_lancado_em = new Date();
        } else if (action === 'marcar_pago' || action === 'pagar') {
          const paidAt = new Date();
          updates.status = 'PAGO';
          if (columns.includes('status_pagamento')) updates.status_pagamento = 'pago';
          if (columns.includes('pago')) updates.pago = true;
          if (columns.includes('quitada')) updates.quitada = true;
          if (columns.includes('pago_em')) updates.pago_em = paidAt;
          if (columns.includes('data_pagamento')) updates.data_pagamento = paidAt;
          if (columns.includes('payment_marked_by') || columns.includes('pago_por')) {
            const user = (await client.query('SELECT email FROM users WHERE id=$1 LIMIT 1',[req.userId])).rows[0];
            const actor = user?.email || String(req.userId || 'Sistema');
            if (columns.includes('payment_marked_by')) updates.payment_marked_by = actor;
            if (columns.includes('pago_por')) updates.pago_por = actor;
          }
        } else if (action === 'devolver' || action === 'rejeitar') {
          updates.status = 'DEVOLVIDO';
          if (columns.includes('comentario_devolucao')) updates.comentario_devolucao = req.body?.comentario || null;
        } else {
          await client.query('ROLLBACK');
          return res.status(400).json({ success:false, error:'purchase_action_unsupported', action });
        }

        if (columns.includes('updated_at')) updates.updated_at = new Date();
        const entries = Object.entries(updates).filter(([field]) => columns.includes(field));
        const values = entries.map(([,value]) => value);
        values.push(purchaseId);
        const setSql = entries.map(([field],index) => `${quoteIdentifier(field)}=$${index + 1}`).join(',');
        const updatedResult = await client.query(`UPDATE purchase_requests SET ${setSql} WHERE id=$${values.length} RETURNING *`,values);
        await client.query('COMMIT');
        console.log('PURCHASE_ACTION_OK',JSON.stringify({ purchase_id:purchaseId, action, status:updatedResult.rows[0]?.status }));
        return res.status(200).json({ success:true, purchase:updatedResult.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
      } finally {
        client.release();
      }
    }
    if (name === 'processarNotaFiscalComClaude') {
      const intakeId = String(req.body?.intake_id || '').trim();
      const fileUrl = String(req.body?.file_url || '').trim();
      const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
      if (!intakeId || !fileUrl) return res.status(400).json({ error:'invalid_invoice_input', message:'intake_id e file_url são obrigatórios' });
      if (!apiKey) return res.status(503).json({ error:'openai_not_configured', message:'OPENAI_API_KEY não configurada' });
      const absoluteFileUrl = /^https?:\/\//i.test(fileUrl) ? fileUrl : `${req.protocol}://${req.get('host')}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
      const prompt = `Leia integralmente esta nota fiscal. Retorne somente JSON com: nf_numero, nf_valor_total (número), nf_data_emissao (YYYY-MM-DD), nf_horario_emissao (HH:MM:SS ou vazio), competencia, nf_emitente_nome, nf_emitente_cpf_cnpj, municipio, descricao_servico, centro_custo_sugerido (somente GERAL, MHAB, MIS ou MUMO), rubrica_nome_sugerida e meta_sugerida. Não use o nome do arquivo como substituto para valor ou data; extraia do conteúdo fiscal.`;
      const aiResponse = await fetch('https://api.openai.com/v1/responses', {
        method:'POST',
        headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
        body:JSON.stringify({
          model:process.env.OPENAI_INVOICE_MODEL || 'gpt-4.1-mini',
          input:[{ role:'user', content:[{ type:'input_text', text:prompt }, { type:'input_file', file_url:absoluteFileUrl }] }],
          text:{ format:{ type:'json_object' } }
        }),
        signal:AbortSignal.timeout(120000)
      });
      const raw = await aiResponse.text();
      if (!aiResponse.ok) throw new Error(`OpenAI ${aiResponse.status}: ${raw.slice(0,500)}`);
      const envelope = JSON.parse(raw);
      const outputText = envelope.output_text || envelope.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text || '';
      const result = JSON.parse(outputText);
      const current = await pool.query('SELECT resultado_ia FROM document_intakes WHERE id=$1 LIMIT 1',[intakeId]);
      if (!current.rowCount) return res.status(404).json({ error:'intake_not_found' });
      const merged = { ...(current.rows[0].resultado_ia || {}), ...result, analisado_em:new Date().toISOString(), provedor_ia:'openai' };
      await pool.query(`UPDATE document_intakes SET resultado_ia=$1::jsonb, centro_custo=COALESCE(NULLIF($2,''),centro_custo), status_processamento='AGUARDANDO_REVISAO', updated_at=NOW() WHERE id=$3`,[JSON.stringify(merged), result.centro_custo_sugerido || '', intakeId]);
      console.log('INVOICE_AI_OK',JSON.stringify({ intake_id:intakeId, nf_numero:result.nf_numero || null, has_value:Number(result.nf_valor_total)>0, has_date:!!result.nf_data_emissao }));
      return res.status(200).json({ success:true, resultado_ia:merged });
    }
    if (name === 'syncBaseConhecimento' && req.body?.force_programacao_sync) {
      const result = await syncProgramacao();
      if (result?.error) {
        return res.status(502).json({ success:false, function:name, error:'programacao_sync_failed', message:result.error });
      }
      return res.status(200).json({ success:true, function:name, programacao_sync:result });
    }
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

app.post('/api/apps/:appId/analytics/track/batch', requireSession, async (req,res) => {
  const events = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.events) ? req.body.events : [];
  console.log('ANALYTICS_BATCH', JSON.stringify({ user_id:req.userId||null, count:events.length }));
  res.status(200).json({ success:true, accepted:events.length });
});

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
