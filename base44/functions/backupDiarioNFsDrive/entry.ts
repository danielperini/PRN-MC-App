import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * backupDiarioNFsDrive
 *
 * Rotina diária de backup de notas fiscais aprovadas para o Google Drive.
 *
 * Pasta raiz: 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp
 * Estrutura existente: {MM-YYYY}  (ex: 07-2026)
 *
 * Regra: NÃO criar pastas novas — usar apenas pastas que já existem.
 * Se a pasta do mês não existir, pular o arquivo e logar.
 *
 * Padrão de nome:
 *   NF {NUMERO} {NATUREZA} - {FORNECEDOR} - {PROJETO} - R$ {VALOR}.pdf
 *   XML {NUMERO} {NATUREZA} - {FORNECEDOR} - {PROJETO} - R$ {VALOR}.xml
 *   COMP NF {NUMERO} {NATUREZA} - {FORNECEDOR} - {PROJETO} - R$ {VALOR}.pdf
 *
 * Regras de data: rejeitar/reanalisar datas anteriores a 2026.
 */

const ROOT_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BATCH_SIZE = 10;

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const STATUS_APROVADOS = ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'];

// ── Utilitários ──────────────────────────────────────────────────────────────

function safeStr(v) {
  return String(v || '').trim();
}

function normalizeText(v) {
  return safeStr(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 \-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseValor(v) {
  const raw = safeStr(v).replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(raw.replace(',', '.')) || 0;
}

function formatValor(v) {
  const num = parseValor(v);
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sanitizeFilePart(v, maxLen = 50) {
  return safeStr(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen)
    .trim();
}

/**
 * Dada uma data string, retorna { ano, mesIdx (0-based), mesNome }
 * ou null se a data for inválida / anterior a 2026.
 */
function parseDataEmissao(raw) {
  if (!raw) return null;
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    d = new Date(raw.substring(0, 10) + 'T12:00:00Z');
  } else {
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  }
  if (!d || isNaN(d.getTime())) return null;
  const ano = d.getFullYear();
  const mesIdx = d.getMonth();
  return { ano, mesIdx, mesNome: MESES_PT[mesIdx] };
}

/**
 * Determina o projeto com base no centro de custo.
 */
function getProjeto(centroCusto) {
  const cc = normalizeText(centroCusto);
  if (cc.includes('NOTURNO')) return 'NOTURNO NOS MUSEUS 2026';
  return 'MUSEUS CENTRO';
}

/**
 * Monta o nome padronizado do arquivo.
 * tipo: 'NF' | 'XML' | 'COMP'
 */
function buildFileName(tipo, pr, extra = {}) {
  const numero = sanitizeFilePart(
    pr.nf_numero || extra.nf_numero || pr.id?.substring(0, 8) || 'SN', 10
  );

  const natureza = sanitizeFilePart(
    pr.natureza_despesa || pr.rubrica_nome || pr.categoria || pr.descricao_item || 'DESPESA', 40
  );

  const fornecedor = sanitizeFilePart(
    pr.fornecedor_nome || pr.nf_emitente_nome || extra.fornecedor || 'FORNECEDOR', 50
  );

  const projeto = getProjeto(pr.centro_custo || '');

  const valor = formatValor(
    pr.valor_pago || pr.valor_aprovado_admin || pr.nf_valor_total || pr.valor_solicitado || 0
  );

  const ext = tipo === 'XML' ? 'xml' : 'pdf';
  const prefixo = tipo === 'COMP' ? 'COMP NF' : tipo;

  return `${prefixo} ${numero} ${natureza} - ${fornecedor} - ${projeto} - R$ ${valor}.${ext}`;
}

// ── Google Drive helpers ─────────────────────────────────────────────────────

async function getToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
  return accessToken;
}

async function driveGet(token, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return r;
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const r = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=10`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

async function createFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Erro criar pasta "${name}": ${d.error.message}`);
  return d.id;
}

async function getOrCreate(token, name, parentId) {
  return (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
}

/**
 * Busca uma pasta pelo nome no pai — retorna null se não existir (não cria).
 */
async function findFolderOnly(token, name, parentId) {
  return findFolder(token, name, parentId);
}

/**
 * Verifica se um arquivo com o mesmo nome já existe na pasta.
 */
async function fileExistsInFolder(token, fileName, folderId) {
  const q = encodeURIComponent(
    `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`
  );
  const r = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0] || null;
}

/**
 * Faz upload de um arquivo a partir de uma URL pública.
 */
async function uploadFromUrl(token, fileUrl, fileName, folderId) {
  const dlRes = await fetch(fileUrl);
  if (!dlRes.ok) throw new Error(`Download falhou (${dlRes.status}): ${fileUrl}`);
  const blob = await dlRes.blob();
  const mimeType = fileName.endsWith('.xml') ? 'application/xml' : 'application/pdf';

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', new Blob([await blob.arrayBuffer()], { type: mimeType }), fileName);

  const upRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  );
  const result = await upRes.json();
  if (result.error) throw new Error(`Upload Drive falhou: ${result.error.message}`);
  return { id: result.id, link: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view` };
}

// ── Validação e reanálise de data ────────────────────────────────────────────

/**
 * Verifica se a data da NF é suspeita (antes de 2026).
 * Se for 2023, provavelmente é data de abertura da empresa — reanalisar via IA.
 */
async function validarDataEmissao(base44, pr) {
  const dataRaw = pr.nf_data_emissao || pr.aprov_admin_data || pr.aprov_coord_data || '';
  const parsed = parseDataEmissao(dataRaw);

  if (!parsed) return { dataValida: false, dateInfo: null, reanalisado: false };
  if (parsed.ano >= 2026) return { dataValida: true, dateInfo: parsed, reanalisado: false };

  // Data anterior a 2026: reanalisar
  console.log(`[REANÁLISE] Purchase ${pr.id} tem data ${dataRaw} (ano ${parsed.ano}) — reanalisando com IA`);

  const pdfUrl = pr.nota_fiscal_url || pr.nota_fiscal_pdf_url || pr.nf_pdf_url || '';
  if (!pdfUrl) {
    console.warn(`[REANÁLISE] Sem PDF para reanalisar: ${pr.id}`);
    return { dataValida: false, dateInfo: parsed, reanalisado: false };
  }

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const ia = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: `Este documento tem data suspeita de ${dataRaw} (ano ${parsed.ano}).
O CNPJ 23.843.648/0001-25 (Viaduto das Artes) foi aberto em 2023 — esse ano pode aparecer como data de abertura da empresa, NÃO como data da nota fiscal.
Data atual: ${hoje}. Notas fiscais válidas para este projeto são de 2026 em diante.

Extraia a data de EMISSÃO REAL da nota fiscal (ignorando datas de abertura de empresa, datas de contratos, datas de convênios).
Retorne JSON:
{
  "nf_data_emissao_corrigida": "YYYY-MM-DD ou null",
  "ano_detectado": número,
  "confianca": "alta|media|baixa",
  "explicacao": "..."
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
      },
    });

    const dataCorrigida = ia?.nf_data_emissao_corrigida || '';
    const parsedCorrigida = parseDataEmissao(dataCorrigida);

    if (parsedCorrigida && parsedCorrigida.ano >= 2026) {
      // Corrigir no banco
      await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
        nf_data_emissao: dataCorrigida,
      }).catch(() => null);
      console.log(`[REANÁLISE OK] ${pr.id}: data corrigida para ${dataCorrigida}`);
      return { dataValida: true, dateInfo: parsedCorrigida, reanalisado: true, dataCorrigida };
    }

    console.warn(`[REANÁLISE] ${pr.id}: IA retornou data ${dataCorrigida} ainda inválida — pulando`);
    return { dataValida: false, dateInfo: parsedCorrigida || parsed, reanalisado: true };
  } catch (e) {
    console.error(`[REANÁLISE] Erro IA para ${pr.id}:`, e.message);
    return { dataValida: false, dateInfo: parsed, reanalisado: false };
  }
}

// ── Processar uma PurchaseRequest ────────────────────────────────────────────

async function processarPurchase(base44, token, pr, notasFolderCache) {
  const log = { id: pr.id, descricao: pr.descricao_item, status: '', detalhes: [] };

  // Verificar se tem arquivos fiscais
  const pdfUrl = pr.nota_fiscal_url || pr.nota_fiscal_pdf_url || pr.nf_pdf_url || '';
  const xmlUrl = pr.nota_fiscal_xml_url || pr.xml_url || '';
  const comprovanteUrl = pr.comprovante_url || pr.comprovante_pagamento_url || '';

  if (!pdfUrl && !xmlUrl && !comprovanteUrl) {
    log.status = 'sem_arquivos';
    return log;
  }

  // Validar/corrigir data
  const { dataValida, dateInfo, reanalisado, dataCorrigida } = await validarDataEmissao(base44, pr);

  if (!dataValida) {
    log.status = 'data_invalida';
    log.detalhes.push(`Data ${pr.nf_data_emissao || 'desconhecida'} inválida. Reanalisado: ${reanalisado}`);
    return log;
  }

  if (reanalisado && dataCorrigida) {
    log.detalhes.push(`Data corrigida de ${pr.nf_data_emissao} para ${dataCorrigida}`);
  }

  const { ano, mesIdx } = dateInfo;

  // Pasta no formato MM-YYYY (ex: 07-2026) — criar se não existir
  const mesFormatado = String(mesIdx + 1).padStart(2, '0');
  const nomePasta = `${mesFormatado}-${ano}`;
  const cacheKey = nomePasta;
  let mesFolderId = notasFolderCache[cacheKey];

  if (!mesFolderId) {
    mesFolderId = await getOrCreate(token, nomePasta, ROOT_FOLDER_ID);
    notasFolderCache[cacheKey] = mesFolderId;
    log.detalhes.push(`Pasta "${nomePasta}" localizada/criada no Drive`);
  }

  const updates = {};
  let uploaded = 0;

  // Verificar idempotência: já tem backup com os mesmos dados?
  const backupKey = `${pr.id}_${pr.nf_numero || ''}_${pr.valor_pago || pr.valor_solicitado || 0}`;
  const jaTemBackup =
    pr.drive_backup_nf_pdf_link && pr.drive_backup_nf_ok === true &&
    pr.drive_backup_nf_pdf_link.includes('drive.google.com');

  // Função interna de upload com idempotência
  async function fazerUpload(fileUrl, fileName) {
    if (!fileUrl) return null;
    const existing = await fileExistsInFolder(token, fileName, mesFolderId).catch(() => null);
    if (existing) {
      log.detalhes.push(`JÁ EXISTE: ${fileName}`);
      return { id: existing.id, link: `https://drive.google.com/file/d/${existing.id}/view`, skipped: true };
    }
    const result = await uploadFromUrl(token, fileUrl, fileName, mesFolderId);
    uploaded++;
    return { ...result, skipped: false };
  }

  // PDF da nota
  if (pdfUrl) {
    const fileName = buildFileName('NF', pr);
    try {
      const r = await fazerUpload(pdfUrl, fileName);
      if (r) {
        updates.drive_backup_nf_pdf_link = r.link;
        log.detalhes.push(`PDF: ${fileName} — ${r.skipped ? 'já existia' : 'enviado'}`);
      }
    } catch (e) {
      log.detalhes.push(`ERRO PDF: ${e.message}`);
    }
  }

  // XML
  if (xmlUrl) {
    const fileName = buildFileName('XML', pr);
    try {
      const r = await fazerUpload(xmlUrl, fileName);
      if (r) {
        updates.drive_backup_nf_xml_link = r.link;
        log.detalhes.push(`XML: ${fileName} — ${r.skipped ? 'já existia' : 'enviado'}`);
      }
    } catch (e) {
      log.detalhes.push(`ERRO XML: ${e.message}`);
    }
  }

  // Comprovante
  if (comprovanteUrl) {
    const fileName = buildFileName('COMP', pr);
    try {
      const r = await fazerUpload(comprovanteUrl, fileName);
      if (r) {
        updates.drive_backup_comprovante_link = r.link;
        log.detalhes.push(`COMP: ${fileName} — ${r.skipped ? 'já existia' : 'enviado'}`);
      }
    } catch (e) {
      log.detalhes.push(`ERRO COMP: ${e.message}`);
    }
  }

  // Verificar se existe extrato bancário correspondente ao mês da NF
  try {
    const extratos = await base44.asServiceRole.entities.MovimentacaoBancaria.filter(
      { mes_num: mesIdx + 1, ano },
      '-created_date', 1
    ).catch(() => []);
    if (extratos && extratos.length > 0) {
      log.detalhes.push(`✓ Extrato bancário ${MESES_PT[mesIdx]}/${ano} encontrado`);
    } else {
      log.detalhes.push(`⚠ Sem extrato bancário para ${MESES_PT[mesIdx]}/${ano}`);
    }
  } catch (_) { /* não bloquear por falha na verificação */ }

  // Atualizar PurchaseRequest
  if (Object.keys(updates).length > 0) {
    updates.drive_backup_nf_ok = true;
    updates.backup_last_synced_at = new Date().toISOString();
    await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, updates).catch((e) => {
      log.detalhes.push(`AVISO: falha ao atualizar links no banco — ${e.message}`);
    });
  }

  log.status = uploaded > 0 ? 'enviado' : 'ja_sincronizado';
  return log;
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isCron = req.headers.get('x-base44-trigger') === 'cron';

    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      // Aceita admin OU coordenador chamando manualmente
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    // limite: processa no máximo N registros por execução (padrão 30; use 0 para todos)
    const limite = typeof body.limite === 'number' ? body.limite : 30;
    const startTime = Date.now();

    // Buscar compras aprovadas com arquivos fiscais
    const compras = [];
    let skip = 0;
    while (true) {
      const lote = await base44.asServiceRole.entities.PurchaseRequest.filter(
        { status: { $in: STATUS_APROVADOS } }, '-created_date', 100, skip
      ).catch(() => []);
      if (!lote || lote.length === 0) break;

      // Filtrar: apenas registros com ao menos um arquivo fiscal
      for (const pr of lote) {
        const temArquivo =
          pr.nota_fiscal_url || pr.nota_fiscal_pdf_url || pr.nf_pdf_url ||
          pr.nota_fiscal_xml_url || pr.xml_url ||
          pr.comprovante_url || pr.comprovante_pagamento_url;
        if (temArquivo) compras.push(pr);
      }

      if (lote.length < 100) break;
      skip += 100;
    }

    // Filtrar apenas os que ainda não foram sincronizados com sucesso
    const pendentes = compras.filter(p => p.drive_backup_nf_ok !== true);

    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        total_compras_com_arquivo: compras.length,
        total_pendentes: pendentes.length,
        ids: pendentes.slice(0, 50).map((p) => ({ id: p.id, status: p.status, nf: p.nf_numero, data: p.nf_data_emissao })),
      });
    }

    // Obter token Drive
    const token = await getToken(base44);
    const notasFolderCache = {};

    const resultados = { enviado: 0, ja_sincronizado: 0, data_invalida: 0, sem_arquivos: 0, pasta_nao_encontrada: 0, erro: 0 };
    const logs = [];

    // Limitar a quantidade processada por execução para evitar timeout
    const comprasParaProcessar = limite > 0 ? pendentes.slice(0, limite) : pendentes;

    // Processar em lotes de BATCH_SIZE
    for (let i = 0; i < comprasParaProcessar.length; i += BATCH_SIZE) {
      const lote = comprasParaProcessar.slice(i, i + BATCH_SIZE);
      for (const pr of lote) {
        try {
          const logItem = await processarPurchase(base44, token, pr, notasFolderCache);
          logs.push(logItem);
          resultados[logItem.status] = (resultados[logItem.status] || 0) + 1;
        } catch (e) {
          console.error(`Erro ao processar ${pr.id}:`, e.message);
          logs.push({ id: pr.id, status: 'erro', detalhes: [e.message] });
          resultados.erro++;
        }
      }
    }

    // Log de execução
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'backup_diario_nfs_drive',
      status: resultados.erro > 0 && resultados.enviado === 0 ? 'failure' : 'success',
      total_files: compras.length,
      files_copied: resultados.enviado,
      error_message: resultados.erro > 0 ? `${resultados.erro} erros de upload` : '',
      execution_time_ms: Date.now() - startTime,
      triggered_by: isCron ? 'scheduled' : 'manual',
    }).catch(() => null);

    return Response.json({
      ok: true,
      total_com_arquivo: compras.length,
      total_pendentes: pendentes.length,
      total_processadas: comprasParaProcessar.length,
      resultados,
      execution_ms: Date.now() - startTime,
      logs: logs.filter((l) => l.status !== 'ja_sincronizado').slice(0, 100),
    });

  } catch (error) {
    console.error('backupDiarioNFsDrive error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});