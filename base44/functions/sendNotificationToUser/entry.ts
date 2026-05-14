import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const {
      user_email,
      title,
      message,
      category,
      type,
      priority = 'normal',
      related_entity_type,
      related_entity_id,
      action_url,
      museum
    } = payload;

    if (!user_email || !title || !message || !category || !type) {
      return Response.json(
        { error: 'Missing required fields: user_email, title, message, category, type' },
        { status: 400 }
      );
    }

    // Get user preferences
    const preferences = await base44.asServiceRole.entities.NotificationPreference.filter(
      { user_email }
    );
    const prefs = preferences?.[0];

    if (!prefs) {
      // Create default preferences
      await base44.asServiceRole.entities.NotificationPreference.create({
        user_email,
        user_role: payload.user_role || 'profissional',
        email_address: user_email,
        receive_email_notifications: true,
        email_frequency: 'daily',
        receive_in_app: true,
        notification_categories: {
          system: true,
          financial: true,
          reports: true,
          programming: true,
          communication: true,
          web_clipping: true,
          approvals: true,
          documents: true,
          agenda: true,
          ai_suggestions: true,
          backup: true,
          team: true
        }
      });
    }

    // Check if category is enabled
    const categoryEnabled = prefs?.notification_categories?.[category] ?? true;
    if (!categoryEnabled) {
      return Response.json({ message: 'Category disabled for this user', sent: false });
    }

    // Create in-app notification if enabled
    let notificationId = null;
    if (prefs?.receive_in_app !== false) {
      const notification = await base44.asServiceRole.entities.SystemNotification.create({
        user_email,
        title,
        message,
        category,
        type,
        priority,
        related_entity_type,
        related_entity_id,
        action_url,
        status: 'unread',
        museum,
        created_at: new Date().toISOString()
      });
      notificationId = notification.id;
    }

    // Send email if enabled
    let emailSent = false;
    if (prefs?.receive_email_notifications && prefs?.email_address) {
      try {
        // Check frequency settings
        if (prefs.email_frequency !== 'disabled') {
          // For immediate, send right away
          if (prefs.email_frequency === 'immediate' || priority === 'critical') {
            const emailResult = await sendEmailNotification(
              base44,
              prefs.email_address,
              title,
              message,
              category,
              action_url
            );
            emailSent = emailResult.success;

            // Update notification with email sent status
            if (notificationId) {
              await base44.asServiceRole.entities.SystemNotification.update(notificationId, {
                email_sent: true,
                email_sent_at: new Date().toISOString()
              });
            }

            // Log email event
            if (emailSent && notificationId) {
              await base44.asServiceRole.entities.NotificationLog.create({
                notification_id: notificationId,
                user_email,
                event_type: 'email_sent',
                category,
                priority,
                delivery_method: 'email',
                status: 'success',
                timestamp: new Date().toISOString()
              });
            }
          }
          // For daily/weekly, notifications are batched by a scheduled function
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Log email failure
        if (notificationId) {
          await base44.asServiceRole.entities.NotificationLog.create({
            notification_id: notificationId,
            user_email,
            event_type: 'email_failed',
            category,
            priority,
            delivery_method: 'email',
            status: 'failed',
            error_message: emailError.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Log in-app notification event
    if (notificationId) {
      await base44.asServiceRole.entities.NotificationLog.create({
        notification_id: notificationId,
        user_email,
        event_type: 'sent',
        category,
        priority,
        delivery_method: 'in_app',
        status: 'success',
        timestamp: new Date().toISOString()
      });
    }

    return Response.json({
      success: true,
      notification_id: notificationId,
      email_sent: emailSent,
      message: 'Notification processed successfully'
    });
  } catch (error) {
    console.error('Error in sendNotificationToUser:', error);
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});

async function sendEmailNotification(base44, email, title, message, category, actionUrl) {
  try {
    const subject = `[Museus Centro] ${title}`;
    const body = `
${title}

${message}

${actionUrl ? `Link: ${actionUrl}` : ''}

---

Gerenciar preferências: [link para preferências]
Cancelar assinatura: [link para cancelar]

Você está recebendo este e-mail porque possui cadastro no sistema Museus Centro / Viaduto das Artes.
    `.trim();

    // Use SendEmail integration
    await base44.integrations.Core.SendEmail({
      to: email,
      subject,
      body,
      from_name: 'Museus Centro'
    });

    return { success: true };
  } catch (error) {
    console.error('SendEmail error:', error);
    return { success: false, error: error.message };
  }
}