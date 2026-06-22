import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const EMAIL_SYNC_BATCH_SIZE = 25;
const EMAIL_QUERY = 'from:danielperini@museuscentro.com.br has:attachment after:2026/01/01';

// Extensões e MIME types válidos para processamento
const EXTENSOES_VALIDAS = new Set(['pdf', 'xml', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg']);
const MIMES_VALIDOS = new Set([
  'application/pdf', 'application/xml', 'text/xml',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg', 'image/jpg'
]);
const MIMES_IGNORAR = new Set([
  'image/gif', 'image/svg+xml', 'image/webp', 'image/bmp',
  'text/calendar', 'text/vcard', 'application/pkcs7-signature'
]);

function getExtensao(filename) {
  const parts = String(filename || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function isValidFile(filename, mimeType) {
  if (!filename || !mimeType) return false;
  if (MIMES_IGNORAR.has(mimeType)) return false;
  const ext = getExtensao(filename);
  if (!ext) return false;
  return EXTENSOES_VALIDAS.has(ext) || MIMES_VALIDOS.has(mimeType);
}

async function getOrCreateAuthHeader(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('gmail');
  return { Authorization: `Bearer ${conn.accessToken}` };
}

async function gmailFetch(url, authHeader) {
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Apenas administradores e coordenadores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'contar'; // 'contar' | 'processar_bloco' | 'processar_todos' | 'retomar' | 'status'

    // 1. OBTER STATUS ATUAL
    if (action === 'status') {
      const jobs = await base44.asServiceRole.entities.EmailSyncJob.list('-created_date', 1);
      const job = jobs?.[0] || null;
      return Response.json({ success: true, job });
    }

    // 2. CONTAGEM PRÉVIA
    if (action === 'contar') {
      const authHeader = await getOrCreateAuthHeader(base44);

      // Listar mensagens
      const messages = [];
      let pageToken = null;
      let totalMessages = 0;

      do {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(EMAIL_QUERY)}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const data = await gmailFetch(url, authHeader);
        if (data.messages) {
          messages.push(...data.messages);
          totalMessages += data.messages.length;
        }
        pageToken = data.nextPageToken || null;
      } while (pageToken && messages.length < 2000);

      // Para cada mensagem, contar anexos
      let totalAttachments = 0;
      let totalValidFiles = 0;

      for (const msg of messages.slice(0, 500)) { // Limitar a 500 para a pré-contagem
        try {
          const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&fields=payload/parts`;
          const full = await gmailFetch(url, authHeader);
          const parts = full?.payload?.parts || [];
          for (const part of parts) {
            if (part.filename && part.body?.attachmentId) {
              totalAttachments++;
              if (isValidFile(part.filename, part.mimeType || '')) {
                totalValidFiles++;
              }
            }
          }
        } catch (err) {
          console.warn(`Erro ao ler mensagem ${msg.id}:`, err?.message);
        }
      }

      // Verificar quantos já estão sincronizados
      let totalAlreadySynced = 0;
      try {
        // Conta DocumentIntake que vieram do Gmail (têm intake_id começando com 'gmail:')
        const allIntakes = [];
        let skip = 0;
        let hasMore = true;
        while (hasMore) {
          const batch = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 500, skip);
          if (!batch || batch.length === 0) { hasMore = false; break; }
          allIntakes.push(...batch);
          skip += 500;
          if (batch.length < 500) hasMore = false;
        }
        totalAlreadySynced = allIntakes.filter(d =>
          d.status_registro !== 'REMOVIDO' &&
          (d.origem === 'GMAIL' || d.origem === 'EMAIL' || String(d.file_name_original || '').toLowerCase().includes('gmail'))
        ).length;
      } catch (err) {
        console.warn('Erro ao contar já sincronizados:', err?.message);
      }

      const totalPending = Math.max(0, totalValidFiles - totalAlreadySynced);
      const totalBatches = Math.ceil(totalPending / EMAIL_SYNC_BATCH_SIZE);

      // Persistir job de contagem
      const correlationId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const job = await base44.asServiceRole.entities.EmailSyncJob.create({
        account: 'danielperini@museuscentro.com.br',
        provider: 'gmail',
        status: 'AGUARDANDO_CONFIRMACAO',
        total_messages: totalMessages,
        total_attachments: totalAttachments,
        total_valid_files: totalValidFiles,
        total_already_synced: totalAlreadySynced,
        total_pending: totalPending,
        batch_size: EMAIL_SYNC_BATCH_SIZE,
        total_batches: totalBatches,
        current_batch: 0,
        processed_count: 0,
        remaining_count: totalPending,
        correlation_id: correlationId,
        started_at: new Date().toISOString(),
      });

      return Response.json({
        success: true,
        job,
        resumo: {
          total_emails_encontrados: totalMessages,
          total_anexos_encontrados: totalAttachments,
          total_arquivos_validos: totalValidFiles,
          total_ja_sincronizados: totalAlreadySynced,
          total_pendentes: totalPending,
          tamanho_bloco: EMAIL_SYNC_BATCH_SIZE,
          bloco_atual: 1,
          total_blocos: totalBatches,
          restante_apos_bloco: Math.max(0, totalPending - EMAIL_SYNC_BATCH_SIZE),
        }
      });
    }

    // 3. PROCESSAR BLOCO
    if (action === 'processar_bloco' || action === 'processar_todos') {
      const jobs = await base44.asServiceRole.entities.EmailSyncJob.list('-created_date', 1);
      let job = jobs?.[0];

      if (!job || job.status === 'CONCLUIDO' || job.status === 'CONCLUIDO_COM_ERROS') {
        return Response.json({ success: false, error: 'Nenhuma sincronização pendente. Execute a contagem primeiro.' });
      }

      // Atualizar status para PROCESSANDO
      job = await base44.asServiceRole.entities.EmailSyncJob.update(job.id, {
        status: 'PROCESSANDO',
        current_batch: (job.current_batch || 0) + 1,
      });

      const authHeader = await getOrCreateAuthHeader(base44);
      const batchSize = job.batch_size || EMAIL_SYNC_BATCH_SIZE;
      const batchNumber = job.current_batch || 1;

      // Buscar mensagens para processar
      const messages = [];
      let pageToken = null;
      do {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(EMAIL_QUERY)}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const data = await gmailFetch(url, authHeader);
        if (data.messages) messages.push(...data.messages);
        pageToken = data.nextPageToken || null;
      } while (pageToken && messages.length < 2000);

      let processedCount = job.processed_count || 0;
      let createdCount = job.created_count || 0;
      let updatedCount = job.updated_count || 0;
      let duplicateCount = job.duplicate_count || 0;
      let ignoredCount = job.ignored_count || 0;
      let errorCount = job.error_count || 0;
      const errorsDetail = [...(job.errors_detail || [])];
      let lastCursor = job.last_cursor || '';
      let lastAttachmentId = job.last_attachment_id || '';

      let processadosNesteBloco = 0;
      const maxNesteBloco = batchSize;
      let encontrouCursor = !lastCursor; // Se não tem cursor, começa do início

      for (const msg of messages) {
        if (processadosNesteBloco >= maxNesteBloco) break;

        // Pular até encontrar o último cursor
        if (!encontrouCursor) {
          if (msg.id === lastCursor) {
            encontrouCursor = true;
            // Pular a mensagem do cursor (já foi processada)
            continue;
          }
          continue;
        }

        try {
          const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
          const full = await gmailFetch(msgUrl, authHeader);
          const parts = full?.payload?.parts || [];
          const headers = full?.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value || '(sem assunto)';
          const from = headers.find(h => h.name === 'From')?.value || '';

          for (const part of parts) {
            if (processadosNesteBloco >= maxNesteBloco) break;
            if (!part.filename || !part.body?.attachmentId) continue;
            if (!isValidFile(part.filename, part.mimeType || '')) {
              ignoredCount++;
              processadosNesteBloco++;
              processedCount++;
              continue;
            }

            const attachmentId = part.body.attachmentId;
            const messageId = msg.id + ':' + attachmentId;

            // Verificar duplicidade: já existe DocumentIntake com este messageId?
            const existentes = await base44.asServiceRole.entities.DocumentIntake.filter({
              origem: 'GMAIL',
              gmail_message_id: messageId,
            });

            if (existentes && existentes.length > 0) {
              duplicateCount++;
              processadosNesteBloco++;
              processedCount++;
              lastCursor = msg.id;
              lastAttachmentId = attachmentId;
              continue;
            }

            // Download do anexo
            const attUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${attachmentId}`;
            const attData = await gmailFetch(attUrl, authHeader);

            if (!attData.data) {
              errorCount++;
              processadosNesteBloco++;
              processedCount++;
              errorsDetail.push({
                messageId: msg.id,
                attachmentId,
                filename: part.filename,
                erro: 'Anexo sem dados (base64 vazio)',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            // Upload do ficheiro
            const fileBuffer = Uint8Array.from(atob(attData.data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
            const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
              file: new File([fileBuffer], part.filename, { type: part.mimeType || 'application/octet-stream' }),
            });

            const fileUrl = uploadResult?.file_url || uploadResult?.url || '';
            if (!fileUrl) {
              errorCount++;
              processadosNesteBloco++;
              processedCount++;
              errorsDetail.push({
                messageId: msg.id,
                attachmentId,
                filename: part.filename,
                erro: 'Falha no upload do ficheiro',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            // Criar DocumentIntake
            await base44.asServiceRole.entities.DocumentIntake.create({
              user_email: 'danielperini@museuscentro.com.br',
              user_name: 'Daniel Perini',
              arquivo_original_url: fileUrl,
              file_name_original: part.filename,
              mime_type: part.mimeType || 'application/octet-stream',
              tipo_detectado: part.filename.toLowerCase().endsWith('.xml') ? 'NOTA_FISCAL_XML' :
                              part.filename.toLowerCase().endsWith('.pdf') ? 'NOTA_FISCAL_PDF' : 'PENDENTE',
              status_processamento: 'ENVIADO',
              origem: 'GMAIL',
              gmail_message_id: messageId,
              gmail_subject: subject,
              gmail_from: from,
              gmail_date: full?.internalDate ? new Date(Number(full.internalDate)).toISOString() : new Date().toISOString(),
            });

            createdCount++;
            processadosNesteBloco++;
            processedCount++;
            lastCursor = msg.id;
            lastAttachmentId = attachmentId;
          }
        } catch (err) {
          errorCount++;
          processadosNesteBloco++;
          processedCount++;
          errorsDetail.push({
            messageId: msg.id,
            erro: err?.message || 'Erro desconhecido',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Recalcular pendentes
      const remaining = Math.max(0, (job.total_pending || 0) - processadosNesteBloco);
      const percentComplete = (job.total_pending || 1) > 0
        ? Math.round((processedCount / (job.total_pending || 1)) * 100)
        : 100;

      const isUltimoBloco = remaining <= 0;
      const proximoStatus = isUltimoBloco
        ? (errorCount > 0 ? 'CONCLUIDO_COM_ERROS' : 'CONCLUIDO')
        : 'AGUARDANDO_CONFIRMACAO';

      // Atualizar job
      job = await base44.asServiceRole.entities.EmailSyncJob.update(job.id, {
        status: proximoStatus,
        processed_count: processedCount,
        created_count: createdCount,
        updated_count: updatedCount,
        duplicate_count: duplicateCount,
        ignored_count: ignoredCount,
        error_count: errorCount,
        remaining_count: remaining,
        percent_complete: percentComplete,
        last_cursor: lastCursor,
        last_attachment_id: lastAttachmentId,
        errors_detail: errorsDetail,
        ...(isUltimoBloco ? { finished_at: new Date().toISOString() } : {}),
      });

      return Response.json({
        success: true,
        job,
        bloco: {
          numero: batchNumber,
          processados: processadosNesteBloco,
          criados: createdCount - (job.created_count || 0) + (processadosNesteBloco > 0 ? createdCount - (job.created_count || createdCount) : 0),
          duplicados: duplicateCount - (job.duplicate_count || 0),
          ignorados: ignoredCount - (job.ignored_count || 0),
          erros: errorCount - (job.error_count || 0),
          restantes: remaining,
          percentual: percentComplete,
        },
        continuar: action === 'processar_todos' && !isUltimoBloco,
      });
    }

    // 4. RETOMAR
    if (action === 'retomar') {
      const jobs = await base44.asServiceRole.entities.EmailSyncJob.list('-created_date', 1);
      const job = jobs?.[0];

      if (!job) {
        return Response.json({ success: false, error: 'Nenhuma sincronização para retomar.' });
      }

      if (job.status === 'CONCLUIDO' || job.status === 'CONCLUIDO_COM_ERROS') {
        return Response.json({
          success: true,
          job,
          mensagem: 'Sincronização já concluída.',
          concluido: true,
        });
      }

      return Response.json({
        success: true,
        job,
        mensagem: `Última sincronização interrompida no bloco ${job.current_batch || 0} de ${job.total_batches || 0}. Foram processados ${job.processed_count || 0} de ${job.total_pending || 0} ficheiros. Restam ${job.remaining_count || 0} ficheiros.`,
        pode_retomar: true,
      });
    }

    return Response.json({ success: false, error: `Ação desconhecida: ${action}` }, 400);

  } catch (error) {
    console.error('syncGmailBlocos error:', error);
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});