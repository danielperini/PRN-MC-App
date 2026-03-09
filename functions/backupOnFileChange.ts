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

    const event = body?.event ?? body?.data?.event ?? body?.data ?? null;
    const eventType = event?.type ?? body?.type ?? null;

    if (!eventType || !['create', 'delete'].includes(eventType)) {
      return Response.json({
        success: true,
        message: 'Evento ignorado',
        detectedEventType: eventType,
      });
    }

    try {
      const response = await base44.asServiceRole.functions.invoke('backupToGoogleDrive');

      return Response.json({
        success: true,
        message: `Backup automático realizado após ${eventType} de arquivo`,
        backup_data: response?.data ?? null
      });
    } catch (invokeError) {
      console.error('Erro ao invocar backupToGoogleDrive:', invokeError);

      return Response.json(
        {
          success: false,
          stage: 'invoke backupToGoogleDrive',
          message: `Falha ao invocar backup após ${eventType} de arquivo`,
          error: String(invokeError?.message || invokeError)
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in backupOnFileChange:', error);

    return Response.json(
      {
        success: false,
        stage: 'backupOnFileChange',
        error: String(error?.message || error)
      },
      { status: 500 }
    );
  }
});