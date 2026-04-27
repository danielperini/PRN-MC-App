import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalize(value: any) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s@.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function computeSaldo(rubrica: any) {
  const total =
    toNumber(rubrica?.valor_total) ||
    toNumber(rubrica?.valor_rubrica);

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

/* =========================
   TEAM PAYMENT AUTO (mantido)
========================= */

async function ensureTeamPaymentFromNF(base44: any, purchase: any, purchaseId: string, rubrica: any, valor: number, userEmail: string) {
  try {
    const existing = await base44.asServiceRole.entities.TeamPayment.filter({
      purchase_request_id: purchaseId,
    });

    if (existing && existing.length > 0) return existing[0];

    return await base44.asServiceRole.entities.TeamPayment.create({
      purchase_request_id: purchaseId,
      user_name: purchase?.fornecedor_nome || '',
      valor_nf: valor,
      numero_nf: purchase?.observacoes || '',
      rubrica_id: purchase.rubrica_id,
      rubrica_nome: purchase.rubrica_nome,
      status: 'APROVADO_COORD',
      origem_automatica: true,
      criado_por_aprovacao_nf: true,
      aprovado_por: userEmail,
      aprovado_em: new Date().toISOString(),
    });

  } catch (e) {
    console.warn('Erro TeamPayment:', e?.message);
    return null;
  }
}

/* =========================
   SERVER
========================= */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, purchaseId, comentario } = await req.json();

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    const valor = getPurchaseValue(purchase);

    if (valor <= 0) {
      return Response.json({ error: 'Valor inválido' }, { status: 400 });
    }

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id)
      : null;

    if (!rubrica) {
      return Response.json({ error: 'Compra sem rubrica' }, { status: 400 });
    }

    const saldo = computeSaldo(rubrica);

    /* =========================
       APROVAR
    ========================= */

    if (action === 'approve_coord' || action === 'aprovar') {

      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({ error: 'Status inválido' }, { status: 400 });
      }

      if (saldo < valor) {
        return Response.json({ error: 'Saldo insuficiente' }, { status: 400 });
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

      let teamPayment = null;

      try {
        teamPayment = await ensureTeamPaymentFromNF(
          base44,
          purchase,
          purchaseId,
          rubrica,
          valor,
          user.email
        );
      } catch {}

      return Response.json({
        success: true,
        team_payment_id: teamPayment?.id || null,
      });
    }

    /* =========================
       RECUSAR (NOVO)
    ========================= */

    if (action === 'reject' || action === 'rejeitar') {

      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({
          error: 'Só é possível recusar solicitações pendentes'
        }, { status: 400 });
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RECUSADO',
        comentario_recusa: comentario || null,
        rejected_by: user.email,
        rejected_at: new Date().toISOString()
      });

      return Response.json({
        success: true,
        message: 'Solicitação recusada com sucesso'
      });
    }

    /* =========================
       PAGAR
    ========================= */

    if (action === 'mark_paid') {

      if (normalize(purchase.status) !== 'aprovado_coord') {
        return Response.json({ error: 'Precisa estar aprovado' }, { status: 400 });
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

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (e: any) {
    return Response.json({
      error: e?.message,
      stack: e?.stack
    }, { status: 500 });
  }
});
