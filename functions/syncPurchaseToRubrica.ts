import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Sincroniza uma compra aprovada para a rubrica correspondente
 * Chamado automaticamente quando uma compra é aprovada
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { purchaseId, action } = await req.json();

    if (!purchaseId || action !== 'approve_coord') {
      return Response.json({ error: 'purchaseId e action requeridos' }, { status: 400 });
    }

    const purchase = await base44.entities.PurchaseRequest.get(purchaseId);
    if (!purchase) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    // Buscar mapeamentos ativos
    const mapeamentos = await base44.entities.MapeamentoRubricas.filter({ ativo: true });
    if (!mapeamentos || mapeamentos.length === 0) {
      return Response.json({ warning: 'Sem mapeamentos ativos' });
    }

    // Buscar rubrica pela função/descrição
    const termoOrigem = purchase.funcao_origem || purchase.descricao_item || '';
    const mapeamento = mapeamentos.find(m => 
      termoOrigem.toUpperCase().includes(m.termo_origem.toUpperCase())
    );

    if (!mapeamento) {
      return Response.json({ warning: 'Nenhum mapeamento encontrado para esta compra' });
    }

    // Buscar rubrica por nome
    const rubricas = await base44.entities.Rubrica.filter({ rubrica: mapeamento.rubrica_destino });
    if (!rubricas || rubricas.length === 0) {
      return Response.json({ warning: `Rubrica ${mapeamento.rubrica_destino} não encontrada` });
    }

    const rubrica = rubricas[0];

    // Verificar se já existe lançamento para esta compra
    const existingLancamento = await base44.entities.LancamentoRubrica.filter({
      rubrica_id: rubrica.id,
      referencia_compra_id: purchaseId,
    });

    if (existingLancamento && existingLancamento.length > 0) {
      // Atualizar lançamento existente
      await base44.entities.LancamentoRubrica.update(existingLancamento[0].id, {
        valor: purchase.valor_solicitado,
        descricao: purchase.descricao_item,
        fornecedor: purchase.fornecedor_nome,
        funcao_origem: purchase.funcao_origem,
      });
    } else {
      // Criar novo lançamento
      const user = await base44.auth.me();
      await base44.entities.LancamentoRubrica.create({
        rubrica_id: rubrica.id,
        data_lancamento: new Date().toISOString().split('T')[0],
        origem_lancamento: 'automatico_compras',
        referencia_compra_id: purchaseId,
        descricao: purchase.descricao_item,
        fornecedor: purchase.fornecedor_nome,
        funcao_origem: purchase.funcao_origem,
        valor: purchase.valor_solicitado,
        criado_por: user?.email,
      });
    }

    // Recalcular totais da rubrica
    const lancamentos = await base44.entities.LancamentoRubrica.filter({ rubrica_id: rubrica.id });
    const novoUtilizado = lancamentos.reduce((sum, l) => sum + (l.valor || 0), 0);
    const novoSaldo = rubrica.valor_rubrica - novoUtilizado;
    const novoPercentual = (novoUtilizado / rubrica.valor_rubrica) * 100;

    await base44.entities.Rubrica.update(rubrica.id, {
      valor_utilizado: novoUtilizado,
      saldo: novoSaldo,
      percentual_utilizado: novoPercentual,
    });

    return Response.json({ 
      success: true, 
      rubrica: rubrica.rubrica,
      valor_adicionado: purchase.valor_solicitado,
      novo_utilizado: novoUtilizado,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});