import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// backupNFsGmailParaDrivePasta
//
// Varre o Gmail conectado em busca de e-mails com anexos NF (PDF/XML),
// baixa, renomeia conforme o padrão oficial
//   NF-{nf_numero}_{emissor_slug}_R${valor}_{AAAA-MM}.{ext}
// e salva em subpastas mensais MM-AAAA dentro da pasta de backup
// 1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU (criadas automaticamente se faltarem).
//
// Custo: $0 — sem IA (apenas parser XML determinístico).
// Idempotente: fingerprint por nome-oficial; caminha raiz + subpastas
// na abertura. Pula subpastas 01-AAAA (janeiro) — alinhado às demais rotinas.
// =====================================================================

const FOLDER_ALVO = '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_DEPTH = 3;
const MAX_FILES_WALK = 3500;
const BUDGET_MS = 28_000;

const NF_KEYWORDS = [
  'nota fiscal', 'notas fiscais', 'nf-', 'nf ', 'nfe', 'nf-e', 'nfs-e', 'nfse', 'danfe',
  'museus centro', 'museus', 'r$', 'prestador', 'tomador',
];

const STOP_KEYWORDS = [
  'spam', 'promoção', 'newsletter', 'propaganda', 'marketing',
  'convite', 'aniversário', 'parabéns', 'recado', 'agendamento',
  'evento cultural',
];

function normalizeStr(s: any): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isNFEmail(subject: string, from: string, snippet: string): boolean {
  const text = normalizeStr(`${subject} ${from} ${snippet}`);
  for (const kw of STOP_KEYWORDS) if (text.includes(normalizeStr(kw))) return false;
  for (const kw of NF_KEYWORDS) if (text.includes(normalizeStr(kw))) return true;
  if (/\.(pdf|xml)(\b|$)/i.test(text)) return true;
  if (/\d{44}/.test(text)) return true;
  return false;
}

function isAllowedFilename(filename: string): boolean {
  const n = normalizeStr(filename);
  return n.endsWith('.pdf') || n.endsWith('.xml');
}

function fingerprint(fn: string): string {
  return normalizeStr(fn).replace(/[^a-z0-9]/g, '').slice(0, 110);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── Helpers de parsing XML (NFS-e / NF-e) ────────────────────────────────────

function slugify(s: any, max = 30): string {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, max)
    .replace(/^_+|_+$/g, '') || 'EMISSOR';
}

function parseValorNum(v: any): number {
  const s = String(v || '').trim().replace(/\s/g, '');
  if (!s) return 0;
  // pt-BR: 1.234,56
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  // en: 1234.56
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) || 0;
  const onlyDigitsComma = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(onlyDigitsComma) || 0;
}

function formatValorArquivo(v: any): string {
  const num = Math.round((parseValorNum(v)) * 100) / 100;
  // Sem separador de milhar, vírgula decimal: "1234,56"
  return num.toFixed(2).replace('.', ',');
}

function parseXmlBytes(bytes: Uint8Array): any | null {
  let txt: string;
  try {
    txt = new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }

  const get = (re: RegExp): string => {
    const m = txt.match(re);
    return m ? (m[1] || '').trim() : '';
  };

  let numero = get(/<(?:nNF|nNfse|nNFS-e|numeroNfse)\s*>\s*(\d+)\s*<\//i) ||
              get(/<numero>\s*(\d+)\s*<\/numero>/i);

  const emitMatch = txt.match(/<emit[^>]*>([\s\S]*?)<\/emit>/i);
  let emitenteCnpj = '';
  let emitenteNome = '';
  if (emitMatch) {
    const blk = emitMatch[1];
    emitenteCnpj = (blk.match(/<CNPJ>\s*(\d{14})\s*<\/CNPJ>/i) || [])[1] || '';
    emitenteNome = (blk.match(/<xNome>\s*([^<]+?)\s*<\/xNome>/i) || [])[1] ||
                  (blk.match(/<razaoSocial>\s*([^<]+?)\s*<\/razaoSocial>/i) || [])[1] ||
                  (blk.match(/<nome>\s*([^<]+?)\s*<\/nome>/i) || [])[1] || '';
  }
  if (!emitenteCnpj) emitenteCnpj = get(/<CNPJ>\s*(\d{14})\s*<\/CNPJ>/i);
  if (!emitenteNome) emitenteNome =
    get(/<xNome>\s*([^<]+?)\s*<\/xNome>/i) ||
    get(/<razaoSocial>\s*([^<]+?)\s*<\/razaoSocial>/i);

  const valorStr =
    get(/<vNF>\s*([\d.,]+)\s*<\/vNF>/i) ||
    get(/<vLiq>\s*([\d.,]+)\s*<\/vLiq>/i) ||
    get(/<valorServicos>\s*([\d.,]+)\s*<\/valorServicos>/i) ||
    get(/<valorLiquidoNfse>\s*([\d.,]+)\s*<\/valorLiquidoNfse>/i) ||
    get(/<valorTotal>\s*([\d.,]+)\s*<\/valorTotal>/i) ||
    get(/<valorLiquidoNFe>\s*([\d.,]+)\s*<\/valorLiquidoNFe>/i);

  const dataRaw =
    get(/<dhEmi>\s*([^<]+?)\s*<\/dhEmi>/i) ||
    get(/<dataEmissao>\s*([^<]+?)\s*<\/dataEmissao>/i) ||
    get(/<data_emissao>\s*([^<]+?)\s*<\/data_emissao>/i) ||
    get(/<dataEmissaoNFe>\s*([^<]+?)\s*<\/dataEmissaoNFe>/i) ||
    get(/<emissao>\s*([^<]+?)\s*<\/emissao>/i);

  let dataIso = '';
  let monthKey = '';
  if (dataRaw) {
    const iso = dataRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      dataIso = `${iso[1]}-${iso[2]}-${iso[3]}`;
      monthKey = `${iso[2]}-${iso[1]}`;
    } else {
      const br = dataRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (br) {
        dataIso = `${br[3]}-${br[2]}-${br[1]}`;
        monthKey = `${br[2]}-${br[3]}`;
      }
    }
  }

  // Sanity check: data deve estar em [2025-01, 2027-12]
  const validAno = monthKey ? (parseInt(monthKey.split('-')[1]) >= 2025) : false;
  if (monthKey && !validAno) {
    dataIso = '';
    monthKey = '';
  }

  return { numero, emitenteCnpj, emitenteNome, valorStr, dataEmissao: dataIso, monthKey };
}

function buildRenamedFilename(data: any, ext: string): string {
  const nf = data?.numero || 'SN';
  const emitente = slugify(data?.emitenteNome || 'EMISSOR', 30);
  const valor = formatValorArquivo(data?.valorStr);
  const dataEmi = String(data?.dataEmissao || '');
  const anoMes = dataEmi.length >= 7 ? dataEmi.substring(0, 7) : (data?.monthKey ? data.monthKey : '0000-00');
  const extLower = String(ext || '').toLowerCase();
  return `NF-${nf}_${emitente}_R$${valor}_${anoMes}.${extLower}`;
}

function extractNfFromFilename(fn: string): string {
  const m = String(fn).match(/NF[ -]?(\d+)/i);
  return m ? m[1] : 'SN';
}

function extrairNomeFromHeader(fromHeader: string): string {
  if (!fromHeader) return '';
  const m = fromHeader.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  if (m) return m[1].trim();
  const noEmail = fromHeader.split('<')[0].trim();
  return noEmail.replace(/"/g, '').trim();
}

// ── Drive helpers ────────────────────────────────────────────────────────────

async function drive(token: string, url: string, opts: any = {}): Promise<Response> {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

async function listFolder(token: string, folderId: string, pageSize = 1000): Promise<any[]> {
  const items: any[] = [];
  let pt: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=name&fields=files(id,name,mimeType)&pageSize=${pageSize}&supportsAllDrives=true`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await drive(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (Array.isArray(d.files)) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function coletarFingerprints(
  token: string,
  rootId: string
): Promise<{ set: Set<string>; total: number; folders: Map<string, string> }> {
  const set = new Set<string>();
  const folders = new Map<string, string>();
  let total = 0;
  const seen = new Set<string>([rootId]);

  async function walk(fid: string, depth: number) {
    if (total > MAX_FILES_WALK) return;
    const items = await listFolder(token, fid);
    for (const it of items) {
      if (total > MAX_FILES_WALK) return;
      if (it.mimeType === FOLDER_MIME) {
        const fname = String(it.name || '').trim();
        if (depth === 0 && /^\d{2}-\d{4}$/.test(fname)) folders.set(fname, it.id);
        // Pula janeiro (01-AAAA)
        if (/^01-\d{4}$/.test(fname)) continue;
        if (depth + 1 < MAX_DEPTH && !seen.has(it.id)) {
          seen.add(it.id);
          await walk(it.id, depth + 1);
        }
        continue;
      }
      const name = (it.name || '').toLowerCase();
      if (name.endsWith('.pdf') || name.endsWith('.xml')) {
        const fp = fingerprint(it.name || '');
        if (fp) { set.add(fp); total++; }
      }
    }
  }

  await walk(rootId, 0);
  return { set, total, folders };
}

async function getOrCreateMonthFolder(
  token: string,
  parentFolderId: string,
  monthKey: string,
  existingFolders: Map<string, string>
): Promise<{ id: string; criadaAgora: boolean }> {
  const found = existingFolders.get(monthKey);
  if (found) return { id: found, criadaAgora: false };

  // Tenta localizar (caso tenha sido criada após cache inicial)
  const items = await listFolder(token, parentFolderId, 200);
  for (const it of items) {
    if (it.mimeType === FOLDER_MIME && it.name === monthKey) {
      existingFolders.set(monthKey, it.id);
      return { id: it.id, criadaAgora: false };
    }
  }

  // Cria nova subpasta
  const metadata = JSON.stringify({ name: monthKey, mimeType: FOLDER_MIME, parents: [parentFolderId] });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: metadata,
  });
  if (!r.ok) throw new Error(`criar pasta ${monthKey}: ${r.status}`);
  const d = await r.json();
  existingFolders.set(monthKey, d.id);
  return { id: d.id, criadaAgora: true };
}

async function uploadToDrive(
  token: string,
  folderId: string,
  filename: string,
  mimeType: string,
  bytes: Uint8Array
): Promise<{ fileId?: string; url?: string; erro?: string }> {
  const boundary = 'mc-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const metadataJson = JSON.stringify({ name: filename, parents: [folderId] });

  const headStr =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataJson}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const tailStr = `\r\n--${boundary}--\r\n`;

  const headB = new TextEncoder().encode(headStr);
  const tailB = new TextEncoder().encode(tailStr);
  const combined = new Uint8Array(headB.length + bytes.byteLength + tailB.length);
  combined.set(headB, 0);
  combined.set(bytes, headB.length);
  combined.set(tailB, headB.length + bytes.byteLength);

  const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(combined.byteLength),
    },
    body: combined,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => r.statusText);
    return { erro: `${r.status}: ${txt.slice(0, 200)}` };
  }
  const d = await r.json();
  return { fileId: d?.id, url: d?.webViewLink };
}

// ── Email header helpers ─────────────────────────────────────────────────────

const MESES_PT: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  janeiro: '01', fevereiro: '02', marco: '03', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
  outubro: '10', novembro: '11', dezembro: '12',
};

function getEmailDate(headers: any): { monthKey: string; dataIso: string } {
  const dateRaw = headers.date || '';
  const m = dateRaw.match(/(\d{1,2})\s+(\w{3,9})\s+(\d{4})/);
  if (!m) return { monthKey: '', dataIso: '' };
  const mesKey = m[2].toLowerCase();
  const mes = MESES_PT[mesKey.substring(0, 3)] || MESES_PT[mesKey] || '';
  if (!mes) return { monthKey: '', dataIso: '' };
  const dia = m[1].padStart(2, '0');
  return { monthKey: `${mes}-${m[3]}`, dataIso: `${m[3]}-${mes}-${dia}` };
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const start = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const srv = base44.asServiceRole;
    const db = srv.entities;

    const body = await req.json().catch(() => ({}));
    const isCron = req.headers.get('x-base44-trigger') === 'cron' || body.cron === '1' || body.cron === true;
    const triggeredBy = isCron || String(body.triggeredBy || '').toLowerCase() === 'scheduled' ? 'scheduled' : 'manual';

    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
      if (user.role !== 'admin') {
        return Response.json({ ok: false, error: 'Acesso restrito à coordenação (admin).' }, { status: 403 });
      }
    }

    const dryRun = body.dryRun === true;
    const maxResults = Math.min(Number(body.maxResults || 8), 15);
    const pageToken = body.pageToken || null;
    const fromInicio = body.dataInicio || '2026/01/31';

    let gmailToken: string | null = null;
    let driveToken: string | null = null;
    try {
      const g = await srv.connectors.getConnection('gmail');
      gmailToken = g?.accessToken || null;
    } catch (e) {
      return Response.json({ ok: false, error: 'Gmail não conectado', detalhe: String(e?.message || e).slice(0, 200) }, { status: 401 });
    }
    try {
      const d = await srv.connectors.getConnection('googledrive');
      driveToken = d?.accessToken || null;
    } catch (e) {
      return Response.json({ ok: false, error: 'Google Drive não conectado', detalhe: String(e?.message || e).slice(0, 200) }, { status: 401 });
    }
    if (!gmailToken || !driveToken) {
      return Response.json({ ok: false, error: 'OAuth ausente para Gmail ou Drive.' }, { status: 401 });
    }

    // Coleta fingerprints (dedupe) + cache de subpastas mensais existentes
    let fingerprintsExistentes: Set<string>;
    let totalNoDrive = 0;
    let monthFolders: Map<string, string>;
    try {
      const col = await coletarFingerprints(driveToken, FOLDER_ALVO);
      fingerprintsExistentes = col.set;
      totalNoDrive = col.total;
      monthFolders = col.folders;
    } catch (e: any) {
      return Response.json({ ok: false, error: 'Falha ao listar Drive', detalhe: String(e?.message || e).slice(0, 200) }, { status: 502 });
    }

    const searchQuery = `has:attachment (filename:pdf OR filename:xml) after:${fromInicio}`;
    let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=${maxResults}`;
    if (pageToken) listUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${gmailToken}` } });
    if (!listRes.ok) {
      const errTxt = await listRes.text().catch(() => '');
      return Response.json({ ok: false, error: `listar emails: ${listRes.status}`, detalhe: errTxt.slice(0, 200) }, { status: 502 });
    }
    const listData = await listRes.json();
    const messages: any[] = listData.messages || [];
    const nextPageToken = listData.nextPageToken || null;

    if (messages.length === 0) {
      return Response.json({
        ok: true,
        mensagem: 'Nenhum novo email com anexo NF encontrado.',
        importados: 0, duplicados: 0, ignorados: 0, erros: 0,
        pastas_criadas: 0,
        total_emails: 0, total_no_drive: totalNoDrive,
        nextPageToken: null, dryRun,
      });
    }

    const resumo = {
      pendentes: messages.length,
      importados: 0,
      duplicados: 0,
      ignorados: 0,
      pastas_criadas: 0,
      erros: [] as string[],
      resultados: [] as any[],
    };

    const pastasCriadasSet = new Set<string>();

    for (const msg of messages) {
      if (Date.now() - start > BUDGET_MS) {
        resumo.resultados.push({ messageId: msg.id, status: 'pulado', motivo: 'budget de tempo' });
        break;
      }
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${gmailToken}` } }
        );
        if (!msgRes.ok) {
          resumo.erros.push(`${msg.id}: msg ${msgRes.status}`);
          continue;
        }
        const message = await msgRes.json();
        const headers: any = {};
        (message.payload?.headers || []).forEach((h: any) => {
          headers[h.name?.toLowerCase()] = h.value;
        });
        const subject = headers.subject || '';
        const from = headers.from || '';
        const emailDate = getEmailDate(headers);
        const emissorFromEmail = extrairNomeFromHeader(from);

        if (!isNFEmail(subject, from, message.snippet || '')) {
          resumo.ignorados++;
          resumo.resultados.push({ messageId: msg.id, subject, status: 'ignorado', motivo: 'não-NF' });
          continue;
        }

        const parts: any[] = [];
        function collectParts(part: any) {
          if (part.parts) part.parts.forEach(collectParts);
          else if (part.filename && part.body?.attachmentId) parts.push(part);
        }
        collectParts(message.payload);
        if (parts.length === 0) {
          resumo.ignorados++;
          resumo.resultados.push({ messageId: msg.id, subject, status: 'ignorado', motivo: 'sem anexos' });
          continue;
        }

        // Separa XMLs e PDFs
        const xmlParts: any[] = [];
        const pdfParts: any[] = [];
        for (const p of parts) {
          if (!isAllowedFilename(p.filename)) continue;
          if (p.filename.toLowerCase().endsWith('.xml')) xmlParts.push(p);
          else if (p.filename.toLowerCase().endsWith('.pdf')) pdfParts.push(p);
        }

        const parsedByBasename = new Map<string, any>();
        const parsedDataByPart = new Map<string, any>();
        const bytesByPart = new Map<string, Uint8Array>();

        // 1. Baixa e parseia cada XML → dados oficiais
        for (const part of xmlParts) {
          if (Date.now() - start > BUDGET_MS) break;
          const filename = part.filename || '';
          try {
            const attRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
              { headers: { Authorization: `Bearer ${gmailToken}` } }
            );
            if (!attRes.ok) {
              resumo.erros.push(`${filename}: download xml ${attRes.status}`);
              continue;
            }
            const attData = await attRes.json();
            const rawBytes = b64ToBytes(attData.data || '');
            const parsed = parseXmlBytes(rawBytes) || {};
            const basename = filename.replace(/\.[^.]+$/, '');
            parsedByBasename.set(basename, parsed);
            parsedDataByPart.set(filename, parsed);
            bytesByPart.set(filename, rawBytes);
          } catch (e: any) {
            resumo.erros.push(`${filename}: parse xml ${String(e?.message || e).slice(0, 80)}`);
          }
        }

        // 2. PDFs: pareia com XML (basename) — se não houver, heuristic via filename + email data
        for (const part of pdfParts) {
          const filename = part.filename || '';
          const basename = filename.replace(/\.[^.]+$/, '');
          const pairedXml = parsedByBasename.get(basename);

          let dataForPdf: any;
          if (pairedXml) {
            dataForPdf = pairedXml;
          } else {
            // PDF alone — best effort
            dataForPdf = {
              numero: extractNfFromFilename(filename),
              emitenteNome: emissorFromEmail || 'EMISSOR',
              emitenteCnpj: '',
              valorStr: '0',
              dataEmissao: emailDate.dataIso,
              monthKey: emailDate.monthKey,
              semXml: true,
            };
          }
          parsedDataByPart.set(filename, dataForPdf);
        }

        // 3. Upload (renomado) para pasta mensal
        const todasPartes = [...xmlParts, ...pdfParts];
        const nomesSalvosNesteEmail = new Set<string>();

        for (const part of todasPartes) {
          if (Date.now() - start > BUDGET_MS) {
            resumo.resultados.push({ messageId: msg.id, filename: part.filename, status: 'pulado', motivo: 'budget' });
            break;
          }
          const filename = part.filename || '';
          if (!isAllowedFilename(filename)) continue;

          const dados = parsedDataByPart.get(filename);
          let monthKey = dados?.monthKey || emailDate.monthKey || '';

          // Pula pastas de janeiro (01-AAAA)
          if (/^01-\d{4}$/.test(monthKey)) monthKey = '';

          let targetFolderId = FOLDER_ALVO;
          if (monthKey && /^\d{2}-\d{4}$/.test(monthKey)) {
            try {
              const uf = await getOrCreateMonthFolder(driveToken, FOLDER_ALVO, monthKey, monthFolders);
              targetFolderId = uf.id;
              if (uf.criadaAgora && !pastasCriadasSet.has(monthKey)) pastasCriadasSet.add(monthKey);
            } catch (e: any) {
              resumo.erros.push(`pasta ${monthKey}: ${String(e?.message || e).slice(0, 80)}`);
              targetFolderId = FOLDER_ALVO;
            }
          }

          const ext = filename.toLowerCase().endsWith('.xml') ? 'xml' : 'pdf';
          let nomeFinal = filename;
          if (dados && (dados.numero || dados.dataEmissao || dados.monthKey)) {
            nomeFinal = buildRenamedFilename(dados, ext);
          }

          const fp = fingerprint(nomeFinal);
          if (fp && (fingerprintsExistentes.has(fp) || nomesSalvosNesteEmail.has(fp))) {
            resumo.duplicados++;
            resumo.resultados.push({ messageId: msg.id, filename, nomeFinal, status: 'duplicado_drive' });
            continue;
          }

          if (dryRun) {
            resumo.resultados.push({ messageId: msg.id, filename, nomeFinal, monthKey, status: 'dry-run' });
            continue;
          }

          try {
            let rawBytes = bytesByPart.get(filename);
            if (!rawBytes) {
              const attRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
                { headers: { Authorization: `Bearer ${gmailToken}` } }
              );
              if (!attRes.ok) {
                resumo.erros.push(`${filename}: download pdf ${attRes.status}`);
                continue;
              }
              const attData = await attRes.json();
              rawBytes = b64ToBytes(attData.data || '');
              bytesByPart.set(filename, rawBytes);
            }
            const mimeType = part.mimeType ||
              (ext === 'xml' ? 'application/xml' : 'application/pdf');

            const upResult = await uploadToDrive(driveToken, targetFolderId, nomeFinal, mimeType, rawBytes);
            if (upResult.fileId) {
              resumo.importados++;
              if (fp) { fingerprintsExistentes.add(fp); nomesSalvosNesteEmail.add(fp); }
              resumo.resultados.push({
                messageId: msg.id,
                filename,
                nomeFinal,
                monthKey,
                status: 'importado_drive',
                folderId: targetFolderId,
                fileId: upResult.fileId,
                url: upResult.url,
              });
            } else {
              resumo.erros.push(`${filename}: upload falhou — ${upResult.erro}`);
            }
          } catch (e: any) {
            resumo.erros.push(`${filename}: ${String(e?.message || e).slice(0, 100)}`);
          }
        }
      } catch (e: any) {
        resumo.erros.push(`${msg.id}: ${String(e?.message || e).slice(0, 100)}`);
      }
    }

    resumo.pastas_criadas = pastasCriadasSet.size;

    await db.BackupLog.create({
      backup_type: 'drive_nf_sync_mensal',
      entity_type: 'backupNFsGmailParaDrivePasta',
      status: resumo.erros.length > 0 ? 'concluido' : 'success',
      total_files: messages.length,
      files_copied: resumo.importados,
      details: `Gmail→Drive | importados ${resumo.importados} | renomeados (padrão NF-XXX_emissor_R$XXX_AAAA-MM) | dup ${resumo.duplicados} | ign ${resumo.ignorados} | pastas_criadas ${resumo.pastas_criadas} | err ${resumo.erros.length} | drive_existentes ${totalNoDrive}${dryRun ? ' | DRY-RUN' : ''}`,
      error_message: resumo.erros.length > 0 ? resumo.erros.slice(0, 3).join('; ').slice(0, 500) : '',
      triggered_by: triggeredBy as any,
      processed_at: new Date().toISOString(),
      execution_time_ms: Date.now() - start,
    }).catch(() => {});

    return Response.json({
      ok: true,
      mensagem: `Importados ${resumo.importados} anexos NF renomeados para o Drive (dup ${resumo.duplicados}, pastas criadas ${resumo.pastas_criadas}). Próxima sincronização Drive→banco: 04h00/05h00.`,
      folder_id: FOLDER_ALVO,
      total_no_drive_existentes: totalNoDrive,
      total_emails: messages.length,
      pastas_criadas: Array.from(pastasCriadasSet),
      nextPageToken,
      resumo,
      amostra: resumo.resultados.slice(0, 25),
      dryRun,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message || 'erro', stack: e?.stack }, { status: 500 });
  }
});