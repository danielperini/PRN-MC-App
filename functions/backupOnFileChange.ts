import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    createClientFromRequest(req);

    let body = {};
    try {
      body = await req.json();
    } catch (_e) {
      body = {};
    }

    const event = body?.event ?? null;
    const eventType = event?.type ?? null;

    if (!eventType || !['create', 'delete'].includes(eventType)) {
      return Response.json({
        success: true,
        message: 'Evento ignorado',
        detectedEventType: eventType,
        receivedBody: body
      });
    }

    return Response.json({
      success: true,
      message: `Evento ${eventType} detectado com sucesso`,
      detectedEventType: eventType
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: String(error?.message || error)
      },
      { status: 500 }
    );
  }
});;