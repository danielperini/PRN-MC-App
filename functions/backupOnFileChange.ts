import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rawBody = await req.clone().text();
    let body = {};

    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch (_e) {
      body = {};
    }

    console.log('rawBody:', rawBody);
    console.log('body:', body);

    const eventData = body?.data || {};
    const eventType = eventData?.type || body?.type || 'unknown';

    console.log('eventType:', eventType);

    const reports = await base44.asServiceRole.entities.Report.list();
    const attachments = await base44.asServiceRole.entities.Attachment.list();

    const backupData = {
      success: true,
      message: 'Backup realizado com sucesso',
      timestamp: new Date().toISOString(),
      eventType,
      reportsCount: Array.isArray(reports) ? reports.length : 0,
      attachmentsCount: Array.isArray(attachments) ? attachments.length : 0
    };

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Backup automático executado',
        backup_data: backupData
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Erro em backupOnFileChange:', error?.message);
    console.error(error?.stack);

    return new Response(
      JSON.stringify({
        success: false,
        error: String(error?.message || error)
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
});