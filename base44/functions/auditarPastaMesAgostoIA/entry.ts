// auditarPastaMesAgostoIA
//
// Varredura da pasta de agosto (1jhZBWsOltRSjtdKHPG64PovnxygKLuW) que recebeu NFs de
// outros meses. Para cada PDF/XML:
//   1. Resolve data de emissão real via (a) DocumentIntake já processado,
//      (b) parse XML, (c) padrão do nome, (d) leitura IA GPT-4o via Files API.
//   2. Se o arquivo for HTML mascarado de PDF / corrompido / IA falhar:
//      recupera bytes válidos de (a) intake vinculado (URL alternativa) ou
//      (b) busca Drive por tokens únicos (número + valor). Substitui o conteúdo
//      preservando ID/nome/pasta via update-media.
//   3. Renomeia para o padrão canônico (NF/XML <num> <desc> - <emissor> - MUSEUS CENTRO - R$ <val>.<ext>).
//   4. Move para a pasta mensal correta (MM-AAAA) sob ROOT_NOTAS_FOLDER_ID.
//
// default dryRun=true (audita antes de mutar). Deadline interno 85s. Lote unitário.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ROOT_NOTAS_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const DEFAULT_AGOSTO_FOLDER_ID = '1jhZBWsOltRSjtdKHPG64PovnxygKLuW';
const AGOSTO_ESPERADO = { mes: '08', ano: 2026 };
const OPENAI_MODEL = 'gpt-4o-2024-08-06';
const IA_TIMEOUT_MS = 50_000;
const DEADLINE_MS = 85_000;

const MESES_NOMES = {
  janeiro: 1, fevereiro: 2, marco: 3, marco3: 3, abril: 4, maio: 5,
  junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function safeStr(v) { return String(v || '').trim(); }

function sanitize(v, max = 60) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, max).trim();
}

function parseDataEmissao(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    d = new Date(s.substring(0, 10) + 'T12:00:00Z');
  } else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  }
  if (!d) {
    const m = s.toLowerCase().match(/(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+)?(\d{4})/);
    if (m) d = new Date(Number(m[2]), MESES_NOMES[m[1]] - 1, 15, 12);
  }
  if (!d || isNaN(d.getTime())) return null;
  return { ano: d.getFullYear(), mes: String(d.getMonth() + 1).padStart(2, '0') };
}

function extrairDataDoNome(name) {
  if (!name) return null;
  let m = String(name).match(/(?:^|[^\d])(\d{2})[-_\/](\d{4})(?:$|[^\d])/);
  if (m) {
    const mes = Number(m[1]);
    const ano = Number(m[2]);
    if (mes >= 1 && mes <= 12 && ano >= 2020 && ano <= 2030) {
      return { ano, mes: String(mes).padStart(2, '0') };
    }
  }
  m = String(name).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return parseDataEmissao(`${m[1]}-${m[2]}-${m[3]}`);
  return parseDataEmissao(name);
}

function extrairNumDoNome(name) {
  if (!name) return null;
  const m = String(name).match(/(?:NF|Nota\s+Fiscal|nf|NFS[eE]|NFSe)\s*(?:n?[o°º]?\.?\s*)?(\d{1,8})/i);
  return m ? m[1] : null;
}

function extrairValorDoNome(name) {
  if (!name) return null;
  const m = String(name).match(/R\$\s*([\d.,]+)/i);
  if (!m) return null;
  const v = parseFloat(String(m[1]).replace(/\./g, '').replace(',', '.'));
  return isNaN(v) ? null : v;
}

function buildNomeOficial({ num, desc, emissor, valor, ext }) {
  const n = sanitize(num, 10).replace(/^0+(\d)/, '$1') || 'SN';
  const d = sanitize(desc, 30) || 'Despesa';
  const e = sanitize(emissor, 60) || 'FORNECEDOR';
  const v = Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefix = ext === 'xml' ? 'XML' : 'NF';
  return `${prefix} ${n} ${d} - ${e} - MUSEUS CENTRO - R$ ${v}.${ext}`;
}

function parseXmlFields(xml) {
  if (!xml) return null;
  const out = {};
  const dateMatches = [
    /<dhEmi[^>]*>([^<]+)<\/dhEmi>/i,
    /<dEmi[^>]*>([^<]+)<\/dEmi>/i,
    /<dataEmissao[^>]*>([^<]+)<\/dataEmissao>/i,
    /<DataEmissao[^>]*>([^<]+)<\/DataEmissao>/i,
    /<dhConte[^>]*>([^<]+)<\/dhConte>/i,
  ];
  for (const p of dateMatches) {
    const m = xml.match(p);
    if (m) { out.data = parseDataEmissao(m[1]); if (out.data) break; }
  }
  const numM = xml.match(/<nNF[^>]*>([^<]+)<\/nNF>/i) ||
               xml.match(/<nNFS[eE][^>]*>([^<]+)<\/nNFS[eE]>/i) ||
               xml.match(/<Numero[^>]*>([^<]+)<\/Numero>/i) ||
               xml.match(/<numeroNFSe[^>]*>([^<]+)<\/numeroNFSe>/i);
  if (numM) out.num = numM[1];
  const emM = xml.match(/<xNome[^>]*>([^<]+)<\/xNome>/i) ||
              xml.match(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i) ||
              xml.match(/<razaoSocial[^>]*>([^<]+)<\/razaoSocial>/i);
  if (emM) out.emissor = emM[1];
  const vM = xml.match(/<vNF[^>]*>([^<]+)<\/vNF>/i) ||
             xml.match(/<valorNFS[eE][^>]*>([^<]+)<\/valorNFS[eE]>/i) ||
             xml.match(/<vLiq[^>]*>([^<]+)<\/vLiq>/i) ||
             xml.match(/<Valor[^>]*>([^<]+)<\/Valor>/i);
  if (vM) {
    const v = parseFloat(String(vM[1]).replace(/\./g, '').replace(',', '.'));
    if (!isNaN(v)) out.valor = v;
  }
  return out;
}

async function getToken(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  return conn?.accessToken || conn?.access_token || conn?.token;
}

async function listFolder(token, folderId) {
  const items = [];
  let pt = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=name&fields=files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(`listFolder ${r.status}: ${d.error?.message || r.statusText}`);
    }
    const d = await r.json();
    if (Array.isArray(d.files)) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function listBackupFiles(token, query) {
  const q = encodeURIComponent(`${query} and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=name&fields=files(id,name,mimeType)&pageSize=20&supportsAllDrives=true`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const d = await r.json();
  return d.files || [];
}

async function downloadFileBytes(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

async function downloadFileText(token, fileId) {
  const bytes = await downloadFileBytes(token, fileId);
  if (!bytes) return null;
  return new TextDecoder('utf-8').decode(bytes);
}

async function getFile(token, fileId, fields) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return await r.json();
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

async function createFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`createFolder "${name}": ${d.error.message}`);
  return d.id;
}

async function getOrCreate(token, name, parentId, cache) {
  const key = `${parentId}/${name}`;
  if (cache[key] !== undefined) return cache[key];
  const id = (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
  cache[key] = id;
  return id;
}

async function renameFile(token, fileId, newName) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  return r.ok;
}

async function moveFile(token, fileId, newParentId, oldParentId) {
  const params = new URLSearchParams();
  params.set('addParents', newParentId);
  if (oldParentId && oldParentId !== newParentId) params.set('removeParents', oldParentId);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}&supportsAllDrives=true`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }
  );
  return r.ok;
}

async function updateFileMedia(token, fileId, bytes, mimeType) {
  const r = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType || 'application/pdf' },
      body: bytes,
      signal: AbortSignal.timeout(45_000),
    }
  );
  return r.ok;
}

// ── IA: upload PDF para Files API + chat completion focused em data ──
async function uploadPDFOpenAI(bytes, filename) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const fd = new FormData();
  fd.append('purpose', 'user_data');
  fd.append('file', new Blob([bytes], { type: 'application/pdf' }), filename || 'documento.pdf');
  const resp = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(40_000),
  });
  if (!resp.ok) throw new Error(`OpenAI Files ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  const data = await resp.json();
  if (!data?.id) throw new Error('Files API sem id');
  return data.id;
}

const IA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    numero_nota: { type: ['string', 'null'] },
    fornecedor_nome: { type: ['string', 'null'] },
    valor_total: { type: ['number', 'null'] },
    data_emissao: { type: ['string', 'null'] },
  },
  required: ['numero_nota', 'fornecedor_nome', 'valor_total', 'data_emissao'],
};

async function lerPDFOpenAI(bytes, filename) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const fileId = await uploadPDFOpenAI(bytes, filename);
  const body = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Você lê notas fiscais brasileiras. Extraia APENAS: numero_nota, fornecedor_nome (razão social), valor_total (número), data_emissao (YYYY-MM-DD). Use a data rotulada "Data de Emissão"/"Emitida em". Nunca use data de abertura, fundação, vencimento ou do nome do arquivo. Se ilegível, retorne null em todos os campos. Responda SOMENTE JSON.',
      },
      { role: 'user', content: [{ type: 'file', file: { file_id: fileId } }] },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'nf_minimal', strict: true, schema: IA_SCHEMA } },
    max_tokens: 600,
    temperature: 0,
  };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(IA_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`OpenAI chat ${resp.status}: ${await resp.text().catch(() => resp.statusText)}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  try { return JSON.parse(content); }
  catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; }
}

// ── Detecção HTML mascarado de PDF ──
function isHTMLMascarandoPDF(bytes) {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, Math.min(2048, bytes.length)));
  return /^\s*<(!DOCTYPE|html|html)/i.test(head);
}
function isPdfValido(bytes) {
  return bytes && bytes.length > 4 && new TextDecoder('ascii').decode(bytes.subarray(0, 5)) === '%PDF-';
}

// ── Recuperação de arquivo corrompido ──
async function recuperarBytesValidos({ token, file, intakesPorFilename, base44, numToken, valorToken, emissorToken }) {
  // (a) intake vinculado com URL alternativa
  const intake = intakesPorFilename.get(safeStr(file.name));
  if (intake) {
    for (const urlField of ['nf_pdf_url', 'arquivo_original_url']) {
      const url = safeStr(intake[urlField]);
      if (!url) continue;
      const fid = url.match(/\/file\/d\/([\w-]+)/)?.[1] || url.match(/[?&]id=([\w-]+)/)?.[1] || url.match(/drive\.google\.com\/open\?id=([\w-]+)/)?.[1];
      if (fid && fid !== file.id) {
        const cand = await downloadFileBytes(token, fid);
        if (isPdfValido(cand)) return cand;
      }
    }
    // tentar buscar intake por ID e baixar arquivo vinculado
    if (intake.nf_pdf_intake_id) {
      const cand = await downloadFileBytes(token, intake.nf_pdf_intake_id);
      if (isPdfValido(cand)) return cand;
    }
  }
  // (b) busca Drive por token (número + valor)
  if (numToken || valorToken) {
    let q = `mimeType='application/pdf'`;
    if (numToken) q += ` and name contains '${String(numToken).replace(/'/g, "\\'")}'`;
    if (valorToken) {
      const v = String(valorToken.toFixed(2)).replace('.', ',');
      q += ` and name contains 'R$ ${v}'`;
    }
    const cands = await listBackupFiles(token, q);
    for (const c of cands) {
      if (c.id === file.id) continue;
      const bytes = await downloadFileBytes(token, c.id);
      if (isPdfValido(bytes)) return bytes;
    }
  }
  // (c) fallback só por número
  if (numToken && (!valorToken)) {
    const cands = await listBackupFiles(token, `mimeType='application/pdf' and name contains '${String(numToken).replace(/'/g, "\\'")}'`);
    for (const c of cands) {
      if (c.id === file.id) continue;
      const bytes = await downloadFileBytes(token, c.id);
      if (isPdfValido(bytes)) return bytes;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const COORD_GERAL_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];
    if (user && user.role !== 'admin' && !COORD_GERAL_EMAILS.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden — apenas administradores / coordenadores gerais' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const folderId = String(body.folderId || body.folderUrl?.match(/\/folders\/([\w-]+)/)?.[1] || DEFAULT_AGOSTO_FOLDER_ID).trim();
    const dryRun = body.dryRun !== false; // default: SIMULAÇÃO
    const limite = Math.min(Number(body.limite || 40), 100);
    const rootNotasId = body.rootNotasId || ROOT_NOTAS_FOLDER_ID;

    let token = null;
    try { token = await getToken(base44); }
    catch (e) { return Response.json({ ok: false, error: `Token Drive indisponível: ${e.message}` }, { status: 503 }); }

    const folderMeta = await getFile(token, folderId, 'id,name');
    if (!folderMeta) return Response.json({ ok: false, error: 'Pasta de agosto não encontrada', folderId }, { status: 404 });

    const allFiles = await listFolder(token, folderId);
    const candidateFiles = allFiles.filter(f =>
      f.mimeType !== 'application/vnd.google-apps.folder' && /\.(pdf|xml)$/i.test(f.name)
    ).slice(0, limite);

    const stats = {
      dry_run: dryRun,
      source_folder_id: folderId,
      source_folder_name: folderMeta.name,
      files_total: allFiles.length,
      files_target: candidateFiles.length,
      matched_intake: 0,
      xml_parsed: 0,
      from_filename: 0,
      lidos_ia: 0,
      recuperados: 0,
      ja_agosto_correto: 0,
      movidos_para_outros_meses: [],
      renomeados: 0,
      erros_irrecuperaveis: [],
      interrompidos_por_deadline: 0,
    };

    const folderCache = {};
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    // Pré-carrega DocumentIntakes (NF PDF + XML) indexados por file_name_original
    const intakesPorFilename = new Map();
    try {
      const recent = await base44.asServiceRole.entities.DocumentIntake.filter(
        { tipo_detectado: { $in: ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML'] } },
        '-updated_date', 2000, 0
      ).catch(() => []);
      for (const it of (recent || [])) {
        const k = safeStr(it.file_name_original);
        if (k && !intakesPorFilename.has(k)) intakesPorFilename.set(k, it);
      }
    } catch (e) { console.warn('[auditarAgosto] preload intakes falhou:', e.message); }

    for (let i = 0; i < candidateFiles.length; i++) {
      if (Date.now() - startTime > DEADLINE_MS) {
        stats.interrompidos_por_deadline = candidateFiles.length - i;
        break;
      }
      const file = candidateFiles[i];
      const ext = /\.xml$/i.test(file.name) ? 'xml' : 'pdf';
      let dataInfo = null;
      let num = null;
      let emissor = null;
      let valor = null;
      let desc = 'Despesa';
      let origem = '';

      // (a) DocumentIntake
      const intake = intakesPorFilename.get(safeStr(file.name));
      if (intake) {
        stats.matched_intake++;
        if (intake.nf_data_emissao) { dataInfo = parseDataEmissao(intake.nf_data_emissao); if (dataInfo) origem = 'intake'; }
        num = safeStr(intake.nf_numero);
        emissor = intake.fornecedor_nome || intake.nf_emitente_nome;
        valor = Number(intake.nf_valor_total || 0) || null;
        if (intake.rubrica_nome_sugerida || intake.rubrica_nome) desc = intake.rubrica_nome_sugerida || intake.rubrica_nome;
      }

      // (b) Parse XML
      if (!dataInfo && ext === 'xml') {
        try {
          const xml = await downloadFileText(token, file.id);
          if (xml) {
            stats.xml_parsed++;
            const f = parseXmlFields(xml);
            if (f?.data) { dataInfo = f.data; origem = 'xml'; }
            if (f?.num) num = num || f.num;
            if (f?.emissor) emissor = emissor || f.emissor;
            if (f?.valor) valor = valor || f.valor;
          }
        } catch { /* segue */ }
      }

      // (c) Pattern do nome
      if (!dataInfo) {
        const fd = extrairDataDoNome(file.name);
        if (fd) { dataInfo = fd; origem = 'filename'; stats.from_filename++; }
      }

      // (d) Leitura IA via GPT-4o
      if (!dataInfo && ext === 'pdf') {
        try {
          let bytes = await downloadFileBytes(token, file.id);
          if (bytes) {
            // Detectar HTML mascarado
            if (isHTMLMascarandoPDF(bytes)) {
              const recuperado = await recuperarBytesValidos({
                token, file, intakesPorFilename,
                numToken: num || extrairNumDoNome(file.name),
                valorToken: valor || extrairValorDoNome(file.name),
                emissorToken: emissor,
              });
              if (recuperado && isPdfValido(recuperado)) {
                stats.recuperados++;
                if (!dryRun) {
                  await updateFileMedia(token, file.id, recuperado, 'application/pdf');
                  await delay(200);
                }
                bytes = recuperado;
              } else {
                stats.erros_irrecuperaveis.push({ nome: file.name, motivo: 'PDF é HTML mascarado e nenhum substituto válido encontrado' });
                continue;
              }
            } else if (!isPdfValido(bytes)) {
              const recuperado = await recuperarBytesValidos({
                token, file, intakesPorFilename,
                numToken: num || extrairNumDoNome(file.name),
                valorToken: valor || extrairValorDoNome(file.name),
                emissorToken: emissor,
              });
              if (recuperado && isPdfValido(recuperado)) {
                stats.recuperados++;
                if (!dryRun) {
                  await updateFileMedia(token, file.id, recuperado, 'application/pdf');
                  await delay(200);
                }
                bytes = recuperado;
              } else {
                stats.erros_irrecuperaveis.push({ nome: file.name, motivo: 'PDF corrompido (sem assinatura %PDF) e sem substituto' });
                continue;
              }
            }
            // IA
            const ia = await lerPDFOpenAI(bytes, file.name);
            stats.lidos_ia++;
            if (ia?.data_emissao) {
              const d = parseDataEmissao(ia.data_emissao);
              if (d && (d.ano === 2025 || d.ano === 2026)) { dataInfo = d; origem = 'ia'; }
            }
            if (ia?.numero_nota) num = num || safeStr(ia.numero_nota);
            if (ia?.fornecedor_nome) emissor = emissor || ia.fornecedor_nome;
            if (ia?.valor_total) valor = valor || Number(ia.valor_total) || null;
          } else {
            stats.erros_irrecuperaveis.push({ nome: file.name, motivo: 'Download do conteúdo falhou' });
            continue;
          }
        } catch (e) {
          stats.erros_irrecuperaveis.push({ nome: file.name, motivo: `IA falhou: ${e.message}` });
          continue;
        }
      }

      if (!dataInfo) {
        stats.erros_irrecuperaveis.push({ nome: file.name, motivo: 'Data de emissão não resolvida (intake/xml/nome/IA)' });
        continue;
      }

      // 4. Nome canônico
      if (!num) num = extrairNumDoNome(file.name);
      const novoNome = buildNomeOficial({ num, desc, emissor, valor, ext });

      // 5. Pasta destino
      const targetMonthFolder = `${dataInfo.mes}-${dataInfo.ano}`;
      const isAgostoCorreto = dataInfo.mes === AGOSTO_ESPERADO.mes && dataInfo.ano === AGOSTO_ESPERADO.ano;
      if (isAgostoCorreto) stats.ja_agosto_correto++;

      if (!dryRun) {
        if (file.name !== novoNome) {
          const ok = await renameFile(token, file.id, novoNome);
          if (ok) stats.renomeados++;
          await delay(150);
        }
        if (!isAgostoCorreto) {
          try {
            const targetId = await getOrCreate(token, targetMonthFolder, rootNotasId, folderCache);
            const meta = await getFile(token, file.id, 'parents');
            const parents = meta?.parents || [];
            let moveOk = false;
            if (!parents.length) moveOk = await moveFile(token, file.id, targetId, null);
            else for (const cp of parents) { if (await moveFile(token, file.id, targetId, cp)) { moveOk = true; break; } }
            if (moveOk) {
              stats.movidos_para_outros_meses.push({ nome_original: file.name, nome_novo: novoNome, pasta_destino: targetMonthFolder, origem });
            } else {
              stats.erros_irrecuperaveis.push({ nome: file.name, motivo: 'MOVE falhou' });
            }
            await delay(200);
          } catch (e) {
            stats.erros_irrecuperaveis.push({ nome: file.name, motivo: `MOVE erro: ${e.message}` });
          }
        }
        // Atualiza intake vinculado
        if (intake) {
          const patch = {};
          if (origem === 'ia' || origem === 'xml') patch.nf_data_emissao = `${dataInfo.ano}-${dataInfo.mes}-01`;
          if (num) patch.nf_numero = num;
          if (emissor) patch.nf_emitente_nome = emissor;
          if (valor) patch.nf_valor_total = valor;
          patch.file_name_final = novoNome;
          try { await base44.asServiceRole.entities.DocumentIntake.update(intake.id, patch); } catch (e) { /* ignore */ }
        }
      } else {
        if (file.name !== novoNome) stats.renomeados++;
        if (!isAgostoCorreto) {
          stats.movidos_para_outros_meses.push({ nome_original: file.name, nome_novo: novoNome, pasta_destino: targetMonthFolder, origem });
        }
      }
    }

    const elapsed_ms = Date.now() - startTime;

    // BackupLog ao final
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'auditoria_entrada_unica',
        entity_type: 'AUDITORIA_PASTA_AGOSTO_IA',
        file_name: folderMeta.name,
        status: 'concluido',
        total_files: stats.files_target,
        files_copied: stats.lidos_ia + stats.recuperados,
        details: `${stats.ja_agosto_correto} agosto; ${stats.movidos_para_outros_meses.length} outros; ${stats.erros_irrecuperaveis.length} erros; dryRun=${dryRun}`,
        execution_time_ms: elapsed_ms,
        triggered_by: 'manual',
        processed_at: new Date().toISOString(),
      });
    } catch (e) { console.warn('[auditarAgosto] BackupLog falhou:', e.message); }

    console.log('[auditarPastaMesAgostoIA] relatório:', JSON.stringify(stats, null, 2));
    return Response.json({ ok: true, stats, elapsed_ms });
  } catch (error) {
    console.error('[auditarPastaMesAgostoIA] erro:', error.message);
    return Response.json({ ok: false, error: error?.message || 'Erro interno' }, { status: 500 });
  }
});