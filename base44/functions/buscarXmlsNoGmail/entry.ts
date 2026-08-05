import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// buscarXmlsNoGmail — FASE 3 do pipeline de conciliação da Entrada Única.
// ---------------------------------------------------------------------
// Para cada NF PDF em AGUARDANDO_REVISAO sem XML vinculado (e sem duplicidade
// confirmada), pesquisa na caixa conectada do Gmail (autorizada via conector)
// por mensagens dos últimos 90 dias contendo anexo .xml com query
// "has:attachment filename:.xml [número NF] [tokens do fornecedor]".
// Ao encontrar: baixa o anexo XML, faz upload para o Base44, cria um novo
// DocumentIntake NOTA_FISCAL_XML (AGUARDANDO_REVISAO, origem=buscarXmlsNoGmail)
// e faz o vínculo bidirecional com o PDF.
// Limite de 5 NFs por execução (para não estourar o timeout de 50s do Gmail
// API). Idempotente: pula intakes já com nf_xml_intake_id.
// =====================================================================

const MAX_NFS = 5;
const DAYS_BACK = 90;
const BUDGET_MS = 70000;

function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
function digits(v) {
  return String(v || '').replace(/\D/g, '');
}
function safeStr(v) {
  return String(v || '').trim();
}

const STOP_TOKENS = new Set([
  'nf', 'nfe', 'nfse', 'danfe', 'nota', 'fiscal', 'museus', 'centro', 'centros',
  'museu', 'noturno', 'pampulha', '2026', '2025', '2024', 'bh', 'mis', 'mhab',
  'mumo', 'comp', 'comprovante', 'boleto', 'recibo', 'pix', 'pagamento', 'pdf',
  'xml', 'r', 'rs', 'reais', 'viaduto', 'artes', 'ltda', 'me', 'eireli', 'sa',
]);

function fornecedorTokens(s) {
  const n = norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (const t of n) {
    if (t.length < 3) continue;
    if (STOP_TOKENS.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    out.push(t);
  }
  return [...new Set(out)].slice(0, 3);
}

function numeroNF(intake) {
  const ia = intake?.resultado_ia || {};
  let n = safeStr(intake?.nf_numero || ia.nf_numero || '');
  if (!n) {
    const name = intake?.file_name_final || intake?.file_name_original || '';
    const base = String(name).replace(/\.[^.]+$/, '');
    const nums = base.match(/\d{3,}/g) || [];
    const cand = nums.filter((x) => x.length >= 3 && x.length <= 10);
    n = cand[0] || nums[0] || '';
  }
  return digits(n);
}

function fornecedorNome(intake) {
  const ia = intake?.resultado_ia || {};
  return safeStr(
    intake?.fornecedor_nome || intake?.nf_emitente_nome ||
    ia.fornecedor_nome || ia.nf_emitente_nome || ia.emitente_nome || ''
  );
}

function b64ToBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function listMessages(token, query) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const d = await r.json().catch(() => ({}));
  return d.messages || [];
}

async function getMessage(token, id) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return await r.json().catch(() => null);
}

async function downloadAttachment(token, msgId, attId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${attId}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  if (!d || !d.data) return null;
  return b64ToBytes(d.data);
}

function findXmlAttachment(parts) {
  for (const p of parts || []) {
    const fn = String(p?.filename || '').toLowerCase();
    const mt = String(p?.mimeType || '').toLowerCase();
    if ((fn.endsWith('.xml') || mt.includes('xml')) && p?.body?.attachmentId) return p;
    if (Array.isArray(p?.parts)) {
      const sub = findXmlAttachment(p.parts);
      if (sub) return sub;
    }
  }
  return null;
}

async function registrarBackupLog(srv, dados) {
  try {
    await srv.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      entity_type: 'buscarXmlsNoGmail',
      status: 'concluido',
      processed_at: new Date().toISOString(),
      triggered_by: dados.triggeredBy,
      execution_time_ms: dados.execution_ms,
      details: JSON.stringify(dados.resumo),
      error_message: dados.resumo.erros.length > 0 ? dados.resumo.erros.slice(0, 3).join('; ').slice(0, 500) : '',
    });
  } catch (_) {}
}

Deno.serve(async (req) => {
  const start = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;
  const db = srv.entities;
  const body = await req.json().catch(() => ({}));
  const isCron = req.headers.get('x-base44-trigger') === 'cron' || body.cron === '1' || body.cron === true;
  const triggeredBy = String(body.triggeredBy || (isCron ? 'scheduled' : 'manual')).toLowerCase() === 'scheduled' ? 'scheduled' : 'manual';

  if (!isCron) {
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ ok: false, error: 'Acesso restrito à coordenação geral' }, { status: 403 });
    }
  }

  let gmailToken = null;
  try {
    const conn = await srv.connectors.getConnection('gmail');
    gmailToken = conn?.accessToken || null;
  } catch (e) {
    return Response.json({ ok: false, error: 'Gmail não conectado', detalhe: String(e?.message || e) }, { status: 401 });
  }
  if (!gmailToken) return Response.json({ ok: false, error: 'Gmail não conectado' }, { status: 401 });

  // Diagnóstico: valida deploy + conector Gmail sem executar o pipeline completo.
  if (body.lint === '1' || body.lint === true) {
    try {
      const msgs = await listMessages(gmailToken, `has:attachment filename:.xml newer_than:${DAYS_BACK}d`);
      return Response.json({ ok: true, lint: true, gmail_xml_messages: msgs.length });
    } catch (e) {
      return Response.json({ ok: false, lint: true, error: String(e?.message || e) }, { status: 500 });
    }
  }

  const resumo = { pendentes: 0, encontrados: 0, vinculados: 0, erros: [] };

  // Coleta PDFs pendentes (sem XML, AGUARDANDO_REVISAO, ativos, sem duplicidade)
  const pendentes = [];
  let skip = 0;
  while (pendentes.length < MAX_NFS) {
    const batch = await db.DocumentIntake.filter({
      status_registro: 'ATIVO',
      status_processamento: 'AGUARDANDO_REVISAO',
      tipo_detectado: 'NOTA_FISCAL_PDF',
    }, '-created_date', 50, skip).catch(() => []);
    if (!batch || batch.length === 0) break;
    for (const d of batch) {
      if (d.nf_xml_intake_id) continue;
      const dup = String(d.duplicidade_status || '').toLowerCase();
      if (dup === 'confirmada' || d.duplicada_financeira === true) continue;
      pendentes.push(d);
      if (pendentes.length >= MAX_NFS) break;
    }
    if (batch.length < 50) break;
    skip += 50;
  }
  resumo.pendentes = pendentes.length;
  if (pendentes.length === 0) {
    await registrarBackupLog(srv, { resumo, triggeredBy, execution_ms: Date.now() - start });
    return Response.json({ ok: true, ...resumo });
  }

  for (const pdf of pendentes) {
    if (Date.now() - start > BUDGET_MS) break;
    if (pdf.nf_xml_intake_id) continue; // idempotência re-check
    const nf = numeroNF(pdf);
    if (!nf) continue;
    const fornToks = fornecedorTokens(fornecedorNome(pdf));

    const tokens = [nf, ...fornToks].filter(Boolean).join(' ');
    const query = `has:attachment filename:.xml newer_than:${DAYS_BACK}d ${tokens}`;

    let msgs = [];
    try {
      msgs = await listMessages(gmailToken, query);
    } catch (e) {
      resumo.erros.push(`${nf}: ${String(e?.message || e)}`);
      continue;
    }
    if (!msgs.length) continue;

    let vinculado = false;
    for (const m of msgs.slice(0, 3)) {
      if (vinculado) break;
      const msg = await getMessage(gmailToken, m.id);
      if (!msg) continue;
      const xmlPart = findXmlAttachment(msg.payload?.parts);
      if (!xmlPart) continue;
      const bytes = await downloadAttachment(gmailToken, msg.id, xmlPart.body.attachmentId);
      if (!bytes) continue;
      const fileName = String(xmlPart.filename || `NF_${nf}.xml`);
      try {
        const file = new File([bytes], fileName, { type: 'application/xml' });
        const up = await srv.integrations.Core.UploadFile({ file });
        const url = up?.file_url || up?.url || up?.data?.file_url || '';
        if (!url) { resumo.erros.push(`${fileName}: upload sem url`); continue; }

        const novoXml = await db.DocumentIntake.create({
          user_email: safeStr(pdf.user_email),
          user_name: safeStr(pdf.user_name),
          tipo_detectado: 'NOTA_FISCAL_XML',
          status_processamento: 'AGUARDANDO_REVISAO',
          arquivo_original_url: url,
          file_name_original: fileName,
          file_name_final: fileName,
          mime_type: 'application/xml',
          nf_numero: nf,
          nf_pdf_intake_id: pdf.id,
          nf_pdf_url: safeStr(pdf.arquivo_original_url),
          grupo_status: 'VINCULADO',
          origem: 'buscarXmlsNoGmail',
        });

        await db.DocumentIntake.update(pdf.id, {
          nf_xml_intake_id: novoXml?.id || '',
          nf_xml_url: url,
          grupo_status: 'VINCULADO',
          xml_obrigatorio_pendente: false,
          enviado_sem_xml: false,
          xml_pendente_desde: null,
        });

        resumo.encontrados++;
        resumo.vinculados++;
        vinculado = true;
      } catch (e) {
        resumo.erros.push(`${fileName}: ${String(e?.message || e)}`);
      }
    }
  }

  await registrarBackupLog(srv, { resumo, triggeredBy, execution_ms: Date.now() - start });
  return Response.json({ ok: true, ...resumo });
});