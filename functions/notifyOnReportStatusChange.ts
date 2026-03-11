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
    
    // Notificar coordenadores quando relatório for SUBMITTED
    if (report.status === 'SUBMITTED' && eventType === 'update') {
      for (const coordEmail of coordinatorEmails) {
        await base44.integrations.Core.SendEmail({
          to: coordEmail,
          subject: `📋 Novo Relatório Enviado para Revisão - ${report.author_name}`,
          body: formatCoordinatorSubmissionEmail(report, coordEmail)
        });
      }
    }

    // Notificar usuário quando relatório for RETURNED
    if (report.status === 'RETURNED' && eventType === 'update') {
      await base44.integrations.Core.SendEmail({
        to: userEmail,
        subject: `⚠️ Seu Relatório Foi Devolvido para Revisão`,
        body: formatUserReturnedEmail(report)
      });
    }

    // Notificar usuário quando relatório for APPROVED
    if (report.status === 'APPROVED' && eventType === 'update') {
      await base44.integrations.Core.SendEmail({
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
Olá Coordenador,

Um novo relatório foi enviado para revisão:

📋 Relatório: ${report.numero_protocolo || 'N/A'}
👤 Profissional: ${report.author_name}
🏛️ Museu: ${report.museu}
📅 Período: ${report.mes_referencia}/${report.ano}
📊 Atividades: ${(report.atividades || []).length} atividade(s)

O relatório está aguardando sua revisão. Acesse a plataforma para visualizar os detalhes e tomar as ações necessárias (aprovar, devolver para revisão, etc).

Abraços,
Plataforma de Relatórios
  `.trim();
}

function formatUserReturnedEmail(report) {
  const comment = report.return_comment || 'Nenhum comentário específico';
  return `
Olá ${report.author_name},

Seu relatório foi devolvido para revisão com comentários do coordenador:

📋 Relatório: ${report.numero_protocolo || 'N/A'}
📅 Período: ${report.mes_referencia}/${report.ano}

💬 Comentários:
${comment}

Por favor, faça as correções necessárias e reenvie o relatório para nova análise.

Abraços,
Plataforma de Relatórios
  `.trim();
}

function formatUserApprovedEmail(report) {
  return `
Olá ${report.author_name},

Excelentes notícias! Seu relatório foi aprovado pela coordenação. 🎉

📋 Relatório: ${report.numero_protocolo || 'N/A'}
📅 Período: ${report.mes_referencia}/${report.ano}
🏛️ Museu: ${report.museu}

${report.reviewer_name ? `✅ Aprovado por: ${report.reviewer_name}` : ''}

Obrigado pelo excelente trabalho!

Abraços,
Plataforma de Relatórios
  `.trim();
}