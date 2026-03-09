import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try {
      body = await req.json();
    } catch (_e) {
      body = {};
    }

    const event =
      body?.event ??
      body?.data?.event ??
      body?.data ??
      null;

    const eventType =
      event?.type ??
      body?.type ??
      null;

    if (!eventType) {
      return Response.json({
        success: true,
        message: 'Evento ignorado: type não encontrado',
        detectedEventType: null,
        receivedBody: body
      });
    }

    if (!['create', 'delete'].includes(eventType)) {
      return Response.json({
        success: true,
        message: `Evento ignorado: ${eventType}`,
        detectedEventType: eventType,
        receivedBody: body
      });
    }

    const response = await base44.asServiceRole.functions.invoke('backupToGoogleDrive');

    return Response.json({
      success: true,
      message: `Backup automático realizado após ${eventType} de arquivo`,
      detectedEventType: eventType,
      backup_data: response?.data ?? null
    });
  } catch (error: any) {
    console.error('Error in backupOnFileChange:', error);

    return Response.json(
      {
        success: false,
        error: String(error?.message || error)
      },
      { status: 500 }
    );
  }
});