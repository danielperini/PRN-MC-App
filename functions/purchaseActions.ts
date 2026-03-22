<COLE EXATAMENTE ESTE ARQUIVO SUBSTITUINDO O ATUAL>

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/* ================= HELPERS ================= */

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

/* ================= CORE ================= */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { action = '', purchaseId, ...data } = payload || {};

    const normalizedAction =
      action === 'approve_coord' || action === 'approve_admin'
        ? 'aprovar'
        : action === 'recusar'
        ? 'reject'
        : action;

    const isCoordinator =
      user.role === 'admin' ||
      user.role === 'ADMIN' ||
      user.role === 'COORDENADOR';

    /* ================= MARCAR PAGO ================= */

    if (normalizedAction === 'marcar_pago') {

      if (!purchaseId) {
        return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });
      }

      if (!isCoordinator) {
        return Response.json({ error: 'Sem permissão' }, { status: 403 });
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

      if (!purchase) {
        return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
      }

      const valorPago = toNumber(purchase.valor_pago) || toNumber(purchase.valor_final);

      const paymentDate = new Date().toISOString().split('T')[0];

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        data_pagamento: paymentDate,
        valor_pago: valorPago,
        pago_por: user.email,
      });

      /* 🔥 INTEGRAÇÃO COM EQUIPE */

      try {

        const teamPayments = await base44.asServiceRole.entities.TeamPayment.filter({
          purchase_id: purchaseId
        });

        if (teamPayments && teamPayments.length > 0) {

          const tp = teamPayments[0];

          await base44.asServiceRole.entities.TeamPayment.update(tp.id, {
            status: 'PAGO'
          });

          if (tp.team_member_id) {

            const member = await base44.asServiceRole.entities.TeamMember.get(tp.team_member_id);

            if (member) {

              const parcelasPagas = (member.parcelas_pagas || 0) + 1;

              await base44.asServiceRole.entities.TeamMember.update(member.id, {
                parcelas_pagas: parcelasPagas
              });

            }

          }

        }

      } catch (e) {
        console.error('Erro integração equipe:', e);
      }

      return Response.json({
        success: true,
        action: 'PAGO'
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    console.error('purchaseActions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
