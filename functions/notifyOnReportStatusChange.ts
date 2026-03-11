import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    if (event.type !== 'update') {
      return Response.json({ success: true, reason: 'not_an_update' });
    }

    const report = data;
    const oldStatus = old_data?.status;
    const newStatus = report.status;

    // Notificar profissional quando relatório é devolvido (RETURNED)
    if (newStatus === 'RETURNED' && oldStatus !== 'RETURNED') {
      const notification = await base44.asServiceRole.entities.Notification.create({
        user_email: report.author_email || report.created_by,
        type: 'REPORT_RETURNED',
        title: 'Relatório devolvido para revisão',
        message: `Seu relatório (${report.numero_protocolo}) foi devolvido para revisão por ${report.reviewer_name || 'seu coordenador'}. Verifique os comentários e faça os ajustes necessários.`,
        report_id: report.id,
        action_url: `/ReportEditor?id=${report.id}`,
        read: false,
        email_sent: false
      });

      // Enviar email ao profissional
      await base44.integrations.Core.SendEmail({
        to: report.author_email || report.created_by,
        subject: `Relatório devolvido para revisão: ${report.numero_protocolo}`,
        body: `Olá ${report.author_name},\n\nSeu relatório do mês de ${report.mes_referencia}/${report.ano} foi devolvido para revisão.\n\nComentários do coordenador:\n${report.return_comment || '(Sem comentários específicos)'}\n\nAcesse a plataforma para visualizar os detalhes e fazer os ajustes necessários.\n\nAtenciosamente,\nPlataforma Museus Centro`
      });
    }

    // Notificar coordenadores quando novo relatório é enviado (SUBMITTED)
    if (newStatus === 'SUBMITTED' && oldStatus === 'DRAFT') {
      // Buscar todos os coordenadores do museu
      const coordinators = await base44.asServiceRole.entities.UserPermission.filter({
        base_role: 'COORDENADOR',
        can_review_reports: true
      }, 'user_email', 100);

      // Criar notificação para cada coordenador relevante
      for (const coord of coordinators) {
        const notification = await base44.asServiceRole.entities.Notification.create({
          user_email: coord.user_email,
          type: 'REPORT_SUBMITTED',
          title: 'Novo relatório enviado para revisão',
          message: `Um novo relatório foi enviado por ${report.author_name} (${report.museu}) - ${report.mes_referencia}/${report.ano}. Protocolo: ${report.numero_protocolo}`,
          report_id: report.id,
          action_url: `/CoordReview?filter=${report.museu}`,
          read: false,
          email_sent: false
        });
      }

      // Enviar email para coordenadores
      if (coordinators.length > 0) {
        const coordEmails = coordinators.map(c => c.user_email).join(', ');
        await base44.integrations.Core.SendEmail({
          to: coordinators[0].user_email,
          subject: `Novo relatório enviado para revisão: ${report.numero_protocolo}`,
          body: `Olá,\n\nUm novo relatório foi enviado para revisão:\n\nProfissional: ${report.author_name}\nMuseu: ${report.museu}\nPeríodo: ${report.mes_referencia}/${report.ano}\nProtocolo: ${report.numero_protocolo}\n\nAcesse a plataforma para revisar o relatório.\n\nAtenciosamente,\nPlataforma Museus Centro`
        });
      }
    }

    // Notificar profissional quando relatório é aprovado
    if (newStatus === 'APPROVED' && oldStatus !== 'APPROVED') {
      const notification = await base44.asServiceRole.entities.Notification.create({
        user_email: report.author_email || report.created_by,
        type: 'REPORT_APPROVED',
        title: 'Relatório aprovado',
        message: `Parabéns! Seu relatório (${report.numero_protocolo}) foi aprovado por ${report.reviewer_name || 'seu coordenador'}. Você pode agora exportar em PDF.`,
        report_id: report.id,
        action_url: `/ReportEditor?id=${report.id}`,
        read: false,
        email_sent: false
      });

      await base44.integrations.Core.SendEmail({
        to: report.author_email || report.created_by,
        subject: `Relatório aprovado: ${report.numero_protocolo}`,
        body: `Olá ${report.author_name},\n\nParabéns! Seu relatório do mês de ${report.mes_referencia}/${report.ano} foi aprovado.\n\nVocê pode agora acessar a plataforma para exportar o relatório em PDF.\n\nAtenciosamente,\nPlataforma Museus Centro`
      });
    }

    return Response.json({
      success: true,
      message: 'Notificações enviadas com sucesso'
    });
  } catch (error) {
    console.error('Erro ao enviar notificações:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});