import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalize(value: any) {
  return String(value || '').trim().toLowerCase();
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
      return Response.json({
        error: 'Valor inválido',
        debug: { valor }
      }, { status: 400 });
    }

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id)
      : null;

    if (!rubrica) {
      return Response.json({
        error: 'Compra sem rubrica vinculada',
        debug: {
          purchase_id: purchaseId,
          rubrica_id: purchase?.rubrica_id
        }
      }, { status: 400 });
    }

    const saldo = computeSaldo(rubrica);

    /* =========================
       APROVAR
    ========================= */
    if (action === 'approve_coord' || action === 'aprovar') {

      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({
          error: 'Status inválido',
          debug: { status: purchase.status }
        }, { status: 400 });
      }

      if (saldo < valor) {
        return Response.json({
          error: 'Saldo insuficiente',
          debug: {
            rubrica: rubrica?.nome,
            saldo,
            valor
          }
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

      // Atualizar DocumentIntake vinculado para APROVADO (se existir)
      try {
        const intakes = await base44.asServiceRole.entities.DocumentIntake.filter({
          entidade_destino: 'PurchaseRequest',
          entidade_destino_id: purchaseId,
        });
        if (intakes && intakes.length > 0) {
          await base44.asServiceRole.entities.DocumentIntake.update(intakes[0].id, {
            status_processamento: 'APROVADO',
          });
        }
      } catch (e) {
        console.warn('Aviso: não foi possível atualizar DocumentIntake:', e?.message);
      }

      return Response.json({
        success: true,
        message: 'Compra aprovada com sucesso'
      });
    }

    /* =========================
       PAGAR
    ========================= */
    if (action === 'mark_paid') {

      if (normalize(purchase.status) !== 'aprovado_coord') {
        return Response.json({
          error: 'Compra precisa estar aprovada',
          debug: { status: purchase.status }
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
        message: 'Pagamento realizado com sucesso'
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