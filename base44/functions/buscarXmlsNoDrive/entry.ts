import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// buscarXmlsNoDrive — FASE 2 do pipeline de conciliação da Entrada Única.
// ---------------------------------------------------------------------
// Para cada NF PDF em AGUARDANDO_REVISAO sem XML vinculado (e sem duplicidade
// confirmada), busca um arquivo .xml correspondente na pasta raiz de NFs do
// Google Drive (ID: 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp) e em suas subpastas de
// nível 1. O match usa o número da NF (extraído do intake ou do nome do
// arquivo) + tokens do nome do fornecedor: score = (número NF contido no
// nome do XML ? 0,6 : 0) + (tokens de fornecedor em comum / total de tokens
// do fornecedor × 0,4); mínimo 0,6 (exige match por número).
// Ao encontrar: baixa o XML, faz upload para o Base44, cria um novo
// DocumentIntake NOTA_FISCAL_XML (AGUARDANDO_REVISAO, origem=buscarXmlsNoDrive)
// e faz o vínculo bidirecional (nf_xml_intake_id ↔ nf_pdf_intake_id).
// Idempotente: pula intakes já com nf_xml_intake_id. Processa até 20 NFs por
// execução e respeita um orçamento de ~110s para não estourar o timeout.
// =====================================================================

const DRIVE_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const DEFAULT_MAX_NFS = 20;
const BUDGET_MS = 60000;
const MAX_SUBPASTAS = 5;

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
  return [...new Set(out)].slice(0, 5);
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

function isXml(f) {
  if (['text/xml', 'application/xml'].includes(f?.mimeType)) return true;
  return String(f?.name || '').toLowerCase().endsWith('.xml');
}

async function listFolder(token, folderId) {
  const out = [];
  let page = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? `&pageToken=${page}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Drive HTTP ${r.status}`);
    const d = await r.json().catch(() => ({}));
    out.push(...(d.files || []));
    page = d.nextPageToken || '';
  } while (page);
  return out;
}

async function downloadFile(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Download HTTP ${r.status}`);
  return await r.arrayBuffer();
}

function scoreMatch(xmlFileName, fornToks, nf) {
  const nm = norm(xmlFileName);
  if (!nf || !nm.includes(nf)) return 0;
  if (fornToks.length === 0) return 0.7; // match só por número
  const cToks = fornecedorTokens(xmlFileName);
  if (cToks.length === 0) return 0.7;
  const inter = fornToks.filter((t) => cToks.includes(t)).length;
  return 0.6 + (inter / fornToks.length) * 0.4;
}

async function registrarBackupLog(srv, dados) {
  try {
    await srv.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      entity_type: 'buscarXmlsNoDrive',
      status: 'concluido',
      processed_at: new Date().toISOString(),
      triggered_by: dados.triggeredBy,
      execution_time_ms: dados.execution_ms,
      details: JSON.stringify(dados.resumo),
      error_message: dados.resumo.erros.length > 0 ? dados.resumo.erros.slice(0, 5).join('; ').slice(0, 500) : '',
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
    if (String(user.role || '').toLowerCase() !== 'admin') {
      return Response.json({ ok: false, error: 'Acesso restrito à coordenação geral' }, { status: 403 });
    }
  }

  let driveToken = null;
  try {
    const conn = await srv.connectors.getConnection('googledrive');
    driveToken = conn?.accessToken || null;
  } catch (e) {
    return Response.json({ ok: false, error: 'Google Drive não conectado', detalhe: String(e?.message || e) }, { status: 401 });
  }
  if (!driveToken) return Response.json({ ok: false, error: 'Google Drive não conectado' }, { status: 401 });

  // Diagnóstico: valida deploy + conector Drive sem executar o pipeline completo.
  if (body.lint === '1' || body.lint === true) {
    try {
      const t0 = Date.now();
      const items = await listFolder(driveToken, DRIVE_FOLDER_ID);
      const xmlsRoot = items.filter(isXml);
      const subFolders = items.filter((f) => f.mimeType === 'application/vnd.google-apps.folder').slice(0, MAX_SUBPASTAS);
      let totalXmlSub = 0;
      const subCounts = [];
      for (const sf of subFolders) {
        if (Date.now() - t0 > BUDGET_MS / 2) break;
        try {
          const sub = await listFolder(driveToken, sf.id);
          const sx = sub.filter(isXml);
          totalXmlSub += sx.length;
          subCounts.push({ id: sf.id, name: sf.name, total: sub.length, xmls: sx.length });
        } catch (e) { subCounts.push({ id: sf.id, name: sf.name, error: String(e?.message || e) }); }
      }
      return Response.json({
        ok: true, lint: true,
        root_total: items.length, root_xmls: xmlsRoot.length,
        sub_scanned: subCounts.length, total_xml_subpastas: totalXmlSub,
        sub_counts: subCounts,
        elapsed_ms: Date.now() - t0,
      });
    } catch (e) {
      return Response.json({ ok: false, lint: true, error: String(e?.message || e) }, { status: 500 });
    }
  }

  const resumo = { pendentes: 0, xmls_candidatos: 0, vinculados: 0, erros: [] };

  // Coleta PDFs pendentes (sem XML, AGUARDANDO_REVISAO, ativos, sem duplicidade confirmada)
  const maxNfs = Number(body.maxNfs) > 0 ? Math.min(Number(body.maxNfs), DEFAULT_MAX_NFS) : DEFAULT_MAX_NFS;
  const pendentes = [];
  let skip = 0;
  while (pendentes.length < maxNfs) {
    const batch = await db.DocumentIntake.filter({
      status_registro: 'ATIVO',
      status_processamento: 'AGUARDANDO_REVISAO',
      tipo_detectado: 'NOTA_FISCAL_PDF',
    }, '-created_date', 100, skip).catch(() => []);
    if (!batch || batch.length === 0) break;
    for (const d of batch) {
      if (d.nf_xml_intake_id) continue;
      const dup = String(d.duplicidade_status || '').toLowerCase();
      if (dup === 'confirmada' || d.duplicada_financeira === true) continue;
      pendentes.push(d);
      if (pendentes.length >= maxNfs) break;
    }
    if (batch.length < 100) break;
    skip += 100;
  }
  resumo.pendentes = pendentes.length;
  if (pendentes.length === 0) {
    await registrarBackupLog(srv, { resumo, triggeredBy, execution_ms: Date.now() - start });
    return Response.json({ ok: true, ...resumo });
  }

  // Coleta XMLs do Drive (raiz + até MAX_SUBPASTAS subpastas de nível 1)
  let allXmls = [];
  try {
    const rootItems = await listFolder(driveToken, DRIVE_FOLDER_ID);
    allXmls = rootItems.filter(isXml);
    const subFolders = rootItems.filter((f) => f.mimeType === 'application/vnd.google-apps.folder').slice(0, MAX_SUBPASTAS);
    for (const sf of subFolders) {
      if (Date.now() - start > BUDGET_MS - 30000) break;
      try {
        const sub = await listFolder(driveToken, sf.id);
        allXmls.push(...sub.filter(isXml));
      } catch (_) {}
    }
  } catch (e) {
    resumo.erros.push(`listar_drive: ${String(e?.message || e)}`);
    await registrarBackupLog(srv, { resumo, triggeredBy, execution_ms: Date.now() - start });
    return Response.json({ ok: false, error: String(e?.message || e), ...resumo }, { status: 500 });
  }
  resumo.xmls_candidatos = allXmls.length;

  const usados = new Set();
  for (const pdf of pendentes) {
    if (Date.now() - start > BUDGET_MS) break;
    if (pdf.nf_xml_intake_id) continue; // idempotência re-check
    const nf = numeroNF(pdf);
    if (!nf) continue;
    const fornToks = fornecedorTokens(fornecedorNome(pdf));

    let best = null;
    let bestScore = 0;
    for (const f of allXmls) {
      if (usados.has(f.id)) continue;
      const s = scoreMatch(f.name, fornToks, nf);
      if (s > bestScore) { bestScore = s; best = f; }
    }
    if (!best || bestScore < 0.6) continue;

    try {
      const bytes = await downloadFile(driveToken, best.id);
      const file = new File([bytes], best.name, { type: best.mimeType || 'application/xml' });
      const up = await srv.integrations.Core.UploadFile({ file });
      const url = up?.file_url || up?.url || up?.data?.file_url || '';
      if (!url) { resumo.erros.push(`${best.name}: upload sem url`); continue; }

      const novoXml = await db.DocumentIntake.create({
        user_email: safeStr(pdf.user_email),
        user_name: safeStr(pdf.user_name),
        tipo_detectado: 'NOTA_FISCAL_XML',
        status_processamento: 'AGUARDANDO_REVISAO',
        arquivo_original_url: url,
        file_name_original: best.name,
        file_name_final: best.name,
        mime_type: best.mimeType || 'application/xml',
        nf_numero: nf,
        nf_pdf_intake_id: pdf.id,
        nf_pdf_url: safeStr(pdf.arquivo_original_url),
        grupo_status: 'VINCULADO',
        origem: 'buscarXmlsNoDrive',
      });

      await db.DocumentIntake.update(pdf.id, {
        nf_xml_intake_id: novoXml?.id || '',
        nf_xml_url: url,
        grupo_status: 'VINCULADO',
        xml_obrigatorio_pendente: false,
        enviado_sem_xml: false,
        xml_pendente_desde: null,
      });

      usados.add(best.id);
      resumo.vinculados++;
    } catch (e) {
      resumo.erros.push(`${best.name}: ${String(e?.message || e)}`);
    }
  }

  await registrarBackupLog(srv, { resumo, triggeredBy, execution_ms: Date.now() - start });
  return Response.json({ ok: true, ...resumo });
});