import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const event = body?.event || body?.data?.event;
    if (!event || !event.entity_id) {
      return Response.json({ success: true, message: 'Evento inválido' });
    }

    const reportId = event.entity_id;
    const eventType = event.type; // 'create' ou 'update'

    // Buscar o relatório
    const report = await base44.asServiceRole.entities.Report.get(reportId);
    if (!report) {
      return Response.json({ success: false, error: 'Relatório não encontrado' }, { status: 404 });
    }

    const userEmail = report.created_by;
    const coordinatorEmails = await getCoordinatorEmails(base44);
    
    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    // Notificar coordenadores quando relatório for SUBMITTED
    if (report.status === 'SUBMITTED' && eventType === 'update') {
      for (const coordEmail of coordinatorEmails) {
        if (coordEmail !== ALLOWED_EMAIL) { console.log('Email bloqueado:', coordEmail); continue; }
        await base44.integrations.Core.SendEmail({
          to: coordEmail,
          subject: `📋 Novo Relatório Enviado para Revisão - ${report.author_name}`,
          body: formatCoordinatorSubmissionEmail(report, coordEmail)
        });
      }
    }

    // Notificar usuário quando relatório for RETURNED
    if (report.status === 'RETURNED' && eventType === 'update') {
      if (userEmail !== ALLOWED_EMAIL) { console.log('Email bloqueado:', userEmail); }
      else await base44.integrations.Core.SendEmail({
        to: userEmail,
        subject: `⚠️ Seu Relatório Foi Devolvido para Revisão`,
        body: formatUserReturnedEmail(report)
      });
    }

    // Notificar usuário quando relatório for APPROVED
    if (report.status === 'APPROVED' && eventType === 'update') {
      if (userEmail !== ALLOWED_EMAIL) { console.log('Email bloqueado:', userEmail); }
      else await base44.integrations.Core.SendEmail({
        to: userEmail,
        subject: `✅ Seu Relatório Foi Aprovado!`,
        body: formatUserApprovedEmail(report)
      });
    }

    return Response.json({ 
      success: true, 
      message: `Notificações enviadas para status: ${report.status}` 
    });
  } catch (error) {
    console.error('Erro em notifyOnReportStatusChange:', error);
    return Response.json({ 
      success: false, 
      error: error?.message || 'Erro ao enviar notificações' 
    }, { status: 500 });
  }
});

async function getCoordinatorEmails(base44) {
  try {
    const users = await base44.asServiceRole.entities.User.filter(
      { role: 'COORDENADOR' },
      '-created_date',
      100
    );
    return users.map(u => u.email).filter(Boolean);
  } catch {
    return [];
  }
}

function formatCoordinatorSubmissionEmail(report, coordEmail) {
  return `
Oi!

Temos um novo relatório de ${report.author_name} aguardando sua análise! 📋

✨ Detalhes rápidos:
• Período: ${report.mes_referencia}/${report.ano}
• Museu: ${report.museu}
• ${(report.atividades || []).length} atividade(s) registrada(s)
• Protocolo: ${report.numero_protocolo || 'N/A'}

Quando tiver um tempinho, é só acessar a plataforma para revisar. Pode aprovar direto ou deixar um comentário se precisar de ajustes. Confiamos no seu olhar! 👀

Grande abraço,
Plataforma de Relatórios
  `.trim();
}

function formatUserReturnedEmail(report) {
  const comment = report.return_comment || 'Sem comentários específicos';
  return `
Oi ${report.author_name}!

Seu relatório retornou com alguns apontamentos do coordenador. Nada de preocupante — só alguns detalhes para ajustar! 🔄

📋 Período: ${report.mes_referencia}/${report.ano}

💭 Feedback recebido:
${comment}

Depois que fizer os ajustes, é só reenviar. Confiamos no seu trabalho! 💪

Um abraço,
Plataforma de Relatórios
  `.trim();
}

function formatUserApprovedEmail(report) {
  return `
Oi ${report.author_name}! 🎉

Que legal! Seu relatório foi aprovado! Parabéns pelo excelente trabalho! ✨

📋 Período: ${report.mes_referencia}/${report.ano}
🏛️ Museu: ${report.museu}
${report.reviewer_name ? `👍 Aprovado por: ${report.reviewer_name}` : ''}

Obrigado por manter tudo em dia. Seu compromisso com a qualidade faz toda a diferença! 🙌

Um grande abraço,
Plataforma de Relatórios
  `.trim();
}