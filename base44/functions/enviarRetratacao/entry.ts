import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Função one-shot: envia email de retratação para todos os usuários cadastrados.
// Após execução, o bloqueio geral de emails permanece ativo em todas as demais funções.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: apenas admin pode executar esta ação' }, { status: 403 });
    }

    // Buscar todos os usuários cadastrados
    const users = await base44.asServiceRole.entities.User.list('', 1000);
    if (!users || users.length === 0) {
      return Response.json({ success: true, message: 'Nenhum usuário encontrado', sent: 0 });
    }

    const subject = 'Correção no sistema de notificações';
    const body = `Pedimos desculpas pelo envio indevido de emails anteriormente. O sistema foi corrigido e novas notificações serão enviadas de forma adequada. Agradecemos a compreensão.

Atenciosamente,
Equipe Museus Centro`;

    const results = [];

    for (const u of users) {
      const email = u.email;
      if (!email) continue;

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject,
          body,
          from_name: 'Museus Centro',
        });
        results.push({ email, success: true });
        console.log('Retratação enviada para:', email);
      } catch (err) {
        results.push({ email, success: false, error: err?.message || 'erro' });
        console.error('Erro ao enviar retratação para', email, ':', err?.message);
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return Response.json({
      success: true,
      message: `Retratação enviada. Enviados: ${sent}, Falhas: ${failed}`,
      sent,
      failed,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});