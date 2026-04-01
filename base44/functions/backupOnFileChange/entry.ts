import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function extractEvent(body: any) {
  return body?.event || body?.data?.event || body?.data || null;
}

function extractEventType(body: any, event: any) {
  return event?.type || body?.type || null;
}

function extractAttachmentId(body: any, event: any) {
  return (
    body?.attachment_id ||
    body?.entity_id ||
    event?.entity_id ||
    body?.data?.entity_id ||
    body?.data?.event?.entity_id ||
    null
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const event = extractEvent(body);
    const eventType = extractEventType(body, event);
    const attachmentId = extractAttachmentId(body, event);

    if (!eventType) {
      return Response.json({
        success: true,
        message: 'Evento ignorado: type não encontrado',
        detectedEventType: null,
        receivedBody: body
      });
    }

    if (eventType !== 'create') {
      return Response.json({
        success: true,
        message: `Evento ignorado: ${eventType}`,
        detectedEventType: eventType,
        receivedBody: body
      });
    }

    if (!attachmentId) {
      return Response.json({
        success: true,
        message: 'Evento ignorado: attachment/entity_id não encontrado',
        detectedEventType: eventType,
        receivedBody: body
      });
    }

    const attachment = await base44.asServiceRole.entities.Attachment.get(attachmentId).catch(() => null);

    if (!attachment) {
      return Response.json({
        success: true,
        message: 'Evento ignorado: Attachment não encontrado',
        detectedEventType: eventType,
        attachment_id: attachmentId
      });
    }

    let response;

    if (attachment.nf_tipo_documento) {
      response = await base44.asServiceRole.functions.invoke('backupNotasFiscaisToDrive', {
        attachment_id: attachmentId
      });
    } else {
      response = await base44.asServiceRole.functions.invoke('backupSingleFile', {
        attachment_id: attachmentId
      });
    }

    return Response.json({
      success: true,
      message: 'Backup automático realizado após criação de arquivo',
      detectedEventType: eventType,
      attachment_id: attachmentId,
      backup_data: response?.data || null
    });
  } catch (error: any) {
    console.error('Error in backupOnFileChange:', error);

    return Response.json(
      {
        success: false,
        error: error?.message ? String(error.message) : String(error)
      },
      { status: 500 }
    );
  }
});
