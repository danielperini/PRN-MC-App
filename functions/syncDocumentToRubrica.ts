import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { documentId } = await req.json();

    if (!documentId) {
      return Response.json({ error: 'documentId required' }, { status: 400 });
    }

    // Buscar o documento
    const docs = await base44.entities.PurchaseDocument.filter({ id: documentId });
    const documento = docs?.[0];

    if (!documento) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    // Se o documento não tem rubrica, buscar pela compra relacionada
    let rubricaId = documento.rubrica_id;

    if (!rubricaId && documento.purchase_id) {
      // Buscar a compra e tentar encontrar a rubrica
      const compras = await base44.entities.PurchaseRequest.filter({ id: documento.purchase_id });
      const compra = compras?.[0];

      if (compra && compra.budgetline_id) {
        // Buscar a linha orçamentária para obter a rubrica
        const lines = await base44.entities.BudgetLine.filter({ id: compra.budgetline_id });
        const line = lines?.[0];

        if (line) {
          // Buscar rubrica pelo nome ou código
          const rubricas = await base44.entities.Rubrica.filter({ rubrica: line.descricao });
          if (rubricas?.length > 0) {
            rubricaId = rubricas[0].id;
          }
        }
      }
    }

    if (!rubricaId) {
      return Response.json({ 
        error: 'No rubrica found for this document',
        success: false 
      });
    }

    // Verificar se já existe um lançamento para este documento
    const lancamentos = await base44.entities.LancamentoRubrica.filter({
      rubrica_id: rubricaId,
      referencia_compra_id: documento.purchase_id,
      tipo_documento: documento.tipo_documento,
    });

    let lancamento = lancamentos?.[0];

    // Se não existe, criar novo lançamento
    if (!lancamento) {
      const novoLancamento = await base44.entities.LancamentoRubrica.create({
        rubrica_id: rubricaId,
        data_lancamento: documento.data_documento || new Date().toISOString().split('T')[0],
        origem_lancamento: 'automatico_compras',
        referencia_compra_id: documento.purchase_id,
        descricao: `${documento.tipo_documento === 'nota_fiscal' ? 'NF' : document.tipo_documento.toUpperCase()} - ${documento.numero_documento || documento.nome_arquivo}`,
        fornecedor: documento.fornecedor || '',
        valor: documento.valor_documento || 0,
        uploadado_por: documento.uploadado_por,
      });

      lancamento = novoLancamento;
    } else {
      // Atualizar lançamento existente com novo valor se documento tiver valor
      if (documento.valor_documento) {
        await base44.entities.LancamentoRubrica.update(lancamento.id, {
          valor: documento.valor_documento,
          data_lancamento: documento.data_documento || lancamento.data_lancamento,
        });
      }
    }

    // Recalcular valor_utilizado da rubrica
    const todosLancamentos = await base44.entities.LancamentoRubrica.filter({
      rubrica_id: rubricaId,
    }, '-created_date', 500);

    const valorUtilizado = todosLancamentos.reduce((sum, l) => sum + (l.valor || 0), 0);

    // Buscar rubrica para calcular saldo
    const rubricas = await base44.entities.Rubrica.filter({ id: rubricaId });
    const rubrica = rubricas?.[0];

    if (rubrica) {
      const saldo = (rubrica.valor_rubrica || 0) - valorUtilizado;
      const percentualUtilizado = rubrica.valor_rubrica > 0 
        ? Math.round((valorUtilizado / rubrica.valor_rubrica) * 100)
        : 0;

      await base44.entities.Rubrica.update(rubricaId, {
        valor_utilizado: valorUtilizado,
        saldo: saldo,
        percentual_utilizado: percentualUtilizado,
      });
    }

    return Response.json({
      success: true,
      lancamento_id: lancamento.id,
      valor_utilizado: valorUtilizado,
    });

  } catch (error) {
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});