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
    const byDriveId = await base44.asServiceRole.entities.DocumentIntake.filter(
      { status_registro: 'ATIVO' },
      '-created_date',
      500,
    ).catch(() => []);

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
      return { success: false, motivo: `Falha no download: HTTP ${downloadRes.status}` };
    }

    const fileBytes = await downloadRes.arrayBuffer();

    // (2) Upload para Storage Base44
    let fileUrl;
    try {
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
        file: fileBytes,
      });
      fileUrl = uploadResult.file_url;
    } catch (uploadErr) {
      // Fallback: tentar como string base64
      console.warn('Upload primário falhou, tentando fallback:', uploadErr.message);
      const b64 = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
        file: b64,
      });
      fileUrl = uploadResult.file_url;
    }

    if (!fileUrl) {
      return { success: false, motivo: 'Falha no upload para storage' };
    }

    // (3) Criar registro em DocumentIntake com ANALISANDO_IA
    const intake = await base44.asServiceRole.entities.DocumentIntake.create({
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

    // (4) Chamar processarNotaFiscalComClaude
    const analiseResult = await base44.asServiceRole.functions.invoke(
      'processarNotaFiscalComClaude',
      {
        intake_id: intake.id,
        file_url: fileUrl,
        orientacoes_usuario: 'Documento importado automaticamente do Google Drive. Analise com atenção redobrada.',
        modelo: 'claude',
      },
    );

    if (!analiseResult?.data?.ok) {
      console.warn(`Análise IA falhou para ${file.name}:`, analiseResult?.data?.error);
      // Marcar como AGUARDANDO_REVISAO mesmo se IA falhou parcialmente
      await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'AGUARDANDO_REVISAO',
        erros_validacao: ['Análise IA retornou com ressalvas. Revisão manual recomendada.'],
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
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const maxFiles = Math.min(Math.max(parseInt(body.maxFiles, 10) || 50, 1), 500);
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