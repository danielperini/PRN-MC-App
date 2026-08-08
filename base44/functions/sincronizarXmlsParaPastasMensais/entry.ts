/**
 * sincronizarXmlsParaPastasMensais
 *
 * Garante que cada XML de nota fiscal fique na mesma pasta mensal do Drive
 * que seu PDF correspondente, com ambos renomeados no mesmo padrão canônico.
 *
 * Fontes de XML:
 *   1. PurchaseRequests com nf_xml_url / nota_fiscal_xml_url / xml_url preenchido
 *   2. DocumentIntakes (NOTA_FISCAL_XML) com arquivo_original_url
 *   3. Varredura recursiva da pasta 1jhZBWsOltRSjtdKHPG64PovnxygKLuW- (.xml soltos)
 *
 * Pareamento PDF+XML via nf_numero + valor + fornecedor (lookup em PurchaseRequest).
 * Padrão canônico via motor de nomenclatura oficial (inline).
 * Destinos:
 *   PRIMÁRIO  = 13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T (backup mensal)
 *   SECUNDÁRIO = 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp (arquivo final)
 * Subpastas MM-YYYY criadas automaticamente.
 * Cópia via files.copy (preserva original). Idempotente (skip se já existe).
 * Log em BackupLog.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SOURCE_SCAN_FOLDER = '1jhZBWsOltRSjtdKHPG64PovnxygKLuW-';
const DEST_PRIMARIO = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const DEST_SECUNDARIO = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ── Helpers de nome (inline do nfNomeOficial.ts) ──────────────────────────────

function sanitize(v: any, max = 60): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, max)
    .trim();
}

function parseValor(v: any): number {
  const s = String(v || '').replace(/\s/g, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function formatValor(v: any): string {
  return parseValor(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const EQUIPE_KEYWORDS = ['equipe', 'coordenação', 'coordenacao', 'pessoal', 'serviços (equipe', 'servicos (equipe'];

function isEquipe(pr: any): boolean {
  if (!pr) return false;
  const cat = String(pr.categoria || '').toLowerCase();
  return EQUIPE_KEYWORDS.some((k) => cat.includes(k));
}

function buildNomeOficial(pr: any, intake: any, tipo: 'NF' | 'XML', teamMember: any = null): string {
  const ext = tipo === 'XML' ? 'xml' : 'pdf';
  const prefixo = tipo === 'XML' ? 'XML' : 'NF';
  const numRaw = sanitize(pr?.nf_numero || intake?.nf_numero || pr?.id?.substring(0, 8) || 'SN', 10);
  const num = numRaw === 'SN' ? 'SN' : numRaw.replace(/^0+(\d)/, '$1');
  const descricao = sanitize(
    pr?.rubrica_nome || pr?.categoria || pr?.natureza_despesa || intake?.rubrica_nome_sugerida || 'Despesa',
    30,
  );
  let nomeExibicao: string;
  if (isEquipe(pr) && teamMember) {
    const empresa = sanitize(teamMember.empresa_nome || 'PESSOA FISICA', 60);
    const funcao = sanitize(teamMember.funcao || teamMember.role || '', 40);
    nomeExibicao = [empresa, funcao].filter(Boolean).join(' - ');
  } else {
    nomeExibicao = sanitize(
      pr?.fornecedor_nome || pr?.nf_emitente_nome || intake?.fornecedor_nome || intake?.nf_emitente_nome || 'FORNECEDOR',
      60,
    );
  }
  const valor = formatValor(
    pr?.valor_pago || pr?.valor_aprovado_admin || pr?.nf_valor_total || pr?.valor_solicitado || intake?.nf_valor_total || 0,
  );
  return `${prefixo} ${num} ${descricao} - ${nomeExibicao} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function driveReq(token: string, url: string, opts: any = {}) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

async function listFolder(token: string, folderId: string): Promise<any[]> {
  const items: any[] = [];
  let pt: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,webViewLink),nextPageToken&pageSize=1000`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await driveReq(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function findFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
  );
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

async function createFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`createFolder "${name}": ${d.error.message}`);
  return d.id || null;
}

async function getOrCreateMesFolder(token: string, mesAno: string, rootId: string, cache: Map<string, string>): Promise<string | null> {
  if (!mesAno) return null;
  const cacheKey = `${rootId}::${mesAno}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) || null;
  let id = await findFolder(token, mesAno, rootId);
  if (!id) id = await createFolder(token, mesAno, rootId);
  cache.set(cacheKey, id || '');
  return id || null;
}

async function fileExistsInFolder(token: string, fileName: string, folderId: string): Promise<boolean> {
  const q = encodeURIComponent(
    `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
  );
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
  if (!r.ok) return false;
  const d = await r.json();
  return (d.files?.length || 0) > 0;
}

async function copyFile(token: string, fileId: string, fileName: string, destFolderId: string): Promise<string> {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: fileName, parents: [destFolderId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Copy "${fileName}": ${d.error.message}`);
  return d.id;
}

async function uploadFromUrl(token: string, fileUrl: string, fileName: string, folderId: string, mime: string): Promise<string> {
  const dl = await fetch(fileUrl);
  if (!dl.ok) throw new Error(`Download falhou (${dl.status}): ${fileUrl}`);
  const buf = await dl.arrayBuffer();
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', new Blob([buf], { type: mime }), fileName);
  const up = await driveReq(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    body: form,
  });
  const d = await up.json();
  if (d.error) throw new Error(`Upload Drive: ${d.error.message}`);
  return d.id;
}

// ── Data / mes-ano ─────────────────────────────────────────────────────────────

function extrairMesAno(dataRaw: any): string {
  if (!dataRaw) return '';
  const s = String(dataRaw).trim();
  let iso = '';
  if (/^\d{4}-\d{2}/.test(s)) {
    iso = s;
  } else {
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) iso = `${br[3]}-${br[2]}-${br[1]}`;
  }
  if (!iso) return '';
  const d = new Date(iso.substring(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// ── Resolver PR por chave (nf_numero + valor + fornecedor) ────────────────────

function normalizarChave(nfNum: any, valor: any, fornecedor: any): string {
  const n = String(nfNum || '').replace(/\D/g, '');
  const v = parseValor(valor).toFixed(2);
  const f = sanitize(fornecedor, 40).toLowerCase();
  return `${n}__${v}__${f}`;
}

async function carregarIndicePRs(base44: any): Promise<Map<string, any>> {
  const indice = new Map<string, any>();
  let skip = 0;
  while (true) {
    const lote = await base44.asServiceRole.entities.PurchaseRequest.filter({}, '-created_date', 200, skip).catch(() => []);
    if (!lote?.length) break;
    for (const pr of lote) {
      const nfNum = pr.nf_numero || '';
      if (!nfNum) continue;
      const chave = normalizarChave(nfNum, pr.nf_valor_total || pr.valor_pago || pr.valor_solicitado, pr.fornecedor_nome || pr.nf_emitente_nome);
      if (!indice.has(chave)) indice.set(chave, pr);
      const chaveNum = `num__${String(nfNum).replace(/\D/g, '')}`;
      if (!indice.has(chaveNum)) indice.set(chaveNum, pr);
    }
    if (lote.length < 200) break;
    skip += 200;
  }
  return indice;
}

function buscarPR(indice: Map<string, any>, nfNum: any, valor: any, fornecedor: any): any | null {
  if (!nfNum) return null;
  const chave = normalizarChave(nfNum, valor, fornecedor);
  if (indice.has(chave)) return indice.get(chave);
  const chaveNum = `num__${String(nfNum).replace(/\D/g, '')}`;
  return indice.get(chaveNum) || null;
}

// ── Extrair dados do XML (best-effort, sem IA) ────────────────────────────────

function extrairDadosXmlSimples(xmlText: string): { nfNumero?: string; fornecedor?: string; valor?: number; dataEmissao?: string } {
  const result: any = {};
  const numMatch = xmlText.match(/<nNF>(\d+)<\/nNF>/);
  if (numMatch) result.nfNumero = numMatch[1];
  const valorMatch = xmlText.match(/<vNF>([\d.,]+)<\/vNF>/) || xmlText.match(/<vPag>([\d.,]+)<\/vPag>/);
  if (valorMatch) result.valor = parseValor(valorMatch[1]);
  const nomeMatch = xmlText.match(/<xNome>([^<]+)<\/xNome>/);
  if (nomeMatch) result.fornecedor = nomeMatch[1];
  const dataMatch = xmlText.match(/<dhEmi>([^<]+)<\/dhEmi>/) || xmlText.match(/<dEmi>([^<]+)<\/dEmi>/);
  if (dataMatch) result.dataEmissao = dataMatch[1].substring(0, 10);
  return result;
}

async function baixarEExtrairXml(url: string): Promise<any> {
  try {
    const r = await fetch(url);
    if (!r.ok) return {};
    const text = await r.text();
    return extrairDadosXmlSimples(text);
  } catch {
    return {};
  }
}

// ── Extrair dados do nome do arquivo (fallback) ──────────────────────────────
// Padrões: "NF 01 PRODUTORA - ISABELLA - R$ 4200,00.xml"
//          "13 NF 3 - PERINI PROJETOS - R$ 7000,00.xml"
//          "20 NF 5 Producao - FORNECEDOR - MUSEUS CENTRO - R$ 7000,00.xml"
function extrairDadosNomeArquivo(nome: string): { nfNumero?: string; fornecedor?: string; valor?: number } {
  if (!nome) return {};
  const result: any = {};
  // NF + número
  const nfMatch = nome.match(/NF[\s\-_]?(\d{1,5})\b/i);
  if (nfMatch) result.nfNumero = nfMatch[1].replace(/^0+(\d)/, '$1');
  // R$ valor
  const valorMatch = nome.match(/R\$\s*([\d.,]+)/i);
  if (valorMatch) result.valor = parseValor(valorMatch[1]);
  // Fornecedor: tenta pegar entre "-" conhecidos — pega o texto entre "NF N " e " - R$" ou " - MUSEUS"
  const segMatch = nome.match(/NF[\s\-_]?\d{1,5}\s+(.+?)(?:\s+-\s+(?:MUSEUS|R\$))/i);
  if (segMatch) {
    const seg = segMatch[1].trim();
    // remove prefixo de descrição, separar no " - " e pegar a última parte (provável fornecedor)
    const parts = seg.split(/\s+-\s+/);
    result.fornecedor = (parts[parts.length - 1] || parts[0] || '').trim();
  }
  return result;
}

function extrairDriveFileId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

// ── Varredura recursiva da pasta de origem ────────────────────────────────────

async function varrerPastaXmls(token: string, folderId: string, depth = 0): Promise<any[]> {
  if (depth > 4) return [];
  const items = await listFolder(token, folderId);
  const xmls: any[] = [];
  for (const item of items) {
    if (item.mimeType === FOLDER_MIME) {
      const sub = await varrerPastaXmls(token, item.id, depth + 1);
      xmls.push(...sub);
    } else if (item.name.toLowerCase().endsWith('.xml')) {
      xmls.push({ id: item.id, name: item.name, origem: 'drive_scan' });
    }
  }
  return xmls;
}

// ── Coleta de fontes de XML ──────────────────────────────────────────────────

interface XmlSource {
  id: string;
  name: string;
  url: string | null;
  driveFileId: string | null;
  origem: 'purchase_request' | 'document_intake' | 'drive_scan';
  refId: string;
  nfNumero?: string;
  fornecedor?: string;
  valor?: number;
  dataEmissao?: string;
  createdDate?: string;
}

async function coletarXmls(base44: any, token: string): Promise<{ fontes: XmlSource[]; indicePR: Map<string, any>; totalBruto: number }> {
  const fontes: XmlSource[] = [];
  const indicePR = await carregarIndicePRs(base44);

  // 1. PurchaseRequests com XML
  let skip = 0;
  while (true) {
    const lote = await base44.asServiceRole.entities.PurchaseRequest.filter({}, '-created_date', 200, skip).catch(() => []);
    if (!lote?.length) break;
    for (const pr of lote) {
      const xmlUrl = pr.nf_xml_url || pr.nota_fiscal_xml_url || pr.xml_url || '';
      if (!xmlUrl) continue;
      fontes.push({
        id: pr.id,
        name: pr.arquivo_nome || '',
        url: xmlUrl,
        driveFileId: extrairDriveFileId(xmlUrl),
        origem: 'purchase_request',
        refId: pr.id,
        nfNumero: pr.nf_numero,
        fornecedor: pr.fornecedor_nome || pr.nf_emitente_nome,
        valor: pr.nf_valor_total || pr.valor_pago || pr.valor_solicitado,
        dataEmissao: pr.nf_data_emissao,
      });
    }
    if (lote.length < 200) break;
    skip += 200;
  }

  // 2. DocumentIntakes NOTA_FISCAL_XML
  skip = 0;
  while (true) {
    const lote = await base44.asServiceRole.entities.DocumentIntake.filter({ tipo_detectado: 'NOTA_FISCAL_XML' }, '-created_date', 200, skip).catch(() => []);
    if (!lote?.length) break;
    for (const di of lote) {
      const url = di.arquivo_original_url || di.nf_xml_url || '';
      if (!url) continue;
      fontes.push({
        id: di.id,
        name: di.file_name_original || '',
        url,
        driveFileId: extrairDriveFileId(url),
        origem: 'document_intake',
        refId: di.id,
        nfNumero: di.nf_numero,
        fornecedor: di.fornecedor_nome || di.nf_emitente_nome,
        valor: di.nf_valor_total,
        dataEmissao: di.nf_data_emissao,
        createdDate: di.created_date,
      });
    }
    if (lote.length < 200) break;
    skip += 200;
  }

  // 3. Varredura recursiva da pasta de origem
  const driveXmls = await varrerPastaXmls(token, SOURCE_SCAN_FOLDER, 0);
  for (const dx of driveXmls) {
    fontes.push({
      id: dx.id,
      name: dx.name,
      url: null,
      driveFileId: dx.id,
      origem: 'drive_scan',
      refId: dx.id,
    });
  }

  // ── Deduplicação ──────────────────────────────────────────────────────────
  // A mesma XML pode aparecer de PR, DI e scan do Drive. Prioriza PR > DI > scan.
  const prioridade = { purchase_request: 0, document_intake: 1, drive_scan: 2 };
  const porChave = new Map<string, XmlSource>();
  for (const f of fontes) {
    const chave = f.driveFileId || f.url || f.name || f.refId;
    if (!chave) continue;
    const existente = porChave.get(chave);
    if (!existente || prioridade[f.origem] < prioridade[existente.origem]) {
      porChave.set(chave, f);
    }
  }
  const deduplicadas = Array.from(porChave.values());

  return { fontes: deduplicadas, indicePR, totalBruto: fontes.length };
}

// ── Localizar PDF par no Drive ────────────────────────────────────────────────

let _sourceFolderItemsCache: any[] | null = null;
async function getSourceFolderItems(token: string): Promise<any[]> {
  if (_sourceFolderItemsCache) return _sourceFolderItemsCache;
  _sourceFolderItemsCache = await listFolder(token, SOURCE_SCAN_FOLDER);
  return _sourceFolderItemsCache;
}

async function localizarPdfPar(token: string, fonte: XmlSource, pr: any): Promise<{ driveFileId: string | null; origem: string }> {
  if (pr) {
    const pdfUrl = pr.nf_pdf_url || pr.nota_fiscal_url || pr.drive_backup_nf_pdf_link || '';
    if (pdfUrl) {
      const fileId = extrairDriveFileId(pdfUrl);
      if (fileId) return { driveFileId: fileId, origem: 'pr_pdf' };
    }
  }
  if (fonte.nfNumero) {
    const items = await getSourceFolderItems(token);
    const num = String(fonte.nfNumero);
    const pdfMatch = items.find((f: any) =>
      f.mimeType !== FOLDER_MIME &&
      f.name.toLowerCase().endsWith('.pdf') &&
      (f.name.includes(`NF ${num}`) || f.name.includes(`NF${num}`) || new RegExp(`NF[-_ ]?${num}\\b`).test(f.name)),
    );
    if (pdfMatch) return { driveFileId: pdfMatch.id, origem: 'drive_scan' };
  }
  return { driveFileId: null, origem: 'sem_pdf' };
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const skip = Math.max(0, Number(body.skip || 0));
    const limite = body.limite ? Math.min(Number(body.limite), 500) : null;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;
    const mesFolderCache = new Map<string, string>();
    const start = Date.now();

    const { fontes: todasFontes, indicePR, totalBruto } = await coletarXmls(base44, token);
    const fontes = limite ? todasFontes.slice(skip, skip + limite) : (skip > 0 ? todasFontes.slice(skip) : todasFontes);

    const stats = {
      total_xmls: fontes.length,
      total_deduplicado: totalBruto,
      skip,
      has_more: limite ? (skip + limite) < todasFontes.length : false,
      pareados_pdf: 0,
      sem_pdf: 0,
      sem_pr: 0,
      copiados_primario: 0,
      copiados_secundario: 0,
      ja_existiam: 0,
      erros: 0,
    };
    const linhas: any[] = [];

    const arquivosProcessados = new Set<string>();

    for (const fonte of fontes) {
      // Evita reprocessar dentro do mesmo lote (nome_xml + mes_ano)
      const chaveUnica = `${fonte.driveFileId || fonte.url || fonte.refId}`;
      if (arquivosProcessados.has(chaveUnica)) {
        stats.total_xmls--;
        continue;
      }
      arquivosProcessados.add(chaveUnica);
      const linha: any = {
        nome_original: fonte.name || fonte.url || fonte.driveFileId || '',
        nf_numero: fonte.nfNumero || '',
        fornecedor: fonte.fornecedor || '',
        origem: fonte.origem,
        mes_ano: '',
        nome_final_xml: '',
        nome_final_pdf: '',
        status_pdf: 'sem_pdf',
        status_primario: 'pendente',
        status_secundario: 'pendente',
        erro: '',
      };

      let pr = buscarPR(indicePR, fonte.nfNumero, fonte.valor, fonte.fornecedor);
      if (fonte.origem === 'purchase_request' && fonte.nfNumero) {
        pr = indicePR.get(`num__${String(fonte.nfNumero).replace(/\D/g, '')}`) || pr;
      }

      // Fallback 1: extrair dados do nome do arquivo
      if (!pr && !fonte.nfNumero) {
        const doNome = extrairDadosNomeArquivo(fonte.name);
        if (doNome.nfNumero) {
          fonte.nfNumero = doNome.nfNumero;
          if (!fonte.fornecedor) fonte.fornecedor = doNome.fornecedor;
          if (!fonte.valor) fonte.valor = doNome.valor;
          pr = buscarPR(indicePR, fonte.nfNumero, fonte.valor, fonte.fornecedor);
        }
      }

      // Fallback 2: baixar e extrair do conteúdo XML
      if (!pr && !fonte.nfNumero && fonte.url) {
        const extraido = await baixarEExtrairXml(fonte.url);
        if (extraido.nfNumero) {
          fonte.nfNumero = extraido.nfNumero;
          fonte.fornecedor = extraido.fornecedor || fonte.fornecedor;
          fonte.valor = extraido.valor || fonte.valor;
          fonte.dataEmissao = extraido.dataEmissao || fonte.dataEmissao;
          pr = buscarPR(indicePR, fonte.nfNumero, fonte.valor, fonte.fornecedor);
        }
      }

      if (!pr) stats.sem_pr++;

      // Guarda: pula XMLs totalmente irresolveríveis (sem nf_numero, sem fornecedor, sem valor)
      // — copiaríamos lixo com nome "XML SN Despesa - FORNECEDOR - R$ 0,00"
      if (!fonte.nfNumero && !fonte.fornecedor && !fonte.valor) {
        linha.status_primario = 'pulado_sem_dados';
        linha.status_secundario = 'pulado_sem_dados';
        linha.mes_ano = '';
        stats.total_xmls--;
        linhas.push(linha);
        continue;
      }

      const pdfPar = await localizarPdfPar(token, fonte, pr);
      if (pdfPar.driveFileId) {
        stats.pareados_pdf++;
        linha.status_pdf = pdfPar.origem === 'pr_pdf' ? 'pareado_pr' : 'pareado_drive';
      } else {
        stats.sem_pdf++;
      }

      const intakeFallback: any = {
        nf_numero: fonte.nfNumero,
        fornecedor_nome: fonte.fornecedor,
        nf_valor_total: fonte.valor,
        nf_emitente_nome: fonte.fornecedor,
      };
      const nomeXml = buildNomeOficial(pr, intakeFallback, 'XML');
      const nomePdf = pdfPar.driveFileId ? buildNomeOficial(pr, intakeFallback, 'NF') : '';
      linha.nome_final_xml = nomeXml;
      linha.nome_final_pdf = nomePdf;

      const dataRef = fonte.dataEmissao || pr?.nf_data_emissao || '';
      let mesAno = extrairMesAno(dataRef);
      if (!mesAno && pr) mesAno = extrairMesAno(pr.aprov_admin_data || pr.aprov_coord_data || pr.created_date);
      // Último fallback: data de criação do intake/arquivo (quando sem PR e sem data NF)
      if (!mesAno) mesAno = extrairMesAno(fonte.createdDate || fonte.dataEmissao || '');
      linha.mes_ano = mesAno;

      if (!mesAno) {
        linha.status_primario = 'sem_pasta';
        linha.status_secundario = 'sem_pasta';
        linhas.push(linha);
        continue;
      }

      if (dryRun) {
        linha.status_primario = 'simulado';
        linha.status_secundario = 'simulado';
        linhas.push(linha);
        continue;
      }

      const primarioFolderId = await getOrCreateMesFolder(token, mesAno, DEST_PRIMARIO, mesFolderCache);
      const secundarioFolderId = await getOrCreateMesFolder(token, mesAno, DEST_SECUNDARIO, mesFolderCache);

      const destinos: [string, string | null][] = [['primario', primarioFolderId], ['secundario', secundarioFolderId]];
      for (const [destLabel, destId] of destinos) {
        const destKey = `status_${destLabel}`;
        try {
          if (!destId) {
            linha[destKey] = 'sem_pasta';
            continue;
          }
          const jaExiste = await fileExistsInFolder(token, nomeXml, destId);
          if (jaExiste) {
            linha[destKey] = 'ja_existia';
            stats.ja_existiam++;
            continue;
          }
          if (fonte.driveFileId) {
            await copyFile(token, fonte.driveFileId, nomeXml, destId);
          } else if (fonte.url) {
            await uploadFromUrl(token, fonte.url, nomeXml, destId, 'application/xml');
          } else {
            linha[destKey] = 'sem_origem';
            continue;
          }
          linha[destKey] = 'copiado';
          if (destLabel === 'primario') stats.copiados_primario++;
          else stats.copiados_secundario++;
        } catch (e: any) {
          linha[destKey] = 'erro';
          linha.erro = e.message;
          stats.erros++;
        }
      }

      if (pdfPar.driveFileId && nomePdf) {
        for (const [destLabel, destId] of destinos) {
          try {
            if (!destId) continue;
            const jaExiste = await fileExistsInFolder(token, nomePdf, destId);
            if (jaExiste) continue;
            await copyFile(token, pdfPar.driveFileId, nomePdf, destId);
          } catch (e: any) {
            if (!linha.erro) linha.erro = `PDF: ${e.message}`;
          }
        }
      }

      linhas.push(linha);
    }

    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal',
        status: stats.erros > 0 ? 'concluido' : 'success',
        total_files: stats.total_xmls,
        files_copied: stats.copiados_primario + stats.copiados_secundario,
        details: `XMLs: ${stats.total_xmls} | Pareados: ${stats.pareados_pdf} | Sem PDF: ${stats.sem_pdf} | Sem PR: ${stats.sem_pr} | Primário: ${stats.copiados_primario} | Secundário: ${stats.copiados_secundario} | Já existiam: ${stats.ja_existiam} | Erros: ${stats.erros}`,
        triggered_by: 'manual',
        processed_at: new Date().toISOString(),
        execution_time_ms: Date.now() - start,
      });
    } catch { /* log não bloqueia */ }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      execution_ms: Date.now() - start,
      stats,
      linhas,
    });
  } catch (err) {
    console.error('[sincronizarXmlsParaPastasMensais] erro:', err);
    return Response.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
});