import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try {
      body = await req.json();
    } catch (_error) {
      body = {};
    }

    console.log('backupOnFileChange body:', body);

    const event = body?.event ?? body?.data?.event ?? body?.data ?? null;
    const eventType = event?.type ?? body?.type ?? null;

    // Ignora se não houver tipo ou se não for create/delete
    if (!eventType || !['create', 'delete'].includes(eventType)) {
      return Response.json({
        success: true,
        message: 'Evento ignorado',
        detectedEventType: eventType,
        receivedBody: body
      });
    }

    const response = await base44.asServiceRole.functions.invoke('backupToGoogleDrive');

    return Response.json({
      success: true,
      message: `Backup automático realizado após ${eventType} de arquivo`,
      backup_data: response?.data ?? null
    });
  } catch (error) {
    console.error('Error in backupOnFileChange:', error);

    return Response.json(
      {
        error: String(error?.message || error),
        success: false
      },
      { status: 500 }
    );
  }
});