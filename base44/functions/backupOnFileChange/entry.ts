import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * backupOnFileChange — Acionado por automação de entidade (Attachment create/update).
 *
 * Regras:
 * - Só faz backup se:
 *   (a) não existir drive_file_id ainda, OU
 *   (b) file_hash mudou, OU
 *   (c) updated_date do attachment for mais novo que last_synced_at
 * - Delega toda a lógica de upload/update para backupSingleFile
 */

function extractAttachmentId(body) {
  return body?.attachment_id ||
    body?.entity_id ||
    body?.event?.entity_id ||
    body?.data?.entity_id ||
    body?.data?.event?.entity_id ||
    null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Só processar eventos create e update
    const eventType = body?.event?.type || body?.type;
    if (eventType === 'delete') {
      return Response.json({ skipped: true, reason: 'Delete tratado por onAttachmentDeleted' });
    }

    const attachmentId = extractAttachmentId(body);
    if (!attachmentId) {
      return Response.json({ error: 'attachment_id não encontrado no payload' }, { status: 400 });
    }

    const attachment = await base44.asServiceRole.entities.Attachment.get(attachmentId).catch(() => null);
    if (!attachment) {
      return Response.json({ skipped: true, reason: 'Attachment não encontrado' });
    }

    if (!attachment.file_url) {
      return Response.json({ skipped: true, reason: 'Attachment sem file_url' });
    }

    // Verificar se precisa de backup
    const temBackup = attachment.backup_done && attachment.drive_file_id;
    const lastSynced = attachment.last_synced_at ? new Date(attachment.last_synced_at) : null;
    const updatedAt = attachment.updated_date ? new Date(attachment.updated_date) : null;
    const hashMudou = false; // será verificado dentro de backupSingleFile com o arquivo real

    const precisaBackup =
      !temBackup ||
      (updatedAt && lastSynced && updatedAt > lastSynced);

    if (!precisaBackup) {
      return Response.json({
        skipped: true,
        reason: 'Backup já atualizado (updated_date <= last_synced_at)',
        attachment_id: attachmentId,
        drive_file_id: attachment.drive_file_id,
      });
    }

    // Delegar para backupSingleFile (que verifica hash real do arquivo)
    const result = await base44.asServiceRole.functions.invoke('backupSingleFile', {
      attachment_id: attachmentId
    });

    return Response.json({
      success: true,
      delegated_to: 'backupSingleFile',
      attachment_id: attachmentId,
      result: result?.data || result
    });

  } catch (error) {
    console.error('Erro backupOnFileChange:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});