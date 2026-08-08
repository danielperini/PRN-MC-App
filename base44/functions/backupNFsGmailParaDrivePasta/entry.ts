import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// backupNFsGmailParaDrivePasta
//
// Varre o Gmail conectado em busca de e-mails com anexos de notas fiscais
// (PDF/XML), baixa os anexos e salva diretamente na pasta de backup do
// Google Drive (1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU) — a mesma pasta que as
// rotinas `sincronizarPastaExternaDriveNFs` (04h00) e
// `restaurarNFsBancoBackup` (05h00) varrem diariamente para sincronizar
// com PurchaseRequests. Assim, novas NFs recebidas por e-mail entram
// automaticamente no pipeline de sincronização Drive→banco.
//
// Custo: $0 — sem IA (apenas download/upload binário).
// Idempotente: skipa anexos cujo nome (dedupe por fingerprint) já existe
// em qualquer ponto da árvore (raiz + subpastas MM-AAAA).
// Admin-only.
// =====================================================================

const FOLDER_ALVO = '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_DEPTH = 2;
const MAX_FILES_WALK = 2500;
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
  // Chave de acesso NFe (44 dígitos) no snippet/subject — forte indício de NF
  if (/\d{44}/.test(text)) return true;
  return false;
}

function isAllowedFilename(filename: string): boolean {
  const name = normalizeStr(filename);
  return name.endsWith('.pdf') || name.endsWith('.xml');
}

function fingerprint(fn: string): string {
  return normalizeStr(fn).replace(/[^a-z0-9]/g, '').slice(0, 90);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

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

// Caminha até MAX_DEPTH níveis, coletando fingerprints de arquivos PDF/XML.
async function coletarFingerprints(token: string, rootId: string): Promise<{ set: Set<string>; total: number }> {
  const set = new Set<string>();
  let total = 0;
  const seen = new Set<string>([rootId]);

  async function walk(fid: string, depth: number) {
    if (total > MAX_FILES_WALK) return;
    const items = await listFolder(token, fid);
    for (const it of items) {
      if (total > MAX_FILES_WALK) return;
      if (it.mimeType === FOLDER_MIME) {
        // Pula subpastas "01-AAAA" (janeiro), como nas outras rotinas
        if (/^01-\d{4}$/i.test(String(it.name || '').trim())) continue;
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
  return { set, total };
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
    const fromInicio = body.dataInicio || '2026/01/31'; // Gmail after:31/Jan/2026

    // Tokens OAuth
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

    // Coleta fingerprints do Drive (raiz + subpastas até MAX_DEPTH) — p/ idempotência
    let fingerprintsExistentes: Set<string>;
    let totalNoDrive = 0;
    try {
      const col = await coletarFingerprints(driveToken, FOLDER_ALVO);
      fingerprintsExistentes = col.set;
      totalNoDrive = col.total;
    } catch (e: any) {
      return Response.json({ ok: false, error: 'Falha ao listar Drive', detalhe: String(e?.message || e).slice(0, 200) }, { status: 502 });
    }

    // Lista emails com anexo (PDF ou XML)
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
        importados: 0,
        duplicados: 0,
        ignorados: 0,
        erros: 0,
        total_emails: 0,
        total_no_drive: totalNoDrive,
        nextPageToken: null,
        dryRun,
      });
    }

    const resumo = {
      pendentes: messages.length,
      importados: 0,
      duplicados: 0,
      ignorados: 0,
      erros: [] as string[],
      resultados: [] as any[],
    };

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

        for (const part of parts) {
          if (Date.now() - start > BUDGET_MS) {
            resumo.resultados.push({ messageId: msg.id, filename: part.filename, status: 'pulado', motivo: 'budget' });
            break;
          }
          const filename = part.filename || '';
          if (!isAllowedFilename(filename)) continue;

          const fp = fingerprint(filename);
          if (fp && fingerprintsExistentes.has(fp)) {
            resumo.duplicados++;
            resumo.resultados.push({ messageId: msg.id, filename, status: 'duplicado_drive' });
            continue;
          }

          if (dryRun) {
            resumo.resultados.push({ messageId: msg.id, filename, status: 'dry-run' });
            continue;
          }

          try {
            // 1. Baixa anexo do Gmail
            const attRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
              { headers: { Authorization: `Bearer ${gmailToken}` } }
            );
            if (!attRes.ok) {
              resumo.erros.push(`${filename}: download ${attRes.status}`);
              continue;
            }
            const attData = await attRes.json();
            const rawBytes = b64ToBytes(attData.data || '');

            // 2. Determina MIME type
            const mimeType = part.mimeType ||
              (filename.toLowerCase().endsWith('.xml') ? 'application/xml' : 'application/pdf');

            // 3. Upload ao Drive (pasta de backup)
            const upResult = await uploadToDrive(driveToken, FOLDER_ALVO, filename, mimeType, rawBytes);
            if (upResult.fileId) {
              resumo.importados++;
              if (fp) fingerprintsExistentes.add(fp);
              resumo.resultados.push({
                messageId: msg.id,
                filename,
                status: 'importado_drive',
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

    await db.BackupLog.create({
      backup_type: 'drive_nf_sync_mensal',
      entity_type: 'backupNFsGmailParaDrivePasta',
      status: resumo.erros.length > 0 ? 'concluido' : 'success',
      total_files: messages.length,
      files_copied: resumo.importados,
      details: `Gmail→Drive | importados ${resumo.importados} | dup ${resumo.duplicados} | ign ${resumo.ignorados} | err ${resumo.erros.length} | drive_existentes ${totalNoDrive}${dryRun ? ' | DRY-RUN' : ''}`,
      error_message: resumo.erros.length > 0 ? resumo.erros.slice(0, 3).join('; ').slice(0, 500) : '',
      triggered_by: triggeredBy as any,
      processed_at: new Date().toISOString(),
      execution_time_ms: Date.now() - start,
    }).catch(() => {});

    return Response.json({
      ok: true,
      mensagem: `Importados ${resumo.importados} anexos NF para o Drive (dup ${resumo.duplicados}, ign ${resumo.ignorados}). Próxima sincronização Drive→banco: 04h00/05h00.`,
      folder_id: FOLDER_ALVO,
      total_no_drive_existentes: totalNoDrive,
      total_emails: messages.length,
      nextPageToken,
      resumo,
      amostra: resumo.resultados.slice(0, 25),
      dryRun,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message || 'erro', stack: e?.stack }, { status: 500 });
  }
});