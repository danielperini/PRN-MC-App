import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ======================================================================
// CONSTANTES
// ======================================================================
const ORIGIN_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BACKUP_FOLDER_ID = '1RB2iyHyC4YfXCrnao5vWWXFQFEF0B8UL';
const CUTOFF_DATE = '2026-03-01T00:00:00Z';
const SYSTEM_EMAIL = 'sistema@museus-centro.org.br';

const ACCEPTED_MIMES = new Set([
  'application/pdf',
  'text/xml',
  'application/xml',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const BLOCKED_WORDS = [
  'extrato', 'recibo', 'comprovante', 'boleto',
  'restituição', 'restituicao', 'reembolso', 'estorno',
  'cancelada', 'cancelado', 'pix', 'ted', 'transferência',
  'transferencia', 'darf', 'gnre', 'fgts', 'inss',
  'guia de', 'boleto bancario', 'duplicidade',
];

const TOMADOR_CNPJ = '23843648000125';
const TOMADOR_NOMES = [
  'VIADUTO DAS ARTES',
  'VIADUTO DAS ARTES.',
  'MUSEUS CENTRO',
  'PROJETO MUSEUS CENTRO',
  'OSC VIADUTO DAS ARTES',
];

// ======================================================================
// UTILITÁRIOS
// ======================================================================
function safeStr(v) {
  return String(v || '').trim();
}

function onlyDigits(v) {
  return safeStr(v).replace(/\D/g, '');
}

function normalizeText(v) {
  return safeStr(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function parseValor(v) {
  if (!v && v !== 0) return 0;
  const s = String(v).trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(',', '.')) || 0;
}

function hasBlockedWord(fileName) {
  const normalized = normalizeText(fileName);
  return BLOCKED_WORDS.some((w) => normalized.includes(normalizeText(w)));
}

function buildDriveHash(name, size, modifiedTime) {
  return `${safeStr(name)}|${String(size || 0)}|${safeStr(modifiedTime)}`;
}

function isTomadorValido(tomadorNome, tomadorCnpj) {
  const nomeNorm = normalizeText(tomadorNome);
  const cnpjDigits = onlyDigits(tomadorCnpj);

  if (cnpjDigits && cnpjDigits === TOMADOR_CNPJ) return true;
  if (nomeNorm && TOMADOR_NOMES.some((n) => nomeNorm.includes(normalizeText(n)))) return true;
  return false;
}

// ======================================================================
// ACESSO AO GOOGLE DRIVE
// ======================================================================
async function getDriveToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
  return accessToken;
}

async function driveFetch(base44, url) {
  const token = await getDriveToken(base44);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res;
}

// ======================================================================
// FLUXO 1 — VALIDAÇÃO DE ACESSO ÀS PASTAS
// ======================================================================
async function validateFolderAccess(base44) {
  const results = await Promise.allSettled([
    driveFetch(base44, `https://www.googleapis.com/drive/v3/files/${ORIGIN_FOLDER_ID}?fields=id,name`),
    driveFetch(base44, `https://www.googleapis.com/drive/v3/files/${BACKUP_FOLDER_ID}?fields=id,name`),
  ]);

  const [origin, backup] = results;

  if (origin.status === 'rejected' || !origin.value.ok) {
    return { success: false, error: 'SEM_ACESSO_PASTA_ORIGEM' };
  }

  if (backup.status === 'rejected' || !backup.value.ok) {
    return { success: false, error: 'SEM_ACESSO_PASTA_BACKUP' };
  }

  return { success: true };
}

// ======================================================================
// FLUXO 2 — VARREDURA RECURSIVA
// ======================================================================
async function listFolderRecursive(base44, folderId, folderPath = '') {
  const allFiles = [];
  let pageToken = null;

  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,modifiedTime,createdTime),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await driveFetch(base44, url);
    if (!res.ok) {
      console.warn(`Erro ao listar pasta ${folderId}: ${res.status}`);
      break;
    }

    const data = await res.json();
    pageToken = data.nextPageToken || null;
    const files = data.files || [];

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        const subFiles = await listFolderRecursive(
          base44,
          file.id,
          folderPath ? `${folderPath}/${file.name}` : file.name,
        );
        allFiles.push(...subFiles);
      } else {
        allFiles.push({
          ...file,
          _folderPath: folderPath,
        });
      }
    }
  } while (pageToken);

  return allFiles;
}

// ======================================================================
// FLUXO 3 — FILTRAGEM POR DATA E TIPO
// ======================================================================
function filterFiles(allFiles, cursor) {
  const filtered = [];

  for (const file of allFiles) {
    // Verificar MIME type
    if (!ACCEPTED_MIMES.has(file.mimeType)) continue;

    // Verificar nome bloqueado
    if (hasBlockedWord(file.name)) continue;

    // Verificar data de criação/modificação
    const fileDate = file.modifiedTime || file.createdTime;
    if (!fileDate || fileDate < CUTOFF_DATE) continue;

    filtered.push(file);
  }

  // Ordenar por modifiedTime ASC para consistência do cursor
  filtered.sort((a, b) => {
    const timeA = a.modifiedTime || a.createdTime || '';
    const timeB = b.modifiedTime || b.createdTime || '';
    return timeA.localeCompare(timeB);
  });

  // Aplicar cursor se presente
  if (cursor) {
    const cursorIdx = filtered.findIndex((f) => f.id === cursor);
    if (cursorIdx >= 0) {
      return filtered.slice(cursorIdx + 1);
    }
  }

  return filtered;
}

// ======================================================================
// FLUXO 4 — VERIFICAÇÃO DE IDEMPOTÊNCIA
// ======================================================================
async function checkIdempotency(base44, file) {
  const driveHash = buildDriveHash(file.name, file.size, file.modifiedTime);

  // (a) Verificar por drive_file_id em resultado_ia
  try {
    // Pagina sem limite para cobrir todos os intakes
    let byDriveId = [];
    let _skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.DocumentIntake.filter(
        { status_registro: 'ATIVO' }, '-created_date', 500, _skip
      ).catch(() => []);
      if (!batch || batch.length === 0) break;
      byDriveId = byDriveId.concat(batch);
      if (batch.length < 500) break;
      _skip += 500;
    }

    for (const intake of byDriveId || []) {
      const ria = intake.resultado_ia || {};

      if (ria.drive_file_id === file.id) {
        return { isDuplicate: true, motivo: 'drive_file_id já importado' };
      }

      if (ria.drive_hash === driveHash) {
        return { isDuplicate: true, motivo: 'drive_hash idêntico (nome+tamanho+data)' };
      }
    }
  } catch (e) {
    console.warn('Erro ao verificar drive_file_id:', e.message);
  }

  // (c) Verificar por nf_chave_acesso — só após análise, então pulamos aqui
  // (d, e) Serão verificados pelo processarNotaFiscalComClaude internamente via validateNFDuplicate

  return { isDuplicate: false };
}

// ======================================================================
// UTILITÁRIO — EXTRAÇÃO RÁPIDA DE DADOS DO XML (sem IA)
// ======================================================================
function extractXmlKey(xmlText) {
  const onlyD = (v) => String(v || '').replace(/\D/g, '');
  const cnpjMatch = xmlText.match(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i)
    || xmlText.match(/<cnpj>(\d+)<\/cnpj>/i);
  const cpfMatch = xmlText.match(/<CPF[^>]*>(\d+)<\/CPF>/i);
  const nfMatch = xmlText.match(/<nNF[^>]*>(\d+)<\/nNF>/i)
    || xmlText.match(/<Numero[^>]*>(\d+)<\/Numero>/i)
    || xmlText.match(/<nNfse[^>]*>(\d+)<\/nNfse>/i);
  const valorMatch = xmlText.match(/<vNF[^>]*>([\d.,]+)<\/vNF>/i)
    || xmlText.match(/<vLiquidoNfse[^>]*>([\d.,]+)<\/vLiquidoNfse>/i)
    || xmlText.match(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i);
  const dataMatch = xmlText.match(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i)
    || xmlText.match(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i)
    || xmlText.match(/<Data[^>]*>(\d{4}-\d{2}-\d{2})/i);
  const nomeMatch = xmlText.match(/<xNome[^>]*>([^<]+)<\/xNome>/i)
    || xmlText.match(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i);
  const chaveMatch = xmlText.match(/[0-9]{44}/);
  return {
    nf_emitente_cpf_cnpj: onlyD(cnpjMatch?.[1] || cpfMatch?.[1] || ''),
    nf_emitente_nome: (nomeMatch?.[1] || '').trim(),
    nf_numero: onlyD(nfMatch?.[1] || ''),
    nf_valor_total: parseValor(valorMatch?.[1] || '0'),
    nf_data_emissao: (dataMatch?.[1] || '').trim(),
    nf_chave_acesso: (chaveMatch?.[0] || '').trim(),
  };
}

// Normaliza nome de arquivo para comparação (remove extensão e variações)
function normalizeFileName(name) {
  return safeStr(name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\.(pdf|xml)$/i, '')
    .replace(/[\s_\-]+/g, ' ')
    .trim();
}

// ======================================================================
// FLUXO 5 — IMPORTAÇÃO E ANÁLISE POR IA
// ======================================================================
async function importAndAnalyze(base44, file) {
  const driveHash = buildDriveHash(file.name, file.size, file.modifiedTime);

  try {
    // (1) Download do arquivo do Google Drive
    const downloadRes = await driveFetch(
      base44,
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
    );

    if (!downloadRes.ok) {
      console.error(`Download falhou para ${file.name}: HTTP ${downloadRes.status} ${downloadRes.statusText}`);
      const errorBody = await downloadRes.text().catch(() => '');
      console.error(`Detalhes: ${errorBody}`);
      return { success: false, motivo: `Download Drive falhou: HTTP ${downloadRes.status}` };
    }

    const fileBytes = await downloadRes.arrayBuffer();
    console.log(`Download OK: ${file.name} (${(fileBytes.byteLength / 1024).toFixed(1)} KB)`);

    // (2) Upload para Storage Base44
    let fileUrl;
    try {
      const fileObj = new File([fileBytes], file.name, { type: file.mimeType });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
        file: fileObj,
      });
      fileUrl = uploadResult.file_url;
      console.log(`Upload OK: ${file.name} → ${fileUrl}`);
    } catch (uploadErr) {
      console.error(`Upload falhou para ${file.name}:`, uploadErr.message);
      return { success: false, motivo: `Upload storage falhou: ${uploadErr.message}` };
    }

    if (!fileUrl) {
      return { success: false, motivo: 'Falha no upload para storage — URL não retornada' };
    }

    // (3) Criar registro em DocumentIntake com ANALISANDO_IA
    let intake;
    try {
      intake = await base44.asServiceRole.entities.DocumentIntake.create({
        user_email: SYSTEM_EMAIL,
        user_name: 'Sistema — Sincronização Drive',
        tipo_detectado: 'PENDENTE',
        status_processamento: 'ANALISANDO_IA',
        arquivo_original_url: fileUrl,
        file_name_original: file.name,
        file_name_final: file.name,
        mime_type: file.mimeType,
        origem: 'DRIVE_SYNC',
        resultado_ia: {
          drive_file_id: file.id,
          drive_hash: driveHash,
          drive_folder_path: file._folderPath || '',
          drive_modified_time: file.modifiedTime,
          drive_created_time: file.createdTime,
        },
      });
      console.log(`Intake criado: ${intake.id} para ${file.name}`);
    } catch (createErr) {
      console.error(`Falha ao criar DocumentIntake para ${file.name}:`, createErr.message);
      return { success: false, motivo: `Falha ao criar DocumentIntake: ${createErr.message}` };
    }

    // (4) Análise por IA diretamente (Claude)
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const iaResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
        model: 'claude_sonnet_4_6',
        prompt: `VOCÊ É UM ESPECIALISTA EM DOCUMENTOS FISCAIS para o projeto MUSEUS CENTRO.
Data atual: ${hoje}. Datas até ${hoje} são VÁLIDAS.

TOMADOR: Viaduto das Artes, CNPJ 23.843.648/0001-25.

Documento importado automaticamente do Google Drive (pasta: ${file._folderPath || 'raiz'}).
Leia INTEGRALMENTE e classifique: Nota Fiscal, Recibo, Comprovante, ou Documento Complementar.

Extraia TODOS os dados fiscais disponíveis no JSON:
{
  "eh_nota_fiscal": boolean,
  "eh_documento_complementar": boolean,
  "tipo_documento_complementar": "RECIBO|COMPROVANTE_PAGAMENTO|DOCUMENTO_COMPLEMENTAR|null",
  "documento_valido": true,
  "documento_cancelado": false,
  "nf_numero": "",
  "nf_chave_acesso": "",
  "nf_data_emissao": "",
  "nf_horario_emissao": "",
  "nf_valor_total": "",
  "nf_emitente_nome": "",
  "nf_emitente_cpf_cnpj": "",
  "nf_tomador_nome": "",
  "nf_tomador_cpf_cnpj": "",
  "descricao_servico": "",
  "municipio_emissao": "",
  "competencia": "",
  "tipo_servico": "",
  "codigo_servico": "",
  "aliquota": "",
  "iss_retido": false,
  "valor_iss": "",
  "centro_custo_sugerido": "",
  "museu_sugerido": "",
  "categoria_sugerida": "",
  "rubrica_nome_sugerida": "",
  "justificativa_rubrica": "",
  "inconsistencias": [],
  "avisos": [],
  "motivo_rejeicao": "",
  "score_confiabilidade": 0
}`,
        file_urls: [fileUrl],
        response_json_schema: {
          type: 'object',
          properties: {
            eh_nota_fiscal: { type: 'boolean' },
            eh_documento_complementar: { type: 'boolean' },
            tipo_documento_complementar: { type: 'string' },
            documento_valido: { type: 'boolean' },
            documento_cancelado: { type: 'boolean' },
            nf_numero: { type: 'string' },
            nf_chave_acesso: { type: 'string' },
            nf_data_emissao: { type: 'string' },
            nf_horario_emissao: { type: 'string' },
            nf_valor_total: { type: 'string' },
            nf_emitente_nome: { type: 'string' },
            nf_emitente_cpf_cnpj: { type: 'string' },
            nf_tomador_nome: { type: 'string' },
            nf_tomador_cpf_cnpj: { type: 'string' },
            descricao_servico: { type: 'string' },
            municipio_emissao: { type: 'string' },
            competencia: { type: 'string' },
            tipo_servico: { type: 'string' },
            codigo_servico: { type: 'string' },
            aliquota: { type: 'string' },
            iss_retido: { type: 'boolean' },
            valor_iss: { type: 'string' },
            centro_custo_sugerido: { type: 'string' },
            museu_sugerido: { type: 'string' },
            categoria_sugerida: { type: 'string' },
            rubrica_nome_sugerida: { type: 'string' },
            justificativa_rubrica: { type: 'string' },
            inconsistencias: { type: 'array', items: { type: 'string' } },
            avisos: { type: 'array', items: { type: 'string' } },
            motivo_rejeicao: { type: 'string' },
            score_confiabilidade: { type: 'number' },
          },
        },
      });

      const ia = iaResp || {};
      console.log(`IA OK para ${file.name}: eh_nota_fiscal=${ia.eh_nota_fiscal}, score=${ia.score_confiabilidade}`);

      // Atualizar intake com resultado da IA
      await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
        resultado_ia: {
          ...intake.resultado_ia,
          ...ia,
          drive_file_id: file.id,
          drive_hash: driveHash,
          drive_folder_path: file._folderPath || '',
        },
        tipo_detectado: ia.eh_nota_fiscal ? 'NOTA_FISCAL_PDF' : 'PENDENTE',
        nf_numero: safeStr(ia.nf_numero),
        nf_valor_total: parseValor(ia.nf_valor_total) || null,
        nf_emitente_nome: safeStr(ia.nf_emitente_nome),
        nf_emitente_cpf_cnpj: onlyDigits(ia.nf_emitente_cpf_cnpj),
        municipio: safeStr(ia.municipio_emissao),
        fornecedor_nome: safeStr(ia.nf_emitente_nome),
        fornecedor_cpf_cnpj: onlyDigits(ia.nf_emitente_cpf_cnpj),
        centro_custo: safeStr(ia.centro_custo_sugerido),
        rubrica_nome_sugerida: safeStr(ia.rubrica_nome_sugerida),
        erros_validacao: Array.isArray(ia.inconsistencias) ? ia.inconsistencias : [],
      });
    } catch (iaErr) {
      console.error(`IA falhou para ${file.name}:`, iaErr.message);
      await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'AGUARDANDO_REVISAO',
        erros_validacao: [`Erro na análise IA: ${iaErr.message}. Revisão manual necessária.`],
      });
    }

    return { success: true, intakeId: intake.id, fileUrl };
  } catch (e) {
    console.error(`Erro ao importar ${file.name}:`, e.message);
    return { success: false, motivo: e.message };
  }
}

// ======================================================================
// FLUXO 6 — VALIDAÇÃO PÓS-ANÁLISE
// ======================================================================
async function postValidate(base44, intakeId, fileName) {
  try {
    const intake = await base44.asServiceRole.entities.DocumentIntake.get(intakeId);
    if (!intake) return null;

    const ia = intake.resultado_ia || {};
    const erros = Array.isArray(intake.erros_validacao) ? [...intake.erros_validacao] : [];

    // Verificar palavras proibidas no nome do arquivo
    if (hasBlockedWord(fileName)) {
      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'REJEITADO',
        erros_validacao: [...erros, 'Nome do arquivo contém palavra bloqueada (extrato/recibo/comprovante/boleto/etc.)'],
        resultado_ia: { ...ia, documento_valido: false },
      });
      return { status: 'rejeitado', motivo: 'palavra_bloqueada' };
    }

    // Verificar nota cancelada
    const isCancelada =
      ia.documento_cancelado === true ||
      ia.eh_nota_fiscal === false ||
      normalizeText(ia.descricao_servico || '').includes('CANCELADA');

    if (isCancelada) {
      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'REJEITADO',
        erros_validacao: [...erros, 'Documento cancelado ou inválido detectado pela IA.'],
        resultado_ia: { ...ia, documento_cancelado: true, documento_valido: false },
      });
      return { status: 'cancelado', motivo: 'nota_cancelada' };
    }

    // Verificar tomador
    const tomadorNome = safeStr(ia.tomador_cnpj_encontrado || ia.nf_destinatario_nome || '');
    const tomadorCnpj = safeStr(ia.tomador_cnpj_encontrado || ia.nf_destinatario_cpf_cnpj || '');
    if (!isTomadorValido(tomadorNome, tomadorCnpj)) {
      erros.push('⚠️ CONFERÊNCIA: Tomador não identificado como Viaduto das Artes / Museus Centro. Verifique antes de aprovar.');
      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        erros_validacao: erros,
      });
    }

    // Se documento válido — AGUARDANDO_REVISAO
    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'AGUARDANDO_REVISAO',
    });

    return { status: 'aguardando_revisao' };
  } catch (e) {
    console.error(`Erro na pós-validação do intake ${intakeId}:`, e.message);
    return null;
  }
}

// ======================================================================
// FLUXO 8 — RELATÓRIO
// ======================================================================
function buildReport(stats) {
  return {
    success: true,
    total_lidos: stats.totalLidos,
    importados: stats.importados,
    ignorados: stats.ignorados,
    duplicados: stats.duplicados,
    cancelados: stats.cancelados,
    erros: stats.erros,
    next_cursor: stats.nextCursor || null,
    tem_mais: stats.temMais || false,
    detalhamento: stats.detalhamento || [],
  };
}

// ======================================================================
// HANDLER PRINCIPAL
// ======================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Autenticação (apenas quando chamado via HTTP manual)
    const url = new URL(req.url);
    const isCron = url.searchParams.get('cron') === '1' || req.headers.get('x-base44-trigger') === 'cron';

    if (!isCron) {
      const user = await base44.auth.me();
      if (!user) {
        return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
      }
      if (user.role !== 'admin') {
        return Response.json({ ok: false, error: 'Função exclusiva da coordenação geral' }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const maxFiles = parseInt(body.maxFiles, 10) || 10000; // sem limite máximo — processa tudo
    const cursor = safeStr(body.cursor);
    const triggeredBy = safeStr(body.triggeredBy || (isCron ? 'scheduled' : 'manual'));

    const startTime = Date.now();

    // ── FLUXO 1: Validação de acesso ──
    const accessCheck = await validateFolderAccess(base44);
    if (!accessCheck.success) {
      // Log de falha
      try {
        await base44.asServiceRole.entities.BackupLog.create({
          backup_type: 'drive_sync_nf',
          status: 'failure',
          total_files: 0,
          files_copied: 0,
          error_message: accessCheck.error,
          execution_time_ms: Date.now() - startTime,
          triggered_by: triggeredBy,
        });
      } catch (_) { /* log é best-effort */ }

      return Response.json({
        success: false,
        error: accessCheck.error,
        dry_run: dryRun,
      }, { status: 403 });
    }

    // ── FLUXO 2: Varredura recursiva ──
    const allFiles = await listFolderRecursive(base44, ORIGIN_FOLDER_ID);

    // ── FLUXO 3: Filtragem ──
    let filteredFiles = filterFiles(allFiles, cursor);
    const temMais = filteredFiles.length > maxFiles;
    filteredFiles = filteredFiles.slice(0, maxFiles);

    const stats = {
      totalLidos: filteredFiles.length,
      importados: 0,
      ignorados: 0,
      duplicados: 0,
      cancelados: 0,
      erros: 0,
      nextCursor: filteredFiles.length > 0 ? filteredFiles[filteredFiles.length - 1]?.id || null : null,
      temMais,
      detalhamento: [],
    };

    // ── FLUXO 9: Dry Run ──
    if (dryRun) {
      for (const file of filteredFiles) {
        const dupCheck = await checkIdempotency(base44, file);
        const temPalavraBloqueada = hasBlockedWord(file.name);

        stats.detalhamento.push({
          nome: file.name,
          drive_file_id: file.id,
          pasta: file._folderPath || '/',
          mime: file.mimeType,
          data: file.modifiedTime || file.createdTime,
          seria_importado: !dupCheck.isDuplicate && !temPalavraBloqueada,
          motivo_ignorar: dupCheck.isDuplicate
            ? `Duplicado: ${dupCheck.motivo}`
            : temPalavraBloqueada
              ? 'Nome contém palavra bloqueada'
              : null,
        });
      }

      const report = buildReport({
        ...stats,
        totalLidos: allFiles.length,
        ignorados: allFiles.length - filteredFiles.length,
        importados: 0,
        duplicados: filteredFiles.filter((f) => {
          const idx = stats.detalhamento.findIndex((d) => d.drive_file_id === f.id);
          return idx >= 0 && stats.detalhamento[idx].motivo_ignorar?.startsWith('Duplicado');
        }).length,
      });

      return Response.json({ ...report, dry_run_report: true });
    }

    // ── FLUXO 4 + 5 + 6: Processamento ──
    for (const file of filteredFiles) {
      // Verificar palavras bloqueadas
      if (hasBlockedWord(file.name)) {
        stats.ignorados++;
        stats.detalhamento.push({
          nome: file.name,
          drive_file_id: file.id,
          status: 'ignorado',
          motivo: 'Nome contém palavra bloqueada',
        });
        continue;
      }

      // Verificar idempotência
      const dupCheck = await checkIdempotency(base44, file);
      if (dupCheck.isDuplicate) {
        stats.duplicados++;
        stats.detalhamento.push({
          nome: file.name,
          drive_file_id: file.id,
          status: 'duplicado',
          motivo: dupCheck.motivo,
        });
        continue;
      }

      // Importar e analisar
      const importResult = await importAndAnalyze(base44, file);
      if (!importResult.success) {
        stats.erros++;
        stats.detalhamento.push({
          nome: file.name,
          drive_file_id: file.id,
          status: 'erro',
          motivo: importResult.motivo,
        });
        continue;
      }

      // Pós-validação
      const postResult = await postValidate(base44, importResult.intakeId, file.name);

      if (postResult?.status === 'rejeitado' || postResult?.status === 'cancelado') {
        stats.cancelados++;
        stats.detalhamento.push({
          nome: file.name,
          drive_file_id: file.id,
          status: postResult.status,
          motivo: postResult.motivo,
          intake_id: importResult.intakeId,
        });
      } else {
        stats.importados++;
        stats.detalhamento.push({
          nome: file.name,
          drive_file_id: file.id,
          status: 'importado',
          intake_id: importResult.intakeId,
        });
      }
    }

    // ── FLUXO 7: Parear PDF+XML da mesma pasta do Drive (sem chamar IA) ──
    // Agrupa os intakes recém-criados por pasta e tenta vincular PDF↔XML por nome base
    if (!dryRun && stats.importados > 0) {
      try {
        // Carrega todos os intakes recentes com drive_folder_path
        const recentIntakes = await base44.asServiceRole.entities.DocumentIntake.filter(
          { status_registro: 'ATIVO', status_processamento: 'AGUARDANDO_REVISAO' },
          '-created_date', 500
        ).catch(() => []);

        const pdfsOrfaos = (recentIntakes || []).filter(i =>
          (i.tipo_detectado === 'NOTA_FISCAL_PDF' || (i.mime_type || '').includes('pdf')) &&
          !i.nf_xml_intake_id && i.grupo_status !== 'COMPLETO'
        );
        const xmlsOrfaos = (recentIntakes || []).filter(i =>
          i.tipo_detectado === 'NOTA_FISCAL_XML' ||
          (i.file_name_original || '').toLowerCase().endsWith('.xml')
        ).filter(x => !x.nf_pdf_intake_id && x.grupo_status !== 'COMPLETO');

        // Para cada XML sem dados, tenta extrair do conteúdo
        for (const xml of xmlsOrfaos) {
          const temDados = xml.nf_emitente_cpf_cnpj || xml.nf_numero;
          if (temDados) continue;
          try {
            const res = await fetch(xml.arquivo_original_url);
            if (res.ok) {
              const text = await res.text();
              const dados = extractXmlKey(text);
              if (dados.nf_emitente_cpf_cnpj || dados.nf_numero) {
                await base44.asServiceRole.entities.DocumentIntake.update(xml.id, {
                  resultado_ia: { ...(xml.resultado_ia || {}), ...dados },
                  nf_emitente_cpf_cnpj: dados.nf_emitente_cpf_cnpj,
                  fornecedor_cpf_cnpj: dados.nf_emitente_cpf_cnpj,
                  nf_emitente_nome: dados.nf_emitente_nome,
                  fornecedor_nome: dados.nf_emitente_nome,
                  nf_numero: dados.nf_numero,
                  nf_valor_total: dados.nf_valor_total,
                  nf_chave_acesso: dados.nf_chave_acesso,
                  tipo_detectado: 'NOTA_FISCAL_XML',
                  status_processamento: 'AGUARDANDO_REVISAO',
                });
                // Atualiza objeto em memória para uso no score
                Object.assign(xml, dados, { nf_emitente_cpf_cnpj: dados.nf_emitente_cpf_cnpj, nf_numero: dados.nf_numero });
              }
            }
          } catch (_) {}
        }

        // Tenta vincular por: 1) CNPJ+NF nº, 2) CNPJ+valor, 3) nome base idêntico
        let vinculosNovos = 0;
        for (const pdf of pdfsOrfaos) {
          const cnpjPdf = onlyDigits(pdf.nf_emitente_cpf_cnpj || pdf.fornecedor_cpf_cnpj || '');
          const nfPdf = onlyDigits(pdf.nf_numero || '');
          const valPdf = parseValor(pdf.nf_valor_total || 0);
          const nomePdf = normalizeFileName(pdf.file_name_original || '');

          let melhorXml = null;
          let melhorScore = 0;

          for (const xml of xmlsOrfaos) {
            if (xml.nf_pdf_intake_id) continue;
            let score = 0;
            const cnpjXml = onlyDigits(xml.nf_emitente_cpf_cnpj || xml.fornecedor_cpf_cnpj || '');
            const nfXml = onlyDigits(xml.nf_numero || '');
            const valXml = parseValor(xml.nf_valor_total || 0);
            const nomeXml = normalizeFileName(xml.file_name_original || '');

            if (cnpjPdf && cnpjXml && cnpjPdf === cnpjXml) score += 6;
            if (nfPdf && nfXml && nfPdf === nfXml) score += 6;
            if (valPdf > 0 && valXml > 0 && Math.abs(valPdf - valXml) < 0.06) score += 4;
            // Mesmo nome base (ex: "nf_empresa_123.pdf" ↔ "nf_empresa_123.xml")
            if (nomePdf && nomeXml && nomePdf === nomeXml) score += 8;
            // Pasta do Drive em common
            const pastaPdf = safeStr((pdf.resultado_ia || {}).drive_folder_path);
            const pastaXml = safeStr((xml.resultado_ia || {}).drive_folder_path);
            if (pastaPdf && pastaXml && pastaPdf === pastaXml) score += 2;

            if (score > melhorScore) { melhorScore = score; melhorXml = xml; }
          }

          // Threshold 8 para vínculo automático seguro
          if (melhorXml && melhorScore >= 8) {
            try {
              await base44.asServiceRole.entities.DocumentIntake.update(pdf.id, {
                nf_xml_intake_id: melhorXml.id,
                nf_xml_url: melhorXml.arquivo_original_url,
                grupo_status: 'COMPLETO',
              });
              await base44.asServiceRole.entities.DocumentIntake.update(melhorXml.id, {
                nf_pdf_intake_id: pdf.id,
                nf_pdf_url: pdf.arquivo_original_url,
                grupo_status: 'COMPLETO',
                ocultar_entrada_unica: true,
              });
              melhorXml.nf_pdf_intake_id = pdf.id; // evitar duplo vínculo
              vinculosNovos++;
            } catch (_) {}
          }
        }
        if (vinculosNovos > 0) {
          console.log(`[PareamentoDrive] ${vinculosNovos} pares PDF+XML vinculados automaticamente.`);
        }
      } catch (pairErr) {
        console.warn('[PareamentoDrive] Erro no pareamento:', pairErr?.message);
      }
    }

    // ── FLUXO 8: Log ──
    const executionTime = Date.now() - startTime;
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'drive_sync_nf',
        status: stats.erros > 0 && stats.importados === 0 ? 'failure' : 'success',
        total_files: stats.totalLidos,
        files_copied: stats.importados,
        error_message: stats.erros > 0 ? `${stats.erros} arquivos com erro de processamento` : '',
        execution_time_ms: executionTime,
        triggered_by: triggeredBy,
      });
    } catch (_) { /* log é best-effort */ }

    const report = buildReport(stats);

    return Response.json(report);
  } catch (error) {
    console.error('syncDriveNotasFiscaisDesdeMarco2026 error:', error);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
});