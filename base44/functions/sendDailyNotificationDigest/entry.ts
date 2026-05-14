import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Scheduled function to send daily notification digests
 * Should be called once per day (e.g., 8:00 AM)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all users with email notifications enabled and daily frequency
    const preferences = await base44.asServiceRole.entities.NotificationPreference.filter(
      {
        receive_email_notifications: true,
        email_frequency: 'daily'
      },
      '-updated_at',
      1000
    );

    if (!preferences || preferences.length === 0) {
      return Response.json({ message: 'No users with daily digest preference' });
    }

    let digestsSent = 0;
    let digestsFailed = 0;

    // Process each user
    for (const pref of preferences) {
      try {
        // Get unread notifications for this user from the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const notifications = await base44.asServiceRole.entities.SystemNotification.filter(
          {
            user_email: pref.user_email,
            status: 'unread',
            created_at: { $gte: oneDayAgo }
          },
          '-created_at',
          100
        );

        if (!notifications || notifications.length === 0) {
          continue; // No notifications for this user
        }

        // Check if notifications should respect category preferences
        const filteredNotifications = notifications.filter(n =>
          pref.notification_categories?.[n.category] ?? true
        );

        if (filteredNotifications.length === 0) {
          continue;
        }

        // Group by category
        const groupedByCategory = {};
        for (const notif of filteredNotifications) {
          if (!groupedByCategory[notif.category]) {
            groupedByCategory[notif.category] = [];
          }
          groupedByCategory[notif.category].push(notif);
        }

        // Generate digest email
        const emailResult = await sendDigestEmail(
          base44,
          pref.email_address || pref.user_email,
          groupedByCategory,
          pref
        );

        if (emailResult.success) {
          // Mark all sent notifications with email_sent flag
          for (const notif of filteredNotifications) {
            try {
              await base44.asServiceRole.entities.SystemNotification.update(notif.id, {
                email_sent: true,
                email_sent_at: new Date().toISOString()
              });
            } catch (updateError) {
              console.error(`Error updating notification ${notif.id}:`, updateError);
            }
          }

          // Update last email sent time
          await base44.asServiceRole.entities.NotificationPreference.update(pref.id, {
            last_email_sent_at: new Date().toISOString()
          });

          digestsSent++;
        } else {
          digestsFailed++;
        }
      } catch (userError) {
        console.error(`Error processing user ${pref.user_email}:`, userError);
        digestsFailed++;
      }
    }

    return Response.json({
      success: true,
      digests_sent: digestsSent,
      digests_failed: digestsFailed,
      total_processed: preferences.length
    });
  } catch (error) {
    console.error('Error in sendDailyNotificationDigest:', error);
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});

async function sendDigestEmail(base44, email, groupedNotifications, preferences) {
  try {
    const categoryLabels = {
      system: 'Sistema',
      financial: 'Financeiro',
      reports: 'Relatórios',
      programming: 'Programação',
      communication: 'Comunicação',
      web_clipping: 'Web & Clipping',
      approvals: 'Aprovações',
      documents: 'Documentos',
      agenda: 'Agenda',
      ai_suggestions: 'Sugestões de IA',
      backup: 'Backup',
      team: 'Equipe'
    };

    // Build HTML email
    let htmlContent = `
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 24px; color: #000; }
    .header p { margin: 5px 0 0 0; color: #666; }
    .category { margin-bottom: 20px; }
    .category h2 { font-size: 16px; color: #000; border-bottom: 2px solid #ddd; padding-bottom: 10px; margin: 0 0 10px 0; }
    .notification { background-color: #f9f9f9; padding: 12px; margin-bottom: 10px; border-radius: 4px; border-left: 3px solid #999; }
    .notification-title { font-weight: bold; color: #000; margin-bottom: 5px; }
    .notification-message { color: #555; font-size: 14px; margin-bottom: 5px; }
    .notification-time { color: #999; font-size: 12px; }
    .cta-button { display: inline-block; background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
    .footer { border-top: 1px solid #ddd; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #666; }
    .footer a { color: #0066cc; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Resumo de Notificações</h1>
      <p>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
`;

    // Add each category
    for (const [category, notifications] of Object.entries(groupedNotifications)) {
      const categoryLabel = categoryLabels[category] || category;
      htmlContent += `
    <div class="category">
      <h2>${categoryLabel} (${notifications.length})</h2>
`;

      // Add notifications for this category (max 5)
      for (const notif of notifications.slice(0, 5)) {
        htmlContent += `
      <div class="notification">
        <div class="notification-title">${notif.title}</div>
        <div class="notification-message">${notif.message}</div>
        <div class="notification-time">${new Date(notif.created_at).toLocaleString('pt-BR')}</div>
        ${notif.action_url ? `<a href="${notif.action_url}" class="cta-button">Ver detalhes</a>` : ''}
      </div>
`;
      }

      if (notifications.length > 5) {
        htmlContent += `<p style="color: #999; font-size: 12px;">... e mais ${notifications.length - 5} notificação(ões)</p>`;
      }

      htmlContent += `</div>`;
    }

    htmlContent += `
    <div class="footer">
      <p><strong>Gerenciar preferências:</strong> [link para preferências de notificações]</p>
      <p><a href="[unsubscribe-link]">Cancelar assinatura de notificações por email</a></p>
      <p>Você está recebendo este e-mail porque possui cadastro no sistema Museus Centro / Viaduto das Artes.</p>
    </div>
  </div>
</body>
</html>
    `;

    const subject = '[Museus Centro] Resumo de notificações do dia';

    // Send email
    await base44.integrations.Core.SendEmail({
      to: email,
      subject,
      body: htmlContent,
      from_name: 'Museus Centro'
    });

    return { success: true };
  } catch (error) {
    console.error('SendEmail error:', error);
    return { success: false, error: error.message };
  }
}