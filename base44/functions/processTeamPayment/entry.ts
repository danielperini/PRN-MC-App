import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(v: any) {
  return Number(v) || 0;
}

function computeSaldo(rubrica: any) {
  const total = toNumber(rubrica?.valor_total);
  const utilizado = toNumber(rubrica?.valor_utilizado);
  const comprometido = toNumber(rubrica?.saldo_comprometido);
  return total - utilizado - comprometido;
}

function pickRubricaId(payment: any, member: any) {
  return (
    payment?.rubrica_id ||
    payment?.rubricaId ||
    payment?.budget_rubrica_id ||
    payment?.linha_rubrica_id ||
    member?.rubrica_id ||
    null
  );
}

function pickRubricaNome(payment: any, rubrica: any) {
  return (
    payment?.rubrica_nome ||
    payment?.rubrica ||
    rubrica?.nome ||
    rubrica?.rubrica ||
    ''
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { payment_id, action } = body;

    if (!payment_id || !action) {
      return Response.json({ error: 'payment_id e action obrigatórios' }, { status: 400 });
    }

    const payment = await base44.entities.TeamPayment.get(payment_id);

    if (!payment) {
      return Response.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    const member = (await base44.entities.TeamMember.filter({
      user_email: payment?.user_email
    }))?.[0] || null;

    const rubricaId = pickRubricaId(payment, member);

    if (!rubricaId) {
      return Response.json({
        error: 'Pagamento sem rubrica vinculada',
        blocked_by_rubrica: true
      }, { status: 400 });
    }

    const rubrica = await base44.entities.Rubrica.get(rubricaId);

    if (!rubrica?.id) {
      return Response.json({
        error: 'Rubrica vinculada não encontrada',
        blocked_by_rubrica: true
      }, { status: 404 });
    }

    const valor = toNumber(payment?.valor_nf || payment?.valor_parcela_previsto);
    const rubricaNome = pickRubricaNome(payment, rubrica);

    if (action === 'approve') {
      if (payment.status !== 'AGUARDANDO_APROVACAO') {
        return Response.json({ error: 'Status inválido para aprovação' }, { status: 400 });
      }

      const saldo = computeSaldo(rubrica);

      if (saldo < valor) {
        return Response.json({
          error: 'Saldo insuficiente',
          saldo_insuficiente: true
        }, { status: 400 });
      }

      await base44.entities.Rubrica.update(rubrica.id, {
        saldo_comprometido: toNumber(rubrica?.saldo_comprometido) + valor
      });

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'APROVADO_COORD',
        aprov_coord_data: new Date().toISOString(),
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({
        ok: true,
        action: 'approved',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });
    }

    if (action === 'pay') {
      if (payment.status !== 'APROVADO_COORD') {
        return Response.json({ error: 'Pagamento só permitido após aprovação' }, { status: 400 });
      }

      const comprometido = toNumber(rubrica?.saldo_comprometido);

      if (comprometido < valor) {
        const saldo = computeSaldo(rubrica);

        if (saldo < valor) {
          return Response.json({
            error: 'Saldo insuficiente para pagamento',
            saldo_insuficiente: true
          }, { status: 400 });
        }
      }

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: toNumber(rubrica?.valor_utilizado) + valor,
        saldo_comprometido: Math.max(0, comprometido - valor)
      });

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'PAGO',
        valor_pago: valor,
        data_pagamento: new Date().toISOString(),
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({
        ok: true,
        action: 'paid',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });
    }

    if (action === 'return') {
      if (!['AGUARDANDO_APROVACAO', 'APROVADO_COORD'].includes(String(payment.status || ''))) {
        return Response.json({ error: 'Status inválido para devolução' }, { status: 400 });
      }

      if (String(payment.status || '') === 'APROVADO_COORD') {
        await base44.entities.Rubrica.update(rubrica.id, {
          saldo_comprometido: Math.max(0, toNumber(rubrica?.saldo_comprometido) - valor)
        });
      }

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'DEVOLVIDO_REVISAO',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({
        ok: true,
        action: 'returned',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
});
