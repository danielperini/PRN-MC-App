import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { invokeLLM } from '../_shared/gatewayIA.ts';

// ============================================================================
// preencherDataEmissaoNFsLote
// ----------------------------------------------------------------------------
// Preenche em lote o campo `nf_data_emissao` (vazio) de:
//   1) DocumentIntake (status_registro ATIVO) — via XML vinculado (dhEmi/dEmi)
//      ou, em fallback, via IA sobre o PDF (arquivo_original_url).
//   2) PurchaseRequest (status APROVADO_ADMIN) — copia do DocumentIntake
//      vinculado (intake_id/documento_intake_id); se o intake ainda não tiver a
//      data, aplica o mesmo pipeline XML→IA sobre o arquivo do intake.
//
// O preenchimento é idempotente: nunca sobrescreve uma data já preenchida.
//
// Processa em lotes de 20 com delay de 300ms entre lotes para evitar rate
// limit. Timeout por registro de 15s. Há um deadline soft de 50s para que a
// função conclua dentro do tempo da Plataforma; registros restantes ficam
// para execuções posteriores. Retorna totais: analisados, preenchidos_xml,
// preenchidos_ia, sem_data, erros.
//
// modo: 'document_intake' | 'purchase_requests' | 'ambos' (padrão)
// ============================================================================

const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES_MS = 300;
const TIMEOUT_PER_RECORD_MS = 15000;
const SOFT_DEADLINE_MS = 50000;
const MAX_INTAKES = 400;
const MAX_PURCHASES = 200;

function safeStr(v) { return String(v || '').trim(); }

function normalizeDate(isoOrDate) {
  if (!isoOrDate) return '';
  const s = safeStr(isoOrDate);
  // ISO datetime: 2026-03-04T... ou 2026-03-04
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return '';
}

function parseXmlDate(xmlText) {
  if (!xmlText) return '';
  // NF-e: dhEmi; NFS-e/antigas: dEmi
  const m1 = xmlText.match(/<dhEmi[^>]*>([^<]+)<\/dhEmi>/i);
  if (m1) return normalizeDate(safeStr(m1[1]));
  const m2 = xmlText.match(/<dEmi[^>]*>([^<]+)<\/dEmi>/i);
  if (m2) return normalizeDate(safeStr(m2[1]));
  return '';
}

function extractDriveFileId(url) {
  if (!url) return '';
  const s = safeStr(url);
  let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return '';
}

async function getDriveToken(base44) {
  try {
    const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = conn?.accessToken || conn?.access_token;
    if (!token) throw new Error('sem token');
    return token;
  } catch (e) {
    throw new Error('Google Drive não conectado: ' + (e?.message || e));
  }
}

function driveHeaders(token) { return { Authorization: `Bearer ${token}` }; }

async function downloadText(url, token) {
  // Preferência: se for URL do Drive, usa a API com token; senão fetch direto
  const fileId = extractDriveFileId(url);
  if (fileId && token) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: driveHeaders(token),
    });
    if (!res.ok) throw new Error(`Drive HTTP ${res.status}`);
    return await res.text();
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function withTimeout(promise, ms, fallback) {
  let id;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((r) => { id = setTimeout(() => r(fallback), ms); }),
  ]).finally(() => { if (id) clearTimeout(id); });
}

async function logAIUsage(base44, data) {
  try {
    await base44.asServiceRole.entities.AIUsageLog.create({
      task_type: 'preencher_data_emissao_nf_lote',
      model_used: data.model || 'automatic',
      tokens_input: 0,
      tokens_output: 0,
      cost_estimated_usd: 0,
      user_email: data.user_email || '',
      feature: 'preencher_data_emissao_nf_lote',
      duration_ms: data.duration_ms || 0,
      error: data.error || '',
    });
  } catch {}
}

// Tenta extrair data de emissão de um DocumentIntake.
// Retorna { data, fonte } onde fonte ∈ 'xml' | 'ia' | 'sem'
async function extrairDataDeIntake(base44, intake, token) {
  const xmlUrl = safeStr(intake.nf_xml_url);
  if (xmlUrl) {
    try {
      const xml = await withTimeout(downloadText(xmlUrl, token), 6000, '');
      const data = parseXmlDate(xml);
      if (data) return { data, fonte: 'xml' };
    } catch (e) {
      // segue para IA
    }
  }

  const pdfUrl = safeStr(intake.arquivo_original_url);
  if (pdfUrl) {
    const t0 = Date.now();
    try {
      const resposta = await withTimeout(
        invokeLLM(base44.asServiceRole,{
          prompt: 'Extraia a DATA DE EMISSÃO desta nota fiscal (campo "Data de Emissão" / "Data Emissão"). Retorne no formato YYYY-MM-DD. Se não encontrar, retorne string vazia.',
          file_urls: [pdfUrl],
          response_json_schema: {
            type: 'object',
            properties: { nf_data_emissao: { type: 'string' } },
          },
        }),
        TIMEOUT_PER_RECORD_MS,
        null
      );
      const data = normalizeDate(resposta?.nf_data_emissao || '');
      await logAIUsage(base44, {
        user_email: '',
        model: 'automatic',
        duration_ms: Date.now() - t0,
        error: data ? '' : 'sem data extraída',
      });
      if (data) return { data, fonte: 'ia' };
    } catch (e) {
      await logAIUsage(base44, { user_email: '', error: String(e?.message || e).slice(0, 200) });
    }
  }

  return { data: '', fonte: 'sem' };
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  const deadline = startTime + SOFT_DEADLINE_MS;
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await base44.auth.me().catch(() => null);

    const payload = await req.json().catch(() => ({}));
    const modo = payload?.modo === 'purchase_requests' ? 'purchase_requests'
      : payload?.modo === 'document_intake' ? 'document_intake'
      : 'ambos';

    const stats = {
      analisados: 0,
      preenchidos_xml: 0,
      preenchidos_ia: 0,
      sem_data: 0,
      erros: 0,
      parou_por_tempo: false,
    };

    let driveToken = '';
    try { driveToken = await getDriveToken(base44); } catch { driveToken = ''; }

    // ---------- DocumentIntake ----------
    if (modo === 'ambos' || modo === 'document_intake') {
      let intakes = [];
      try {
        intakes = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', MAX_INTAKES);
      } catch (e) {
        console.warn('[preencher] erro ao listar DocumentIntake:', e?.message);
      }
      const pendentes = (intakes || []).filter((d) => {
        if (String(d?.status_registro || '').toUpperCase() === 'REMOVIDO') return false;
        return !safeStr(d?.nf_data_emissao);
      });

      for (let i = 0; i < pendentes.length; i += BATCH_SIZE) {
        if (Date.now() > deadline) { stats.parou_por_tempo = true; break; }
        const batch = pendentes.slice(i, i + BATCH_SIZE);
        for (const intake of batch) {
          if (Date.now() > deadline) { stats.parou_por_tempo = true; break; }
          stats.analisados++;
          try {
            const { data, fonte } = await extrairDataDeIntake(base44, intake, driveToken);
            if (data) {
              await base44.asServiceRole.entities.DocumentIntake.update(intake.id, { nf_data_emissao: data });
              if (fonte === 'xml') stats.preenchidos_xml++;
              else if (fonte === 'ia') stats.preenchidos_ia++;
            } else {
              stats.sem_data++;
            }
          } catch (e) {
            stats.erros++;
          }
        }
        if (i + BATCH_SIZE < pendentes.length) {
          await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
        }
      }
    }

    // ---------- PurchaseRequests ----------
    if (modo === 'ambos' || modo === 'purchase_requests') {
      let prs = [];
      try {
        prs = await base44.asServiceRole.entities.PurchaseRequest.filter({ status: 'APROVADO_ADMIN' }, '-created_date', MAX_PURCHASES);
      } catch (e) {
        console.warn('[preencher] erro ao listar PurchaseRequest:', e?.message);
      }
      const pendentes = (prs || []).filter((p) => !safeStr(p?.nf_data_emissao));

      // cache de intakes já buscados (evita re-fetch quando várias PRs ligam ao mesmo intake)
      const intakeCache = new Map();

      for (let i = 0; i < pendentes.length; i += BATCH_SIZE) {
        if (Date.now() > deadline) { stats.parou_por_tempo = true; break; }
        const batch = pendentes.slice(i, i + BATCH_SIZE);
        for (const pr of batch) {
          if (Date.now() > deadline) { stats.parou_por_tempo = true; break; }
          stats.analisados++;
          try {
            const intakeId = safeStr(pr.intake_id || pr.documento_intake_id);
            let intake = null;
            if (intakeId) {
              if (intakeCache.has(intakeId)) {
                intake = intakeCache.get(intakeId);
              } else {
                intake = await base44.asServiceRole.entities.DocumentIntake.get(intakeId).catch(() => null);
                intakeCache.set(intakeId, intake);
              }
            }

            let data = '';
            let fonte = 'sem';

            // 1) copia do intake se já preenchido
            if (intake && safeStr(intake.nf_data_emissao)) {
              data = normalizeDate(intake.nf_data_emissao);
              fonte = 'xml'; // reaproveita data já extraída (provavelmente do XML)
            }

            // 2) pipeline XML → IA sobre o intake vinculado
            if (!data && intake) {
              const r = await extrairDataDeIntake(base44, intake, driveToken);
              data = r.data;
              fonte = r.fonte;
              // se encontrou, grava também no intake (idempotente — só grava se vazio)
              if (data && !safeStr(intake.nf_data_emissao)) {
                try {
                  await base44.asServiceRole.entities.DocumentIntake.update(intake.id, { nf_data_emissao: data });
                } catch {}
              }
            }

            // 3) sem intake: tenta a nota_fiscal_url do próprio PR como PDF (IA) — último recurso
            if (!data) {
              const pdfUrl = safeStr(pr.nota_fiscal_url || pr.arquivo_url || pr.file_url);
              if (pdfUrl) {
                const t0 = Date.now();
                try {
                  const resposta = await withTimeout(
                    invokeLLM(base44.asServiceRole,{
                      prompt: 'Extraia a DATA DE EMISSÃO desta nota fiscal. Retorne no formato YYYY-MM-DD. Se não encontrar, retorne string vazia.',
                      file_urls: [pdfUrl],
                      response_json_schema: {
                        type: 'object',
                        properties: { nf_data_emissao: { type: 'string' } },
                      },
                    }),
                    TIMEOUT_PER_RECORD_MS,
                    null
                  );
                  data = normalizeDate(resposta?.nf_data_emissao || '');
                  if (data) fonte = 'ia';
                  await logAIUsage(base44, { user_email: user?.email || '', duration_ms: Date.now() - t0, error: data ? '' : 'sem data' });
                } catch (e) {
                  await logAIUsage(base44, { user_email: user?.email || '', error: String(e?.message || e).slice(0, 200) });
                }
              }
            }

            if (data) {
              await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, { nf_data_emissao: data });
              if (fonte === 'xml') stats.preenchidos_xml++;
              else if (fonte === 'ia') stats.preenchidos_ia++;
            } else {
              stats.sem_data++;
            }
          } catch (e) {
            stats.erros++;
          }
        }
        if (i + BATCH_SIZE < pendentes.length) {
          await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
        }
      }
    }

    return Response.json({
      ok: true,
      ...stats,
      modo,
      duration_ms: Date.now() - startTime,
    });
  } catch (error) {
    console.error('[preencherDataEmissaoNFsLote]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});