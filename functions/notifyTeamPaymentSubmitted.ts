import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { team_member_name, mes, ano, valor } = await req.json();

    // Buscar coordenadores
    const coordenadores = await base44.asServiceRole.entities.UserPermission.filter({
      base_role: 'COORDENADOR'
    });

    const adminUsers = await base44.asServiceRole.entities.User.list();
    const admins = adminUsers.filter(u => u.role === 'admin');

    const notifyEmails = [
      ...coordenadores.map(c => c.user_email),
      ...admins.map(a => a.email)
    ];

    // Notificar cada coordenador
    for (const email of notifyEmails) {
      const subject = `[Equipe] Nova Nota Fiscal - ${team_member_name} (${mes}/${ano})`;
      const body = `Olá,\n\nUm novo pagamento foi submetido para aprovação:\n\nMembro: ${team_member_name}\nPeriodo: ${mes}/${ano}\nValor: R$ ${valor.toFixed(2)}\n\nAcesse o painel de aprovações para revisar.\n\nAtenciosamente,\nSistema de Suprimentos`;

      try {
        await base44.integrations.Core.SendEmail({
          to: email,
          subject,
          body
        });
      } catch (err) {
        console.error(`Erro ao enviar email para ${email}:`, err);
      }
    }

    return Response.json({ success: true, notified: notifyEmails.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});