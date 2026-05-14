import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Emails autorizados para receber notificações de compras
    const emailsAutorizados = [
      'daniel',
      'josiane'
    ];

    // Buscar todas as preferências de notificação
    const prefs = await base44.asServiceRole.entities.NotificationPreference.list('-created_date', 1000);

    let bloqueadas = 0;
    let mantidas = 0;

    // Processar cada preferência
    for (const pref of prefs) {
      const userEmail = (pref.user_email || '').toLowerCase();
      const isAutorizado = emailsAutorizados.some(email => userEmail.includes(email));

      if (isAutorizado) {
        // Manter ativadas para Daniel e Josiane
        mantidas++;
      } else {
        // Bloquear notificações de compras para os outros
        await base44.asServiceRole.entities.NotificationPreference.update(pref.id, {
          notification_categories: {
            ...pref.notification_categories,
            approvals: false,
            financial: false
          }
        });
        bloqueadas++;
      }
    }

    console.log(`Notificações restritas: ${bloqueadas} bloqueadas, ${mantidas} autorizados`);

    return Response.json({
      success: true,
      message: `Notificações restritas. ${mantidas} autorizados. ${bloqueadas} bloqueados.`,
      bloqueadas,
      mantidas
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});