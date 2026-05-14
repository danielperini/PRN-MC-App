import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar todas as preferências
    const prefs = await base44.asServiceRole.entities.NotificationPreference.list('-created_date', 1000);

    let atualizadas = 0;

    // Reativar todas as notificações
    for (const pref of prefs) {
      await base44.asServiceRole.entities.NotificationPreference.update(pref.id, {
        receive_email_notifications: true,
        receive_in_app: true
      });
      atualizadas++;
    }

    console.log(`${atualizadas} notificações reativadas em 17/05/2026 00:00`);

    return Response.json({
      success: true,
      message: `${atualizadas} notificações reativadas`,
      reativadas: atualizadas
    });

  } catch (error) {
    console.error('Erro ao reativar notificações:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});