import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { purchaseId, action } = await req.json();

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId required' }, { status: 400 });
    }

    // Buscar a compra
    const compras = await base44.entities.PurchaseRequest.filter({ id: purchaseId });
    const compra = compras?.[0];

    if (!compra) {
      return Response.json({ error: 'Purchase not found' }, { status: 404 });
    }

    if (action === 'delete') {
      // Remover lançamento automático vinculado
      const lancamentos = await base44.entities.LancamentoRubrica.filter({
        referencia_compra_id: purchaseId,
        origem_lancamento: 'automatico_compras',
      });

      for (const lancamento of lancamentos) {
        await base44.entities.LancamentoRubrica.delete(lancamento.id);
      }
    } else {
      // Buscar mapeamento baseado na função/descrição
      const mapeamentos = await base44.entities.MapeamentoRubricas.filter({ ativo: true });
      let rubricaDestino = null;

      for (const map of mapeamentos) {
        if (compra.descricao_item?.toUpperCase().includes(map.termo_origem) ||
            compra.funcao_origem?.toUpperCase().includes(map.termo_origem)) {
          rubricaDestino = map.rubrica_destino;
          break;
        }
      }

      if (rubricaDestino) {
        // Encontrar a rubrica
        const rubricas = await base44.entities.Rubrica.filter({ rubrica: rubricaDestino });
        const rubrica = rubricas?.[0];

        if (rubrica) {
          // Procurar lançamento existente para esta compra
          const lancamentos = await base44.entities.LancamentoRubrica.filter({
            referencia_compra_id: purchaseId,
            rubrica_id: rubrica.id,
          });

          if (lancamentos?.length > 0) {
            // Atualizar lançamento existente
            await base44.entities.LancamentoRubrica.update(lancamentos[0].id, {
              descricao: compra.descricao_item,
              fornecedor: compra.fornecedor_nome,
              valor: compra.valor_solicitado || compra.valor_aprovado_admin || 0,
            });
          } else {
            // Criar novo lançamento
            await base44.entities.LancamentoRubrica.create({
              rubrica_id: rubrica.id,
              data_lancamento: new Date().toISOString().split('T')[0],
              origem_lancamento: 'automatico_compras',
              referencia_compra_id: purchaseId,
              descricao: compra.descricao_item,
              fornecedor: compra.fornecedor_nome,
              funcao_origem: compra.funcao_origem,
              valor: compra.valor_solicitado || compra.valor_aprovado_admin || 0,
              criado_por: user?.email,
            });
          }

          // Recalcular rubrica
          await base44.functions.invoke('recalculateRubrica', { rubricaId: rubrica.id });
        }
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});