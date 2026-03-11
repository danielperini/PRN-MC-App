import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (!data || !event) {
      return Response.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const { file_name, description, activity_id } = data;

    // Buscar coordenadores e admins para notificar
    const users = await base44.asServiceRole.entities.User.list();
    const coordsAndAdmins = users.filter(u => u.role === 'admin' || u.role === 'coordenador');

    // Criar notificações para cada coordenador/admin
    for (const user of coordsAndAdmins) {
      await base44.asServiceRole.entities.Notification.create({
        user_email: user.email,
        type: 'FILE_ATTACHED',
        title: '📎 Novo arquivo anexado',
        message: `Arquivo "${file_name}" foi anexado ${description ? `- ${description.substring(0, 50)}` : ''}`,
        action_url: '/GestorArquivos',
        read: false,
        email_sent: false,
      });
    }

    return Response.json({ success: true, notified: coordsAndAdmins.length });
  } catch (error) {
    console.error('Erro ao criar notificação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});