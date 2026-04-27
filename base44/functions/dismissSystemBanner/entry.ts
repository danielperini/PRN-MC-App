import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { messageId } = body;

    if (!messageId) {
      return Response.json({ error: 'messageId obrigatório' }, { status: 400 });
    }

    const msg = await base44.asServiceRole.entities.SystemMessage.get(messageId);
    if (!msg) {
      return Response.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    }

    const already = msg.banner_dispensado_por || [];
    if (already.includes(user.email)) {
      return Response.json({ ok: true }); // já dispensado
    }

    await base44.asServiceRole.entities.SystemMessage.update(messageId, {
      banner_dispensado_por: [...already, user.email],
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});