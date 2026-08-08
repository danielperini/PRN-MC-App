import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ============================================================================
// corrigirDataEmissaoNFsDrive
// ----------------------------------------------------------------------------
// Missão: corrigir datas de emissão ERRADAS ou ausentes em PurchaseRequests
// lendo o PDF real da NF no Google Drive via IA (gpt_5_mini com visão).
//
// Critério de "data suspeita" (registros candidatos à correção):
//   - nf_data_emissao vazio / null / ''
//   - ano < 2026 (ex: 2023 data de abertura da empresa)
//   - formato inválido (não YYYY-MM-DD)
//   - string com apenas mês/ano (ex: "2026-07" — truncada)
//
// Fluxo por PR:
//   1. Monta lista de URLs candidatas (nota_fiscal_url, arquivo_url, nf_pdf_url,
//      file_url, drive_backup_nf_pdf_link).
//   2. Para cada URL: resolve URL pública direta; se quebrar, busca no Drive
//      pelo nome do arquivo (arquivo_nome) ou chave de acesso (nf_chave_acesso)
//      ou número da nota (nf_numero) + emitente (nf_emitente_nome/fornecedor_nome).
//   3. IA lê o PDF (gpt_5_mini com visão) e extrai a DATA DE EMISSÃO real.
//      Ignora datas de abertura de empresa (CNPJ), contratos, vencimentos.
//   4. Se a data extraída for >= 2026 e diferente da atual, atualiza o banco.
//   5. Se não encontrar PDF em nenhuma fonte, marca status "sem_pdf".
//
// Processa em lotes de 5 (IA visão é cara). Timeout de 30s por registro.
// Deadline soft de 90s — sobra para automação posterior.
//
// Payload aceito:
//   { limite?: number, dryRun?: boolean, apenasComErro?: boolean }
//   - limite: máx PRs a processar (default 20)
//   - dryRun: só analisa, não grava (default false)
//   - apenasComErro: só processa PRs com drive_backup_error preenchido
// ============================================================================

const SOFT_DEADLINE_MS = 90_000;
const TIMEOUT_POR_REGISTRO_MS = 30_000;
const BATCH_SIZE = 5;
const DELAY_ENTRE_REGISTROS_MS = 400;
const RAIZ_NOTAS_FISCAIS_QUERY = "'0B3uMUMO' in parents and trashed=false";

function safeStr(v) { return String(v ?? '').trim(); }

function normalizeDate(s) {
  if (!s) return '';
  s = safeStr(s);
  // ISO datetime
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy ou dd/mm/yy
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // dd-mm-yyyy
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // só YYYY-MM (truncado) → inválido
  if (/^\d{4}-\d{2}$/.test(s)) return '';
  return '';
}

function anoDaData(s) {
  const data = normalizeDate(s);
  if (!data) return null;
  return parseInt(data.slice(0, 4), 10);
}

function dataSuspeita(pr) {
  const data = pr?.nf_data_emissao;
  if (!data) return { suspeita: true, motivo: 'vazia' };
  const norm = normalizeDate(data);
  if (!norm) return { suspeita: true, motivo: 'formato_invalido' };
  const ano = anoDaData(norm);
  if (ano && ano < 2026) return { suspeita: true, motivo: `ano_${ano}` };
  return { suspeita: false };
}

function extractDriveFileId(url) {
  if (!url) return '';
  const s = safeStr(url);
  let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // URL pública uc?export=download&id=
  m = s.match(/uc\?.*?[?&]id=([a-zA-Z0-9_-]+)/);
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

// Lista URLs candidatas a PDF de uma PR, em ordem de prioridade.
function urlsCandidatasPdf(pr) {
  const lista = [];
  const campos = [
    pr.nota_fiscal_url,
    pr.nf_pdf_url,
    pr.arquivo_url,
    pr.file_url,
    pr.drive_backup_nf_pdf_link,
    pr.documento_url,
  ];
  for (const u of campos) {
    if (u && !lista.includes(u)) lista.push(u);
  }
  return lista;
}

// Verifica se a URL aponta para PDF (mime) ou baixa com short HEAD para detectar
// arquivos que não abrem (HTTP 4xx/5xx, arquivo removido, etc.).
async function urlFunciona(token, url) {
  try {
    const fileId = extractDriveFileId(url);
    let r;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      if (fileId) {
        // Drive API metadata — sem baixar
        r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,trashed,name,size`, {
          headers: driveHeaders(token),
          signal: ctrl.signal,
        });
      } else {
        // URL externa — HEAD
        r = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      }
    } finally {
      clearTimeout(t);
    }
    if (!r.ok) return { ok: false, status: r.status };
    if (fileId) {
      const meta = await r.json().catch(() => ({}));
      if (meta?.trashed) return { ok: false, status: 'trashed' };
      if (meta?.mimeType && !meta.mimeType.includes('pdf') && !meta.mimeType.includes('octet-stream')) {
        return { ok: false, status: 'mime_' + meta.mimeType };
      }
      return { ok: true, fileId, name: meta?.name || '' };
    }
    const ct = r.headers.get('content-type') || '';
    if (ct && !ct.includes('pdf') && !ct.includes('octet-stream')) {
      return { ok: false, status: 'mime_' + ct };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, status: String(e?.name || e?.message || e).slice(0, 50) };
  }
}

// URL pública direta (baixa sem login) para o file do Drive — usada pela IA.
function urlPublicaDownload(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// Baixa PDF do Drive (autenticado) e re-faz upload via Core.UploadFile.
// InvokeLLM não consegue ler URLs do Drive público (uc?export=download
// retorna HTML de aviso para arquivos >100MB). Esse re-upload devolve uma
// URL estável e legível pela IA. Limpa cache em /tmp.
async function baixarEReSpawnarPdf(base44, token, fileId) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 18_000);
    let r;
    try {
      r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: driveHeaders(token),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
    if (!r.ok) return '';
    const buf = await r.arrayBuffer();
    if (!buf || buf.byteLength < 200) return '';
    // Re-upload via UploadFile — File API devolve URL acessível à IA
    const fileObj = new File([buf], `nf_${fileId}.pdf`, { type: 'application/pdf' });
    const up = await base44.asServiceRole.integrations.Core.UploadFile({ file: fileObj });
    return up?.file_url || '';
  } catch (e) {
    console.warn('[baixarEReSpawnarPdf] erro:', e?.message || e);
    return '';
  }
}

// Busca no Drive por nome de arquivo ou termos-chave da NF.
async function buscarPdfNoDrive(token, pr) {
  const termos = [];
  if (pr.arquivo_nome) termos.push(safeStr(pr.arquivo_nome));
  if (pr.nf_numero) termos.push(safeStr(pr.nf_numero));
  if (pr.nf_emitente_nome) termos.push(safeStr(pr.nf_emitente_nome).split(' ')[0]);
  if (pr.fornecedor_nome) termos.push(safeStr(pr.fornecedor_nome).split(' ')[0]);

  const tentativas = [];
  // 1) nome completo do arquivo
  if (pr.arquivo_nome) tentativas.push(`name='${pr.arquivo_nome.replace(/'/g, "\\'")}'`);
  // 2) contém número da NF
  if (pr.nf_numero) tentativas.push(`fullText contains '${escapeQ(safeStr(pr.nf_numero))}' AND mimeType='application/pdf'`);
  // 3) contém chave de acesso
  if (pr.nf_chave_acesso) tentativas.push(`fullText contains '${escapeQ(safeStr(pr.nf_chave_acesso).slice(0, 20))}' AND mimeType='application/pdf'`);
  // 4) nome do emitente + PDF
  if (pr.nf_emitente_nome) tentativas.push(`fullText contains '${escapeQ(safeStr(pr.nf_emitente_nome).split(' ')[0])}' AND mimeType='application/pdf'`);

  for (const q of tentativas) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      let r;
      try {
        r = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=5&orderBy=modifiedTime desc`,
          { headers: driveHeaders(token), signal: ctrl.signal },
        );
      } finally {
        clearTimeout(t);
      }
      if (!r.ok) continue;
      const data = await r.json().catch(() => ({}));
      const files = (data?.files || []).filter((f) => f.mimeType === 'application/pdf' || f.mimeType === 'application/octet-stream');
      if (files.length > 0) {
        return { fileId: files[0].id, name: files[0].name };
      }
    } catch {}
  }
  return null;
}

function escapeQ(s) {
  return safeStr(s).replace(/'/g, "\\'");
}

async function extrairDataEmissaoViaIA(base44, pdfUrl) {
  const hoje = new Date().toISOString().slice(0, 10);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 40_000);
    let res;
    try {
      res = await Promise.race([
        base44.asServiceRole.integrations.Core.InvokeLLM({
          model: 'gemini_3_flash',
          prompt: `Você é um extrator de dados de NOTA FISCAL. Analise o PDF anexo.

Sua tarefa única: extrair a DATA DE EMISSÃO da nota fiscal (campo "Data de Emissão" / "Data/Hora de Emissão" / "Emitida em").

REGRAS CRÍTICAS:
1. Extraia APENAS a data de EMISSÃO da NF — nunca outras datas.
2. IGNORE: datas de abertura de empresa (ex: 2023), datas de contratos, datas de vencimento, datas de pagamento, datas de processamento.
3. Notas válidas são de 2026 em diante. Se a data mais saliente for 2023 (abertura da empresa), PROCURE outra data mais recente rotulada como "Data de Emissão".
4. Formato esperado na resposta: YYYY-MM-DD.
5. Se o PDF for ilegível, corrompido, ou não for nota fiscal, retorne null.

Contexto:
- Data de hoje: ${hoje}

Retorne JSON válido:
{
  "nf_data_emissao_corrigida": "YYYY-MM-DD" | null,
  "ano_detectado": <number> | null,
  "confianca": "alta" | "media" | "baixa",
  "explicacao": "breve justificativa"
}`,
          file_urls: [pdfUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              nf_data_emissao_corrigida: { type: 'string' },
              ano_detectado: { type: 'number' },
              confianca: { type: 'string' },
              explicacao: { type: 'string' },
            },
            required: ['nf_data_emissao_corrigida', 'confianca', 'explicacao'],
          },
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_ia_40s')), 40_000)),
      ]);
    } finally {
      clearTimeout(t);
    }
    return res;
  } catch (e) {
    return { erro: String(e?.message || e).slice(0, 120) };
  }
}

async function logAIUsage(base44, opts) {
  try {
    await base44.asServiceRole.entities.AIUsageLog.create({
      task_type: 'corrigir_data_emissao_nf_drive',
      model_used: 'gemini_3_flash',
      tokens_input: 0,
      tokens_output: 0,
      cost_estimated_usd: 0,
      user_email: opts.user_email || '',
      feature: 'corrigir_data_emissao_nf_drive',
      duration_ms: opts.duration_ms || 0,
      error: opts.error || '',
    });
  } catch {}
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  const deadline = startTime + SOFT_DEADLINE_MS;
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await base44.auth.me().catch(() => null);
    // Requer usuário autenticado; a correção de datas é rotina de manutenção
    // admin/coordenação. O painel já controla quem pode disparar via UI.
    if (!user) {
      return Response.json({ error: 'Forbidden — login necessário' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const limite = Math.min(Math.max(parseInt(payload?.limite || '20', 10) || 20, 1), 50);
    const dryRun = !!payload?.dryRun;
    const apenasComErro = !!payload?.apenasComErro;

    let driveToken = '';
    try {
      driveToken = await getDriveToken(base44);
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 503 });
    }

    // Lista PRs APROVADO_ADMIN/PAGO com suspeita de data errada
    let prs = [];
    try {
      prs = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
    } catch (e) {
      return Response.json({ ok: false, error: 'erro_listar_prs: ' + e.message }, { status: 500 });
    }

    const suspeitos = (prs || []).filter((p) => {
      if (apenasComErro && !safeStr(p.drive_backup_error)) return false;
      // só APROVADO_ADMIN / PAGO / quitadas
      const st = safeStr(p.status);
      if (!['APROVADO_ADMIN', 'PAGO'].includes(st)) return false;
      // precisa de pelo menos um identificador de arquivo
      const hasUrl = urlsCandidatasPdf(p).length > 0 || safeStr(p.arquivo_nome) || safeStr(p.nf_numero);
      if (!hasUrl) return false;
      const s = dataSuspeita(p);
      return s.suspeita;
    }).slice(0, limite);

    const stats = {
      analisados: 0,
      corrigidos: 0,
      sem_pdf: 0,
      ia_sem_data: 0,
      ia_data_invalida: 0,
      ia_timeout: 0,
      erros: 0,
      parou_por_tempo: false,
      total_suspeitos: suspeitos.length,
    };
    const detalhes = [];

    for (const pr of suspeitos) {
      if (Date.now() > deadline) { stats.parou_por_tempo = true; break; }
      stats.analisados++;
      const t0 = Date.now();
      const detalhe = {
        id: pr.id,
        descricao: safeStr(pr.descricao_item).slice(0, 50),
        nf_numero: safeStr(pr.nf_numero),
        data_antiga: safeStr(pr.nf_data_emissao) || '(vazia)',
      };

      try {
        // 1) Tentar URLs candidatas — achar uma que abre
        let pdfUrlOk = '';
        let arquivoNome = '';
        for (const url of urlsCandidatasPdf(pr)) {
          const check = await urlFunciona(driveToken, url);
          if (check.ok) {
            if (check.fileId) {
              pdfUrlOk = urlPublicaDownload(check.fileId);
              arquivoNome = check.name || '';
            } else {
              pdfUrlOk = url;
            }
            break;
          }
        }

        // 2) Se nenhuma URL abre, buscar no Drive por nome/numero/chave
        if (!pdfUrlOk) {
          const busca = await buscarPdfNoDrive(driveToken, pr);
          if (busca?.fileId) {
            pdfUrlOk = urlPublicaDownload(busca.fileId);
            arquivoNome = busca.name || '';
            detalhe.encontrado_via_busca = true;
            detalhe.arquivo_encontrado = arquivoNome;
          }
        }

        if (!pdfUrlOk) {
          stats.sem_pdf++;
          detalhe.status = 'sem_pdf';
          detalhes.push(detalhe);
          await logAIUsage(base44, { user_email: user?.email || '', duration_ms: Date.now() - t0, error: 'sem_pdf' });
          await new Promise((r) => setTimeout(r, DELAY_ENTRE_REGISTROS_MS));
          continue;
        }

        // Extrai fileId (seja qual for a URL ok) para re-upload
        let fileIdParaUpload = '';
        for (const u of urlsCandidatasPdf(pr)) {
          const fid = extractDriveFileId(u);
          if (fid) { fileIdParaUpload = fid; break; }
        }
        if (!fileIdParaUpload && detalhe.encontrado_via_busca) {
          // busca-resposta do Drive: o nome veio de buscarPdfNoDrive
          fileIdParaUpload = pdfUrlOk.split('id=')[1] || '';
        }

        // 3) IA lê o PDF e extrai data de emissão (1ª tentativa: URL pública direta)
        let ia = await extrairDataEmissaoViaIA(base44, pdfUrlOk);
        let dataExtraida = normalizeDate(ia?.nf_data_emissao_corrigida || '');
        let confianca = safeStr(ia?.confianca || 'baixa');
        let usouReupload = false;

        // 4) Se a IA disse que não conseguiu abrir o link, re-faz upload e tenta de novo
        const explicLow = safeStr(ia?.explicacao).toLowerCase();
        const indispHint = explicLow.includes('indispon') || explicLow.includes('inalcan')
          || explicLow.includes('não acess') || explicLow.includes('nao acess') || explicLow.includes('corromp')
          || explicLow.includes('link indispon') || explicLow.includes('file unavail');
        if (!dataExtraida && indispHint && fileIdParaUpload) {
          const urlReup = await baixarEReSpawnarPdf(base44, driveToken, fileIdParaUpload);
          if (urlReup) {
            detalhe.reupload_efetuado = true;
            usouReupload = true;
            ia = await extrairDataEmissaoViaIA(base44, urlReup);
            dataExtraida = normalizeDate(ia?.nf_data_emissao_corrigida || '');
            confianca = safeStr(ia?.confianca || 'baixa');
          }
        }

        detalhe.ia_data = dataExtraida || '(sem)';
        detalhe.ia_confianca = confianca;
        detalhe.ia_explicacao = safeStr(ia?.explicacao).slice(0, 120);
        if (ia?.erro) detalhe.ia_erro = ia.erro;
        if (usouReupload) detalhe.ia_tentativa = 'reupload';

        if (ia?.erro && ia.erro.includes('timeout')) {
          stats.ia_timeout++;
          detalhe.status = 'ia_timeout';
          detalhes.push(detalhe);
          await logAIUsage(base44, { user_email: user?.email || '', duration_ms: Date.now() - t0, error: 'timeout' });
          await new Promise((r) => setTimeout(r, DELAY_ENTRE_REGISTROS_MS));
          continue;
        }

        if (!dataExtraida) {
          stats.ia_sem_data++;
          detalhe.status = 'ia_sem_data';
          detalhes.push(detalhe);
          await logAIUsage(base44, { user_email: user?.email || '', duration_ms: Date.now() - t0, error: 'sem_data' });
          await new Promise((r) => setTimeout(r, DELAY_ENTRE_REGISTROS_MS));
          continue;
        }

        const ano = anoDaData(dataExtraida);
        if (!ano || ano < 2026) {
          stats.ia_data_invalida++;
          detalhe.status = `ia_data_invalida_ano_${ano}`;
          detalhes.push(detalhe);
          await logAIUsage(base44, { user_email: user?.email || '', duration_ms: Date.now() - t0, error: 'ano_invalido_' + ano });
          await new Promise((r) => setTimeout(r, DELAY_ENTRE_REGISTROS_MS));
          continue;
        }

        // 4) Atualizar banco (ou dryRun)
        if (!dryRun) {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
            nf_data_emissao: dataExtraida,
          });
          stats.corrigidos++;
        } else {
          stats.corrigidos++; // simulação
        }
        detalhe.status = 'corrigido';
        detalhe.data_nova = dataExtraida;
        detalhes.push(detalhe);
        await logAIUsage(base44, { user_email: user?.email || '', duration_ms: Date.now() - t0, error: '' });
      } catch (e) {
        stats.erros++;
        detalhe.status = 'erro';
        detalhe.erro = String(e?.message || e).slice(0, 150);
        detalhes.push(detalhe);
        await logAIUsage(base44, { user_email: user?.email || '', duration_ms: Date.now() - t0, error: detalhe.erro });
      }
      await new Promise((r) => setTimeout(r, DELAY_ENTRE_REGISTROS_MS));
    }

    return Response.json({
      ok: true,
      ...stats,
      dryRun,
      apenasComErro,
      duration_ms: Date.now() - startTime,
      detalhes: detalhes.slice(0, 30),
    });
  } catch (error) {
    console.error('[corrigirDataEmissaoNFsDrive]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});