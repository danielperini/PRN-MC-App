import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value) {
  return String(value || '').trim();
}

function getPurchaseValue(compra) {
  return (
    toNumber(compra?.valor_pago) ||
    toNumber(compra?.valor_final) ||
    toNumber(compra?.valor_aprovado) ||
    toNumber(compra?.valor_solicitado) ||
    0
  );
}

function getDocTypeLabel(tipo) {
  const t = normalizeString(tipo).toLowerCase();
  if (t === 'nota_fiscal') return 'NF';
  if (t === 'xml_nf') return 'XML';
  if (t === 'recibo') return 'RECIBO';
  if (t === 'contrato') return 'CONTRATO';
  if (t === 'orcamento') return 'ORÇAMENTO';
  return t ? t.toUpperCase() : 'DOC';
}

async function findRubricaByBudgetLine(base44, budgetlineId) {
  if (!budgetlineId) return null;

  let rubricas = await base44.asServiceRole.entities.Rubrica.filter({
    budgetline_id: budgetlineId
  });
  if (rubricas && rubricas.length > 0) return rubricas[0];

  rubricas = await base44.asServiceRole.entities.Rubrica.filter({
    budget_line_id: budgetlineId
  });
  if (rubricas && rubricas.length > 0) return rubricas[0];

  rubricas = await base44.asServiceRole.entities.Rubrica.filter({
    linha_orcamentaria_id: budgetlineId
  });
  if (rubricas && rubricas.length > 0) return rubricas[0];

  return null;
}

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

    // Buscar documento
    const docs = await base44.asServiceRole.entities.PurchaseDocument.filter({ id: documentId });
    const documento = docs && docs.length > 0 ? docs[0] : null;

    if (!documento) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    // Documento precisa estar vinculado a uma compra
    if (!documento.purchase_id) {
      return Response.json({
        success: false,
        error: 'Documento sem purchase_id vinculado'
      }, { status: 400 });
    }

    // Buscar compra relacionada
    const compras = await base44.asServiceRole.entities.PurchaseRequest.filter({
      id: documento.purchase_id
    });
    const compra = compras && compras.length > 0 ? compras[0] : null;

    if (!compra) {
      return Response.json({ error: 'Purchase not found' }, { status: 404 });
    }

    // Buscar rubrica
    let rubricaId = documento.rubrica_id || null;
    let rubrica = null;

    if (rubricaId) {
      const rubricasDiretas = await base44.asServiceRole.entities.Rubrica.filter({ id: rubricaId });
      rubrica = rubricasDiretas && rubricasDiretas.length > 0 ? rubricasDiretas[0] : null;
    }

    if (!rubrica && compra.budgetline_id) {
      rubrica = await findRubricaByBudgetLine(base44, compra.budgetline_id);
      if (!rubrica) {
        const lines = await base44.asServiceRole.entities.BudgetLine.filter({ id: compra.budgetline_id });
        const line = lines && lines.length > 0 ? lines[0] : null;

        if (line && line.descricao) {
          const rubricasPorNome = await base44.asServiceRole.entities.Rubrica.filter({
            rubrica: line.descricao
          });
          rubrica = rubricasPorNome && rubricasPorNome.length > 0 ? rubricasPorNome[0] : null;
        }
      }
    }

    if (!rubrica) {
      return Response.json({
        error: 'No rubrica found for this document/purchase',
        success: false,
        purchase_id: documento.purchase_id,
        budgetline_id: compra.budgetline_id || null
      }, { status: 404 });
    }

    rubricaId = rubrica.id;

    // Fonte de verdade do valor = compra
    const valorCompra = getPurchaseValue(compra);

    // Verificar se já existe lançamento automático dessa compra nessa rubrica
    const lancamentos = await base44.asServiceRole.entities.LancamentoRubrica.filter({
      rubrica_id: rubricaId,
      referencia_compra_id: documento.purchase_id
    });

    let lancamento = lancamentos && lancamentos.length > 0 ? lancamentos[0] : null;

    const descricaoLancamento = `${getDocTypeLabel(documento.tipo_documento)} - ${documento.numero_documento || documento.nome_arquivo || compra.descricao_item || 'Documento'}`;

    if (!lancamento) {
      lancamento = await base44.asServiceRole.entities.LancamentoRubrica.create({
        rubrica_id: rubricaId,
        data_lancamento: compra.data_pagamento || documento.data_documento || new Date().toISOString().split('T')[0],
        origem_lancamento: 'automatico_compras',
        referencia_compra_id: documento.purchase_id,
        descricao: descricaoLancamento,
        fornecedor: documento.fornecedor || compra.fornecedor_nome || '',
        funcao_origem: compra.categoria || compra.tipo_gasto || '',
        valor: valorCompra,
        observacao: `Lançamento automático vinculado à compra ${documento.purchase_id}. Valor financeiro baseado na compra, não no documento.`,
        criado_por: user.email,
      });
    } else {
      await base44.asServiceRole.entities.LancamentoRubrica.update(lancamento.id, {
        data_lancamento: compra.data_pagamento || documento.data_documento || lancamento.data_lancamento,
        descricao: descricaoLancamento,
        fornecedor: documento.fornecedor || compra.fornecedor_nome || lancamento.fornecedor || '',
        funcao_origem: compra.categoria || compra.tipo_gasto || lancamento.funcao_origem || '',
        valor: valorCompra,
        observacao: `Lançamento automático atualizado pela compra ${documento.purchase_id}. Valor baseado na compra.`,
      });
    }

    // Recalcular rubrica pela function central
    try {
      await base44.asServiceRole.functions.invoke('recalculateRubrica', {
        rubricaId: rubricaId,
        purchaseId: documento.purchase_id,
        budgetline_id: compra.budgetline_id || null
      });
    } catch (e) {
      console.error('Erro ao recalcular rubrica:', e.message);
    }

    // Buscar rubrica atualizada
    const rubricasAtualizadas = await base44.asServiceRole.entities.Rubrica.filter({ id: rubricaId });
    const rubricaAtualizada = rubricasAtualizadas && rubricasAtualizadas.length > 0 ? rubricasAtualizadas[0] : null;

    return Response.json({
      success: true,
      lancamento_id: lancamento.id,
      rubrica_id: rubricaId,
      purchase_id: documento.purchase_id,
      valor_documento: toNumber(documento.valor_documento),
      valor_compra: valorCompra,
      valor_utilizado: rubricaAtualizada ? rubricaAtualizada.valor_utilizado : null,
      saldo: rubricaAtualizada ? rubricaAtualizada.saldo : null
    });
  } catch (error) {
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});