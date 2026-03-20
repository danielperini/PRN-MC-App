import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStringLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function buildRubricaKey(rubrica) {
  const grupo = normalizeStringLower(rubrica?.grupo || '');
  const nome = normalizeStringLower(
    rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || ''
  );
  return `${grupo}__${nome}`;
}

function getPurchaseValue(compra) {
  return (
    toNumber(compra?.valor_pago) ||
    toNumber(compra?.valor_final) ||
    toNumber(compra?.valor_aprovado_admin) ||
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

function getCompraBudgetlineId(compra) {
  return (
    compra?.budgetline_id ||
    compra?.budget_line_id ||
    compra?.linha_orcamentaria_id ||
    null
  );
}

async function listAll(entityApi, orderBy = '', pageSize = 500) {
  let all = [];
  let page = 0;

  while (true) {
    const batch = await entityApi.list(orderBy, pageSize, page * pageSize);
    if (!batch || batch.length === 0) break;

    all = all.concat(batch);

    if (batch.length < pageSize) break;
    page++;
  }

  return all;
}

function resolveRubricaFromPurchase(compra, rubricas, budgetLineById) {
  if (compra?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === compra.rubrica_id);
    if (rubrica) {
      return {
        rubricaId: rubrica.id,
        origem: 'rubrica_id',
        motivo: null,
      };
    }
  }

  const compraBudgetlineId = getCompraBudgetlineId(compra);

  if (compraBudgetlineId) {
    const budgetLine = budgetLineById[compraBudgetlineId];

    if (budgetLine?.rubrica_id) {
      const rubrica = rubricas.find((r) => r.id === budgetLine.rubrica_id);
      if (rubrica) {
        return {
          rubricaId: rubrica.id,
          origem: 'budgetline_id',
          motivo: null,
        };
      }
    }

    const nomeBudgetLine = normalizeStringLower(
      budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || ''
    );

    if (nomeBudgetLine) {
      const matches = rubricas.filter((r) => {
        const nomeRubrica = normalizeStringLower(
          r?.rubrica || r?.nome || r?.descricao || ''
        );
        const rubricaKey = r?.rubrica_key || buildRubricaKey(r);
        return (
          nomeRubrica === nomeBudgetLine ||
          rubricaKey.includes(nomeBudgetLine)
        );
      });

      if (matches.length === 1) {
        return {
          rubricaId: matches[0].id,
          origem: 'budgetline_nome',
          motivo: null,
        };
      }

      if (matches.length > 1) {
        return {
          rubricaId: null,
          origem: 'nao_encontrada',
          motivo: 'Match ambíguo via budget line',
        };
      }
    }
  }

  return {
    rubricaId: null,
    origem: 'nao_encontrada',
    motivo: 'Rubrica não resolvida',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { documentId } = payload || {};

    if (!documentId) {
      return Response.json(
        { error: 'documentId required', success: false },
        { status: 400 }
      );
    }

    const docs = await base44.asServiceRole.entities.PurchaseDocument.filter({
      id: documentId
    });
    const documento = docs && docs.length > 0 ? docs[0] : null;

    if (!documento) {
      return Response.json(
        { error: 'Document not found', success: false },
        { status: 404 }
      );
    }

    if (!documento.purchase_id) {
      return Response.json(
        {
          success: false,
          error: 'Documento sem purchase_id vinculado'
        },
        { status: 400 }
      );
    }

    const compras = await base44.asServiceRole.entities.PurchaseRequest.filter({
      id: documento.purchase_id
    });
    const compra = compras && compras.length > 0 ? compras[0] : null;

    if (!compra) {
      return Response.json(
        { error: 'Purchase not found', success: false },
        { status: 404 }
      );
    }

    const purchaseStatus = normalizeStatus(compra.status);
    const compraBudgetlineId = getCompraBudgetlineId(compra);

    if (purchaseStatus !== 'PAGO' && purchaseStatus !== 'PAGO_PARCIAL') {
      return Response.json(
        {
          success: false,
          error: 'A rubrica só deve ser debitada quando a compra estiver paga.',
          purchase_id: documento.purchase_id,
          purchase_status: compra.status
        },
        { status: 400 }
      );
    }

    const [todasRubricas, allBudgetLines] = await Promise.all([
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
      listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
    ]);

    const rubricasMap = new Map();
    for (const r of todasRubricas) {
      const key = r?.rubrica_key || buildRubricaKey(r);
      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, r);
      }
    }
    const rubricasUnicas = Array.from(rubricasMap.values());

    const budgetLineById = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const resolved = resolveRubricaFromPurchase(
      compra,
      rubricasUnicas,
      budgetLineById
    );

    if (!resolved.rubricaId) {
      return Response.json(
        {
          error: 'No rubrica found for this document/purchase',
          success: false,
          purchase_id: documento.purchase_id,
          budgetline_id: compraBudgetlineId,
          motivo: resolved.motivo
        },
        { status: 404 }
      );
    }

    const rubricaId = resolved.rubricaId;
    const valorCompra = getPurchaseValue(compra);

    if (!valorCompra || valorCompra <= 0) {
      return Response.json(
        {
          success: false,
          error: 'Valor da compra inválido para lançamento na rubrica.',
          purchase_id: documento.purchase_id,
          valor_compra: valorCompra
        },
        { status: 400 }
      );
    }

    const descricaoLancamento =
      `${getDocTypeLabel(documento.tipo_documento || documento.tipo)} - ` +
      `${documento.numero_documento || documento.nome_arquivo || compra.descricao_item || 'Documento'}`;

    const lancamentos = await base44.asServiceRole.entities.LancamentoRubrica.filter({
      rubrica_id: rubricaId,
      referencia_compra_id: documento.purchase_id
    });

    const lancamentosAutomaticos = (lancamentos || []).filter(
      (l) => normalizeStringLower(l.origem_lancamento) === 'automatico_compras'
    );

    let lancamento =
      lancamentosAutomaticos.length > 0 ? lancamentosAutomaticos[0] : null;

    const dataLancamento =
      compra.data_pagamento ||
      documento.data_documento ||
      new Date().toISOString().split('T')[0];

    if (!lancamento) {
      lancamento = await base44.asServiceRole.entities.LancamentoRubrica.create({
        rubrica_id: rubricaId,
        data_lancamento: dataLancamento,
        origem_lancamento: 'automatico_compras',
        referencia_compra_id: documento.purchase_id,
        descricao: descricaoLancamento,
        fornecedor: documento.fornecedor || compra.fornecedor_nome || '',
        funcao_origem: compra.categoria || compra.tipo_gasto || '',
        valor: valorCompra,
        observacao:
          `Lançamento automático vinculado à compra ${documento.purchase_id}. ` +
          `Valor financeiro baseado na compra paga, não no documento.`,
        criado_por: user.email
      });
    } else {
      await base44.asServiceRole.entities.LancamentoRubrica.update(lancamento.id, {
        data_lancamento: dataLancamento,
        descricao: descricaoLancamento,
        fornecedor:
          documento.fornecedor || compra.fornecedor_nome || lancamento.fornecedor || '',
        funcao_origem:
          compra.categoria || compra.tipo_gasto || lancamento.funcao_origem || '',
        valor: valorCompra,
        observacao:
          `Lançamento automático atualizado pela compra ${documento.purchase_id}. ` +
          `Valor baseado na compra paga.`
      });
    }

    if (lancamentosAutomaticos.length > 1) {
      const duplicados = lancamentosAutomaticos.slice(1);
      for (const dup of duplicados) {
        try {
          await base44.asServiceRole.entities.LancamentoRubrica.delete(dup.id);
        } catch (e) {
          console.error('Erro ao remover lançamento duplicado:', dup.id, e.message);
        }
      }
    }

    try {
      await base44.asServiceRole.entities.PurchaseRequest.update(compra.id, {
        rubrica_id: rubricaId
      });
    } catch (e) {
      console.error('Erro ao gravar rubrica_id na compra:', e.message);
    }

    try {
      await base44.asServiceRole.entities.PurchaseDocument.update(documento.id, {
        rubrica_id: rubricaId
      });
    } catch (e) {
      console.error('Erro ao gravar rubrica_id no documento:', e.message);
    }

    try {
      await base44.asServiceRole.functions.invoke('recalculateRubrica', {
        rubricaId,
        rubrica_id: rubricaId,
        purchaseId: documento.purchase_id,
        budgetline_id: compraBudgetlineId
      });
    } catch (e) {
      console.error('Erro ao recalcular rubrica:', e.message);
    }

    try {
      await base44.asServiceRole.functions.invoke('recalculateAllRubricas', {
        trigger: 'sync_document_to_rubrica',
        purchaseId: documento.purchase_id,
        budgetline_id: compraBudgetlineId,
        rubricaId,
        rubrica_id: rubricaId
      });
    } catch (e) {
      console.error('Erro ao recalcular todas as rubricas:', e.message);
    }

    const rubricasAtualizadas = await base44.asServiceRole.entities.Rubrica.filter({
      id: rubricaId
    });
    const rubricaAtualizada =
      rubricasAtualizadas && rubricasAtualizadas.length > 0
        ? rubricasAtualizadas[0]
        : null;

    return Response.json({
      success: true,
      lancamento_id: lancamento.id,
      rubrica_id: rubricaId,
      purchase_id: documento.purchase_id,
      purchase_status: compra.status,
      budgetline_id: compraBudgetlineId,
      origem_resolucao: resolved.origem,
      valor_documento: toNumber(documento.valor_documento),
      valor_compra: valorCompra,
      valor_utilizado: rubricaAtualizada ? toNumber(rubricaAtualizada.valor_utilizado) : null,
      saldo: rubricaAtualizada ? toNumber(rubricaAtualizada.saldo) : null,
      percentual_utilizado: rubricaAtualizada
        ? toNumber(rubricaAtualizada.percentual_utilizado)
        : null
    });
  } catch (error) {
    console.error('syncDocumentToRubrica error:', error);
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});
