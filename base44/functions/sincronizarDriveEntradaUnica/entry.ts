import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ============================================================================
// sincronizarDriveEntradaUnica
// ----------------------------------------------------------------------------
// Lê documentos fiscais da pasta de origem do Google Drive, desduplicando por
// chave de acesso NF-e / hash SHA-256, agrupa PDF+XML da mesma nota em um
// único registro DocumentIntake, e encaminha documentos válidos para o fluxo
// já existente da Entrada Única → Compras/PurchaseRequest.
//
// Comprovantes de pagamento (RECIBO_PDF): PDFs/imagens cujo nome casa o padrão
// /comp|comprovante|recibo|pagamento|transf|pix/i são classificados como
// RECIBO_PDF e só são processados quando o payload inclui
// `incluir_comprovantes: true`. Assim recibos ficam separados das NFs.
//
// Registra uma execução em BackupLog (status em_processamento → concluido/
// failure) para que o painel de sincronização na Entrada Única acompanhe o
// andamento em tempo real.
// ============================================================================

const ORIGIN_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const DEST_FOLDER_ID = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';

const CUTOFF_YEAR = 2026;
const CUTOFF_MONTH = 3; // março/2026 em diante

const IGNORED_EXTENSIONS = new Set(['.xls', '.xlsx', '.xlsm', '.csv', '.ods']);
const IGNORED_MIMES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'text/csv',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

const ACCEPTED_EXTENSIONS = new Set(['.xml', '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic']);
const ACCEPTED_MIMES = new Set([
  'application/pdf',
  'text/xml',
  'application/xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const COMPROVANTE_NAME_RE = /comp|comprovante|recibo|pagamento|transf|pix/i;

const MONTH_MAP = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, março: 3, mar: 3, march: 3,
  abril: 4, abr: 4, apr: 4, maio: 5, mai: 5, may: 5, junho: 6, jun: 6,
  julho: 7, jul: 7, agosto: 8, ago: 8, aug: 8, setembro: 9, set: 9, sep: 9,
  outubro: 10, out: 10, oct: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12, dec: 12,
};

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function safeStr(v) {
  return String(v || '').trim();
}

function onlyDigits(v) {
  return safeStr(v).replace(/\D/g, '');
}

function normalizeText(v) {
  return safeStr(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getExt(name) {
  const n = safeStr(name).toLowerCase();
  const m = n.match(/\.([a-z0-9]{2,5})$/);
  return m ? '.' + m[1] : '';
}

function isAcceptedFile(name, mime) {
  const ext = getExt(name);
  if (IGNORED_EXTENSIONS.has(ext) || IGNORED_MIMES.has(mime)) return false;
  if (ACCEPTED_EXTENSIONS.has(ext)) return true;
  return ACCEPTED_MIMES.has(mime);
}

function isXml(name, mime) {
  return getExt(name) === '.xml' || mime === 'text/xml' || mime === 'application/xml';
}

function isPdf(name, mime) {
  return getExt(name) === '.pdf' || mime === 'application/pdf';
}

function isReciboImage(name, mime) {
  const ext = getExt(name);
  return ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext) ||
    ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'].includes(mime);
}

// PDFs cujo nome indica comprovante/recibo de pagamento → RECIBO_PDF
function isComprovantePdfByName(name) {
  if (!name) return false;
  return COMPROVANTE_NAME_RE.test(safeStr(name));
}

// Extrai chave de acesso de 44 dígitos de conteúdo XML fiscal
function extractChaveFromXml(xmlText) {
  if (!xmlText) return '';
  const m1 = xmlText.match(/<chNFe>(\d{44})<\/chNFe>/i);
  if (m1) return m1[1].toLowerCase();
  const m2 = xmlText.match(/<infNFe[^>]+Id="NFe(\d{44})"/i);
  if (m2) return m2[1].toLowerCase();
  const m3 = xmlText.match(/<infNFe[^>]+Id="(NFe\d{44})"/i);
  if (m3) return m3[1].replace(/^NFe/i, '').toLowerCase();
  return '';
}

// Extrai chave de 44 dígitos de um nome de arquivo
function extractChaveFromName(name) {
  const digits = onlyDigits(name);
  if (digits.length >= 44) {
    // pega os primeiros 44 dígitos contíguos
    const m = digits.match(/(\d{44})/);
    if (m) return m[1].toLowerCase();
  }
  // tenta match direto
  const m = safeStr(name).match(/(\d{44})/);
  return m ? m[1].toLowerCase() : '';
}

function parseXmlField(xmlText, tag) {
  const re = new RegExp('<' + tag + '[^>]*>([^<]+)</' + tag + '>', 'i');
  const m = xmlText.match(re);
  return m ? safeStr(m[1]) : '';
}

function extractNfDataFromXml(xmlText) {
  if (!xmlText) return null;
  const chave = extractChaveFromXml(xmlText);
  // chNFe: 2 cUF | 4 AAMM | 8 CNPJ | 2 modelo | 3 série | 9 número | 1 DV
  let ano = 0, mes = 0, cnpjEmit = '', serie = '', numero = '';
  if (chave && chave.length === 44) {
    ano = 2000 + parseInt(chave.substring(2, 4), 10);
    mes = parseInt(chave.substring(4, 6), 10);
    cnpjEmit = chave.substring(6, 20);
    serie = chave.substring(20, 23).replace(/^0+/, '') || '0';
    numero = chave.substring(23, 32).replace(/^0+/, '') || '0';
  }
  const dhEmi = parseXmlField(xmlText, 'dhEmi');
  const cnpjTag = parseXmlField(xmlText, 'CNPJ') || parseXmlField(xmlText, 'CPF');
  if (cnpjTag) cnpjEmit = cnpjEmit || onlyDigits(cnpjTag);
  const numeroTag = parseXmlField(xmlText, 'nNF');
  if (numeroTag) numero = numero || onlyDigits(numeroTag).replace(/^0+/, '') || '0';
  const serieTag = parseXmlField(xmlText, 'serie');
  if (serieTag) serie = serie || onlyDigits(serieTag).replace(/^0+/, '') || '0';
  const valorTag = parseXmlField(xmlText, 'vNF');
  const valor = parseFloat(safeStr(valorTag).replace(',', '.')) || 0;
  let emissaoIso = dhEmi || '';
  if (!emissaoIso && chave) {
    // fallback: AAMM → primeiro dia do mês
    const mm = String(mes).padStart(2, '0');
    emissaoIso = `${ano}-${mm}-01T00:00:00Z`;
  }
  return {
    chave_acesso: chave,
    nf_numero: numero,
    nf_emitente_cnpj: cnpjEmit,
    serie,
    valor_total: valor,
    nf_data_emissao: emissaoIso,
    ano,
    mes,
  };
}

// Padrões para data em strings: dd-mm-yyyy, yyyy-mm-dd, mm/yyyy, yyyy/mm, etc.
function tryDateFromString(s) {
  if (!s) return null;
  const norm = normalizeText(s);
  // yyyy-mm-dd or yyyy/mm/dd
  let m = norm.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2];
    if (y >= 2020 && mo >= 1 && mo <= 12) return [y, mo];
  }
  // dd-mm-yyyy or dd/mm/yyyy
  m = norm.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    const y = +m[3], mo = +m[2], dd = +m[1];
    if (y >= 2020 && mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31) return [y, mo];
  }
  // mm-yyyy or mm/yyyy
  m = norm.match(/(\d{1,2})[-/.](\d{4})/);
  if (m) {
    const mo = +m[1], y = +m[2];
    if (y >= 2020 && mo >= 1 && mo <= 12) return [y, mo];
  }
  // mês por nome + ano (marco 2026, março 2026, march 2026)
  for (const k of Object.keys(MONTH_MAP)) {
    if (norm.includes(k) && /\b(20\d{2})\b/.test(norm)) {
      const yMatch = norm.match(/\b(20\d{2})\b/);
      return [parseInt(yMatch[1], 10), MONTH_MAP[k]];
    }
  }
  return null;
}

function passesCutoff(year, month) {
  if (!year || !month) return false;
  if (year > CUTOFF_YEAR) return true;
  if (year === CUTOFF_YEAR && month >= CUTOFF_MONTH) return true;
  return false;
}

// Determina período do documento priorizando: XML > pasta > nome arquivo > createdTime
function determinePeriod({ xmlData, folderPath, fileName, createdTime }) {
  if (xmlData && xmlData.ano && xmlData.mes) {
    return { ano: xmlData.ano, mes: xmlData.mes, source: 'xml' };
  }
  const fromFolder = tryDateFromString(folderPath);
  if (fromFolder) return { ano: fromFolder[0], mes: fromFolder[1], source: 'pasta' };
  const fromName = tryDateFromString(fileName);
  if (fromName) return { ano: fromName[0], mes: fromName[1], source: 'nome' };
  if (createdTime) {
    const d = new Date(createdTime);
    if (!isNaN(d.getTime())) {
      return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, source: 'createdTime' };
    }
  }
  return { ano: 0, mes: 0, source: 'indeterminado' };
}

function monthLabel(ano, mes) {
  return String(mes).padStart(2, '0') + '-' + ano;
}

// ============================================================================
// ACESSO AO GOOGLE DRIVE
// ============================================================================

async function getDriveToken(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  const token = conn?.accessToken || conn?.access_token;
  if (!token) throw new Error('Token do Google Drive não disponível — reconecte o conector.');
  return token;
}

function driveHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function driveListChildren(token, folderId) {
  const all = [];
  let pageToken = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,mimeType,size,modifiedTime,createdTime),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { headers: driveHeaders(token) });
    if (!res.ok) {
      console.warn(`[Drive] listChildren HTTP ${res.status} folder ${folderId}`);
      break;
    }
    const data = await res.json();
    if (Array.isArray(data.files)) all.push(...data.files);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return all;
}

async function driveListRecursive(token, folderId, folderPath = '') {
  const out = [];
  const children = await driveListChildren(token, folderId);
  for (const f of children) {
    const childPath = folderPath ? folderPath + '/' + f.name : f.name;
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      const nested = await driveListRecursive(token, f.id, childPath);
      out.push(...nested);
    } else {
      out.push({ ...f, folderPath: folderPath });
    }
  }
  return out;
}

async function driveFindFileByName(token, folderId, name) {
  const q = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=10`;
  const res = await fetch(url, { headers: driveHeaders(token) });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

async function driveEnsureSubfolder(token, parentId, name) {
  // busca pasta existente
  const q = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`;
  const res = await fetch(url, { headers: driveHeaders(token) });
  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data.files) && data.files.length > 0) return data.files[0].id;
  }
  // cria
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { ...driveHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!createRes.ok) throw new Error(`Create folder HTTP ${createRes.status}`);
  const created = await createRes.json();
  return created.id;
}

async function driveEnsurePath(token, ano, mes) {
  // destino/ANO/MM-ANO
  const yearFolderId = await driveEnsureSubfolder(token, DEST_FOLDER_ID, String(ano));
  const monthFolderId = await driveEnsureSubfolder(token, yearFolderId, monthLabel(ano, mes));
  return monthFolderId;
}

async function driveCopyFile(token, fileId, name, targetFolderId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
    method: 'POST',
    headers: { ...driveHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [targetFolderId] }),
  });
  if (!res.ok) throw new Error(`Copy HTTP ${res.status}`);
  const data = await res.json();
  return data.id;
}

async function sha256Hex(bytes) {
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  const arr = Array.from(new Uint8Array(hashBuf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// DEDUPLICAÇÃO CONTRA DocumentIntake EXISTENTES
// ============================================================================

async function loadExistingChaves(base44) {
  const set = new Set();
  let skip = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 500, skip);
    if (!batch || batch.length === 0) break;
    for (const d of batch) {
      const k = safeStr(d.nf_chave_acesso).toLowerCase().replace(/[\s-]/g, '');
      if (k.length === 44) set.add(k);
    }
    if (batch.length < 500) break;
    skip += 500;
  }
  return set;
}

// ============================================================================
// PROCESSAMENTO DE ARQUIVO
// ============================================================================

async function analyzeFile(base44, token, file, existingChavesSet, incluirComprovantes) {
  const ext = getExt(file.name);
  const mime = file.mimeType || '';
  const filepath = file.folderPath ? file.folderPath + '/' + file.name : file.name;

  // 1) tipo/extensão
  if (!isAcceptedFile(file.name, mime)) {
    return { acao: 'ignorado_extensao', arquivo: file.name, caminho: filepath, motivo: `ext=${ext} mime=${mime}` };
  }

  let xmlData = null;
  let chave = '';
  let hash = '';
  let tipoToken = null;

  if (isXml(file.name, mime)) {
    try {
      const text = await driveDownloadText(token, file.id);
      xmlData = extractNfDataFromXml(text);
      chave = xmlData?.chave_acesso || '';
      if (!chave) chave = extractChaveFromName(file.name);
      tipoToken = 'xml_nf';
    } catch (e) {
      return { acao: 'erro', arquivo: file.name, caminho: filepath, motivo: e.message, chave_acesso: '', hash: '' };
    }
  } else if (isPdf(file.name, mime)) {
    // PDF:区分 comprovante vs NF pelo nome
    const ehComprovante = isComprovantePdfByName(file.name);
    tipoToken = ehComprovante ? 'recibo_pdf' : 'pdf_nf';
    chave = extractChaveFromName(file.name);
    try {
      const bytes = await driveDownloadBytes(token, file.id);
      hash = await sha256Hex(bytes);
    } catch (e) {
      // sem hash OK — apenas registra
      console.warn(`[Hash] ${file.name}: ${e.message}`);
    }
  } else if (isReciboImage(file.name, mime)) {
    tipoToken = 'recibo_imagem';
    try {
      const bytes = await driveDownloadBytes(token, file.id);
      hash = await sha256Hex(bytes);
    } catch (e) {
      console.warn(`[Hash] ${file.name}: ${e.message}`);
    }
  }

  // 2) gate de comprovantes — só processa recibos quando incluir_comprovantes=true
  const ehRecibo = tipoToken === 'recibo_pdf' || tipoToken === 'recibo_imagem';
  if (ehRecibo && !incluirComprovantes) {
    return {
      acao: 'ignorado_comprovante',
      arquivo: file.name,
      caminho: filepath,
      chave_acesso: chave,
      hash,
      motivo: 'Comprovante/recibo ignorado (incluir_comprovantes=false)',
    };
  }

  // 3) deduplicação por chave
  if (chave && existingChavesSet.has(chave)) {
    return {
      acao: 'duplicado_bloqueado',
      arquivo: file.name,
      caminho: filepath,
      chave_acesso: chave,
      hash,
      motivo: 'Chave de acesso já existe em DocumentIntake',
    };
  }

  // 4) período
  const periodo = determinePeriod({
    xmlData,
    folderPath: filepath,
    fileName: file.name,
    createdTime: file.createdTime,
  });
  if (!passesCutoff(periodo.ano, periodo.mes)) {
    return {
      acao: 'ignorado_data',
      arquivo: file.name,
      caminho: filepath,
      chave_acesso: chave,
      hash,
      motivo: `Período ${periodo.ano}/${periodo.mes || 0} (${periodo.source}) abaixo do corte ${CUTOFF_YEAR}-${String(CUTOFF_MONTH).padStart(2, '0')}`,
    };
  }

  return {
    acao: 'a_sincronizar',
    arquivo: file.name,
    caminho: filepath,
    chave_acesso: chave,
    hash,
    tipo: tipoToken,
    xmlData,
    periodo,
    fileId: file.id,
    fileSize: file.size || 0,
    modifiedTime: file.modifiedTime || '',
  };
}

async function driveDownloadText(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: driveHeaders(token),
  });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  return await res.text();
}

async function driveDownloadBytes(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: driveHeaders(token),
  });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// ============================================================================
// AGRUPAMENTO PDF + XML
// ============================================================================

function groupByChave(analyzed) {
  const groups = new Map();
  for (const item of analyzed) {
    if (item.acao !== 'a_sincronizar') continue;
    const key = item.chave_acesso || '';
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { chave: key, pdf: null, xml: null, recibo: null });
    const g = groups.get(key);
    if (item.tipo === 'xml_nf') g.xml = item;
    else if (item.tipo === 'pdf_nf') g.pdf = item;
    else if (item.tipo === 'recibo_pdf' || item.tipo === 'recibo_imagem') g.recibo = item;
  }
  return groups;
}

function groupByNfFields(analyzed) {
  // agrupa PDFs e XMLs sem chave pelo número + CNPJ + valor + data
  const groups = new Map();
  for (const item of analyzed) {
    if (item.acao !== 'a_sincronizar') continue;
    if (item.chave_acesso) continue;
    const x = item.xmlData;
    if (!x) continue;
    const key = [x.nf_numero, x.nf_emitente_cnpj, x.serie, x.valor_total, x.nf_data_emissao].join('|');
    if (!groups.has(key)) groups.set(key, { chave: '', pdf: null, xml: null, recibo: null, fieldsKey: key });
    const g = groups.get(key);
    if (item.tipo === 'xml_nf') g.xml = item;
    else if (item.tipo === 'pdf_nf') g.pdf = item;
    else if (item.tipo === 'recibo_pdf' || item.tipo === 'recibo_imagem') g.recibo = item;
  }
  return groups;
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

function emptyReport() {
  return {
    total_analisado: 0,
    total_a_sincronizar: 0,
    total_sincronizado: 0,
    total_ja_existente: 0,
    total_duplicado_bloqueado: 0,
    total_pdf_sem_xml: 0,
    total_xml_sem_pdf: 0,
    total_recibos: 0,
    total_comprovantes_ignorados: 0,
    total_notas_fiscais: 0,
    total_ignorado_extensao: 0,
    total_ignorado_data: 0,
    erros: [],
    detalhes: [],
    continuar: false,
    proximo_page_token: null,
  };
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  let backupLogId = null;
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await base44.auth.me().catch(() => null); // serviço-admin pode chamar sem sessão UI

    const payload = await req.json().catch(() => ({}));
    const mode = payload?.mode === 'execute' ? 'execute' : 'simulate';
    const source = payload?.source === 'xlsx' ? 'xlsx' : 'drive';
    const xlsxFiles = Array.isArray(payload?.xlsx_files) ? payload.xlsx_files : [];
    const pageTokenIn = safeStr(payload?.page_token) || null;
    const batchSize = Math.min(parseInt(payload?.batch_size, 10) || 25, 100);
    const incluirComprovantes = payload?.incluir_comprovantes === true;
    const triggeredBy = payload?.triggered_by === 'scheduled' ? 'scheduled' : 'manual';

    const report = emptyReport();
    report.total_comprovantes_ignorados = 0;

    // ---------- BackupLog: marca início da execução (apenas em execute) ----------
    if (mode === 'execute') {
      try {
        const log = await base44.asServiceRole.entities.BackupLog.create({
          backup_type: 'auditoria_entrada_unica',
          entity_type: 'SYNC_DRIVE_ENTRADA_UNICA',
          status: 'em_processamento',
          triggered_by: triggeredBy,
          total_files: 0,
          files_copied: 0,
          processed_at: new Date().toISOString(),
          details: incluirComprovantes
            ? 'Sincronização Drive (NFs + comprovantes) em andamento'
            : 'Sincronização Drive (NFs) em andamento',
        });
        backupLogId = log?.id || null;
      } catch (e) {
        console.warn('[BackupLog] não foi possível criar log de início:', e.message);
      }
    }

    const token = await getDriveToken(base44);

    // Carrega chaves existentes para deduplicação
    const existingChaves = await loadExistingChaves(base44);

    // ---------- Coleta da fila ----------
    let fila = [];
    let proximoPageToken = null;

    if (source === 'xlsx') {
      // Primeira execução: lista XLSX como fila. page_token começa em 0 e avança por batch.
      const startIdx = pageTokenIn ? parseInt(pageTokenIn, 10) || 0 : 0;
      const slice = xlsxFiles.slice(startIdx, startIdx + batchSize);
      fila = slice.map((f, i) => ({
        arquivo: f.arquivo || f.name || '',
        caminho: f.caminho_origem || f.caminho || '',
        _filaIndex: startIdx + i,
      }));
      const nextIdx = startIdx + batchSize;
      if (nextIdx < xlsxFiles.length) {
        report.continuar = true;
        report.proximo_page_token = String(nextIdx);
      }
    } else {
      // Drive mode: varredura recursiva com paginação por arquivo
      let cached = null;
      // Se houver page_token, ele indica offset dentro da varredura
      const offset = pageTokenIn ? parseInt(pageTokenIn, 10) || 0 : 0;
      const all = await driveListRecursive(token, ORIGIN_FOLDER_ID);
      cached = all.slice(offset, offset + batchSize);
      fila = cached.map((f, i) => ({
        name: f.name,
        folderPath: f.folderPath,
        id: f.id,
        fileId: f.id,
        mimeType: f.mimeType,
        size: f.size,
        modifiedTime: f.modifiedTime,
        createdTime: f.createdTime,
        _filaIndex: offset + i,
      }));
      const nextOffset = offset + batchSize;
      if (nextOffset < all.length) {
        report.continuar = true;
        report.proximo_page_token = String(nextOffset);
      }
    }

    // ---------- Resolve arquivos XLSX no Drive ----------
    if (source === 'xlsx') {
      const resolved = [];
      for (const f of fila) {
        if (!f.arquivo) continue;
        const found = await driveFindFileByName(token, ORIGIN_FOLDER_ID, f.arquivo);
        if (found.length === 0) {
          report.total_analisado++;
          report.total_ignorado_extensao++; // contabiliza como não encontrado
          report.detalhes.push({
            arquivo: f.arquivo,
            caminho: f.caminho,
            acao: 'nao_encontrado_drive',
            motivo: 'Arquivo da fila XLSX não localizado na pasta de origem',
            chave_acesso: '',
            hash: '',
          });
          continue;
        }
        // pega metadados completos
        const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${found[0].id}?fields=id,name,mimeType,size,modifiedTime,createdTime`, {
          headers: driveHeaders(token),
        });
        if (!metaRes.ok) {
          report.erros.push(`Falha ao obter metadados de ${f.arquivo}: HTTP ${metaRes.status}`);
          continue;
        }
        const meta = await metaRes.json();
        resolved.push({ ...meta, folderPath: f.caminho });
      }
      fila = resolved;
    }

    // ---------- Analisa cada arquivo ----------
    const analyzed = [];
    for (const f of fila) {
      report.total_analisado++;
      const item = await analyzeFile(base44, token, f, existingChaves, incluirComprovantes);
      report.detalhes.push({
        arquivo: item.arquivo,
        caminho: item.caminho,
        acao: item.acao,
        motivo: item.motivo || '',
        chave_acesso: item.chave_acesso || '',
        hash: item.hash || '',
        periodo: item.periodo || null,
      });
      switch (item.acao) {
        case 'a_sincronizar':
          report.total_a_sincronizar++;
          if (item.tipo === 'xml_nf' || item.tipo === 'pdf_nf') report.total_notas_fiscais++;
          else if (item.tipo === 'recibo_pdf' || item.tipo === 'recibo_imagem') report.total_recibos++;
          analyzed.push(item);
          break;
        case 'duplicado_bloqueado':
          report.total_duplicado_bloqueado++;
          if (existingChaves.has(item.chave_acesso)) report.total_ja_existente++;
          break;
        case 'ignorado_extensao':
          report.total_ignorado_extensao++;
          break;
        case 'ignorado_comprovante':
          report.total_comprovantes_ignorados++;
          break;
        case 'ignorado_data':
          report.total_ignorado_data++;
          break;
        case 'erro':
          report.erros.push(`${item.arquivo}: ${item.motivo}`);
          break;
        case 'nao_encontrado_drive':
          // já contabilizado
          break;
      }
    }

    // ---------- Agrupamento PDF + XML ----------
    const byChave = groupByChave(analyzed);
    const byFields = groupByNfFields(analyzed);
    const allGroups = [...byChave.values(), ...byFields.values()];

    for (const g of allGroups) {
      if (g.xml && !g.pdf && !g.recibo) report.total_xml_sem_pdf++;
      if ((g.pdf || g.recibo) && !g.xml) report.total_pdf_sem_xml++;
    }

    // ---------- Modo execute: copia + cria DocumentIntake ----------
    if (mode === 'execute' && analyzed.length > 0) {
      for (const g of allGroups) {
        const refItem = g.xml || g.pdf || g.recibo;
        if (!refItem) continue;
        const periodo = refItem.periodo;
        try {
          const destSubfolderId = await driveEnsurePath(token, periodo.ano, periodo.mes);
          // copia cada arquivo do grupo
          const copiados = [];
          for (const item of [g.xml, g.pdf, g.recibo].filter(Boolean)) {
            // verifica se já existe no destino
            const existing = await driveFindFileByName(token, destSubfolderId, item.arquivo);
            if (existing.length > 0) {
              report.total_ja_existente++;
              copiados.push({ name: item.arquivo, id: existing[0].id, ja_existia: true });
              continue;
            }
            const newId = await driveCopyFile(token, item.fileId, item.arquivo, destSubfolderId);
            copiados.push({ name: item.arquivo, id: newId, ja_existia: false });
          }

          // cria um único DocumentIntake para o grupo
          const grupoUploadId = 'sync-' + (g.chave || refItem.hash || refItem.fileId).substring(0, 32);
          let grupoStatus = 'INCOMPLETO';
          if (g.xml && (g.pdf || g.recibo)) grupoStatus = 'COMPLETO';
          else if (g.xml && !g.pdf && !g.recibo) grupoStatus = 'COMPLETO'; // XML apenas
          else if (!g.xml && (g.pdf || g.recibo)) grupoStatus = 'COMPLETO'; // PDF apenas

          // tipo_detectado: NF quando há xml ou pdf_nf; RECIBO_PDF quando só recibo
          const temNf = !!(g.xml || g.pdf);
          let tipoDetectado = 'OUTRO';
          if (temNf) {
            tipoDetectado = g.xml ? 'NOTA_FISCAL_XML' : 'NOTA_FISCAL_PDF';
          } else if (g.recibo) {
            tipoDetectado = 'RECIBO_PDF';
          }

          const intakePayload = {
            user_email: user?.email || 'sistema@museus-centro.org.br',
            user_name: user?.full_name || 'Sistema',
            tipo_detectado: tipoDetectado,
            status_processamento: 'AGUARDANDO_REVISAO',
            arquivo_original_url: (g.xml || g.pdf || g.recibo) ? `https://drive.google.com/file/d/${refItem.fileId}/view` : '',
            file_name_original: refItem.arquivo,
            file_name_final: refItem.arquivo,
            mime_type: '',
            origem: 'sync_drive',
            grupo_upload_id: grupoUploadId,
            grupo_status: grupoStatus,
            nf_xml_url: g.xml ? `https://drive.google.com/file/d/${g.xml.fileId}/view` : '',
            nf_pdf_url: g.pdf ? `https://drive.google.com/file/d/${g.pdf.fileId}/view` : (g.recibo ? `https://drive.google.com/file/d/${g.recibo.fileId}/view` : ''),
            nf_chave_acesso: g.chave,
            nf_emitente_cnpj: g.xml?.xmlData?.nf_emitente_cnpj || '',
            nf_emitente_nome: '',
            nf_numero: g.xml?.xmlData?.nf_numero || '',
            nf_valor_total: g.xml?.xmlData?.valor_total || 0,
            nf_data_emissao: g.xml?.xmlData?.nf_data_emissao || '',
            centro_custo: '',
            revisado_pelo_usuario: false,
            status_registro: 'ATIVO',
            ocultar_entrada_unica: false,
          };

          await base44.asServiceRole.entities.DocumentIntake.create(intakePayload);
          // adiciona chave ao set para evitar duplicatas no mesmo lote
          if (g.chave) existingChaves.add(g.chave);
          report.total_sincronizado++;
        } catch (e) {
          report.erros.push(`Group ${refItem.arquivo}: ${e.message}`);
        }
      }
    }

    // ---------- BackupLog: finaliza ----------
    if (mode === 'execute' && backupLogId) {
      try {
        const ok = report.erros.length === 0;
        await base44.asServiceRole.entities.BackupLog.update(backupLogId, {
          status: ok ? 'concluido' : 'failure',
          total_files: report.total_analisado,
          files_copied: report.total_sincronizado,
          execution_time_ms: Date.now() - startTime,
          processed_at: new Date().toISOString(),
          details: `analisados=${report.total_analisado} sincronizados=${report.total_sincronizado} duplicados=${report.total_duplicado_bloqueado} recibos=${report.total_recibos} comprovantes_ignorados=${report.total_comprovantes_ignorados}`,
          error_message: ok ? '' : report.erros.slice(0, 3).join(' | '),
        });
      } catch (e) {
        console.warn('[BackupLog] falha ao finalizar log:', e.message);
      }
    }

    return Response.json(report);
  } catch (error) {
    console.error('[sincronizarDriveEntradaUnica]', error.message);
    // Tenta marcar o BackupLog como falha
    if (backupLogId) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.BackupLog.update(backupLogId, {
          status: 'failure',
          execution_time_ms: Date.now() - startTime,
          error_message: String(error?.message || error).slice(0, 500),
          processed_at: new Date().toISOString(),
        });
      } catch {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});