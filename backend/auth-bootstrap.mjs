import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { brandedEmailHtml, brandedEmailText, publicAppUrl, reportSubmissionSteps } from './email-layout.mjs';

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
const GOOGLE_STATE_COOKIE = 'appgestor_google_oauth_state';
const GOOGLE_RETURN_COOKIE = 'appgestor_google_oauth_return';
const APP_ORIGIN = publicAppUrl(process.env.PUBLIC_BASE_URL);

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
  const message = `Você deixou ${items.join(' e ')} no Gestor Museus Centro. Conclua o preenchimento e envie para aprovação.`;
  const text = brandedEmailText({ greeting:`Olá, ${firstName}`, message, steps:reportSubmissionSteps, ctaLabel:'Abrir pendências', ctaUrl:APP_ORIGIN, recipientEmail:email });
  await transport.sendMail({
    from:`Gestor Museus Centro <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to:email,
    subject:'Pendência no Gestor Museus Centro',
    text,
    html:brandedEmailHtml({ appUrl:APP_ORIGIN, title:'Pendência de preenchimento', greeting:`Olá, ${firstName}`, message, steps:reportSubmissionSteps, ctaLabel:'Abrir pendências', ctaUrl:APP_ORIGIN, recipientEmail:email })
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

function safeReturnPath(value) {
  const fallback = '/';
  if (!value) return fallback;
  try {
    const url = new URL(String(value), APP_ORIGIN);
    if (url.origin !== new URL(APP_ORIGIN).origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`.startsWith('/')
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${APP_ORIGIN}/api/auth/google/callback`;
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
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
      user_id BIGINT NOT NULL,
      session_token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_hash ON auth_sessions(session_token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS auth_login_events (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT UNIQUE,
      user_id BIGINT NOT NULL,
      email TEXT NOT NULL,
      method TEXT NOT NULL,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_auth_login_events_email ON auth_login_events(lower(email),logged_at DESC);
    CREATE TABLE IF NOT EXISTS user_permissions (
      id BIGSERIAL PRIMARY KEY,
      user_email TEXT NOT NULL UNIQUE,
      user_name TEXT,
      base_role TEXT,
      can_review_reports BOOLEAN DEFAULT FALSE,
      can_manage_users BOOLEAN DEFAULT FALSE,
      can_manage_files BOOLEAN DEFAULT FALSE,
      can_view_audit_log BOOLEAN DEFAULT FALSE,
      can_manage_platform BOOLEAN DEFAULT FALSE,
      gestao_compras BOOLEAN DEFAULT FALSE,
      pode_aprovar_solicitacoes BOOLEAN DEFAULT FALSE,
      can_curate_news BOOLEAN DEFAULT FALSE,
      must_submit_monthly_reports BOOLEAN DEFAULT FALSE,
      can_view_sponsor_dashboard BOOLEAN DEFAULT FALSE,
      can_view_approved_reports BOOLEAN DEFAULT FALSE,
      can_view_approved_programacao BOOLEAN DEFAULT FALSE,
      can_view_public_gallery BOOLEAN DEFAULT FALSE,
      can_view_budget_summary BOOLEAN DEFAULT FALSE,
      can_view_project_kpis BOOLEAN DEFAULT FALSE,
      created_date TIMESTAMPTZ DEFAULT NOW(),
      updated_date TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_registrations (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      museu TEXT,
      role TEXT,
      base_role TEXT,
      funcao TEXT,
      equipe TEXT,
      login_provider TEXT,
      status TEXT NOT NULL DEFAULT 'PENDENTE',
      acesso_liberado BOOLEAN NOT NULL DEFAULT FALSE,
      aprovado_em TIMESTAMPTZ,
      created_date TIMESTAMPTZ DEFAULT NOW(),
      updated_date TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS auth_password_resets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_auth_password_resets_user ON auth_password_resets(user_id,created_at DESC);
  `);
  // Existing sessions are the only reliable historical proof of sign-in.
  // Preserve them once; new sessions are logged atomically with their id.
  await pool.query(`INSERT INTO auth_login_events(session_id,user_id,email,method,logged_at)
    SELECT s.id,u.id,lower(u.email),'legacy_session',s.created_at
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    ON CONFLICT (session_id) DO NOTHING`);
}

async function createSession(res, userId, method) {
  const accessToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  const session = await pool.query(
    `INSERT INTO auth_sessions(user_id, session_token_hash, expires_at) VALUES($1,$2,$3) RETURNING id`,
    [String(userId), hashToken(accessToken), expiresAt]
  );
  await pool.query('INSERT INTO auth_login_events(session_id,user_id,email,method) SELECT $2,id,lower(email),$3 FROM users WHERE id=$1', [userId,session.rows[0].id,method]);
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
  return accessToken;
}

async function managementActor(req) {
  const raw = cookies(req)[COOKIE];
  if (!raw) return null;
  const result = await pool.query(`SELECT u.id,u.email,u.role,u.acesso_liberado,u.is_verified
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.session_token_hash=$1 AND s.expires_at>NOW() LIMIT 1`, [hashToken(raw)]);
  const actor = result.rows[0];
  if (!actor || actor.acesso_liberado !== true || actor.is_verified !== true) return null;
  if (['ADMIN','COORDENADOR'].includes(String(actor.role || '').toUpperCase())) return actor;
  const permission = await pool.query('SELECT can_manage_users FROM user_permissions WHERE lower(user_email)=lower($1) LIMIT 1',[actor.email]);
  return permission.rows[0]?.can_manage_users === true ? actor : null;
}

async function installAuth(app) {
  await ensureAuthSchema().catch(e => console.error('AUTH_SCHEMA_INIT_ERROR', e));

  app.post('/api/public/register', async (req,res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const fullName = String(req.body?.full_name || '').trim().slice(0,160);
    const role = String(req.body?.role || 'PROFISSIONAL').toUpperCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || !['PROFISSIONAL','COORDENADOR','OBSERVADOR'].includes(role)) {
      return res.status(400).json({ error:'invalid_registration' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query('SELECT id FROM users WHERE lower(email)=$1 LIMIT 1',[email]);
      if (user.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error:'account_exists' }); }
      await client.query(`INSERT INTO user_registrations
        (email,full_name,museu,role,base_role,funcao,equipe,login_provider,status,acesso_liberado)
        VALUES ($1,$2,$3,$4,$4,$5,$6,'email_or_google','PENDENTE',FALSE)
        ON CONFLICT (email) DO UPDATE SET full_name=EXCLUDED.full_name,museu=EXCLUDED.museu,
          role=EXCLUDED.role,base_role=EXCLUDED.base_role,funcao=EXCLUDED.funcao,equipe=EXCLUDED.equipe,
          status='PENDENTE',acesso_liberado=FALSE,updated_date=NOW()
        `,[email,fullName,String(req.body?.museu||'').slice(0,100),role,
          String(req.body?.funcao||'').slice(0,100),String(req.body?.equipe||'').slice(0,100)]);
      await client.query('COMMIT');
      return res.status(202).json({ success:true, status:'PENDENTE' });
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>{});
      console.error('REGISTRATION_ERROR',error);
      return res.status(500).json({ error:'registration_failed' });
    } finally { client.release(); }
  });

  app.post('/api/auth/password/reset/request', async (req,res) => {
    const email=String(req.body?.email||'').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'invalid_email'});
    const accepted={success:true,message:'Se a conta estiver ativa, um link de redefinição será enviado.'};
    let resetId=null;
    try {
      const user=(await pool.query('SELECT id,full_name FROM users WHERE lower(email)=$1 AND acesso_liberado IS TRUE AND is_verified IS TRUE LIMIT 1',[email])).rows[0];
      if (!user) return res.status(202).json(accepted);
      const recent=await pool.query(`SELECT 1 FROM auth_password_resets WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 hour' LIMIT 1`,[user.id]);
      if (recent.rowCount) return res.status(202).json(accepted);
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return res.status(503).json({error:'mail_unavailable'});
      const token=randomToken();
      const reset=await pool.query(`INSERT INTO auth_password_resets(user_id,token_hash,expires_at)
        VALUES($1,$2,NOW()+INTERVAL '30 minutes') RETURNING id`,[user.id,hashToken(token)]);
      resetId=reset.rows[0].id;
      const password=process.env.SMTP_PASS_B64?Buffer.from(process.env.SMTP_PASS_B64,'base64').toString('utf8'):process.env.SMTP_PASS;
      const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:String(process.env.SMTP_SECURE).toLowerCase()==='true',auth:{user:process.env.SMTP_USER,pass:password}});
      const url=`${APP_ORIGIN}/login?reset_token=${encodeURIComponent(token)}`;
      await transport.sendMail({from:`Gestor Museus Centro <${process.env.SMTP_FROM||process.env.SMTP_USER}>`,to:email,
        subject:'Redefinir senha — Gestor Museus Centro',
        text:brandedEmailText({greeting:`Olá, ${String(user.full_name||email).split(' ')[0]}`,message:'Use o link abaixo para definir uma nova senha. O link vence em 30 minutos e só pode ser usado uma vez.',ctaLabel:'Redefinir senha',ctaUrl:url}),
        html:brandedEmailHtml({appUrl:APP_ORIGIN,title:'Redefina sua senha',greeting:`Olá, ${String(user.full_name||email).split(' ')[0]}`,message:'Use o link abaixo para definir uma nova senha. O link vence em 30 minutos e só pode ser usado uma vez.',ctaLabel:'Redefinir senha',ctaUrl:url,accountHint:'Este link é pessoal. Não compartilhe com ninguém.'})});
      return res.status(202).json(accepted);
    } catch(error) {
      if (resetId) await pool.query('DELETE FROM auth_password_resets WHERE id=$1',[resetId]).catch(()=>{});
      console.error('PASSWORD_RESET_REQUEST_ERROR',error.message);
      return res.status(202).json(accepted);
    }
  });

  app.post('/api/auth/password/reset/confirm', async (req,res) => {
    const token=String(req.body?.token||'');
    const password=String(req.body?.password||'');
    if (!/^[a-f0-9]{64}$/.test(token) || password.length<8 || password.length>256) return res.status(400).json({error:'invalid_reset'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const reset=(await client.query(`SELECT r.id,r.user_id FROM auth_password_resets r
        JOIN users u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.used_at IS NULL AND r.expires_at>NOW()
          AND u.acesso_liberado IS TRUE AND u.is_verified IS TRUE FOR UPDATE OF r`,[hashToken(token)])).rows[0];
      if (!reset) {await client.query('ROLLBACK');return res.status(400).json({error:'expired_or_used_token'});}
      await client.query('UPDATE users SET password_hash=$2,updated_date=NOW() WHERE id=$1',[reset.user_id,await bcrypt.hash(password,12)]);
      await client.query('UPDATE auth_password_resets SET used_at=NOW() WHERE id=$1',[reset.id]);
      await client.query('DELETE FROM auth_sessions WHERE user_id::text=$1',[String(reset.user_id)]);
      await client.query('COMMIT');
      return res.json({success:true});
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});console.error('PASSWORD_RESET_CONFIRM_ERROR',error);return res.status(500).json({error:'reset_failed'});}
    finally {client.release();}
  });

  app.get('/api/admin/user-login-stats', async (req,res) => {
    try {
      if (!(await managementActor(req))) return res.status(403).json({ error:'manage_users_required' });
      const result = await pool.query(`SELECT lower(u.email) AS email,
        COUNT(DISTINCT e.id)::int AS total_logins, MAX(e.logged_at) AS ultimo_login_em,
        COUNT(DISTINCT s.id) FILTER (WHERE s.expires_at>NOW())::int AS active_sessions
        FROM users u LEFT JOIN auth_login_events e ON e.user_id=u.id
        LEFT JOIN auth_sessions s ON s.user_id::text=u.id::text
        GROUP BY u.id,lower(u.email)`);
      return res.json({ statsByEmail:Object.fromEntries(result.rows.map(row=>[row.email,row])), unavailable:false });
    } catch(error) { console.error('LOGIN_STATS_ERROR',error); return res.status(500).json({ error:'login_stats_failed' }); }
  });

  app.post('/api/admin/users/:id/revoke-sessions', async (req,res) => {
    try {
      if (!(await managementActor(req))) return res.status(403).json({ error:'manage_users_required' });
      const result=await pool.query('DELETE FROM auth_sessions WHERE user_id::text=$1',[String(req.params.id)]);
      return res.json({ success:true,revoked:result.rowCount });
    } catch(error) { console.error('REVOKE_USER_SESSIONS_ERROR',error); return res.status(500).json({ error:'revoke_sessions_failed' }); }
  });

  app.post('/api/admin/user-registrations/:id/approve', async (req,res) => {
    if (!(await managementActor(req))) return res.status(403).json({ error:'manage_users_required' });
    const role = String(req.body?.role || 'PROFISSIONAL').toUpperCase();
    if (!['PROFISSIONAL','COORDENADOR','OBSERVADOR'].includes(role)) return res.status(400).json({ error:'invalid_role' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const registration = await client.query(`SELECT * FROM user_registrations WHERE id=$1 FOR UPDATE`,[req.params.id]);
      const row = registration.rows[0];
      if (!row || row.status !== 'PENDENTE') { await client.query('ROLLBACK'); return res.status(409).json({ error:'registration_not_pending' }); }
      const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1',[row.email]);
      if (existing.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error:'account_exists' }); }
      const uid = crypto.randomBytes(12).toString('hex');
      const user = await client.query(`INSERT INTO users
        (base44_id,email,full_name,role,base_role,funcao,equipe,museu,acesso_liberado,is_verified,
         is_service,force_password_reset,created_date,updated_date,raw_data)
        VALUES ($1,$2,$3,$4,$4,$5,$6,$7,TRUE,TRUE,FALSE,FALSE,NOW(),NOW(),$8) RETURNING id,email,full_name,role`,
        [uid,row.email,row.full_name,role,row.funcao,row.equipe,row.museu,
          JSON.stringify({id:uid,email:row.email,full_name:row.full_name,role,base_role:role,funcao:row.funcao,equipe:row.equipe,museu:row.museu,acesso_liberado:true,is_verified:true})]);
      await client.query(`INSERT INTO user_permissions(user_email,user_name,base_role,must_submit_monthly_reports)
        VALUES($1,$2,$3,$4) ON CONFLICT(user_email) DO UPDATE SET user_name=EXCLUDED.user_name,
        base_role=EXCLUDED.base_role,must_submit_monthly_reports=EXCLUDED.must_submit_monthly_reports,updated_date=NOW()`,
        [row.email,row.full_name,role,role==='PROFISSIONAL']);
      await client.query(`UPDATE user_registrations SET status='APROVADO',acesso_liberado=TRUE,base_role=$2,role=$2,aprovado_em=NOW(),updated_date=NOW() WHERE id=$1`,[row.id,role]);
      await client.query('COMMIT');
      let emailSent=false;
      try {
        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
          const password=process.env.SMTP_PASS_B64?Buffer.from(process.env.SMTP_PASS_B64,'base64').toString('utf8'):process.env.SMTP_PASS;
          const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:String(process.env.SMTP_SECURE).toLowerCase()==='true',auth:{user:process.env.SMTP_USER,pass:password}});
          const url=`${APP_ORIGIN}/login`;
          const message='Sua solicitação foi aprovada. Entre com a conta Google deste e-mail ou use “Esqueci minha senha” para criar uma senha com um link pessoal.';
          await transport.sendMail({from:`Gestor Museus Centro <${process.env.SMTP_FROM||process.env.SMTP_USER}>`,to:row.email,
            subject:'Acesso aprovado — Gestor Museus Centro',
            text:brandedEmailText({greeting:`Olá, ${row.full_name.split(' ')[0]}`,message,ctaLabel:'Acessar o app',ctaUrl:url}),
            html:brandedEmailHtml({appUrl:APP_ORIGIN,title:'Seu acesso foi aprovado',greeting:`Olá, ${row.full_name.split(' ')[0]}`,message,ctaLabel:'Acessar o app',ctaUrl:url,accountHint:'Use o mesmo e-mail informado no cadastro. Se preferir senha, escolha “Esqueci minha senha” na tela de entrada.'})});
          emailSent=true;
        }
      } catch(mailError) {console.error('APPROVAL_EMAIL_ERROR',mailError.message);}
      return res.json({ success:true,user:user.rows[0],email_sent:emailSent });
    } catch(error) { await client.query('ROLLBACK').catch(()=>{}); console.error('APPROVE_REGISTRATION_ERROR',error); return res.status(500).json({ error:'approve_failed' }); }
    finally { client.release(); }
  });

  app.post('/api/admin/user-registrations/:id/reject', async (req,res) => {
    try {
      if (!(await managementActor(req))) return res.status(403).json({ error:'manage_users_required' });
      const result = await pool.query(`UPDATE user_registrations SET status='REJEITADO',acesso_liberado=FALSE,updated_date=NOW()
        WHERE id=$1 AND status='PENDENTE' RETURNING id`,[req.params.id]);
      return result.rowCount ? res.json({ success:true }) : res.status(409).json({ error:'registration_not_pending' });
    } catch(error) { console.error('REJECT_REGISTRATION_ERROR',error); return res.status(500).json({ error:'reject_failed' }); }
  });

  // Google OAuth is the standard entry point for the project team.  The
  // production frontend invokes this exact route through the Base44 client.
  app.get(['/api/auth/google', '/api/apps/auth/google'], (req, res) => {
    const client = oauthClient();
    if (!client) return res.status(503).send('Login Google indisponível: OAuth não configurado.');

    const state = randomToken();
    const returnTo = safeReturnPath(req.query?.return_to || req.query?.from_url || '/');
    res.setHeader('Set-Cookie', [
      `${GOOGLE_STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      `${GOOGLE_RETURN_COOKIE}=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    ]);
    res.redirect(client.generateAuthUrl({
      access_type: 'online',
      prompt: 'select_account',
      scope: ['openid', 'email', 'profile'],
      state,
    }));
  });

  app.get(['/api/auth/google/callback', '/api/apps/auth/google/callback'], async (req, res) => {
    const returnTo = safeReturnPath(cookies(req)[GOOGLE_RETURN_COOKIE] || '/');
    const clearOauthCookies = [
      `${GOOGLE_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      `${GOOGLE_RETURN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    ];
    try {
      const client = oauthClient();
      const expectedState = cookies(req)[GOOGLE_STATE_COOKIE];
      const actualState = String(req.query?.state || '');
      const code = String(req.query?.code || '');
      if (!client || !expectedState || !actualState || !code || expectedState.length !== actualState.length || !crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(actualState))) {
        res.setHeader('Set-Cookie', clearOauthCookies);
        return res.redirect('/login?error=google_auth_invalid');
      }

      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);
      const profile = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
      const email = String(profile.data.email || '').trim().toLowerCase();
      const result = await pool.query(`SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
      const user = result.rows[0];
      if (!user || user.acesso_liberado !== true || user.is_verified !== true) {
        res.setHeader('Set-Cookie', clearOauthCookies);
        return res.redirect('/login?error=access_not_authorized');
      }

      await createSession(res, user.id, 'google');
      // createSession sets the session cookie; append the OAuth cleanup cookies.
      const current = res.getHeader('Set-Cookie');
      res.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : [current]).filter(Boolean), ...clearOauthCookies]);
      return res.redirect(returnTo);
    } catch (error) {
      console.error('GOOGLE_AUTH_CALLBACK_ERROR', { message: error?.message });
      res.setHeader('Set-Cookie', clearOauthCookies);
      return res.redirect('/login?error=google_auth_failed');
    }
  });

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
      if (user.rows[0].acesso_liberado !== true || user.rows[0].is_verified !== true) return res.status(403).json({ error:'access_not_authorized' });
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
      if (user.acesso_liberado !== true || user.is_verified !== true) return res.status(403).json({ error:'access_not_authorized' });
      const stored = String(user.password_hash || '');
      let valid = false;
      if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) valid = await bcrypt.compare(password, stored);
      else if (stored.startsWith('sha256:')) valid = crypto.createHash('sha256').update(password).digest('hex') === stored.slice(7);
      if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
      const accessToken = await createSession(res, user.id, 'password');
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
