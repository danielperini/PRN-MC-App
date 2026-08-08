import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { invokeLLM } from '../_shared/gatewayIA.ts';

// =====================================================================
// varreduraUnificadaDiaria — Orquestrador único agendado.
//
// FASE 1 — CONTRATOS ASSINADOS (Drive + Gmail do Daniel), in-process:
//   • lista PDFs/DOCs da pasta "Contratos" no Drive + anexos de contrato
//     recebidos no Gmail do Daniel (danielperini.mc@viadutodasartes.org.br);
//   • verifica quais AINDA NÃO estão no app (DocumentIntake CONTRATO ativo
//     ou contrato_url já vinculado a um TeamMember);
//   • para os novos: baixa → re-upload p/ storage → LÊ COM IA (invokeGpt /
//     gatewayIA, sem consumir créditos Base44) → cria DocumentIntake
//     CONTRATO → associa à equipe (cria/atualiza TeamMember);
//   • envia e-mail ao usuário pedindo para CHECAR se é o contrato VIGENTE.
//
// FASE 2 — NFs / XML / COMPROVANTES (Drive + Gmail):
//   dispara em paralelo (Promise.allSettled, orçamento de tempo) as rotinas
//   já existentes e idempotentes:
//     - syncGmailNFsDanielPerini       (NFs PDF+XML do Gmail do Daniel)
//     - sincronizarNFsDriveBackupMensal (NFs + comprovantes no Drive)
//     - buscarXmlsNoDrive               (XMLs faltantes no Drive)
//   Falhas parceladas não abortam a FASE 1; convergem nas execuções diárias.
// =====================================================================

const CONTRATOS_DRIVE_FOLDER = '1sI_XEZpUo3W5gcs2Nik3rGm1v6bAbKTh';
const GMAIL_ACCOUNT = 'danielperini.mc@viadutodasartes.org.br';
const APP_URL = 'https://app.base44.com/apps/6834f59edf1a8e9c07bdfba2';
const BUDGET_MS = 80000;            // 80s — margem p/ limite Deno 100s
const MAX_CONTRATOS_IA = 3;         // por execução; converge diariamente
const SCORE_DRIVE = 0.5;
const SCORE_GMAIL = 0.9;

const CONTRATO_KW = ['contrato', 'termo', 'acordo', 'convenio', 'convênio', 'tc-', 'tc_', ' aditivo'];

function normalize(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
const IGNORE_TOKENS = new Set([
  'contrato','termo','acordo','aditivo','assinado','assinada','signed',
  'mc','museu','museus','centro','viaduto','artes','de','da','do','e','com',
  '2024','2025','2026','pdf','doc',
]);
function nameTokens(fn: string): string[] {
  return normalize(fn).replace(/\.(pdf|docx|doc)$/i, '').replace(/[-_]+/g, ' ')
    .split(/\s+/).filter(t => t.length > 1 && !IGNORE_TOKENS.has(t));
}
function scoreMatch(ft: string[], mName: string): number {
  const mt = normalize(mName).split(/\s+/).filter(t => t.length > 1);
  if (!mt.length) return 0;
  let m = 0;
  for (const t of mt) if (ft.some(x => x.includes(t) || t.includes(x))) m++;
  return m / mt.length;
}
function isContrato(nome: string): boolean {
  const n = normalize(nome);
  return CONTRATO_KW.some(k => n.includes(normalize(k)));
}
function fingerprintNome(n: string): string {
  return normalize(n).replace(/\.(pdf|docx|doc)$/i, '')
    .replace(/\s*[-_v]\s*\d+(\.\d+)?$/g, '')
    .replace(/\s+\d{2}\/\d{2}\/\d{4}$/, '').replace(/\s+\d{4}-\d{2}-\d{2}$/, '')
    .replace(/\s+copia\s*\d*$/g, '').replace(/\s+assinado\s*$/g, '')
    .replace(/\s+signed\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
}
function toNumber(v: unknown): number {
  const n = Number(String(v || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function b64ToBytes(b64: string): Uint8Array {
  const s = (b64 || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const bin = atob(s); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

const IA_PROMPT = `Você é especialista jurídico em contratos do Projeto Museus Centro (Viaduto das Artes / BH).
Analise INTEGRALMENTE o documento e extraia os campos. Retorne null quando não encontrar.
Campos: numero_contrato, tipo_documento (CONTRATO|TERMO_COMPROMISSO|TERMO_ADITIVO|OUTRO),
data_assinatura (YYYY-MM-DD), vigencia_inicio (YYYY-MM-DD), vigencia_fim (YYYY-MM-DD),
objeto_contrato, escopo_atividades, valor_total (número), numero_parcelas (inteiro),
valor_parcela (número), forma_pagamento, contratado_nome, contratado_tipo (PF|PJ|MEI),
contratado_cpf (só números), contratado_cnpj (só números), contratado_email, contratado_telefone,
contratado_endereco, contratado_banco, contratado_agencia, contratado_conta, contratado_tipo_conta,
contratado_pix, funcao_projeto, museu_relacionado (MIS|MHAB|MUMO|Viaduto das Artes|Geral),
centro_custo, contratante_nome, contratante_cnpj, divergencias (array de strings).`;

const IA_SCHEMA = {
  type: 'object',
  properties: {
    numero_contrato: { type: 'string' }, tipo_documento: { type: 'string' },
    data_assinatura: { type: 'string' }, vigencia_inicio: { type: 'string' }, vigencia_fim: { type: 'string' },
    objeto_contrato: { type: 'string' }, escopo_atividades: { type: 'string' },
    valor_total: { type: 'number' }, numero_parcelas: { type: 'number' }, valor_parcela: { type: 'number' },
    forma_pagamento: { type: 'string' }, contratado_nome: { type: 'string' },
    contratado_tipo: { type: 'string' }, contratado_cpf: { type: 'string' }, contratado_cnpj: { type: 'string' },
    contratado_email: { type: 'string' }, contratado_telefone: { type: 'string' },
    contratado_endereco: { type: 'string' }, contratado_banco: { type: 'string' },
    contratado_agencia: { type: 'string' }, contratado_conta: { type: 'string' },
    contratado_tipo_conta: { type: 'string' }, contratado_pix: { type: 'string' },
    funcao_projeto: { type: 'string' }, museu_relacionado: { type: 'string' },
    centro_custo: { type: 'string' }, contratante_nome: { type: 'string' },
    contratante_cnpj: { type: 'string' }, divergencias: { type: 'array', items: { type: 'string' } },
  },
};

async function listDriveContratos(token: string, fid: string, depth = 0): Promise<any[]> {
  if (depth > 4) return [];
  let files: any[] = []; let page: string | null = null;
  do {
    const q = encodeURIComponent(`'${fid}' in parents and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=100${page ? '&pageToken=' + page : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json(); if (data.error) break;
    for (const f of (data.files || [])) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        files = files.concat(await listDriveContratos(token, f.id, depth + 1));
      } else if (isContrato(f.name) && /\.(pdf|docx?)/i.test(f.name)) {
        files.push({ ...f, source: 'drive' });
      }
    }
    page = data.nextPageToken || null;
  } while (page);
  return files;
}

async function listGmailContratos(token: string, cap = 50): Promise<any[]> {
  const out: any[] = [];
  const since = Math.floor((Date.now() - 365 * 86400000) / 1000);
  const query = encodeURIComponent(`has:attachment (filename:contrato OR filename:termo OR filename:acordo) after:${since}`);
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${cap}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) return out;
  const list = await listRes.json();
  for (const msg of (list.messages || [])) {
    const mRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mRes.ok) continue;
    const m = await mRes.json();
    const parts: any[] = [];
    (function walk(p: any) { if (p.parts) p.parts.forEach(walk); else if (p.filename && p.body?.attachmentId) parts.push(p); })(m.payload);
    for (const p of parts) {
      if (isContrato(p.filename || '') && /\.(pdf|docx?)/i.test(p.filename || '')) {
        out.push({ id: `gmail_${msg.id}_${p.partId}`, name: p.filename, mime: p.mimeType, attachmentId: p.body.attachmentId, msgId: msg.id, source: 'gmail' });
      }
    }
  }
  return out;
}

async function upsertTeamMember(srv: any, dadosIA: any, fileUrl: string, intakeId?: string) {
  const nome = String(dadosIA?.contratado_nome || '').trim();
  if (!nome) return null;
  const cpf = String(dadosIA?.contratado_cpf || '').replace(/\D/g, '');
  const cnpj = String(dadosIA?.contratado_cnpj || '').replace(/\D/g, '');
  const tipoPessoa = dadosIA?.contratado_tipo === 'PJ' ? 'ME' : dadosIA?.contratado_tipo === 'MEI' ? 'MEI' : 'PF';
  let existente: any = null;
  if (cpf) { const r = await srv.entities.TeamMember.filter({ cpf }).catch(()=>[]); existente = (r as any[])[0]; }
  if (!existente && cnpj) { const r = await srv.entities.TeamMember.filter({ cnpj }).catch(()=>[]); existente = (r as any[])[0]; }
  if (!existente) { const r = await srv.entities.TeamMember.filter({ user_name: nome }).catch(()=>[]); existente = (r as any[])[0]; }
  const ficha: Record<string, any> = {
    user_name: nome, tipo_pessoa: tipoPessoa, cpf: cpf || null, cnpj: cnpj || null,
    funcao: dadosIA?.funcao_projeto || '', email_pessoal: dadosIA?.contratado_email || null,
    telefone: dadosIA?.contratado_telefone || null, empresa_endereco: dadosIA?.contratado_endereco || null,
    banco: dadosIA?.contratado_banco || '', agencia: dadosIA?.contratado_agencia || '',
    conta: dadosIA?.contratado_conta || '', tipo_conta: dadosIA?.contratado_tipo_conta || 'Corrente',
    pix_key: dadosIA?.contratado_pix || '', valor_total: toNumber(dadosIA?.valor_total),
    numero_parcelas: toNumber(dadosIA?.numero_parcelas) || 1, valor_parcela: toNumber(dadosIA?.valor_parcela),
    data_assinatura: dadosIA?.data_assinatura || null, data_inicio_contrato: dadosIA?.vigencia_inicio || null,
    data_fim_contrato: dadosIA?.vigencia_fim || null, contrato_url: fileUrl, objeto_contrato: dadosIA?.objeto_contrato || '',
    escopo_descricao: dadosIA?.escopo_atividades || '', museu_projeto: dadosIA?.museu_relacionado || '',
    centro_custo: dadosIA?.centro_custo || '', status: 'ATIVO', status_contrato: 'VIGENTE',
    numero_contrato: dadosIA?.numero_contrato || '',
  };
  if (existente) {
    const upd: Record<string, any> = {};
    for (const k of Object.keys(ficha)) {
      const key = k as keyof typeof ficha;
      if (!existente[key] && ficha[key]) upd[k] = ficha[key];
    }
    if (fileUrl && existente.contrato_url !== fileUrl) upd.contrato_url = fileUrl;
    if (Object.keys(upd).length) await srv.entities.TeamMember.update(existente.id, upd).catch(()=>{});
    return { acao: 'atualizado', id: existente.id, nome, user_email: existente.user_email };
  }
  const emailInterno = cpf ? `cpf.${cpf}@contrato.interno` : cnpj ? `cnpj.${cnpj}@contrato.interno`
    : `membro.${normalize(nome).replace(/\s+/g, '.')}.${Date.now()}@contrato.interno`;
  const criado = await srv.entities.TeamMember.create({ ...ficha, user_email: emailInterno }).catch(()=>null);
  return { acao: 'criado', id: criado?.id, nome, user_email: emailInterno };
}

async function emailVerificarVigencia(srv: any, email: string, nome: string, arquivo: string, link: string, dadosIA: any) {
  if (!email || !/@/.test(email) || /@contrato\.interno$/i.test(email)) return false;
  const vig = dadosIA?.vigencia_fim ? `<br><strong>Vigência informada no documento:</strong> ${dadosIA.vigencia_inicio || '?'} a ${dadosIA.vigencia_fim}` : '';
  try {
    await srv.integrations.Core.SendEmail({
      to: email,
      subject: '📋 Por favor, confirme: este é o seu contrato vigente?',
      body: `<p>Olá, <strong>${nome}</strong>!</p>
        <p>Localizamos um contrato/termo assinado em seu nome e o vinculamos ao seu cadastro na plataforma <strong>Museus Centro</strong>.</p>
        <p><strong>Arquivo:</strong> ${arquivo}${vig}</p>
        <p>Precisamos da sua confirmação: <strong>este documento é o seu contrato <em>vigente</em> atual?</strong></p>
        <ul><li>Se <strong>sim</strong>, nenhuma ação é necessária.</li>
        <li>Se <strong>não</strong> (existir versão mais recente, rescisão ou aditivo), por favor responda este e-mail ou envie a versão atualizada.</li></ul>
        <p><a href="${link}" style="background:#1a1a1a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Ver documento</a></p>
        <p style="margin-top:16px;">Acesse sua <strong>Sala</strong> na plataforma para revisar a ficha completa.</p>
        <p style="color:#888;font-size:12px;">Museus Centro — Viaduto das Artes</p>`,
    });
    return true;
  } catch (e) {
    console.warn('[varreduraUnificadaDiaria] SendEmail falhou:', String(e?.message || e));
    return false;
  }
}

Deno.serve(async (req) => {
  const start = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;

  const body = await req.json().catch(() => ({}));
  const isCron = req.headers.get('x-base44-trigger') === 'cron' || body.cron === true || body.cron === '1';
  if (!isCron) {
    const u = await base44.auth.me().catch(() => null);
    if (!u) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    if (!['admin', 'coordenador', 'coordinator'].includes((u.role || '').toLowerCase())) {
      return Response.json({ ok: false, error: 'Acesso restrito à coordenação geral.' }, { status: 403 });
    }
  }

  const out: any = {
    ok: true, inicio: new Date(start).toISOString(),
    contratos: { analisados: 0, novos_no_app: 0, ia_lidos: 0, vinculados_equipe: 0, emails_vigencia: 0, ja_no_app: 0, erros: [] },
    nfs: { invocadas: [], resumo: [] },
  };

  let driveToken: string | null = null;
  let gmailToken: string | null = null;
  try { driveToken = (await srv.connectors.getConnection('googledrive'))?.accessToken || null; } catch (_) {}
  try { gmailToken = (await srv.connectors.getConnection('gmail'))?.accessToken || null; } catch (_) {}

  // ── candidatos de contratos (Drive + Gmail) ──
  const candidatos: any[] = [];
  if (driveToken) {
    try { candidatos.push(...await listDriveContratos(driveToken, CONTRATOS_DRIVE_FOLDER)); } catch (e) { out.contratos.erros.push('drive_list: ' + String(e?.message || e)); }
  }
  if (gmailToken) candidatos.push(...await listGmailContratos(gmailToken).catch((e) => { out.contratos.erros.push('gmail_list: ' + String(e?.message || e)); return []; }));

  // ── já no app? (DocumentIntake CONTRATO ativo por fingerprint + TeamMember.contrato_url) ──
  const existentes = await srv.entities.DocumentIntake.filter({ tipo_detectado: 'CONTRATO', status_registro: 'ATIVO' }, '', 500).catch(() => []) as any[];
  const fpExist = new Set(existentes.map((e: any) => fingerprintNome(e.file_name_original || '')));
  const members = await srv.entities.TeamMember.list('', 500).catch(() => []) as any[];
  const urlExist = new Set(members.map((m: any) => m.contrato_url).filter(Boolean));

  const novos = candidatos.filter((f) => {
    const fp = fingerprintNome(f.name);
    const driveUrl = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
    return !fpExist.has(fp) && !urlExist.has(driveUrl);
  });

  out.contratos.analisados = candidatos.length;
  out.contratos.ja_no_app = candidatos.length - novos.length;

  // ── processar novos (cap + budget) ──
  let processados = 0;
  for (const f of novos) {
    if (Date.now() - start > BUDGET_MS || processados >= MAX_CONTRATOS_IA) break;
    try {
      // 1. obter bytes do documento
      let bytes: Uint8Array | null = null;
      let mime = 'application/pdf';
      if (f.source === 'drive') {
        const expRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: { Authorization: `Bearer ${driveToken}` } });
        if (!expRes.ok) { out.contratos.erros.push(`download ${f.name}: ${expRes.status}`); continue; }
        bytes = new Uint8Array(await expRes.arrayBuffer());
      } else if (gmailToken) {
        const attRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${f.msgId}/attachments/${f.attachmentId}`, { headers: { Authorization: `Bearer ${gmailToken}` } });
        if (!attRes.ok) { out.contratos.erros.push(`gmail att ${f.name}: ${attRes.status}`); continue; }
        bytes = b64ToBytes((await attRes.json()).data || '');
        mime = f.mime || 'application/pdf';
      }
      if (!bytes) continue;

      // 2. upload p/ storage (necessário p/ IA ler)
      const file = new File([bytes], f.name, { type: mime });
      const upRes = await srv.integrations.Core.UploadFile({ file }).catch((e: any) => { out.contratos.erros.push('upload: ' + String(e?.message || e)); return null; });
      const fileUrl = upRes?.file_url || upRes?.url || '';
      if (!fileUrl) continue;

      // 3. LER COM IA (gateway invokeGpt — não consome créditos Base44)
      let dadosIA: any = null;
      try { dadosIA = await invokeLLM(srv, { prompt: IA_PROMPT, file_urls: [fileUrl], model: 'claude_sonnet_4_6', response_json_schema: IA_SCHEMA }); }
      catch (e) { out.contratos.erros.push('ia: ' + String(e?.message || e)); }

      // 4. criar DocumentIntake CONTRATO (registro no app)
      const intake = await srv.entities.DocumentIntake.create({
        user_email: GMAIL_ACCOUNT, user_name: dadosIA?.contratado_nome || 'Contrato',
        arquivo_original_url: fileUrl, file_name_original: f.name,
        mime_type: mime, tipo_detectado: 'CONTRATO', status_processamento: 'AGUARDANDO_REVISAO',
        status_registro: 'ATIVO', grupo_status: 'COMPLETO', origem: f.source === 'gmail' ? 'gmail_contratos' : 'drive_contratos',
        revisado_pelo_usuario: false, resultado_ia: dadosIA ? { ...dadosIA } : null,
        erros_validacao: dadosIA?.divergencias || [],
        fornecedor_nome: dadosIA?.contratado_nome || '', nf_emitente_nome: dadosIA?.contratado_nome || '',
        centro_custo: dadosIA?.centro_custo || '', contrato_numero: dadosIA?.numero_contrato || '',
        contrato_drive_url: f.webViewLink || '', contrato_drive_folder_id: CONTRATOS_DRIVE_FOLDER,
      }).catch((e: any) => { out.contratos.erros.push('intake: ' + String(e?.message || e)); return null; });

      // 5. ASSOCIAR à equipe (cria/atualiza TeamMember)
      const tmRes = await upsertTeamMember(srv, dadosIA, fileUrl, intake?.id);
      if (tmRes) out.contratos.vinculados_equipe++;
      out.contratos.novos_no_app++;

      // 6. match por nome (score) — se IA não casou, associa pelo nome do arquivo
      if (!tmRes?.id && members.length) {
        const ft = nameTokens(f.name);
        let best: any = null, bs = 0;
        for (const m of members) { if (!m.user_name) continue; const s = scoreMatch(ft, m.user_name); if (s > bs) { bs = s; best = m; } }
        if (best && bs >= (f.source === 'gmail' ? SCORE_GMAIL : SCORE_DRIVE)) {
          const driveUrl = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
          await srv.entities.TeamMember.update(best.id, { contrato_url: fileUrl || driveUrl }).catch(()=>{});
          await srv.entities.BackupLog.create({
            backup_type: 'drive_folders', entity_type: 'CONTRACT_AUTO_SYNC', entity_id: best.id,
            drive_file_id: f.id, file_name: f.name, status: 'success', processed_at: new Date().toISOString(),
            details: `Contrato vinculado a ${best.user_name} (score ${Math.round(bs * 100)}%, ${f.source})`, triggered_by: 'scheduled',
          }).catch(()=>{});
          out.contratos.vinculados_equipe++;
        }
      }

      // backup log padrao
      await srv.entities.BackupLog.create({
        backup_type: 'drive_folders', entity_type: 'CONTRACT_AUTO_SYNC', status: 'success',
        file_name: f.name, drive_file_id: f.id, entity_id: tmRes?.id || intake?.id || '',
        processed_at: new Date().toISOString(), triggered_by: 'scheduled',
        details: `Contrato importado (${f.source}) — IA: ${dadosIA ? 'ok' : 'falhou'}`,
      }).catch(()=>{});

      // 7. e-mail p/ usuário checar vigência
      const destEmail = tmRes?.user_email || dadosIA?.contratado_email || '';
      const linkDoc = f.webViewLink || fileUrl;
      if (await emailVerificarVigencia(srv, destEmail, dadosIA?.contratado_nome || tmRes?.nome || '', f.name, linkDoc, dadosIA)) {
        out.contratos.emails_vigencia++;
      }

      if (dadosIA) out.contratos.ia_lidos++;
      processados++;
    } catch (e) {
      out.contratos.erros.push(`${f.name}: ${String(e?.message || e)}`);
    }
  }

  // ── FASE 2: NFs (XML + comprovantes) — invoca rotinas existentes em paralelo ──
  if (Date.now() - start < BUDGET_MS) {
    const nfCalls: Promise<any>[] = [
      base44.functions.invoke('syncGmailNFsDanielPerini', { cron: true, maxResults: 5 }).catch((e: any) => ({ error: String(e?.message || e) })),
      base44.functions.invoke('sincronizarNFsDriveBackupMensal', { cron: true }).catch((e: any) => ({ error: String(e?.message || e) })),
      base44.functions.invoke('buscarXmlsNoDrive', { cron: true }).catch((e: any) => ({ error: String(e?.message || e) })),
    ];
    out.nfs.invocadas = ['syncGmailNFsDanielPerini', 'sincronizarNFsDriveBackupMensal', 'buscarXmlsNoDrive'];
    const settled = await Promise.allSettled(nfCalls);
    out.nfs.resumo = settled.map((r, i) => {
      if (r.status === 'fulfilled') {
        const v = r.value;
        return { fn: out.nfs.invocadas[i], ok: !v?.error, resumo: v?.resumo || v?.resumo?.resumo || v || null, error: v?.error || null };
      }
      return { fn: out.nfs.invocadas[i], ok: false, error: String((r.reason as any)?.message || r.reason) };
    });
  }

  out.duracao_ms = Date.now() - start;
  await srv.entities.BackupLog.create({
    backup_type: 'auditoria_entrada_unica', entity_type: 'varreduraUnificadaDiaria',
    status: 'concluido', processed_at: new Date().toISOString(), triggered_by: isCron ? 'scheduled' : 'manual',
    execution_time_ms: out.duracao_ms, details: JSON.stringify(out.contratos),
    error_message: out.contratos.erros.length ? out.contratos.erros.slice(0, 3).join('; ').slice(0, 500) : '',
  }).catch(() => {});

  return Response.json(out);
});