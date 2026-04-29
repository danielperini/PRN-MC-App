import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function getValor(payment: any) {
  return Number(
    payment?.valor ??
    payment?.valor_nf ??
    payment?.nf_valor_total ??
    payment?.valor_total ??
    0
  ) || 0;
}

function normalizeAction(action: any) {
  const value = String(action || '').trim().toLowerCase();

  if (['aprovar', 'approve', 'approved'].includes(value)) return 'aprovar';
  if (['devolver', 'reject', 'rejeitar', 'rejected'].includes(value)) return 'devolver';
  if (['pagar', 'pay', 'marcar_pago', 'marcar-pago', 'paid'].includes(value)) return 'pagar';
  if (['delete', 'deletar', 'excluir', 'remove', 'remover'].includes(value)) return 'deletar';

  return value;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const action = normalizeAction(body.action);
    const id =
      body.id ||
      body.paymentId ||
      body.payment_id ||
      body.teamPaymentId ||
      body.team_payment_id;

    if (!id) return json({ success: false, error: 'ID do pagamento obrigatório' }, 400);

    const payment = await base44.asServiceRole.entities.TeamPayment.get(id);
    if (!payment) return json({ success: false, error: 'Pagamento não encontrado' }, 404);

    const statusAtual = String(payment.status || '').toUpperCase();
    const rubricaId = payment.rubrica_id;
    const valor = getValor(payment);

    if (['aprovar', 'pagar'].includes(action)) {
      if (!rubricaId) return json({ success: false, error: 'Pagamento sem rubrica vinculada' }, 400);
      if (!valor) return json({ success: false, error: 'Valor do pagamento inválido' }, 400);
    }

    if (action === 'aprovar') {
      if (['APROVADO_COORD', 'APROVADO', 'PAGO'].includes(statusAtual)) {
        return json({ success: true, already_processed: true });
      }

      const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        saldo_comprometido: Number(rubrica?.saldo_comprometido || 0) + valor,
      });

      await base44.asServiceRole.entities.TeamPayment.update(id, {
        status: 'APROVADO_COORD',
        valor_total: valor,
        valor_nf: valor,
        aprovado_em: new Date().toISOString(),
        aprov_coord_data: new Date().toISOString(),
        comentario_aprovacao: body.comentario || '',
      });

      return json({ success: true });
    }

    if (action === 'pagar') {
      if (statusAtual === 'PAGO') return json({ success: true, already_processed: true });

      const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        valor_utilizado: Number(rubrica?.valor_utilizado || 0) + valor,
        saldo_comprometido: Math.max(0, Number(rubrica?.saldo_comprometido || 0) - valor),
      });

      await base44.asServiceRole.entities.TeamPayment.update(id, {
        status: 'PAGO',
        valor_pago: valor,
        data_pagamento: new Date().toISOString(),
        pago_em: new Date().toISOString(),
      });

      return json({ success: true });
    }

    if (action === 'devolver') {
      if (['APROVADO_COORD', 'APROVADO'].includes(statusAtual) && rubricaId && valor) {
        const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);

        await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
          saldo_comprometido: Math.max(0, Number(rubrica?.saldo_comprometido || 0) - valor),
        });
      }

      await base44.asServiceRole.entities.TeamPayment.update(id, {
        status: 'DEVOLVIDO',
        devolvido_em: new Date().toISOString(),
        comentario_devolucao: body.comentario || body.motivo || body.reason || '',
      });

      return json({ success: true });
    }

    if (action === 'deletar') {
      if (['APROVADO_COORD', 'APROVADO'].includes(statusAtual) && rubricaId && valor) {
        const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);

        await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
          saldo_comprometido: Math.max(0, Number(rubrica?.saldo_comprometido || 0) - valor),
        });
      }

      await base44.asServiceRole.entities.TeamPayment.delete(id);
      return json({ success: true });
    }

    return json({ success: false, error: 'Ação inválida' }, 400);
  } catch (err: any) {
    return json({
      success: false,
      error: err?.message || 'Erro interno',
    }, 500);
  }
});
