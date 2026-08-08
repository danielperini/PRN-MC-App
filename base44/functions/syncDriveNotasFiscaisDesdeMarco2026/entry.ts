import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { invokeLLM } from '../_shared/gatewayIA.ts';

// ======================================================================
// CONSTANTES
// ======================================================================
// Pasta raiz (mantida para compatibilidade) + todas as pastas mensais conhecidas
const ORIGIN_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BACKUP_FOLDER_ID = '1RB2iyHyC4YfXCrnao5vWWXFQFEF0B8UL';
const CUTOFF_DATE = '2026-03-01T00:00:00Z';

// Pastas mensais adicionais fornecidas pelo usuário — vasculhadas em paralelo
const EXTRA_FOLDER_IDS = [
  '1X7Ouq3bWMkw2FKuj5ToNrVqI8GT8fdU1',
  '1RV2mZM56GXI2CnDkwSJUp4y_s6uA82QX',
  '1GPGPwo3mXZHmKLEI87GrfsvlHhnt7S9s',
  '1VaIoAV8U9OFJNpwPQcd7Zg9_FM8NgV44',
  '155LK95qLqmv8QKRqBHUgJescETB1MOsw',
  '166UanEeDSixvVKT7RhQ7edsTOtNqYdBT',
];
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
// Token é buscado UMA VEZ no início do handler e passado como string
// para todas as funções — evita múltiplas chamadas ao conector que
// causam throttling e erros 401 em varreduras longas.
async function getDriveToken(base44): Promise<string> {
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  const token = conn?.accessToken || conn?.access_token;
  if (!token) throw new Error('Token do Google Drive não disponível — reconecte o conector.');
  return token;
}

function driveFetch(token: string, url: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

// ======================================================================
// FLUXO 1 — VALIDAÇÃO DE ACESSO ÀS PASTAS
// ======================================================================
async function validateFolderAccess(token: string) {
  const [origin, backup] = await Promise.allSettled([
    driveFetch(token, `https://www.googleapis.com/drive/v3/files/${ORIGIN_FOLDER_ID}?fields=id,name`),
    driveFetch(token, `https://www.googleapis.com/drive/v3/files/${BACKUP_FOLDER_ID}?fields=id,name`),
  ]);

  if (origin.status === 'rejected' || !origin.value.ok) {
    const status = origin.status === 'fulfilled' ? origin.value.status : 'erro';
    return { success: false, error: `SEM_ACESSO_PASTA_ORIGEM (HTTP ${status})` };
  }
  if (backup.status === 'rejected' || !backup.value.ok) {
    const status = backup.status === 'fulfilled' ? backup.value.status : 'erro';
    return { success: false, error: `SEM_ACESSO_PASTA_BACKUP (HTTP ${status})` };
  }

  // Testa acesso às pastas extras (best-effort)
  const extrasCheck = await Promise.allSettled(
    EXTRA_FOLDER_IDS.map(id => driveFetch(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name`))
  );
  const semAcesso = EXTRA_FOLDER_IDS.filter((_, i) => {
    const r = extrasCheck[i];
    return r.status === 'rejected' || !r.value.ok;
  });
  if (semAcesso.length > 0) {
    console.warn(`[FolderAccess] Sem acesso a ${semAcesso.length} pastas extras: ${semAcesso.join(', ')}`);
  }

  return { success: true };
}

// ======================================================================
// FLUXO 2 — VARREDURA RECURSIVA
// ======================================================================
async function listFolderRecursive(token: string, folderId: string, folderPath = '') {
  const allFiles: any[] = [];
  let pageToken: string | null = null;

  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,modifiedTime,createdTime),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await driveFetch(token, url);
    if (!res.ok) {
      console.warn(`Erro ao listar pasta ${folderId}: HTTP ${res.status}`);
      break;
    }

    const data = await res.json();
    pageToken = data.nextPageToken || null;
    const files = data.files || [];

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        const subFiles = await listFolderRecursive(
          token,
          file.id,
          folderPath ? `${folderPath}/${file.name}` : file.name,
        );
        allFiles.push(...subFiles);
      } else {
        allFiles.push({ ...file, _folderPath: folderPath });
      }
    }
  } while (pageToken);

  return allFiles;
}

// ======================================================================
// FLUXO 3 — FILTRAGEM POR DATA E TIPO
// ======================================================================
function isXmlFile(file) {
  return file.mimeType === 'text/xml' ||
    file.mimeType === 'application/xml' ||
    file.name.toLowerCase().endsWith('.xml');
}

function isPdfFile(file) {
  return file.mimeType === 'application/pdf';
}

function filterFiles(allFiles, cursor) {
  const filtered = [];

  for (const file of allFiles) {
    const isPdf = isPdfFile(file);
    const isXml = isXmlFile(file);

    // Aceitar PDF, XML, ou imagem
    if (!isPdf && !isXml && !ACCEPTED_MIMES.has(file.mimeType)) continue;

    // Palavras bloqueadas só para PDFs (XMLs têm nomes técnicos e não devem ser filtrados por nome)
    if (isPdf && hasBlockedWord(file.name)) continue;

    // Filtro de data — XMLs não têm data confiável no Drive, então aceitamos sempre
    if (!isXml) {
      const fileDate = file.modifiedTime || file.createdTime;
      if (!fileDate || fileDate < CUTOFF_DATE) continue;
    }

    filtered.push(file);
  }

  // Ordenar: XMLs primeiro (precisam ser importados antes para o pareamento), depois PDFs
  filtered.sort((a, b) => {
    const aIsXml = isXmlFile(a) ? 0 : 1;
    const bIsXml = isXmlFile(b) ? 0 : 1;
    if (aIsXml !== bIsXml) return aIsXml - bIsXml;
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
// FLUXO 5a — IMPORTAÇÃO DE XML (extração direta, sem IA)
// ======================================================================
async function importXml(base44, token: string, file) {
  const driveHash = buildDriveHash(file.name, file.size, file.modifiedTime);
  try {
    const downloadRes = await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
    if (!downloadRes.ok) return { success: false, motivo: `Download Drive falhou: HTTP ${downloadRes.status}` };

    const xmlText = await downloadRes.text();
    const dados = extractXmlKey(xmlText);

    // Upload do XML para storage
    const fileBytes = new TextEncoder().encode(xmlText);
    const fileObj = new File([fileBytes], file.name, { type: file.mimeType || 'text/xml' });
    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: fileObj });
    const fileUrl = uploadResult?.file_url;
    if (!fileUrl) return { success: false, motivo: 'Upload storage falhou para XML' };

    const intake = await base44.asServiceRole.entities.DocumentIntake.create({
      user_email: SYSTEM_EMAIL,
      user_name: 'Sistema — Sincronização Drive',
      tipo_detectado: 'NOTA_FISCAL_XML',
      status_processamento: 'AGUARDANDO_REVISAO',
      arquivo_original_url: fileUrl,
      file_name_original: file.name,
      file_name_final: file.name,
      mime_type: file.mimeType || 'text/xml',
      origem: 'DRIVE_SYNC',
      nf_emitente_cpf_cnpj: dados.nf_emitente_cpf_cnpj || null,
      fornecedor_cpf_cnpj: dados.nf_emitente_cpf_cnpj || null,
      nf_emitente_nome: dados.nf_emitente_nome || null,
      fornecedor_nome: dados.nf_emitente_nome || null,
      nf_numero: dados.nf_numero || null,
      nf_valor_total: dados.nf_valor_total || null,
      nf_chave_acesso: dados.nf_chave_acesso || null,
      resultado_ia: {
        drive_file_id: file.id,
        drive_hash: driveHash,
        drive_folder_path: file._folderPath || '',
        drive_modified_time: file.modifiedTime,
        drive_created_time: file.createdTime,
        ...dados,
        origem_extracao: 'regex_direto',
      },
    });

    console.log(`[XML] Importado: ${file.name} | NF=${dados.nf_numero} CNPJ=${dados.nf_emitente_cpf_cnpj}`);
    return { success: true, intakeId: intake.id, fileUrl, isXml: true, dadosXml: dados };
  } catch (e) {
    console.error(`Erro ao importar XML ${file.name}:`, e.message);
    return { success: false, motivo: e.message };
  }
}

// ======================================================================
// FLUXO 5b — IMPORTAÇÃO DE PDF E ANÁLISE POR IA
// ======================================================================
async function importAndAnalyze(base44, token: string, file) {
  const driveHash = buildDriveHash(file.name, file.size, file.modifiedTime);

  try {
    // (1) Download do arquivo do Google Drive
    const downloadRes = await driveFetch(
      token,
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
    );

    if (!downloadRes.ok) {
      console.error(`Download falhou para ${file.name}: HTTP ${downloadRes.status} ${downloadRes.statusText}`);
      return { success: false, motivo: `Download Drive falhou: HTTP ${downloadRes.status}` };
    }

    const fileBytes = await downloadRes.arrayBuffer();
    console.log(`Download OK: ${file.name} (${(fileBytes.byteLength / 1024).toFixed(1)} KB)`);

    // (2) Upload para Storage Base44
    let fileUrl;
    try {
      const fileObj = new File([fileBytes], file.name, { type: file.mimeType });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: fileObj });
      fileUrl = uploadResult.file_url;
      console.log(`Upload OK: ${file.name} → ${fileUrl}`);
    } catch (uploadErr) {
      console.error(`Upload falhou para ${file.name}:`, uploadErr.message);
      return { success: false, motivo: `Upload storage falhou: ${uploadErr.message}` };
    }

    if (!fileUrl) return { success: false, motivo: 'Falha no upload para storage — URL não retornada' };

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
    } catch (createErr) {
      console.error(`Falha ao criar DocumentIntake para ${file.name}:`, createErr.message);
      return { success: false, motivo: `Falha ao criar DocumentIntake: ${createErr.message}` };
    }

    // (4) Análise por IA (Claude) — apenas para PDFs
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const iaResp = await invokeLLM(base44.asServiceRole,{
        model: 'claude_sonnet_4_6',
        prompt: `VOCÊ É UM ESPECIALISTA EM DOCUMENTOS FISCAIS para o projeto MUSEUS CENTRO.
Data atual: ${hoje}. Datas até ${hoje} são VÁLIDAS.
TOMADOR: Viaduto das Artes, CNPJ 23.843.648/0001-25.
Documento importado do Google Drive (pasta: ${file._folderPath || 'raiz'}).
Leia INTEGRALMENTE e classifique. Extraia TODOS os dados fiscais no JSON abaixo.`,
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
            nf_valor_total: { type: 'string' },
            nf_emitente_nome: { type: 'string' },
            nf_emitente_cpf_cnpj: { type: 'string' },
            nf_tomador_nome: { type: 'string' },
            nf_tomador_cpf_cnpj: { type: 'string' },
            descricao_servico: { type: 'string' },
            municipio_emissao: { type: 'string' },
            centro_custo_sugerido: { type: 'string' },
            museu_sugerido: { type: 'string' },
            rubrica_nome_sugerida: { type: 'string' },
            inconsistencias: { type: 'array', items: { type: 'string' } },
            motivo_rejeicao: { type: 'string' },
            score_confiabilidade: { type: 'number' },
          },
        },
      });

      const ia = iaResp || {};
      await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
        resultado_ia: { ...intake.resultado_ia, ...ia, drive_file_id: file.id, drive_hash: driveHash, drive_folder_path: file._folderPath || '' },
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
function buildReport(stats: any) {
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
    pareamentos: stats.pareamentos || 0,
    detalhe_pareamentos: stats.detalhe_pareamentos || [],
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
    const body = await req.json().catch(() => ({}));
    const isCron = url.searchParams.get('cron') === '1'
      || req.headers.get('x-base44-trigger') === 'cron'
      || body.cron === '1'
      || body.cron === true;

    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) {
        return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
      }
      if (user.role !== 'admin') {
        return Response.json({ ok: false, error: 'Função exclusiva da coordenação geral' }, { status: 403 });
      }
    }
    const dryRun = body.dryRun === true;
    const maxFiles = parseInt(body.maxFiles, 10) || 10000;
    const cursor = safeStr(body.cursor);
    const triggeredBy = safeStr(body.triggeredBy || (isCron ? 'scheduled' : 'manual'));
    // Se true, ignora o filtro de data de corte (busca todos os PDFs independente da data)
    const ignorarDataCorte = body.ignorarDataCorte === true;
    // Se true, retorna apenas diagnóstico das pastas sem importar nada
    const modoDiagnostico = body.modoDiagnostico === true;

    const startTime = Date.now();

    // ── Token único para toda a execução — evita throttling e 401 em varreduras longas ──
    let driveToken: string;
    try {
      driveToken = await getDriveToken(base44);
    } catch (tokenErr) {
      return Response.json({ success: false, error: tokenErr.message }, { status: 401 });
    }

    // ── FLUXO 1: Validação de acesso ──
    const accessCheck = await validateFolderAccess(driveToken);
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

    // ── FLUXO 2: Varredura recursiva de TODAS as pastas em paralelo ──
    const allFolderIds = [ORIGIN_FOLDER_ID, ...EXTRA_FOLDER_IDS];
    const varreduras = await Promise.allSettled(
      allFolderIds.map(folderId => listFolderRecursive(driveToken, folderId))
    );

    // Agrega e deduplica por drive_file_id (um mesmo arquivo pode aparecer em múltiplas pastas via atalho)
    const seenFileIds = new Set<string>();
    const allFiles: any[] = [];
    for (const r of varreduras) {
      if (r.status === 'rejected') {
        console.warn('[Varredura] Pasta falhou:', r.reason?.message);
        continue;
      }
      for (const f of r.value) {
        if (!seenFileIds.has(f.id)) {
          seenFileIds.add(f.id);
          allFiles.push(f);
        }
      }
    }
    console.log(`[Varredura] Total arquivos únicos encontrados em ${allFolderIds.length} pastas: ${allFiles.length}`);

    // ── MODO DIAGNÓSTICO: listar estrutura de pastas e arquivos sem importar ──
    if (modoDiagnostico) {
      const totalPdfs = allFiles.filter(f => isPdfFile(f)).length;
      const totalXmls = allFiles.filter(f => isXmlFile(f)).length;
      const pastasUnicas = [...new Set(allFiles.map(f => f._folderPath || '/').filter(Boolean))];
      const pdfsAntigos = allFiles.filter(f => isPdfFile(f) && (f.modifiedTime || f.createdTime || '') < CUTOFF_DATE);
      const pdfsBloqueados = allFiles.filter(f => isPdfFile(f) && hasBlockedWord(f.name));
      const pdfsValidos = allFiles.filter(f =>
        isPdfFile(f) && !hasBlockedWord(f.name) &&
        (ignorarDataCorte || (f.modifiedTime || f.createdTime || '') >= CUTOFF_DATE)
      );
      // Analisa paridade PDF+XML por pasta e nome base
      const xmlsPorPasta = {};
      for (const f of allFiles.filter(f => isXmlFile(f))) {
        const chave = `${f._folderPath || '/'}::${normalizeFileName(f.name)}`;
        xmlsPorPasta[chave] = f;
      }
      const pdfsSemXml = pdfsValidos.filter(f => {
        const chave = `${f._folderPath || '/'}::${normalizeFileName(f.name)}`;
        return !xmlsPorPasta[chave];
      });
      const pdfsComXml = pdfsValidos.filter(f => {
        const chave = `${f._folderPath || '/'}::${normalizeFileName(f.name)}`;
        return !!xmlsPorPasta[chave];
      });
      return Response.json({
        success: true,
        diagnostico: true,
        total_arquivos: allFiles.length,
        total_pdfs: totalPdfs,
        total_xmls: totalXmls,
        pdfs_validos_para_importar: pdfsValidos.length,
        pdfs_com_xml_pareado_no_drive: pdfsComXml.length,
        pdfs_sem_xml_no_drive: pdfsSemXml.length,
        pdfs_bloqueados_por_nome: pdfsBloqueados.length,
        pdfs_anteriores_ao_corte: pdfsAntigos.length,
        data_corte: CUTOFF_DATE,
        pastas: pastasUnicas.slice(0, 50),
        amostra_pdfs_validos: pdfsValidos.slice(0, 20).map(f => ({ nome: f.name, pasta: f._folderPath, data: f.modifiedTime || f.createdTime, tem_xml: !!xmlsPorPasta[`${f._folderPath || '/'}::${normalizeFileName(f.name)}`] })),
        amostra_pdfs_sem_xml: pdfsSemXml.slice(0, 15).map(f => ({ nome: f.name, pasta: f._folderPath })),
        amostra_pdfs_antigos: pdfsAntigos.slice(0, 10).map(f => ({ nome: f.name, pasta: f._folderPath, data: f.modifiedTime || f.createdTime })),
        amostra_pdfs_bloqueados: pdfsBloqueados.slice(0, 10).map(f => ({ nome: f.name, motivo: BLOCKED_WORDS.find(w => normalizeText(f.name).includes(normalizeText(w))) })),
        dica: pdfsAntigos.length > 0 && pdfsValidos.length === 0
          ? `Existem ${pdfsAntigos.length} PDFs mas todos são anteriores à data de corte (${CUTOFF_DATE}). Use ignorarDataCorte=true para importá-los.`
          : `${pdfsValidos.length} PDFs válidos. ${pdfsComXml.length} já têm XML correspondente no Drive.`,
      });
    }

    // ── FLUXO 3: Filtragem ──
    let filteredFiles = ignorarDataCorte
      ? allFiles.filter(f => (isPdfFile(f) || isXmlFile(f) || ACCEPTED_MIMES.has(f.mimeType)) && !(isPdfFile(f) && hasBlockedWord(f.name)))
          .sort((a, b) => {
            // XMLs primeiro para estarem disponíveis quando o PDF chegar
            const aX = isXmlFile(a) ? 0 : 1;
            const bX = isXmlFile(b) ? 0 : 1;
            if (aX !== bX) return aX - bX;
            return (a.modifiedTime || a.createdTime || '').localeCompare(b.modifiedTime || b.createdTime || '');
          })
      : filterFiles(allFiles, cursor);

    // Aplicar cursor quando ignorarDataCorte=true
    if (ignorarDataCorte && cursor) {
      const cursorIdx = filteredFiles.findIndex(f => f.id === cursor);
      if (cursorIdx >= 0) filteredFiles = filteredFiles.slice(cursorIdx + 1);
    }

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
    // Mapeia XMLs importados nesta rodada: chave = folderPath::nomeBase → intakeId
    const xmlsImportadosNestaRodada: Record<string, { id: string; url: string; dados: any }> = {};

    for (const file of filteredFiles) {
      const isXml = isXmlFile(file);

      // Verificar palavras bloqueadas — apenas para PDFs
      if (!isXml && hasBlockedWord(file.name)) {
        stats.ignorados++;
        stats.detalhamento.push({ nome: file.name, drive_file_id: file.id, status: 'ignorado', motivo: 'Nome contém palavra bloqueada' });
        continue;
      }

      // Verificar idempotência
      const dupCheck = await checkIdempotency(base44, file);
      if (dupCheck.isDuplicate) {
        stats.duplicados++;
        stats.detalhamento.push({ nome: file.name, drive_file_id: file.id, status: 'duplicado', motivo: dupCheck.motivo });
        continue;
      }

      let importResult;
      if (isXml) {
        // XMLs: extração direta sem IA
        importResult = await importXml(base44, driveToken, file);
        if (importResult.success) {
          const chave = `${file._folderPath || '/'}::${normalizeFileName(file.name)}`;
          xmlsImportadosNestaRodada[chave] = {
            id: importResult.intakeId,
            url: importResult.fileUrl,
            dados: importResult.dadosXml || {},
          };
          stats.importados++;
          stats.detalhamento.push({ nome: file.name, drive_file_id: file.id, status: 'importado', tipo: 'XML', intake_id: importResult.intakeId });
        } else {
          stats.erros++;
          stats.detalhamento.push({ nome: file.name, drive_file_id: file.id, status: 'erro', motivo: importResult.motivo });
        }
      } else {
        // PDFs: análise por IA Claude
        importResult = await importAndAnalyze(base44, driveToken, file);
        if (!importResult.success) {
          stats.erros++;
          stats.detalhamento.push({ nome: file.name, drive_file_id: file.id, status: 'erro', motivo: importResult.motivo });
          continue;
        }

        // Pós-validação
        const postResult = await postValidate(base44, importResult.intakeId, file.name);

        if (postResult?.status === 'rejeitado' || postResult?.status === 'cancelado') {
          stats.cancelados++;
          stats.detalhamento.push({ nome: file.name, drive_file_id: file.id, status: postResult.status, motivo: postResult.motivo, intake_id: importResult.intakeId });
        } else {
          stats.importados++;
          // Vínculo imediato com XML da mesma pasta (importado antes nesta rodada)
          const chaveNome = `${file._folderPath || '/'}::${normalizeFileName(file.name)}`;
          const xmlPareado = xmlsImportadosNestaRodada[chaveNome];
          if (xmlPareado) {
            try {
              await base44.asServiceRole.entities.DocumentIntake.update(importResult.intakeId, {
                nf_xml_intake_id: xmlPareado.id,
                nf_xml_url: xmlPareado.url,
                grupo_status: 'COMPLETO',
              });
              await base44.asServiceRole.entities.DocumentIntake.update(xmlPareado.id, {
                nf_pdf_intake_id: importResult.intakeId,
                nf_pdf_url: importResult.fileUrl,
                grupo_status: 'COMPLETO',
                ocultar_entrada_unica: true,
              });
              console.log(`[PareamentoImediato] ${file.name} ↔ XML da mesma pasta`);
              (stats as any).pareamentos = ((stats as any).pareamentos || 0) + 1;
            } catch (_) {}
          }
          stats.detalhamento.push({ nome: file.name, drive_file_id: file.id, status: 'importado', tipo: 'PDF', xml_pareado: !!xmlPareado, intake_id: importResult.intakeId });
        }
      }
    }

    // ── FLUXO 7: Parear PDF+XML — enriquece XMLs com dados fiscais e depois casa os pares ──
    if (!dryRun) {
      try {
        // Carrega TODOS os intakes ativos sem XML vinculado (não só os recém-criados)
        let recentIntakes: any[] = [];
        let _skip = 0;
        while (true) {
          const batch = await base44.asServiceRole.entities.DocumentIntake.filter(
            { status_registro: 'ATIVO' }, '-created_date', 500, _skip
          ).catch(() => []);
          if (!batch || batch.length === 0) break;
          recentIntakes = recentIntakes.concat(batch);
          if (batch.length < 500) break;
          _skip += 500;
        }

        // PDFs de NF sem XML vinculado
        const pdfsOrfaos = recentIntakes.filter(i =>
          (i.tipo_detectado === 'NOTA_FISCAL_PDF' || (i.mime_type || '').includes('pdf')) &&
          !i.nf_xml_intake_id && i.grupo_status !== 'COMPLETO'
        );

        // XMLs sem PDF vinculado
        const xmlsOrfaos = recentIntakes.filter(i =>
          i.tipo_detectado === 'NOTA_FISCAL_XML' ||
          (i.file_name_original || '').toLowerCase().endsWith('.xml')
        ).filter(x => !x.nf_pdf_intake_id && x.grupo_status !== 'COMPLETO');

        console.log(`[Pareamento] PDFs órfãos: ${pdfsOrfaos.length} | XMLs órfãos: ${xmlsOrfaos.length}`);

        // ── Passo 1: Enriquecer XMLs sem dados fiscais extraindo direto do arquivo ──
        for (const xml of xmlsOrfaos) {
          const jaTem = onlyDigits(xml.nf_emitente_cpf_cnpj || xml.fornecedor_cpf_cnpj || '') ||
                        onlyDigits(xml.nf_numero || '');
          if (jaTem) continue;
          try {
            const res = await fetch(xml.arquivo_original_url);
            if (!res.ok) continue;
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
                nf_valor_total: dados.nf_valor_total || null,
                nf_chave_acesso: dados.nf_chave_acesso,
                tipo_detectado: 'NOTA_FISCAL_XML',
                status_processamento: 'AGUARDANDO_REVISAO',
              }).catch(() => {});
              // Atualiza em memória para uso imediato no score
              Object.assign(xml, {
                nf_emitente_cpf_cnpj: dados.nf_emitente_cpf_cnpj,
                fornecedor_cpf_cnpj: dados.nf_emitente_cpf_cnpj,
                nf_numero: dados.nf_numero,
                nf_valor_total: dados.nf_valor_total,
                nf_chave_acesso: dados.nf_chave_acesso,
                nf_emitente_nome: dados.nf_emitente_nome,
              });
              console.log(`[XML enriquecido] ${xml.file_name_original}: CNPJ=${dados.nf_emitente_cpf_cnpj} NF=${dados.nf_numero}`);
            }
          } catch (_) {}
        }

        // ── Passo 2: Score de pareamento multi-critério ──
        function calcScore(pdf: any, xml: any): number {
          let score = 0;

          const cnpjPdf = onlyDigits(pdf.nf_emitente_cpf_cnpj || pdf.fornecedor_cpf_cnpj || '');
          const cnpjXml = onlyDigits(xml.nf_emitente_cpf_cnpj || xml.fornecedor_cpf_cnpj || '');
          const nfPdf   = onlyDigits(pdf.nf_numero || '');
          const nfXml   = onlyDigits(xml.nf_numero || '');
          const valPdf  = parseValor(pdf.nf_valor_total || 0);
          const valXml  = parseValor(xml.nf_valor_total || 0);
          const nomePdf = normalizeFileName(pdf.file_name_original || '');
          const nomeXml = normalizeFileName(xml.file_name_original || '');
          const chavePdf = safeStr(pdf.nf_chave_acesso || (pdf.resultado_ia || {}).nf_chave_acesso || '');
          const chaveXml = safeStr(xml.nf_chave_acesso || (xml.resultado_ia || {}).nf_chave_acesso || '');
          const pastaPdf = safeStr((pdf.resultado_ia || {}).drive_folder_path || '');
          const pastaXml = safeStr((xml.resultado_ia || {}).drive_folder_path || '');

          // Chave de acesso idêntica — match perfeito (44 dígitos)
          if (chavePdf.length === 44 && chaveXml.length === 44 && chavePdf === chaveXml) return 100;

          // CNPJ + Número NF — identificação fiscal forte
          if (cnpjPdf && cnpjXml && cnpjPdf === cnpjXml) score += 8;
          if (nfPdf && nfXml && nfPdf === nfXml) score += 8;

          // Valor total — tolerância de 1 centavo
          if (valPdf > 0 && valXml > 0 && Math.abs(valPdf - valXml) < 0.02) score += 5;

          // Nome base idêntico (ex: "22 - MUMO.pdf" ↔ "22 - MUMO.xml")
          if (nomePdf && nomeXml && nomePdf === nomeXml) score += 10;

          // Nome base similar: prefixo numérico igual (ex: "22 - ..." e "22 - ...")
          const prefPdf = nomePdf.match(/^(\d+)/)?.[1] || '';
          const prefXml = nomeXml.match(/^(\d+)/)?.[1] || '';
          if (prefPdf && prefXml && prefPdf === prefXml) score += 5;

          // Mesma pasta do Drive
          if (pastaPdf && pastaXml && pastaPdf === pastaXml) score += 3;

          // Palavras do nome em comum (mín 3 palavras com 3+ chars)
          const palavrasPdf = nomePdf.split(' ').filter(p => p.length >= 3);
          const palavrasXml = nomeXml.split(' ').filter(p => p.length >= 3);
          const comuns = palavrasPdf.filter(p => palavrasXml.includes(p));
          if (comuns.length >= 3) score += 4;
          else if (comuns.length >= 2) score += 2;

          return score;
        }

        // ── Passo 3: Algoritmo guloso de pareamento ótimo ──
        // Pré-calcula todos os scores e seleciona os melhores pares sem conflito
        type Pair = { pdf: any; xml: any; score: number };
        const allPairs: Pair[] = [];

        for (const pdf of pdfsOrfaos) {
          for (const xml of xmlsOrfaos) {
            const score = calcScore(pdf, xml);
            if (score >= 8) allPairs.push({ pdf, xml, score });
          }
        }

        // Ordena por score decrescente
        allPairs.sort((a, b) => b.score - a.score);

        const pdfUsados = new Set<string>();
        const xmlUsados = new Set<string>();
        let vinculosNovos = 0;
        const detalhePareamento: any[] = [];

        for (const { pdf, xml, score } of allPairs) {
          if (pdfUsados.has(pdf.id) || xmlUsados.has(xml.id)) continue;

          try {
            await base44.asServiceRole.entities.DocumentIntake.update(pdf.id, {
              nf_xml_intake_id: xml.id,
              nf_xml_url: xml.arquivo_original_url,
              grupo_status: 'COMPLETO',
              status_processamento: 'AGUARDANDO_REVISAO',
            });
            await base44.asServiceRole.entities.DocumentIntake.update(xml.id, {
              nf_pdf_intake_id: pdf.id,
              nf_pdf_url: pdf.arquivo_original_url,
              grupo_status: 'COMPLETO',
              ocultar_entrada_unica: true,
              status_processamento: 'AGUARDANDO_REVISAO',
            });

            pdfUsados.add(pdf.id);
            xmlUsados.add(xml.id);
            vinculosNovos++;
            detalhePareamento.push({
              pdf: pdf.file_name_original,
              xml: xml.file_name_original,
              score,
              motivo: score === 100 ? 'chave_acesso' :
                score >= 16 ? 'cnpj+nf_numero' :
                score >= 10 ? 'nome_base_identico' :
                'multi_criterio',
            });
            console.log(`[Pareado score=${score}] ${pdf.file_name_original} ↔ ${xml.file_name_original}`);
          } catch (_) {}
        }

        if (vinculosNovos > 0) {
          console.log(`[PareamentoDrive] ${vinculosNovos} pares PDF+XML vinculados. Detalhes: ${JSON.stringify(detalhePareamento)}`);
          // Adiciona ao stats para retornar na resposta
          (stats as any).pareamentos = vinculosNovos;
          (stats as any).detalhe_pareamentos = detalhePareamento;
        } else {
          console.log('[PareamentoDrive] Nenhum par novo encontrado.');
        }

      } catch (pairErr) {
        console.warn('[PareamentoDrive] Erro no pareamento:', (pairErr as any)?.message);
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