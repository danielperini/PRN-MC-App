import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalize(value: any) {
  return String(value || '').trim().toLowerCase();
}

function computeSaldo(rubrica: any) {
  const total = toNumber(rubrica?.valor_total) || toNumber(rubrica?.valor_rubrica);
  const utilizado = toNumber(rubrica?.valor_utilizado);
  const comprometido = toNumber(rubrica?.saldo_comprometido);
  return total - utilizado - comprometido;
}

function getPurchaseValue(p: any) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_final) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_solicitado)
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, purchaseId, comentario } = body || {};

    if (!purchaseId) {
      return Response.json({ success: false, error: 'purchaseId obrigatório' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return Response.json({ success: false, error: 'Compra não encontrada' }, { status: 404 });
    }

    const valor = getPurchaseValue(purchase);

    if (valor <= 0) {
      return Response.json({
        success: false,
        error: 'Valor inválido'
      }, { status: 400 });
    }

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id)
      : null;

    if (!rubrica) {
      return Response.json({
        success: false,
        error: 'Compra sem rubrica'
      }, { status: 400 });
    }

    const saldo = computeSaldo(rubrica);

    // =========================
    // APROVAR
    // =========================
    if (action === 'approve_coord' || action === 'aprovar' || action === 'approve') {

      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({
          success: false,
          error: 'Status inválido para aprovação'
        }, { status: 400 });
      }

      if (saldo < valor) {
        return Response.json({
          success: false,
          error: 'Saldo insuficiente'
        }, { status: 400 });
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        saldo_comprometido: toNumber(rubrica?.saldo_comprometido) + valor
      });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_COORD',
        valor_aprovado: valor,
        comentario_aprovacao: comentario || null,
        approved_by: user.email,
        approved_at: new Date().toISOString()
      });

      return Response.json({
        success: true,
        message: 'Aprovado com sucesso'
      });
    }

    // =========================
    // DEVOLVER
    // =========================
    if (action === 'devolver' || action === 'reject') {

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'DEVOLVIDO',
        comentario_devolucao: comentario || null,
        devolvido_por: user.email,
        devolvido_em: new Date().toISOString()
      });

      return Response.json({
        success: true,
        message: 'Solicitação devolvida'
      });
    }

    // =========================
    // PAGAR
    // =========================
    if (action === 'mark_paid') {

      if (normalize(purchase.status) !== 'aprovado_coord') {
        return Response.json({
          success: false,
          error: 'Precisa estar aprovado'
        }, { status: 400 });
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: toNumber(rubrica?.valor_utilizado) + valor,
        saldo_comprometido: Math.max(0, toNumber(rubrica?.saldo_comprometido) - valor)
      });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        valor_pago: valor,
        pago_por: user.email,
        pago_em: new Date().toISOString()
      });

      return Response.json({
        success: true,
        message: 'Pagamento realizado'
      });
    }

    return Response.json({
      success: false,
      error: 'Ação inválida'
    }, { status: 400 });

  } catch (e: any) {
    console.error('purchaseActions fatal:', e);

    return Response.json({
      success: false,
      error: e?.message || 'Erro interno'
    }, { status: 500 });
  }
});
