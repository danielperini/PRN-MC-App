import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado. Apenas admin.' }, { status: 403 });
    }

    // Buscar todas as preferências de notificação
    const prefs = await base44.asServiceRole.entities.NotificationPreference.list('-created_date', 1000);

    let atualizadas = 0;

    // Desativar todas as notificações
    for (const pref of prefs) {
      await base44.asServiceRole.entities.NotificationPreference.update(pref.id, {
        receive_email_notifications: false,
        receive_in_app: false,
        receive_push: false
      });
      atualizadas++;
    }

    console.log(`${atualizadas} preferências de notificação desativadas`);

    return Response.json({
      success: true,
      message: `${atualizadas} notificações bloqueadas. Serão reativadas em 17/05/2026 às 00:00`,
      bloqueadas: atualizadas
    });

  } catch (error) {
    console.error('Erro ao bloquear notificações:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});