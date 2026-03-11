import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, old_data } = payload;

    // Apenas processar eventos de UPDATE
    if (event.type !== 'update' || !data) {
      return new Response(JSON.stringify({ processed: false }), { status: 200 });
    }

    const purchase = data;
    const previousStatus = old_data?.status;
    const newStatus = purchase.status;

    // Apenas enviar notificação se status mudou
    if (previousStatus === newStatus) {
      return new Response(JSON.stringify({ processed: false }), { status: 200 });
    }

    // Buscar dados do relatório associado para obter email do solicitante
    let solicitante_email = purchase.created_by;
    let solicitante_nome = 'Solicitante';

    if (purchase.report_id) {
      const report = await base44.asServiceRole.entities.Report.get(purchase.report_id);
      if (report) {
        solicitante_email = report.created_by || purchase.created_by;
        solicitante_nome = report.author_name || 'Solicitante';
      }
    }

    // Mensagens personalizadas por status
    const statusMessages = {
      APROVADO: {
        titulo: '✅ Solicitação de Compra Aprovada',
        assunto: 'Sua solicitação de compra foi APROVADA',
        mensagem: `Bom dia ${solicitante_nome},\n\nTemos o prazer de informar que sua solicitação de compra foi APROVADA.\n\nDetalhes:\n- Descrição: ${purchase.descricao_item}\n- Valor: R$ ${(purchase.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- Protocolo: ${purchase.numero_protocolo || purchase.id}\n\nVocê pode acompanhar o andamento no sistema.`,
        tipo: 'PURCHASE_APPROVED',
      },
      REJEITADO: {
        titulo: '❌ Solicitação de Compra Rejeitada',
        assunto: 'Sua solicitação de compra foi REJEITADA',
        mensagem: `Prezado(a) ${solicitante_nome},\n\nInformamos que sua solicitação de compra foi REJEITADA.\n\nDetalhes:\n- Descrição: ${purchase.descricao_item}\n- Valor: R$ ${(purchase.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- Protocolo: ${purchase.numero_protocolo || purchase.id}\n\nSe houver dúvidas, entre em contato com o coordenador financeiro.`,
        tipo: 'PURCHASE_REJECTED',
      },
      PENDENTE: {
        titulo: '⏳ Solicitação de Compra Pendente de Revisão',
        assunto: 'Sua solicitação de compra está pendente de revisão',
        mensagem: `Prezado(a) ${solicitante_nome},\n\nSua solicitação de compra foi submetida e está pendente de revisão.\n\nDetalhes:\n- Descrição: ${purchase.descricao_item}\n- Valor: R$ ${(purchase.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- Protocolo: ${purchase.numero_protocolo || purchase.id}\n\nVocê será notificado assim que a revisão for concluída.`,
        tipo: 'PURCHASE_PENDING',
      },
    };

    const config = statusMessages[newStatus];
    if (!config) {
      return new Response(JSON.stringify({ processed: false, reason: 'Status não configurado' }), { status: 200 });
    }

    // Criar registro de notificação no banco
    const notification = await base44.asServiceRole.entities.Notification.create({
      user_email: solicitante_email,
      type: config.tipo,
      title: config.titulo,
      message: config.mensagem,
      report_id: purchase.report_id,
      action_url: `/compras?purchase_id=${purchase.id}`,
      read: false,
      email_sent: false,
    });

    // Enviar email
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: solicitante_email,
        subject: config.assunto,
        body: config.mensagem,
        from_name: 'Museus Centro - Sistema de Compras',
      });

      // Atualizar notificação para marcar email como enviado
      await base44.asServiceRole.entities.Notification.update(notification.id, {
        email_sent: true,
      });
    } catch (emailError) {
      console.error('Erro ao enviar email:', emailError);
      // Continuar mesmo se o email falhar
    }

    return new Response(JSON.stringify({ 
      processed: true, 
      notification_id: notification.id,
      status: newStatus,
      email_sent: true,
    }), { status: 200 });
  } catch (error) {
    console.error('Erro em notifyPurchaseStatusChange:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});