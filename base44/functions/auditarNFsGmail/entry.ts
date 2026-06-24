import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ======================================================================
// CONSTANTES
// ======================================================================
const EXTENSOES_NF = new Set(['pdf', 'xml']);
const MIMES_NF = new Set(['application/pdf', 'text/xml', 'application/xml']);

const BLOCKED_FILENAME = [
  'extrato', 'recibo', 'comprovante', 'boleto',
  'restituição', 'reembolso', 'estorno', 'cancelada', 'cancelado',
  'darf', 'gnre', 'fgts', 'inss', 'guia de',
];

// ======================================================================
// UTILITÁRIOS
// ======================================================================
function safeStr(v) { return String(v || '').trim(); }
function onlyDigits(v) { return safeStr(v).replace(/\D/g, ''); }

function normalizeText(v) {
  return safeStr(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function hasBlockedWord(name) {
  const n = normalizeText(name);
  return BLOCKED_FILENAME.some(w => n.includes(normalizeText(w)));
}

function extractNFNumber(filename) {
  const base = filename.replace(/\.(pdf|xml)$/i, '');
  const nfMatch = base.match(/NF\s*[nN°]*\s*(\d+)/i);
  if (nfMatch) return nfMatch[1];
  const startMatch = base.match(/^(\d+)\s/);
  if (startMatch) return startMatch[1];
  return null;
}

function isValidNF(filename, mimeType) {
  if (!filename || hasBlockedWord(filename)) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext && EXTENSOES_NF.has(ext)) return true;
  if (mimeType && MIMES_NF.has(mimeType)) return true;
  return false;
}

// ======================================================================
// ACESSO GMAIL
// ======================================================================
async function getAuthHeader(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('gmail');
  return { Authorization: `Bearer ${conn.accessToken}` };
}

async function gmailFetch(url, authHeader) {
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail API ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

// ======================================================================
// LISTAR TODOS OS EMAILS COM ANEXOS PDF/XML
// ======================================================================
async function listNFAttachments(base44, authHeader, maxMessages = 60) {
  const attachments = [];
  let pageToken = null;
  let fetchedCount = 0;

  // Buscar emails com anexos PDF ou XML desde 2026
  const query = 'has:attachment (filename:pdf OR filename:xml) after:2026/01/01';

  do {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=200${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await gmailFetch(url, authHeader);
    pageToken = data.nextPageToken || null;

    if (!data.messages) break;

    for (const msg of data.messages) {
      if (fetchedCount >= maxMessages) break;
      fetchedCount++;
      try {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
        const full = await gmailFetch(msgUrl, authHeader);

        const headers = {};
        (full.payload?.headers || []).forEach(h => {
          headers[h.name?.toLowerCase()] = h.value;
        });

        const subject = headers['subject'] || '(sem assunto)';
        const from = headers['from'] || '';
        const date = full.internalDate
          ? new Date(Number(full.internalDate)).toISOString()
          : headers['date'] || '';

        const parts = [];
        function collectParts(part) {
          if (part.parts) {
            part.parts.forEach(collectParts);
          } else if (part.filename && part.body?.attachmentId) {
            parts.push(part);
          }
        }
        collectParts(full.payload);

        for (const part of parts) {
          if (isValidNF(part.filename, part.mimeType || '')) {
            const messageId = `${msg.id}:${part.body.attachmentId}`;
            attachments.push({
              messageId,
              gmail_msg_id: msg.id,
              attachmentId: part.body.attachmentId,
              filename: part.filename,
              mimeType: part.mimeType || '',
              subject,
              from,
              date,
              nf_numero_extraido: extractNFNumber(part.filename),
            });
          }
        }
      } catch (e) {
        console.warn(`Erro ao ler mensagem ${msg.id}: ${e.message}`);
      }
    }
  } while (pageToken && fetchedCount < maxMessages);

  return attachments;
}

// ======================================================================
// CONSTRUIR CATÁLOGO DO SISTEMA
// ======================================================================
async function buildSystemCatalog(base44) {
  const catalog = new Map(); // key → records

  // DocumentIntake — carregar os mais recentes (limite 2000)
  const intakes = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 2000);

  for (const intake of (intakes || [])) {
    if (intake.status_registro === 'REMOVIDO') continue;
    // Indexar por gmail_message_id
    const gmailMsgId = safeStr(intake.gmail_message_id);
    if (gmailMsgId) {
      if (!catalog.has(gmailMsgId)) catalog.set(gmailMsgId, []);
      catalog.get(gmailMsgId).push({
        source: 'DocumentIntake',
        id: intake.id,
        gmail_message_id: gmailMsgId,
        file_name_original: intake.file_name_original,
        origem: intake.origem,
      });
    }

    // Indexar por nome de arquivo
    const fileName = safeStr(intake.file_name_original);
    if (fileName) {
      const key = `file:${normalizeText(fileName)}`;
      if (!catalog.has(key)) catalog.set(key, []);
      catalog.get(key).push({
        source: 'DocumentIntake',
        id: intake.id,
        file_name_original: fileName,
      });
    }
  }

  return catalog;
}

// ======================================================================
// COMPARAÇÃO
// ======================================================================
function isAlreadyImported(attachment, catalog) {
  // (1) Match exato por gmail_message_id
  if (catalog.has(attachment.messageId)) {
    return { imported: true, method: 'gmail_message_id' };
  }

  // (2) Match por nome de arquivo normalizado
  const normName = normalizeText(attachment.filename);
  const key = `file:${normName}`;
  if (catalog.has(key)) {
    return { imported: true, method: 'filename_exact' };
  }

  // (3) Match por número NF extraído do nome
  const nfNum = attachment.nf_numero_extraido;
  if (nfNum) {
    for (const [k, records] of catalog) {
      if (k.startsWith('file:')) continue;
      for (const rec of records) {
        const recNum = extractNFNumber(rec.file_name_original || '');
        if (recNum && recNum === nfNum) {
          return { imported: true, method: 'nf_numero' };
        }
      }
    }
  }

  return { imported: false, method: null };
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
    const maxMessages = Math.min(body.maxMessages || 60, 200);

    const startTime = Date.now();
    const authHeader = await getAuthHeader(base44);

    // ── 1. Listar anexos NF do Gmail ──
    const attachments = await listNFAttachments(base44, authHeader, maxMessages);

    // ── 2. Construir catálogo do sistema ──
    const catalog = await buildSystemCatalog(base44);

    // ── 3. Comparar ──
    const jaImportados = [];
    const naoImportados = [];

    for (const att of attachments) {
      const result = isAlreadyImported(att, catalog);

      const entry = {
        filename: att.filename,
        gmail_msg_id: att.gmail_msg_id,
        attachmentId: att.attachmentId,
        subject: att.subject,
        from: att.from,
        date: att.date,
        mimeType: att.mimeType,
        nf_numero_extraido: att.nf_numero_extraido,
      };

      if (result.imported) {
        jaImportados.push({ ...entry, metodo: result.method });
      } else {
        naoImportados.push(entry);
      }
    }

    const executionTime = Date.now() - startTime;

    return Response.json({
      success: true,
      resumo: {
        total_anexos_nf_gmail: attachments.length,
        ja_importados: jaImportados.length,
        nao_importados: naoImportados.length,
        tempo_ms: executionTime,
      },
      nao_importados: naoImportados,
      ja_importados_resumo: {
        total: jaImportados.length,
        por_message_id: jaImportados.filter(f => f.metodo === 'gmail_message_id').length,
        por_filename: jaImportados.filter(f => f.metodo === 'filename_exact').length,
        por_nf_numero: jaImportados.filter(f => f.metodo === 'nf_numero').length,
      },
      catalog_size: catalog.size,
    });
  } catch (error) {
    console.error('auditarNFsGmail error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});