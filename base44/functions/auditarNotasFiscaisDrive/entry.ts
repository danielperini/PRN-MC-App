import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ======================================================================
// CONSTANTES — Pastas monitoradas do Drive
// ======================================================================
const ORIGIN_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BACKUP_FOLDER_ID = '1RB2iyHyC4YfXCrnao5vWWXFQFEF0B8UL';

const BLOCKED_WORDS = [
  'extrato', 'recibo', 'comprovante', 'boleto',
  'restituição', 'restituicao', 'reembolso', 'estorno',
  'cancelada', 'cancelado', 'pix', 'ted', 'transferência',
  'transferencia', 'darf', 'gnre', 'fgts', 'inss',
  'guia de', 'boleto bancario', 'duplicidade',
];

// ======================================================================
// UTILITÁRIOS
// ======================================================================
function safeStr(v) { return String(v || '').trim(); }
function onlyDigits(v) { return safeStr(v).replace(/\D/g, ''); }

function normalizeText(v) {
  return safeStr(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function hasBlockedWord(fileName) {
  const normalized = normalizeText(fileName);
  return BLOCKED_WORDS.some((w) => normalized.includes(normalizeText(w)));
}

function extractNFNumber(filename) {
  const base = filename.replace(/\.(pdf|xml)$/i, '');
  const nfMatch = base.match(/NF\s*[nN°]*\s*(\d+)/i);
  if (nfMatch) return nfMatch[1];
  const startMatch = base.match(/^(\d+)\s/);
  if (startMatch) return startMatch[1];
  return null;
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
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res;
}

// ======================================================================
// VARREDURA RECURSIVA DO DRIVE
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

    for (const file of (data.files || [])) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        const subFiles = await listFolderRecursive(
          base44, file.id,
          folderPath ? `${folderPath}/${file.name}` : file.name
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
// FILTRAGEM DE ARQUIVOS RELEVANTES
// ======================================================================
function filterRelevantFiles(allFiles) {
  const acceptedMimes = new Set([
    'application/pdf', 'text/xml', 'application/xml',
    'image/png', 'image/jpeg', 'image/webp',
  ]);

  return allFiles.filter((file) => {
    if (!acceptedMimes.has(file.mimeType)) return false;
    if (hasBlockedWord(file.name)) return false;
    return true;
  });
}

// ======================================================================
// CONSTRUÇÃO DO CATÁLOGO DO SISTEMA (já importado)
// ======================================================================
async function buildSystemCatalog(base44) {
  const catalog = new Map(); // key: nfNum_normalizado → [records]

  // (A) PurchaseRequest com origem de importação do Drive
  const prs = await base44.asServiceRole.entities.PurchaseRequest.filter(
    { origem: { $exists: true }, nf_pdf_url: { $exists: true } },
    '-created_date',
    2000
  );

  for (const pr of (prs || [])) {
    const nfNum = onlyDigits(pr.nf_numero || '');
    const fileName = safeStr(pr.arquivo_nome || '');
    const fileNum = extractNFNumber(fileName);

    // Chave primária: número da NF
    const key = nfNum || fileNum;
    if (!key) continue;

    if (!catalog.has(key)) catalog.set(key, []);
    catalog.get(key).push({
      source: 'PurchaseRequest',
      id: pr.id,
      nf_numero: pr.nf_numero,
      arquivo_nome: pr.arquivo_nome,
      nf_valor_total: pr.nf_valor_total || pr.valor_solicitado,
      emitente: pr.nf_emitente_nome || pr.fornecedor_nome,
      origem: pr.origem,
    });
  }

  // (B) DocumentIntake com drive_file_id no resultado_ia
  const intakes = await base44.asServiceRole.entities.DocumentIntake.filter(
    { status_registro: 'ATIVO' },
    '-created_date',
    2000
  );

  for (const intake of (intakes || [])) {
    const ria = intake.resultado_ia || {};
    const driveFileId = safeStr(ria.drive_file_id);

    if (driveFileId) {
      // Indexar também por drive_file_id
      const driveKey = `drive:${driveFileId}`;
      if (!catalog.has(driveKey)) catalog.set(driveKey, []);

      const nfNum = onlyDigits(intake.nf_numero || '');
      catalog.get(driveKey).push({
        source: 'DocumentIntake',
        id: intake.id,
        drive_file_id: driveFileId,
        nf_numero: intake.nf_numero,
        file_name_original: intake.file_name_original,
        nf_valor_total: intake.nf_valor_total,
        tipo_detectado: intake.tipo_detectado,
      });

      // Também indexar pelo número NF se disponível
      if (nfNum) {
        if (!catalog.has(nfNum)) catalog.set(nfNum, []);
        catalog.get(nfNum).push({
          source: 'DocumentIntake',
          id: intake.id,
          drive_file_id: driveFileId,
          nf_numero: intake.nf_numero,
        });
      }
    }
  }

  return catalog;
}

// ======================================================================
// COMPARAÇÃO — Verifica se um arquivo do Drive já está no sistema
// ======================================================================
function isFileAlreadyImported(driveFile, catalog) {
  const reasons = [];

  // (1) Match exato por drive_file_id
  const driveKey = `drive:${driveFile.id}`;
  if (catalog.has(driveKey)) {
    reasons.push(`drive_file_id ${driveFile.id} encontrado em DocumentIntake`);
    return { imported: true, method: 'drive_file_id', reasons };
  }

  // (2) Match por número da NF extraído do nome
  const nfNum = extractNFNumber(driveFile.name);
  if (nfNum && catalog.has(nfNum)) {
    const matches = catalog.get(nfNum);
    reasons.push(`NF número ${nfNum} já cadastrada (${matches.length} registro(s))`);
    return { imported: true, method: 'nf_numero', reasons, matches };
  }

  // (3) Match aproximado por nome normalizado do arquivo
  const normDriveName = normalizeText(driveFile.name).replace(/\.(pdf|xml)$/i, '').trim();
  for (const [key, records] of catalog) {
    if (key.startsWith('drive:')) continue;
    for (const rec of records) {
      const normRecName = normalizeText(rec.arquivo_nome || rec.file_name_original || '')
        .replace(/\.(pdf|xml)$/i, '').trim();
      if (normRecName && normDriveName && normRecName === normDriveName) {
        reasons.push(`Nome de arquivo idêntico: "${driveFile.name}"`);
        return { imported: true, method: 'filename_exact', reasons };
      }
      // Similaridade parcial (nome do arquivo contido ou contendo)
      if (normRecName && normDriveName &&
          (normDriveName.includes(normRecName) || normRecName.includes(normDriveName))) {
        if (normRecName.length > 10 && normDriveName.length > 10) {
          reasons.push(`Nome de arquivo similar: "${driveFile.name}" ≈ "${rec.arquivo_nome || rec.file_name_original || ''}"`);
          return { imported: true, method: 'filename_similar', reasons };
        }
      }
    }
  }

  return { imported: false, method: null, reasons: [] };
}

// ======================================================================
// HANDLER PRINCIPAL
// ======================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const folderIds = body.folderIds || [ORIGIN_FOLDER_ID, BACKUP_FOLDER_ID];

    const startTime = Date.now();

    // ── 1. Varrer pastas do Drive ──
    const allDriveFiles = [];
    for (const folderId of folderIds) {
      try {
        const files = await listFolderRecursive(base44, folderId);
        allDriveFiles.push(...files);
      } catch (e) {
        console.warn(`Erro ao varrer pasta ${folderId}: ${e.message}`);
      }
    }

    // ── 2. Filtrar arquivos relevantes ──
    const relevantFiles = filterRelevantFiles(allDriveFiles);

    // ── 3. Construir catálogo do sistema ──
    const catalog = await buildSystemCatalog(base44);

    // ── 4. Comparar ──
    const jaImportados = [];
    const naoImportados = [];
    const duvidosos = [];

    for (const file of relevantFiles) {
      const result = isFileAlreadyImported(file, catalog);

      const entry = {
        nome: file.name,
        drive_file_id: file.id,
        pasta: file._folderPath || '/',
        mime: file.mimeType,
        tamanho_kb: Math.round((file.size || 0) / 1024),
        data_modificacao: file.modifiedTime || file.createdTime,
        nf_numero_extraido: extractNFNumber(file.name),
      };

      if (result.imported) {
        jaImportados.push({ ...entry, metodo: result.method, detalhes: result.reasons });
      } else {
        naoImportados.push(entry);
      }
    }

    const executionTime = Date.now() - startTime;

    // ── 5. Relatório ──
    const report = {
      success: true,
      resumo: {
        total_arquivos_drive: allDriveFiles.length,
        arquivos_relevantes: relevantFiles.length,
        ja_importados: jaImportados.length,
        nao_importados: naoImportados.length,
        duvidosos: duvidosos.length,
        tempo_ms: executionTime,
      },
      nao_importados: naoImportados,  // ⚠️ Estes precisam ser importados
      ja_importados_resumo: {
        total: jaImportados.length,
        por_drive_file_id: jaImportados.filter(f => f.metodo === 'drive_file_id').length,
        por_nf_numero: jaImportados.filter(f => f.metodo === 'nf_numero').length,
        por_nome_arquivo: jaImportados.filter(f => f.metodo?.startsWith('filename')).length,
      },
      catalog_size: catalog.size,
    };

    return Response.json(report);
  } catch (error) {
    console.error('auditarNotasFiscaisDrive error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});