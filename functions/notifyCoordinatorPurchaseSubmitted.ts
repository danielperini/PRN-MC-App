import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { purchaseId } = await req.json();

    // Buscar solicitação
    const purchase = await base44.asServiceRole.entities.PurchaseRequest.filter({ id: purchaseId });
    if (!purchase || purchase.length === 0) {
      return Response.json({ error: 'Purchase not found' }, { status: 404 });
    }

    const p = purchase[0];

    // Buscar coordenadores
    const coordinators = await base44.asServiceRole.entities.UserPermission.filter({
      can_review_reports: true
    });

    if (!coordinators || coordinators.length === 0) {
      return Response.json({ success: true, message: 'No coordinators found' });
    }

    // Buscar rubrica para mais contexto
    let rubricaInfo = '';
    if (p.budgetline_id) {
      try {
        const budgetLine = await base44.asServiceRole.entities.BudgetLine.filter({ id: p.budgetline_id });
        if (budgetLine && budgetLine.length > 0) {
          rubricaInfo = `\n\n**Rubrica:** [${budgetLine[0].codigo}] ${budgetLine[0].descricao}`;
        }
      } catch (e) {
        // Ignorar erro ao buscar rubrica
      }
    }

    // Enviar email para cada coordenador
    const emailPromises = coordinators.map(coord => 
      base44.integrations.Core.SendEmail({
        to: coord.user_email,
        subject: `🔔 Nova Solicitação de Compra Submetida - ${p.descricao_item}`,
        body: `Olá ${coord.user_name},

Uma nova solicitação de compra foi submetida e aguarda sua aprovação:

**📋 DETALHES DA SOLICITAÇÃO**
- Item: ${p.descricao_item}
- Valor: R$ ${(p.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Solicitante: ${p.created_by}
- Categoria: ${p.categoria}
- Tipo: ${p.tipo_gasto}${rubricaInfo}

**⚡ AÇÃO REQUERIDA**
Acesse o sistema de Suprimentos → Aprovações para revisar e aprovar/recusar esta solicitação.

---
Museus Centro - Sistema de Suprimentos`
      })
    );

    await Promise.all(emailPromises);

    return Response.json({ 
      success: true, 
      message: `Email enviado para ${coordinators.length} coordenador(es)` 
    });
  } catch (error) {
    console.error('Erro ao notificar coordenador:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});