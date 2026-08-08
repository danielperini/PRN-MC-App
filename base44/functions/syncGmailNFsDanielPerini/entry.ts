import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// syncGmailNFsDanielPerini — Sincroniza apenas NFs (PDF+XML) da caixa
// conectada do Gmail de danielperini.mc@viadutodasartes.org.br a partir
// de Fevereiro/2026 até hoje. Roteamento 100% via Sala de Espera
// (DocumentIntake). Idempotente: ignora duplicados — mesmo que já estejam
// na Sala de Espera. Restrito a admin (Daniel Perini).
// =====================================================================

const REMETENTE_OFICIAL = 'danielperini.mc@viadutodasartes.org.br';

const NF_KEYWORDS = [
  'nota fiscal', 'nf ', 'nf-', 'nfe', 'nf-e', 'nfs-e', 'nfse',
  'danfe', 'nota', 'xml', '.pdf', 'emissão', 'prestador',
  'tomador', 'museus centro', 'r$',
];

const STOP_KEYWORDS = [
  'spam', 'promoção', 'newsletter', 'propaganda', 'marketing',
  'convite', 'aniversário', 'feliz', 'parabéns',
  'recado', 'agendamento', 'evento cultural',
];

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isRelevantNFEmail(subject, from, snippet) {
  const combined = normalize(`${subject} ${from} ${snippet || ''}`);
  for (const kw of STOP_KEYWORDS) {
    if (combined.includes(normalize(kw))) return false;
  }
  for (const kw of NF_KEYWORDS) {
    if (combined.includes(normalize(kw))) return true;
  }
  // Detecta filename .xml/.pdf no subject
  if (/\.(pdf|xml)(\b|$)/i.test(combined)) return true;
  return false;
}

function detectTipo(filename) {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.xml') || lower.includes('xml')) return 'NOTA_FISCAL_XML';
  if (lower.endsWith('.pdf')) return 'NOTA_FISCAL_PDF';
  return null;
}

function isAllowedNFAttachment(filename, mimeType) {
  const name = normalize(filename || '');
  // Estritamente PDF e XML — sem outros formatos
  const allowedExts = ['.pdf', '.xml'];
  const allowedMimes = [
    'application/pdf',
    'text/xml',
    'application/xml',
    'application/octet-stream', // alguns provedores enviam XML assim
    'application/vnd.amazon-ebook', // evitar; raros
  ];
  // Filtro rígido por extensão— só PDF e XML passam
  let pass = false;
  for (const ext of allowedExts) {
    if (name.endsWith(ext)) pass = true;
  }
  // Se não tiver extensão reconhecida, rejeita mesmo que mime seja xml
  if (!pass) return false;
  return true;
}

function b64ToBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// stripAccentsLower era apenas um alias de normalize — removido p/ limpeza
const stripAccentsLower = normalize;

function fingerprintFilename(fn) {
  // chaves normalizadas para dedupe — sem acentos, minúscula, só alfanuméricos
  return stripAccentsLower(fn).replace(/[^a-z0-9]/g, '').slice(0, 60);
}

function fingerprintMessageId(mid) {
  return stripAccentsLower(mid || '').trim();
}

async function registrarBackupLog(srv, dados) {
  try {
    await srv.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      entity_type: 'syncGmailNFsDanielPerini',
      status: 'concluido',
      processed_at: new Date().toISOString(),
      triggered_by: dados.triggeredBy,
      execution_time_ms: dados.execution_ms,
      details: JSON.stringify(dados.resumo),
      error_message: dados.resumo.erros.length > 0
        ? dados.resumo.erros.slice(0, 3).join('; ').slice(0, 500)
        : '',
    });
  } catch (_) { /* não crítica */ }
}

Deno.serve(async (req) => {
  const start = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;
  const db = srv.entities;

  const body = await req.json().catch(() => ({}));
  const isCron = req.headers.get('x-base44-trigger') === 'cron' || body.cron === '1' || body.cron === true;
  const triggeredBy = isCron || String(body.triggeredBy || '').toLowerCase() === 'scheduled'
    ? 'scheduled'
    : 'manual';

  if (!isCron) {
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ ok: false, error: 'Acesso restrito à coordenação geral (admin).' }, { status: 403 });
    }
  }

  // Parâmetros
  const dryRun = body.dryRun === true;
  // default 5 — cada import (download+upload) consome ~15-25s
  const maxResults = Math.min(Number(body.maxResults || 5), 15);
  const pageToken = body.pageToken || null;
  const fromInicio = body.dataInicio || '2026/01/31'; // Gmail after: 31/Jan/2026 → 01/Fev/2026 em diante
  const BUDGET_MS = 20000; // 20s — margem extra p/ deploy lento

  let gmailToken = null;
  try {
    const conn = await srv.connectors.getConnection('gmail');
    gmailToken = conn?.accessToken || null;
  } catch (e) {
    return Response.json({ ok: false, error: 'Gmail não conectado', detalhe: String(e?.message || e) }, { status: 401 });
  }
  if (!gmailToken) return Response.json({ ok: false, error: 'Gmail não conectado' }, { status: 401 });

  // Query: emails com anexo a partir de Fev/2026 (touch p/ redeploys)
  const searchQuery = `has:attachment after:${fromInicio}`;
  let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=${maxResults}`;
  if (pageToken) listUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${gmailToken}` } });
  if (!listRes.ok) {
    const errTxt = await listRes.text().catch(() => '');
    return Response.json({ ok: false, error: `Erro ao listar emails: ${listRes.status}`, detalhe: errTxt.slice(0, 300) }, { status: 502 });
  }
  const listData = await listRes.json();
  const messages = listData.messages || [];
  const nextPageToken = listData.nextPageToken || null;

  if (messages.length === 0) {
    return Response.json({
      ok: true,
      mensagem: 'Nenhum email com anexo encontrado a partir de Fev/2026.',
      importados: 0,
      ignorados: 0,
      duplicados: 0,
      erros: 0,
      total_emails: 0,
      nextPageToken: null,
    });
  }

  const resumo = {
    pendentes: messages.length,
    importados: 0,
    ignorados: 0,
    duplicados: 0,
    erros: [],
    avaliacoes_sala_espera: 0,
  };

  const resultados = [];

  // Pré-carrega as últimas 200 intakes ativas (limite p/ evitar timeout antes do processamento)
  const fingerprintsExistentes = new Set();
  try {
    const recent = await db.DocumentIntake.filter(
      { status_registro: 'ATIVO' },
      '-created_date',
      200,
      0
    ).catch(() => []);
    for (const d of recent || []) {
      const fp = fingerprintFilename(d.file_name_original || '');
      if (fp) fingerprintsExistentes.add(fp);
    }
  } catch (e) {
    console.warn('cache de fingerprints falhou (continua):', String(e?.message || e));
  }

  for (const msg of messages) {
    if (Date.now() - start > BUDGET_MS) {
      resultados.push({ messageId: msg.id, status: 'pulado', motivo: 'budget de tempo atingido — retome na próxima página' });
      break;
    }
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${gmailToken}` } }
      );
      if (!msgRes.ok) {
        resumo.erros.push(`${msg.id}: HTTP ${msgRes.status}`);
        continue;
      }
      const message = await msgRes.json();
      const headers = {};
      (message.payload?.headers || []).forEach(h => {
        headers[h.name?.toLowerCase()] = h.value;
      });
      const subject = headers['subject'] || '';
      const from = headers['from'] || '';
      const date = headers['date'] || '';

      if (!isRelevantNFEmail(subject, from, message.snippet || '')) {
        resumo.ignorados++;
        resultados.push({ messageId: msg.id, subject, status: 'ignorado', motivo: 'não é NF' });
        continue;
      }

      const parts = [];
      function collectParts(part) {
        if (part.parts) part.parts.forEach(collectParts);
        else if (part.filename && part.body?.attachmentId) parts.push(part);
      }
      collectParts(message.payload);
      if (parts.length === 0) {
        resumo.ignorados++;
        resultados.push({ messageId: msg.id, subject, status: 'ignorado', motivo: 'sem anexos' });
        continue;
      }

      for (const part of parts) {
        const filename = part.filename || '';
        const mimeType = part.mimeType || '';

        if (!isAllowedNFAttachment(filename, mimeType)) {
          // ignora qualquer anexo que não seja PDF ou XML (sem .png/.jpg/.doc/etc)
          resultados.push({ messageId: msg.id, subject, filename, status: 'ignorado', motivo: 'não é NF (PDF/XML)' });
          continue;
        }

        const tipo = detectTipo(filename);
        if (!tipo) {
          resultados.push({ messageId: msg.id, subject, filename, status: 'ignorado', motivo: 'tipo não reconhecido' });
          continue;
        }

        const fp = fingerprintFilename(filename);
        // SKIP 1: duplicado no cache local
        if (fp && fingerprintsExistentes.has(fp)) {
          resumo.duplicados++;
          resultados.push({ messageId: msg.id, subject, filename, status: 'duplicado', motivo: 'já na Sala de Espera (cache)' });
          continue;
        }
        // SKIP 2: confirmar no banco (idempotência forte)
        const exists = await db.DocumentIntake.filter(
          { file_name_original: filename, status_registro: 'ATIVO' },
          '',
          1
        ).catch(() => []);
        if (exists && exists.length > 0) {
          resumo.duplicados++;
          resultados.push({ messageId: msg.id, subject, filename, status: 'duplicado', motivo: 'já existe DocumentIntake ativo' });
          fingerprintsExistentes.add(fp);
          continue;
        }

        if (dryRun) {
          resultados.push({ messageId: msg.id, subject, filename, status: 'dry-run', tipo });
          continue;
        }

        // Baixa anexo
        const attRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
          { headers: { Authorization: `Bearer ${gmailToken}` } }
        );
        if (!attRes.ok) {
          resumo.erros.push(`${filename}: download ${attRes.status}`);
          continue;
        }
        const attData = await attRes.json();
        if (Date.now() - start > BUDGET_MS) {
          resultados.push({ messageId: msg.id, subject, filename, status: 'pulado', motivo: 'budget de tempo — prosseguir em próxima chamada' });
          continue;
        }
        const rawBytes = b64ToBytes(attData.data);

        // Upload do arquivo para storage
        const file = new File([rawBytes], filename, { type: mimeType || (tipo === 'NOTA_FISCAL_XML' ? 'application/xml' : 'application/pdf') });
        const upRes = await srv.integrations.Core.UploadFile({ file });
        const fileUrl = upRes?.file_url || upRes?.url || '';
        if (!fileUrl) {
          resumo.erros.push(`${filename}: upload sem url`);
          continue;
        }

        // Cria DocumentIntake (Sala de Espera) — roteamento padrão
        const intakePayload = {
          user_email: REMETENTE_OFICIAL,
          user_name: 'Daniel Perini',
          arquivo_original_url: fileUrl,
          file_name_original: filename,
          mime_type: mimeType || (tipo === 'NOTA_FISCAL_XML' ? 'application/xml' : 'application/pdf'),
          status_processamento: 'ENVIADO',
          tipo_detectado: tipo,
          origem: 'gmail_sync_nf',
          revisado_pelo_usuario: false,
          status_registro: 'ATIVO',
        };

        try {
          await db.DocumentIntake.create(intakePayload);
          resumo.importados++;
          resumo.avaliacoes_sala_espera++;
          if (fp) fingerprintsExistentes.add(fp);
          resultados.push({ messageId: msg.id, subject, filename, status: 'importado_sala_espera', tipo });
        } catch (createErr) {
          resumo.erros.push(`${filename}: ${String(createErr?.message || createErr)}`);
        }
      }
    } catch (msgErr) {
      resumo.erros.push(`${msg.id}: ${String(msgErr?.message || msgErr)}`);
    }
  }

  const ultimoMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;

  await registrarBackupLog(srv, { resumo, triggeredBy, execution_ms: Date.now() - start });

  return Response.json({
    ok: true,
    mensagem: `Sincronizadas ${resumo.importados} NFs (${resumo.duplicados} duplicadas ignoradas, ${resumo.ignorados} não-NF ignorados). ${resumo.avaliacoes_sala_espera} NFs roteadas para Sala de Espera.`,
    remetente: REMETENTE_OFICIAL,
    periodo_inicio: fromInicio,
    dryRun,
    total_emails: messages.length,
    nextPageToken,
    ultimoMsgId,
    resumo,
    resultados,
  });
});