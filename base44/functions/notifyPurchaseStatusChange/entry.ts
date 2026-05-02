import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { purchaseId, newStatus, comentario } = await req.json();

    // Buscar solicitação
    const purchase = await base44.asServiceRole.entities.PurchaseRequest.filter({ id: purchaseId });
    if (!purchase || purchase.length === 0) {
      return Response.json({ error: 'Purchase not found' }, { status: 404 });
    }

    const p = purchase[0];

    // Apenas notificar em status específicos
    if (!['APROVADO_COORD', 'APROVADO_ADMIN', 'RECUSADO'].includes(newStatus)) {
      return Response.json({ success: true, message: 'Status does not require notification' });
    }

    // Determinar mensagem baseada no status
    const statusMessages = {
      APROVADO_COORD: {
        title: '✅ Sua solicitação foi aprovada pela Coordenação!',
        desc: 'Sua solicitação foi aprovada e enviada para aprovação administrativa.',
        icon: '✅'
      },
      APROVADO_ADMIN: {
        title: '✅ Sua solicitação foi completamente aprovada!',
        desc: 'Sua compra foi aprovada e está pronta para pagamento.',
        icon: '✅'
      },
      RECUSADO: {
        title: '❌ Sua solicitação foi recusada',
        desc: `Sua solicitação foi recusada.${comentario ? `\n\nMotivo: ${comentario}` : ''}`,
        icon: '❌'
      }
    };

    const msg = statusMessages[newStatus];

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    if (p.created_by !== ALLOWED_EMAIL) {
      console.log('Email bloqueado:', p.created_by);
      return Response.json({ success: true, skipped: true });
    }
    // Enviar email para o solicitante
    await base44.integrations.Core.SendEmail({
      to: p.created_by,
      subject: `${msg.icon} ${msg.title}`,
      body: `Olá,

${msg.desc}

**📋 DETALHES DA SOLICITAÇÃO**
- Item: ${p.descricao_item}
- Valor: R$ ${(p.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Categoria: ${p.categoria}
- Status: ${newStatus === 'APROVADO_COORD' ? 'Aprovada pela Coordenação' : newStatus === 'APROVADO_ADMIN' ? 'Aprovada Completamente' : 'Recusada'}

${newStatus === 'APROVADO_ADMIN' ? '\n⏭️ Próxima etapa: Aguarde o pagamento conforme cronograma.' : ''}

${newStatus === 'RECUSADO' && comentario ? `\n📝 Comentário:\n${comentario}` : ''}

---
Museus Centro - Sistema de Suprimentos`
    });

    return Response.json({ 
      success: true, 
      message: `Email enviado para ${p.created_by}` 
    });
  } catch (error) {
    console.error('Erro ao notificar mudança de status:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});