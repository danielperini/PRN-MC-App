import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { purchase_id, rubrica_codigo, valor_solicitado, tipo_item } = await req.json();

    if (!purchase_id || !rubrica_codigo || !valor_solicitado) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch budget line
    const budgetLines = await base44.asServiceRole.entities.BudgetLine.filter({ codigo: rubrica_codigo });
    const budgetLine = budgetLines?.[0];

    if (!budgetLine) {
      return Response.json({ error: 'Budget line not found' }, { status: 404 });
    }

    // Fetch all purchase requests for this budget line
    const allPurchases = await base44.asServiceRole.entities.PurchaseRequest.filter({ rubrica_codigo });
    
    // Calculate committed amount (excluding current draft)
    const committed = allPurchases
      .filter(p => p.id !== purchase_id && p.status !== 'RECUSADO' && p.status !== 'CANCELADO')
      .reduce((sum, p) => sum + (p.valor_unitario * p.quantidade || 0), 0);

    const available = budgetLine.saldo_disponivel || 0;
    const totalNeed = committed + valor_solicitado;
    const percentageUsed = available > 0 ? ((committed + valor_solicitado) / budgetLine.valor_total) * 100 : 100;

    // Use Claude to evaluate budget fit
    const evaluation = await base44.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: `Você é um avaliador de compras com expertise em gestão orçamentária.

INFORMAÇÕES DA RUBRICA:
- Código: ${rubrica_codigo}
- Descrição: ${budgetLine.descricao || 'N/A'}
- Orçamento Total: R$ ${(budgetLine.valor_total || 0).toFixed(2)}
- Saldo Disponível: R$ ${available.toFixed(2)}
- Já Comprometido: R$ ${committed.toFixed(2)}
- Tipo de Item: ${tipo_item || 'não especificado'}

NOVA SOLICITAÇÃO:
- Valor Solicitado: R$ ${valor_solicitado.toFixed(2)}
- Total Necessário (comprometido + novo): R$ ${totalNeed.toFixed(2)}
- Percentual do Orçamento: ${percentageUsed.toFixed(1)}%

ANÁLISE REQUERIDA:
1. Esta compra cabe no orçamento disponível?
2. Qual é o risco orçamentário? (baixo, médio, alto)
3. Recomendação: aprovar ou alertar o coordenador?
4. Qual seria a % orçamentária final APÓS esta compra?

Responda em JSON: {"cabe": true/false, "risco": "baixo|médio|alto", "recomendacao": "aprovar|alertar", "percentual_final": número, "motivo": "breve motivo"}`,
      response_json_schema: {
        type: 'object',
        properties: {
          cabe: { type: 'boolean' },
          risco: { type: 'string', enum: ['baixo', 'médio', 'alto'] },
          recomendacao: { type: 'string', enum: ['aprovar', 'alertar'] },
          percentual_final: { type: 'number' },
          motivo: { type: 'string' }
        }
      }
    });

    // Check if both item type and budget line agree (if produto, only list metas com produtos, etc)
    let tipoMatch = true;
    if (tipo_item === 'produto' && budgetLine.tipo_item && budgetLine.tipo_item !== 'produto') {
      tipoMatch = false;
    }
    if (tipo_item === 'servico' && budgetLine.tipo_item && budgetLine.tipo_item !== 'servico') {
      tipoMatch = false;
    }

    const isApproved = evaluation?.cabe === true && evaluation?.risco !== 'alto' && tipoMatch;
    const confidenceScore = isApproved ? 95 : (evaluation?.risco === 'baixo' ? 90 : 75);

    return Response.json({
      success: true,
      purchase_id,
      rubrica_codigo,
      evaluation: evaluation || {},
      available_balance: available,
      committed: committed,
      valor_solicitado: valor_solicitado,
      total_need: totalNeed,
      percentage_used: percentageUsed.toFixed(1),
      tipo_match: tipoMatch,
      is_approved: isApproved,
      confidence_score: confidenceScore,
      requires_coordinator_approval: !isApproved || evaluation?.recomendacao === 'alertar'
    });
  } catch (error) {
    console.error('Erro ao avaliar saldo:', error);
    return Response.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
});