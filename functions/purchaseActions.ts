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
    .trim()
    .toLowerCase();
}

function getPurchaseValue(purchase) {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

function getPurchaseBudgetlineId(purchase) {
  return (
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { action = '', purchaseId, ...data } = payload || {};

    const isCoordinator =
      user.role === 'admin' ||
      user.role === 'ADMIN' ||
      user.role === 'COORDENADOR' ||
      user.role === 'COORD_COMUNICACAO' ||
      user.role === 'COORD_ADMINISTRATIVA' ||
      user.role === 'COORD_PRODUCAO';

    // =====================================================
    // APROVAR
    // =====================================================
    if (action === 'aprovar') {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

      const budgetlineId = getPurchaseBudgetlineId(purchase);

      if (!budgetlineId) {
        return Response.json(
          { error: 'Compra sem linha orçamentária' },
          { status: 400 }
        );
      }

      const budgetLine = await base44.asServiceRole.entities.BudgetLine.get(budgetlineId);

      const valor = getPurchaseValue(purchase);

      const saldo =
        toNumber(budgetLine.saldo_inicial) -
        toNumber(budgetLine.saldo_comprometido);

      if (saldo < valor) {
        return Response.json({ error: 'Saldo insuficiente' }, { status: 400 });
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_COORD'
      });

      await base44.asServiceRole.entities.BudgetLine.update(budgetlineId, {
        saldo_comprometido: toNumber(budgetLine.saldo_comprometido) + valor
      });

      return Response.json({ success: true });
    }

    // =====================================================
    // MARCAR COMO PAGO (CORRIGIDO)
    // =====================================================
    if (action === 'marcar_pago') {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

      if (!purchase) {
        return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
      }

      // 🔴 BLOQUEIO FORTE
      if (!purchase.rubrica_id && !getPurchaseBudgetlineId(purchase)) {
        return Response.json(
          {
            error: 'Compra sem rubrica vinculada. Edite antes de pagar.'
          },
          { status: 400 }
        );
      }

      if (
        purchase.status !== 'APROVADO_COORD' &&
        purchase.status !== 'APROVADO_ADMIN'
      ) {
        return Response.json(
          { error: 'Compra precisa estar aprovada' },
          { status: 400 }
        );
      }

      // 🔎 BUSCAR RUBRICA
      let rubricaId = purchase.rubrica_id;

      if (!rubricaId) {
        const budgetLine = await base44.asServiceRole.entities.BudgetLine.get(
          getPurchaseBudgetlineId(purchase)
        );
        rubricaId = budgetLine?.rubrica_id;
      }

      if (!rubricaId) {
        return Response.json(
          { error: 'Não foi possível resolver a rubrica' },
          { status: 400 }
        );
      }

      // 🔎 VALIDAR NOTA FISCAL
      const docs = await base44.asServiceRole.entities.PurchaseDocument.filter({
        purchase_id: purchaseId
      });

      const nfValida = (docs || []).some(
        (d) =>
          ['nota_fiscal', 'xml_nf'].includes(String(d.tipo).toLowerCase()) &&
          ['aprovado', 'approved'].includes(String(d.status).toLowerCase())
      );

      if (!nfValida) {
        return Response.json(
          { error: 'Nota fiscal aprovada obrigatória' },
          { status: 400 }
        );
      }

      const valor = getPurchaseValue(purchase);

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        valor_pago: valor,
        rubrica_id: rubricaId,
        data_pagamento:
          data.data_pagamento || new Date().toISOString().split('T')[0],
        comprovante_url: data.comprovante_url || ''
      });

      // 🔁 SINCRONIZA
      try {
        await base44.asServiceRole.functions.invoke('recalculateAllRubricas', {
          purchaseId,
          rubrica_id: rubricaId
        });
      } catch {}

      return Response.json({
        success: true,
        action: 'PAGO',
        rubrica_id: rubricaId
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});