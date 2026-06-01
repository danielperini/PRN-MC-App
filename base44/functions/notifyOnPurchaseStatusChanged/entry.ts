import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Triggered when a PurchaseRequest status changes
 * Sends smart notifications based on user role and status
 */
async function isEmailPaused(base44) {
  try {
    const configs = await base44.asServiceRole.entities.MetadadosConfig.filter({ categoria: 'sistema', valor: 'notificacoes_email_pausadas' });
    return Array.isArray(configs) && configs.length > 0 && configs[0].ativo === true;
  } catch { return false; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const {
      purchase_id,
      old_status,
      new_status,
      changed_by_email,
      user_email,
      description,
      value,
      museum
    } = payload;

    if (!purchase_id || !new_status || !user_email) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (await isEmailPaused(base44)) {
      console.log('[notifyOnPurchaseStatusChanged] Envio de e-mails pausado globalmente.');
      return Response.json({ success: true, skipped: true, reason: 'email_pausado' });
    }

    // Determine notification type based on status
    let notificationType = null;
    let title = '';
    let message = '';
    let priority = 'normal';
    let category = 'financial';

    switch (new_status) {
      case 'APROVADO_ADMIN':
        notificationType = 'purchase_approved_admin';
        title = 'Solicitação de Compra Aprovada';
        message = `Sua solicitação de compra foi aprovada. Descrição: ${description}. Valor: R$ ${value?.toFixed(2) || '0,00'}`;
        priority = 'high';
        break;

      case 'PAGO':
        notificationType = 'purchase_paid';
        title = 'Pagamento Realizado';
        message = `O pagamento da sua solicitação foi processado. ${description}`;
        priority = 'high';
        break;

      case 'DEVOLVIDO':
        notificationType = 'purchase_returned';
        title = 'Solicitação de Compra Devolvida';
        message = `Sua solicitação foi devolvida para ajustes. Por favor, revise e reenvie. ${description}`;
        priority = 'high';
        break;

      case 'RECUSADO':
        notificationType = 'purchase_rejected';
        title = 'Solicitação de Compra Recusada';
        message = `Sua solicitação de compra foi recusada. ${description}`;
        priority = 'high';
        break;

      default:
        return Response.json({ message: 'Status not notifiable' });
    }

    if (!notificationType) {
      return Response.json({ message: 'No notification needed for this status' });
    }

    // Send notification
    const result = await base44.functions.invoke('sendNotificationToUser', {
      user_email,
      title,
      message,
      category,
      type: notificationType,
      priority,
      related_entity_type: 'PurchaseRequest',
      related_entity_id: purchase_id,
      action_url: `/Compras?purchase_id=${purchase_id}`,
      museum
    });

    // Log the notification event
    console.log(`Notification sent: ${notificationType} to ${user_email}`);

    return Response.json({
      success: true,
      notification_result: result
    });
  } catch (error) {
    console.error('Error in notifyOnPurchaseStatusChanged:', error);
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});