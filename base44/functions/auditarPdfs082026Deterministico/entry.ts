// auditarPdfs082026Deterministico
//
// Auditoria DETERMINISTICA de PDFs fiscais na pasta mensal 08-2026 do Google Drive.
// FONTE DA VERDADE: lista explicita (filename -> mes destino) fornecida pela auditoria externa
// de referencia, complementada por deteccao de magic bytes para os 82 PDFs restantes.
//
// Para cada PDF na pasta origem:
//   1. Match por nome contra a lista explicita de 113 entradas.
//   2. Se match -> MOVE para pasta mensal destino (com deteccao de duplicidade por md5).
//   3. Se nao match -> deteccao de magic bytes:
//        - %PDF -> CORRECT_AUGUST (mantem; assume PDF valido de agosto/2026)
//        - <html/<!DOCTYPE -> INVALID_HTML_AS_PDF (flag, mantem para revisao)
//        - <?xml -> INVALID_XML_AS_PDF (flag, mantem para revisao)
//        - outro -> REVIEW_REQUIRED (flag, mantem para revisao)
//   4. Idempotencia por appProperties (auditoria_pdf_emissao, auditoria_pdf_integridade)
//   5. Log completo em BackupLog

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ROOT_NOTAS_FISCAIS_ID = '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const ORIGEM_PADRAO_08 = '1zLdKkd0CSyCGjZgjchmRooJl6MgdVvi7';
const MES_ANO_ESPERADO = '08-2026';
const PROPS_KEY = 'auditoria_pdf_emissao';
const PROPS_INTEGRITY = 'auditoria_pdf_integridade';

// Lista explicita (filename -> mes destino MM-AAAA) - 113 entradas validadas externamente
const LISTA_EXPLICITA = [
  // 02-2026 (1)
  ['02-2026', 'NF 356160030 Despesa - 339030 - MUSEUS CENTRO - R$ 450,00.pdf'],
  // 03-2026 (13)
  ['03-2026', 'NF 100 Despesa - Designer mes 19 ao 28 - MUSEUS CENTRO - R$ 2,50.pdf'],
  ['03-2026', 'NF 17 Despesa - Producao MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 4,20.pdf'],
  ['03-2026', 'NF 25 Despesa - Producao MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 4,20.pdf'],
  ['03-2026', 'NF 26 Despesa - Educador MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 4,60.pdf'],
  ['03-2026', 'NF 29 Despesa - Designer mes 19 ao 28 - MUSEUS CENTRO - R$ 2,60.pdf'],
  ['03-2026', 'NF 42 Despesa - Assistente Administrativo mes - MUSEUS CENTRO - R$ 4.000,00.pdf'],
  ['03-2026', 'NF 8 Despesa - 339039 - MUSEUS CENTRO - R$ 4,60.pdf'],
  ['03-2026', 'NF 11 Despesa - Assessoria juridica - MUSEUS CENTRO - R$ 1,50.pdf'],
  ['03-2026', 'NF 21 Despesa - Coordenador de Comunicacao mes - MUSEUS CENTRO - R$ 6,00.pdf'],
  ['03-2026', 'NF 12 Despesa - Assessoria juridica - MUSEUS CENTRO - R$ 200,00.pdf'],
  ['03-2026', 'NF 75 Despesa - 339030 - MUSEUS CENTRO - R$ 396,00.pdf'],
  ['03-2026', 'NF 100536411 Despesa - 339039 - MUSEUS CENTRO - R$ 3,00.pdf'],
  ['03-2026', 'NF 59195 Despesa - 339030 - MUSEUS CENTRO - R$ 560,00.pdf'],
  // 04-2026 (7)
  ['04-2026', 'NF 9 Despesa - Designer mes 19 ao 28 - MUSEUS CENTRO - R$ 2.600,00.pdf'],
  ['04-2026', 'NF 19 Despesa - 339039 - MUSEUS CENTRO - R$ 500,00.pdf'],
  ['04-2026', 'NF 29 Despesa - 339039 - MUSEUS CENTRO - R$ 3.000,00.pdf'],
  ['04-2026', 'NF 16676 Despesa - Diarias MIS MUMO MHAB - MUSEUS CENTRO - R$ 800,00.pdf'],
  ['04-2026', 'NF 145 Despesa - 339039 - MUSEUS CENTRO - R$ 1.440,00.pdf'],
  ['04-2026', 'NF 26 Despesa - 339039 - MUSEUS CENTRO - R$ 2.100,00.pdf'],
  ['04-2026', 'NF 63 Despesa - 339039 - MUSEUS CENTRO - R$ 3.000,00.pdf'],
  // 05-2026 (17)
  ['05-2026', 'NF 104 Despesa - 339039 - MUSEUS CENTRO - R$ 2.600,00.pdf'],
  ['05-2026', 'NF 2 Despesa - Consultoria de programacao - MUSEUS CENTRO - R$ 6.000,00.pdf'],
  ['05-2026', 'NF 23 Despesa - Educador MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 6.000,00.pdf'],
  ['05-2026', 'NF 3 Despesa - Consultoria de programacao - MUSEUS CENTRO - R$ 6.000,00.pdf'],
  ['05-2026', 'NF 7 Despesa - 339030 - MUSEUS CENTRO - R$ 447,94.pdf'],
  ['05-2026', 'NF 7331 Despesa - 339030 - MUSEUS CENTRO - R$ 447,94.pdf'],
  ['05-2026', 'NF 1 Despesa - Diarias MIS MUMO MHAB - MUSEUS CENTRO - R$ 180,00.pdf'],
  ['05-2026', 'NF 197755 Despesa - 339039 - MUSEUS CENTRO - R$ 101,50.pdf'],
  ['05-2026', 'NF 197865 Despesa - Peca em destaque MHAB - MUSEUS CENTRO - R$ 104,12.pdf'],
  ['05-2026', 'NF 3 Despesa - Lanches buffet mes 19 ao 28 - MUSEUS CENTRO - R$ 400,00.pdf'],
  ['05-2026', 'NF 728 Despesa - Peca em destaque MHAB - MUSEUS CENTRO - R$ 898,50.pdf'],
  ['05-2026', 'NF 729 Despesa - Manutencao MHAB mes 19 ao 28 - MUSEUS CENTRO - R$ 107,66.pdf'],
  ['05-2026', 'NF 33 Despesa - 339039 - MUSEUS CENTRO - R$ 3.000,00.pdf'],
  ['05-2026', 'NF 34 Despesa - 339039 - MUSEUS CENTRO - R$ 3.000,00.pdf'],
  ['05-2026', 'NF 16829 Despesa - Diarias MIS MUMO MHAB - MUSEUS CENTRO - R$ 1.200,00.pdf'],
  ['05-2026', 'NF 18062026 Despesa - Diarias MIS MUMO MHAB - MUSEUS CENTRO - R$ 1.200,00.pdf'],
  ['05-2026', 'NF 421961 Despesa - 339030 - MUSEUS CENTRO - R$ 563,40.pdf'],
  // 06-2026 (37)
  ['06-2026', 'NF 69 Despesa - 339039 - MUSEUS CENTRO - R$ 3.000,00.pdf'],
  ['06-2026', 'NF 9 Despesa - 339039 - MUSEUS CENTRO - R$ 2.500,00.pdf'],
  ['06-2026', 'NF 11 Despesa - Designer mes 19 ao 28 - MUSEUS CENTRO - R$ 2.600,00.pdf'],
  ['06-2026', 'NF 20 Despesa - Producao MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 4.200,00.pdf'],
  ['06-2026', 'NF 52 Despesa - Producao MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 2.100,00.pdf'],
  ['06-2026', 'NF 16 Despesa - Mostra de baixa complexidade M - MUSEUS CENTRO - R$ 4.000,00.pdf'],
  ['06-2026', 'NF 54 Despesa - Monitores Ed 2026 - MUSEUS CENTRO - R$ 150,00.pdf'],
  ['06-2026', 'NF 450 Despesa - 339039 - MUSEUS CENTRO - R$ 11.250,00.pdf'],
  ['06-2026', 'NF 46 Despesa - Assistente de Producao Ed 202 - MUSEUS CENTRO - R$ 1.000,00.pdf'],
  ['06-2026', 'NF 54 Despesa - 339039 - MUSEUS CENTRO - R$ 5.000,00.pdf'],
  ['06-2026', 'NF 64 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 750,00.pdf'],
  ['06-2026', 'NF 68 Despesa - Apresentacoes culturais 3 muse - MUSEUS CENTRO - R$ 750,00.pdf'],
  ['06-2026', 'NF 915 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 1.500,00.pdf'],
  ['06-2026', 'NF 22 Despesa - Apresentacoes culturais 3 muse - MUSEUS CENTRO - R$ 500,00.pdf'],
  ['06-2026', 'NF 4 Despesa - Assistente de Producao Ed 202 - MUSEUS CENTRO - R$ 1.000,00.pdf'],
  ['06-2026', 'NF 22 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 300,00.pdf'],
  ['06-2026', 'NF 37 Despesa - Manutencao MIS mes 19 ao mes 2 - MUSEUS CENTRO - R$ 3.500,00.pdf'],
  ['06-2026', 'NF 459 Despesa - 339039 - MUSEUS CENTRO - R$ 3.000,00.pdf'],
  ['06-2026', 'NF 56 Despesa - 339039 - MUSEUS CENTRO - R$ 150,00.pdf'],
  ['06-2026', 'NF 12 Despesa - Monitores Ed 2026 - MUSEUS CENTRO - R$ 300,00.pdf'],
  ['06-2026', 'NF 49 Assistente de Producao Ed 2026 - Assistente de Producao Ed 202 - MUSEUS CENTRO - agosto 26 - R$ 1.000,00.pdf'],
  ['06-2026', 'NF 49 Despesa - Assistente de Producao Ed 202 - MUSEUS CENTRO - R$ 1.000,00.pdf'],
  ['06-2026', 'NF 55 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 800,00.pdf'],
  ['06-2026', 'NF 67 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 750,00.pdf'],
  ['06-2026', 'NF 78 Despesa - Infraestrutura 3 museus PBH Ed - MUSEUS CENTRO - R$ 5.515,00.pdf'],
  ['06-2026', 'NF 1 Despesa - Vans Ed 2026 - MUSEUS CENTRO - R$ 30.400,00.pdf'],
  ['06-2026', 'NF 14 Despesa - agosto 26 - MUSEUS CENTRO - R$ 300,00.pdf'],
  ['06-2026', 'NF 14 Manutencao MUMO mes 19 ao 28 - Diarias MIS MUMO MHAB - MUSEUS CENTRO - agosto 26 - R$ 300,00.pdf'],
  ['06-2026', 'NF 19 Despesa - 339039 - MUSEUS CENTRO - R$ 12.700,00.pdf'],
  ['06-2026', 'NF 20 Despesa - 339039 - MUSEUS CENTRO - R$ 7.300,00.pdf'],
  ['06-2026', 'NF 23 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 500,00.pdf'],
  ['06-2026', 'NF 23 Despesa - agosto 26 - MUSEUS CENTRO - R$ 500,00.pdf'],
  ['06-2026', 'NF 23 Manutencao MUMO mes 19 ao 28 - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - agosto 26 - R$ 500,00.pdf'],
  ['06-2026', 'NF 3 Despesa - 339039 - MUSEUS CENTRO - R$ 750,00.pdf'],
  ['06-2026', 'NF 48 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 1.000,00.pdf'],
  ['06-2026', 'NF 5 Despesa - Assistente de Producao Ed 202 - MUSEUS CENTRO - R$ 1.000,00.pdf'],
  ['06-2026', 'NF 66 Despesa - 339039 - MUSEUS CENTRO - R$ 200,00.pdf'],
  // 07-2026 (38)
  ['07-2026', 'NF 12 Apresentacoes culturais 3 muse - Educador MIS MUMO MHAB mes 19 - MUSEUS CENTRO - agosto 26 - R$ 4.600,00.pdf'],
  ['07-2026', 'NF 12 Despesa - Educador MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 4.600,00.pdf'],
  ['07-2026', 'NF 16 Despesa - Monitores Ed 2026 - MUSEUS CENTRO - R$ 300,00.pdf'],
  ['07-2026', 'NF 21 Despesa - Producao MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 4.200,00.pdf'],
  ['07-2026', 'NF 21 Manutencao MUMO mes 19 ao 28 - Producao MIS MUMO MHAB mes 19 - MUSEUS CENTRO - agosto 26 - R$ 4.200,00.pdf'],
  ['07-2026', 'NF 29 Despesa - Educador MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 4.600,00.pdf'],
  ['07-2026', 'NF 3 Despesa - Monitores Ed 2026 - MUSEUS CENTRO - R$ 300,00.pdf'],
  ['07-2026', 'NF 3 Despesa - Producao MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 4.200,00.pdf'],
  ['07-2026', 'NF 34 Despesa - 339039 - MUSEUS CENTRO - R$ 385,00.pdf'],
  ['07-2026', 'NF 45 Despesa - Monitores Ed 2026 - MUSEUS CENTRO - R$ 450,00.pdf'],
  ['07-2026', 'NF 45 Despesa - agosto 26 - MUSEUS CENTRO - R$ 450,00.pdf'],
  ['07-2026', 'NF 45 Monitores Ed 2026 - Monitores Ed 2026 - MUSEUS CENTRO - agosto 26 - R$ 450,00.pdf'],
  ['07-2026', 'NF 5 Despesa - Educador MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 4.600,00.pdf'],
  ['07-2026', 'NF 51 Despesa - Seguranca Ed 2026 - MUSEUS CENTRO - R$ 1.400,00.pdf'],
  ['07-2026', 'NF 6 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 3.500,00.pdf'],
  ['07-2026', 'NF 25 Despesa - Coordenador de Comunicacao mes - MUSEUS CENTRO - R$ 6.000,00.pdf'],
  ['07-2026', 'NF 4 Despesa - 339039 - MUSEUS CENTRO - R$ 2.646,00.pdf'],
  ['07-2026', 'NF 45 Despesa - Limpeza Ed 2026 - MUSEUS CENTRO - R$ 1.770,00.pdf'],
  ['07-2026', 'NF 9 Despesa - Video e Fotografia Ed 2026 - MUSEUS CENTRO - R$ 15.625,00.pdf'],
  ['07-2026', 'NF 96 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 7.700,00.pdf'],
  ['07-2026', 'NF 97 Despesa - Infraestrutura MIS MUMO MHAB E - MUSEUS CENTRO - R$ 1.300,00.pdf'],
  ['07-2026', 'NF 110 Despesa - Video e Fotografia Ed 2026 - MUSEUS CENTRO - R$ 2.500,00.pdf'],
  ['07-2026', 'NF 18 Despesa - Monitores Ed 2026 - MUSEUS CENTRO - R$ 300,00.pdf'],
  ['07-2026', 'NF 2 Despesa - Monitores Ed 2026 - MUSEUS CENTRO - R$ 300,00.pdf'],
  ['07-2026', 'NF 5 Despesa - 339039 - MUSEUS CENTRO - R$ 2.354,00.pdf'],
  ['07-2026', 'NF 5 Despesa - Monitores Ed 2026 - MUSEUS CENTRO - R$ 300,00.pdf'],
  ['07-2026', 'NF 56 Despesa - 339039 - MUSEUS CENTRO - R$ 5.469,85.pdf'],
  ['07-2026', 'NF 5751 Despesa - Infraestrutura 3 museus PBH Ed - MUSEUS CENTRO - R$ 585,00.pdf'],
  ['07-2026', 'NF 2026 Despesa - 339039 - MUSEUS CENTRO - R$ 3.000,00.pdf'],
  ['07-2026', 'NF 4 Despesa - Rede Social Marketing Cultural - MUSEUS CENTRO - R$ 2.500,00.pdf'],
  ['07-2026', 'NF 3 Despesa - 339039 - MUSEUS CENTRO - R$ 7.000,00.pdf'],
  ['07-2026', 'NF 33 Despesa - 339039 - MUSEUS CENTRO - R$ 300,00.pdf'],
  ['07-2026', 'NF 0 Despesa - 339030 - MUSEUS CENTRO - R$ 635,00.pdf'],
  ['07-2026', 'NF 27295 Despesa - Alimentacao mes 19 ao 28 - MUSEUS CENTRO - R$ 124,75.pdf'],
  ['07-2026', 'NF 70277 Despesa - Material MIS MUMO MHAB mes 19 - MUSEUS CENTRO - R$ 304,00.pdf'],
  ['07-2026', 'NF 2 Despesa - Video e Fotografia Ed 2026 - MUSEUS CENTRO - R$ 15.625,00.pdf'],
  ['07-2026', 'NF 50986 Despesa - Manutencao MHAB mes 19 ao 28 - MUSEUS CENTRO - R$ 126,90.pdf'],
  ['07-2026', 'NF 67 Despesa - Acoes educativo-culturais MIS - MUSEUS CENTRO - R$ 1.500,00.pdf'],
];

function normalName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function getToken(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  return conn?.accessToken || conn?.access_token || conn?.token;
}

async function listFiles(token, folderId) {
  const items = [];
  let pt = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,md5Checksum,parents,appProperties),nextPageToken&pageSize=1000&supportsAllDrives=true`;
    if (pt) url += '&pageToken=' + encodeURIComponent(pt);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('listFiles ' + r.status);
    const d = await r.json();
    if (Array.isArray(d.files)) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function listFoldersRoot(token, rootId, cache) {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'"+rootId+"' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'")}&fields=files(id,name)&pageSize=200&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!r.ok) return;
  const d = await r.json();
  for (const f of d.files || []) cache.set(f.name, f.id);
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent("name='" + String(name).replace(/'/g, "\\'") + "' and '" + parentId + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.files && d.files[0] ? d.files[0].id : null;
}

async function createFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error('createFolder "' + name + '": ' + d.error.message);
  return d.id;
}

async function getOrCreateFolder(token, name, parentId, cache) {
  if (cache.has(name)) return cache.get(name);
  let id = await findFolder(token, name, parentId);
  if (!id) id = await createFolder(token, name, parentId);
  cache.set(name, id);
  return id;
}

async function getFile(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  return await r.json();
}

async function moveFile(token, fileId, addId, removeId) {
  const params = new URLSearchParams();
  params.set('addParents', addId);
  if (removeId && removeId !== addId) params.set('removeParents', removeId);
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}&supportsAllDrives=true`;
  const r = await fetch(url, { method: 'PATCH', headers: { Authorization: 'Bearer ' + token } });
  return r.ok;
}

async function setAppProps(token, fileId, props) {
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: props }),
    });
    return r.ok;
  } catch { return false; }
}

async function detectMagic(token, fileId) {
  // Range header busca apenas os primeiros 512 bytes
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: 'Bearer ' + token, Range: 'bytes=0-511' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return 'ERROR';
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'PDF';
    const head = new TextDecoder().decode(buf.slice(0, Math.min(buf.length, 256))).trim().toLowerCase();
    if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'HTML';
    if (head.startsWith('<?xml')) return 'XML';
    return 'OTHER';
  } catch { return 'ERROR'; }
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  console.log('[auditarPdfs08] handler iniciado t0=' + t0);
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const COORD_GERAL = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];
    if (user && user.role !== 'admin' && !COORD_GERAL.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const sourceFolderId = String(body.folderId || ORIGEM_PADRAO_08).trim();
    const rootFolderId = String(body.rootFolderId || ROOT_NOTAS_FISCAIS_ID).trim();
    const expectedMesAno = String(body.expectedMesAno || MES_ANO_ESPERADO).trim();

    let token;
    try { token = await getToken(base44); } catch (e) {
      return Response.json({ ok: false, error: 'Token Drive: ' + e.message }, { status: 503 });
    }

    const folderCache = new Map();
    await listFoldersRoot(token, rootFolderId, folderCache);

    // Constroi mapa nome-normalizado -> (mesDestino, nomeOriginal)
    const mapaNome = new Map();
    for (const [m, n] of LISTA_EXPLICITA) mapaNome.set(normalName(n), { mes: m, nomeLista: n });

    // Lista todos PDFs na origem
    const allFiles = await listFiles(token, sourceFolderId);
    const pdfs = allFiles.filter(f => /\.pdf$/i.test(f.name) && f.mimeType !== 'application/vnd.google-apps.folder');

    // Agrupa PDFs matched por mes destino
    const matchedByMes = new Map(); // mes -> array de PDFs
    const matchedNames = new Map(); // pdfId -> {mes, nomeLista}
    const unmatched = [];
    for (const p of pdfs) {
      const key = normalName(p.name);
      const m = mapaNome.get(key);
      if (m) {
        if (!matchedByMes.has(m.mes)) matchedByMes.set(m.mes, []);
        matchedByMes.get(m.mes).push(p);
        matchedNames.set(p.id, m);
      } else {
        unmatched.push(p);
      }
    }

    const results = [];
    let auditados = 0, movidos = 0, duplicados = 0, corretosAgosto = 0, invalidos = 0, erros = 0, jaOk = 0;
    const porMes = {};

    // Cache por pasta destino: md5 -> driveId, nomeNormalizado -> driveId (so por pasta atual)
    const destCache = new Map(); // mes -> { md5: Map, names: Map }

    const FISCAL_MOVE_PREFIX = 'DRIVE_FISCAL_MOVE:';

    // FASE 1: mover PDFs matched
    for (const [mesDest, listaPdfs] of matchedByMes.entries()) {
      // Obtem id da pasta destino
      let targetId;
      try { targetId = await getOrCreateFolder(token, mesDest, rootFolderId, folderCache); }
      catch (e) {
        for (const p of listaPdfs) {
          results.push({
            arquivo: p.name, status: 'ERROR', tipo: 'PDF', mes_destino: mesDest,
            motivo: 'Pasta destino falhou: ' + e.message, drive_file_id: p.id,
          });
          erros++;
        }
        continue;
      }

      // Lista uma vez os PDFs ja presentes no destino (md5 + nome)
      if (!destCache.has(mesDest)) {
        let destPdfs = [];
        try { destPdfs = await listFiles(token, targetId); } catch {}
        const md5ToId = new Map();
        const nameToId = new Map();
        for (const d of destPdfs) {
          if (d.md5Checksum) md5ToId.set(d.md5Checksum, d.id);
          nameToId.set(normalName(d.name), d.id);
        }
        destCache.set(mesDest, { md5: md5ToId, names: nameToId });
      }
      const cache = destCache.get(mesDest);

      for (const p of listaPdfs) {
        auditados++;
        const driveId = p.id;
        const nomeAnterior = p.name;
        const parentAnterior = (p.parents && p.parents[0]) || sourceFolderId;
        const info = matchedNames.get(driveId);

        // Idempotencia via appProperties
        const propKey = p.appProperties?.[PROPS_KEY];
        if (propKey && propKey.startsWith('ok:' + mesDest)) {
          results.push({
            arquivo: nomeAnterior, status: 'ALREADY_IN_CORRECT_FOLDER', tipo: 'PDF',
            mes_destino: mesDest, motivo: 'ja marcado em ' + mesDest + ' (idempotente)',
            drive_file_id: driveId, parent_anterior: parentAnterior,
          });
          jaOk++;
          continue;
        }

        // Verifica parent atual
        const currentParents = p.parents || [parentAnterior];
        if (currentParents.includes(targetId)) {
          results.push({
            arquivo: nomeAnterior, status: 'ALREADY_IN_CORRECT_FOLDER', tipo: 'PDF',
            mes_destino: mesDest, motivo: 'parents ja incluem destino',
            drive_file_id: driveId, parent_anterior: parentAnterior,
          });
          jaOk++;
          if (!dryRun) await setAppProps(token, driveId, { [PROPS_KEY]: 'ok:' + mesDest });
          continue;
        }

        // Honrando OBJETIVO FINAL (pasta 08-2026 exclusivamente agosto): sempre MOVER.
        // Se ja existe duplicata byte-identica (mesmo md5) no destino, marcar com flag
        // informativa cum DUPLICATE_FLAG, mas ainda mover (Drive so altera parents,
        // nao cria nova copia de bytes).
        const myMd5 = p.md5Checksum || null;
        let dupId = null, dupMotivo = '';
        if (myMd5 && cache.md5.has(myMd5)) { dupId = cache.md5.get(myMd5); dupMotivo = 'md5 byte-identico no destino'; }
        else if (cache.names.has(normalName(nomeAnterior))) { dupId = cache.names.get(normalName(nomeAnterior)); dupMotivo = 'nome identico no destino'; }

        const props = {
          [PROPS_KEY]: 'ok:' + mesDest,
          [PROPS_INTEGRITY]: 'CORRECT',
        };
        if (dupId) props[PROPS_INTEGRITY] = 'DUPLICATE_FLAG:' + dupMotivo;

        if (!dryRun) {
          const moveOk = await moveFile(token, driveId, targetId, parentAnterior);
          if (!moveOk) {
            results.push({
              arquivo: nomeAnterior, status: 'ERROR', tipo: 'PDF', mes_destino: mesDest,
              motivo: 'MOVE falhou', drive_file_id: driveId, parent_anterior: parentAnterior,
            });
            erros++;
            continue;
          }
          await setAppProps(token, driveId, props);
          // Atualiza cache destino (evita auto-marcar duplicados no mesmo batch)
          if (myMd5) cache.md5.set(myMd5, driveId);
          cache.names.set(normalName(nomeAnterior), driveId);
        }

        results.push({
          arquivo: nomeAnterior, status: dupId ? 'MOVED_AND_RENAMED' : 'MOVED_TO_CORRECT_MONTH', tipo: 'PDF',
          mes_destino: mesDest, mes_pasta_atual: expectedMesAno,
          motivo: dryRun
            ? 'dry-run: seria movido para ' + mesDest + (dupId ? ' (marcado duplicate_flag: ' + dupMotivo + ')' : '')
            : 'movido para ' + mesDest + (dupId ? ' (duplicate_flag: ' + dupMotivo + ')' : ''),
          drive_file_id: driveId, parent_anterior: parentAnterior, parent_posterior: dryRun ? null : targetId,
          duplicate_id: dupId || null,
        });
        movidos++;
        porMes[mesDest] = (porMes[mesDest] || 0) + 1;
        if (dupId) duplicados++;
      }
    }

    // FASE 2: classificar PDFs unmatched por magic bytes
    for (const p of unmatched) {
      auditados++;
      const driveId = p.id;
      const nomeAnterior = p.name;
      const parentAnterior = (p.parents && p.parents[0]) || sourceFolderId;

      // Idempotencia: se ja marcado, pula
      const propI = p.appProperties?.[PROPS_INTEGRITY];
      if (propI && !dryRun) {
        const statusAnterior = propI.startsWith('ok:') ? 'CORRECT_AUGUST'
          : propI.startsWith('html') ? 'INVALID_HTML_AS_PDF'
          : propI.startsWith('xml') ? 'INVALID_XML_AS_PDF'
          : propI.startsWith('other') ? 'REVIEW_REQUIRED'
          : null;
        if (statusAnterior) {
          results.push({
            arquivo: nomeAnterior, status: statusAnterior, tipo: 'PDF',
            motivo: 'ja marcado anteriormente (idempotente)',
            drive_file_id: driveId, parent_anterior: parentAnterior,
          });
          if (statusAnterior === 'CORRECT_AUGUST') corretosAgosto++;
          else invalidos++;
          jaOk++;
          continue;
        }
      }

      const mag = await detectMagic(token, driveId);
      let status = 'REVIEW_REQUIRED';
      let integ = 'other';
      if (mag === 'PDF') { status = 'CORRECT_AUGUST'; integ = 'ok:08-2026'; corretosAgosto++; }
      else if (mag === 'HTML') { status = 'INVALID_HTML_AS_PDF'; integ = 'html'; invalidos++; }
      else if (mag === 'XML') { status = 'INVALID_XML_AS_PDF'; integ = 'xml'; invalidos++; }
      else if (mag === 'ERROR') { status = 'ERROR'; integ = 'error'; erros++; }
      else { status = 'REVIEW_REQUIRED'; integ = 'other'; invalidos++; }

      if (!dryRun) await setAppProps(token, driveId, { [PROPS_INTEGRITY]: integ });

      results.push({
        arquivo: nomeAnterior, status, tipo: 'PDF',
        magic_bytes: mag, mes_pasta_atual: expectedMesAno,
        motivo: 'classificado por magic bytes: ' + mag,
        drive_file_id: driveId, parent_anterior: parentAnterior, parent_posterior: parentAnterior,
      });
    }

    const totalLista = LISTA_EXPLICITA.length;
    const matchedCount = Array.from(matchedByMes.values()).reduce((s, a) => s + a.length, 0);

    try {
      if (!dryRun) {
        await base44.asServiceRole.entities.BackupLog.create({
          backup_type: 'auditoria_entrada_unica',
          entity_type: 'AUDITORIA_PDF_08_2026_DETERMINISTICO',
          status: 'concluido',
          total_files: auditados,
          files_copied: movidos,
          details: `PDFs auditados=${auditados} matched=${matchedCount}/${totalLista} movidos=${movidos} jaOk=${jaOk} duplicados=${duplicados} corretosAgosto=${corretosAgosto} invalidos=${invalidos} erros=${erros}`,
          triggered_by: 'manual',
          processed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - t0,
        });
      }
    } catch (e) { console.warn('[auditarPdfs08] BackupLog:', e.message); }

    const resumo = Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0])).map(([m, n]) => ({ mes_destino: m, quantidade: n }));
    const porStatus = {};
    for (const r of results) porStatus[r.status] = (porStatus[r.status] || 0) + 1;

    return Response.json({
      ok: true,
      dry_run: dryRun,
      source_folder_id: sourceFolderId,
      folder_origem: '08-2026',
      expected_mes_ano: expectedMesAno,
      stats: {
        pdfs_analisados: auditados,
        matched_na_lista_explicita: matchedCount,
        total_lista_explicita: totalLista,
        movidos_para_outros_meses: movidos,
        ja_ok_idempotentes: jaOk,
        duplicados_encontrados: duplicados,
        corretos_em_agosto_por_magic: corretosAgosto,
        invalidos_classificados: invalidos,
        erros,
        resumo_por_mes_destino: resumo,
        resumo_por_status: porStatus,
      },
      detalhes: results,
      elapsed_ms: Date.now() - t0,
    });
  } catch (error) {
    console.error('[auditarPdfs08] erro:', error && error.message);
    return Response.json({ ok: false, error: (error && error.message) || 'Erro interno' }, { status: 500 });
  }
});