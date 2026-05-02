import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verifica se é coordenador ou admin
    const allowedRoles = ['COORDENADOR', 'ADMIN', 'admin', 'COORD_PRODUCAO', 'COORD_ADMINISTRATIVA',
      'COORD_COMUNICACAO', 'COORD_PROGRAMACAO', 'CONSULTORIA_PROGRAMACAO'];
    const isAdmin = user.role === 'admin' || user.role === 'ADMIN';
    const isCoordenador = allowedRoles.includes(user.role);
    const isCoordGeral = user.email === 'daniel@periniprojetos.com.br';

    if (!isAdmin && !isCoordenador && !isCoordGeral) {
      return Response.json({ error: 'Acesso negado. Apenas coordenadores e admins podem enviar mensagens.' }, { status: 403 });
    }

    const body = await req.json();
    const { messageId, destinatarios, assunto, corpo, enviar_email, titulo } = body;

    if (!messageId) {
      return Response.json({ error: 'messageId obrigatório' }, { status: 400 });
    }

    if (!destinatarios || destinatarios.length === 0) {
      return Response.json({ error: 'Selecione ao menos um destinatário.' }, { status: 400 });
    }

    // Evita envio duplicado
    const existing = await base44.asServiceRole.entities.SystemMessage.get(messageId);
    if (existing?.status === 'enviado') {
      return Response.json({ error: 'Mensagem já foi enviada anteriormente.' }, { status: 400 });
    }

    let emailsSent = 0;
    let emailErrors = [];

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    if (enviar_email) {
      for (const email of destinatarios) {
        if (email !== ALLOWED_EMAIL) { console.log('Email bloqueado:', email); continue; }
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: email,
            subject: assunto,
            body: `${corpo}\n\n---\nEnviado por: ${user.full_name || user.email}\nPlataforma Museus Centro`,
            from_name: `${user.full_name || 'Museus Centro'} via Plataforma`,
          });
          emailsSent++;
        } catch (e) {
          emailErrors.push(email);
        }
      }
    }

    const status = emailErrors.length === destinatarios.length && enviar_email ? 'erro' : 'enviado';

    await base44.asServiceRole.entities.SystemMessage.update(messageId, {
      status,
      enviado_em: new Date().toISOString(),
      total_destinatarios: destinatarios.length,
      destinatarios,
      remetente_email: user.email,
      remetente_nome: user.full_name || user.email,
      erro_detalhe: emailErrors.length > 0 ? `Falhou para: ${emailErrors.join(', ')}` : null,
    });

    return Response.json({
      ok: true,
      emailsSent,
      emailErrors,
      total: destinatarios.length,
      status,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});