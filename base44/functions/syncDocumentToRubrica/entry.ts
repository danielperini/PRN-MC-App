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
    return { rubricaId: compra.rubrica_id, origem: 'rubrica_id' };
  }

  const blId = getCompraBudgetlineId(compra);
  const bl = budgetLineById[blId];

  if (bl?.rubrica_id) {
    return { rubricaId: bl.rubrica_id, origem: 'budgetline_id' };
  }

  return { rubricaId: null, origem: 'nao_encontrada' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    const { documentId } = await req.json();

    if (!documentId) {
      return Response.json({ error: 'documentId required', success: false }, { status: 400 });
    }

    const documento = await base44.asServiceRole.entities.PurchaseDocument.get(documentId);
    if (!documento?.purchase_id) {
      return Response.json({ error: 'Documento inválido', success: false }, { status: 400 });
    }

    const compra = await base44.asServiceRole.entities.PurchaseRequest.get(documento.purchase_id);
    if (!compra) {
      return Response.json({ error: 'Compra não encontrada', success: false }, { status: 404 });
    }

    const status = normalizeStatus(compra.status);

    // 🔴 BLOQUEIO CRÍTICO
    if (!['PAGO', 'PAGO_PARCIAL'].includes(status)) {
      return Response.json({
        success: false,
        error: 'Compra ainda não paga - não debitar rubrica',
        status: compra.status
      }, { status: 400 });
    }

    const [rubricas, budgetLines] = await Promise.all([
      listAll(base44.asServiceRole.entities.Rubrica),
      listAll(base44.asServiceRole.entities.BudgetLine)
    ]);

    const budgetLineById = Object.fromEntries(
      budgetLines.map(b => [b.id, b])
    );

    const resolved = resolveRubricaFromPurchase(compra, rubricas, budgetLineById);

    if (!resolved.rubricaId) {
      return Response.json({
        success: false,
        error: 'Rubrica não resolvida'
      }, { status: 400 });
    }

    const valorCompra = getPurchaseValue(compra);

    if (valorCompra <= 0) {
      return Response.json({
        success: false,
        error: 'Valor inválido'
      }, { status: 400 });
    }

    // 🔴 EVITA DUPLICIDADE (CRÍTICO)
    const existente = await base44.asServiceRole.entities.LancamentoRubrica.filter({
      referencia_compra_id: compra.id,
      origem_lancamento: 'automatico_compras'
    });

    let lancamento;

    if (existente?.length > 0) {
      lancamento = existente[0];

      await base44.asServiceRole.entities.LancamentoRubrica.update(lancamento.id, {
        valor: valorCompra,
        descricao: `${getDocTypeLabel(documento.tipo)} - ${compra.descricao_item}`,
        data_lancamento: compra.data_pagamento || new Date().toISOString().split('T')[0]
      });

    } else {
      lancamento = await base44.asServiceRole.entities.LancamentoRubrica.create({
        rubrica_id: resolved.rubricaId,
        valor: valorCompra,
        origem_lancamento: 'automatico_compras',
        referencia_compra_id: compra.id,
        descricao: `${getDocTypeLabel(documento.tipo)} - ${compra.descricao_item}`,
        data_lancamento: compra.data_pagamento || new Date().toISOString().split('T')[0],
        criado_por: user.email
      });
    }

    // 🔴 SINCRONIZAÇÃO SEGURA
    await Promise.all([
      base44.asServiceRole.entities.PurchaseRequest.update(compra.id, {
        rubrica_id: resolved.rubricaId
      }),
      base44.asServiceRole.entities.PurchaseDocument.update(documento.id, {
        rubrica_id: resolved.rubricaId
      })
    ]);

    // 🔴 RECALCULO CONTROLADO
    try {
      await base44.asServiceRole.functions.invoke('recalculateRubrica', {
        rubricaId: resolved.rubricaId
      });
    } catch {}

    return Response.json({
      success: true,
      lancamento_id: lancamento.id,
      rubrica_id: resolved.rubricaId,
      valor: valorCompra,
      origem: resolved.origem
    });

  } catch (error) {
    console.error('syncDocumentToRubrica error:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
