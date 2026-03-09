import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try {
      body = await req.json();
    } catch (_e) {
      body = {};
    }

    const event =
      body && body.event
        ? body.event
        : body && body.data && body.data.event
          ? body.data.event
          : body && body.data
            ? body.data
            : null;

    const eventType =
      event && event.type
        ? event.type
        : body && body.type
          ? body.type
          : null;

    if (!eventType) {
      return Response.json({
        success: true,
        message: 'Evento ignorado: type não encontrado',
        detectedEventType: null,
        receivedBody: body
      });
    }

    if (eventType !== 'create' && eventType !== 'delete') {
      return Response.json({
        success: true,
        message: 'Evento ignorado: ' + eventType,
        detectedEventType: eventType,
        receivedBody: body
      });
    }

    const response = await base44.asServiceRole.functions.invoke('backupToGoogleDrive');

    return Response.json({
      success: true,
      message: 'Backup automático realizado após ' + eventType + ' de arquivo',
      detectedEventType: eventType,
      backup_data: response && response.data ? response.data : null
    });
  } catch (error) {
    console.error('Error in backupOnFileChange:', error);

    return Response.json(
      {
        success: false,
        error: error && error.message ? String(error.message) : String(error)
      },
      { status: 500 }
    );
  }
});