import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { to, subject, body: emailBody } = body;

    if (!to || !subject || !emailBody) {
      return Response.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
    }

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    if (to !== ALLOWED_EMAIL) {
      console.log('Email bloqueado:', to);
      return Response.json({ success: true, skipped: true });
    }
    const result = await base44.integrations.Core.SendEmail({
      to,
      subject,
      body: emailBody,
      from_name: 'Museu Centro'
    });

    return Response.json({ success: true, message: 'Email enviado com sucesso', result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});