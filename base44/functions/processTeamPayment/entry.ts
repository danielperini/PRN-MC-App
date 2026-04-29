import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function getValor(p: any) {
  return Number(
    p?.valor_pago ??
    p?.valor_nf ??
    p?.valor ??
    p?.nf_valor_total ??
    p?.valor_total ??
    0
  ) || 0;
}

function normalizeAction(action: any) {
  const a = String(action || '').toLowerCase();
  if (a.includes('aprov') || a.includes('approve')) return 'aprovar';
  if (a.includes('devol') || a.includes('reject') || a.includes('rejeit')) return 'devolver';
  if (a.includes('pag') || a.includes('pay')) return 'pagar';
  if (a.includes('del') || a.includes('remov') || a.includes('exclu')) return 'deletar';
  return a;
}

async function getRubrica(base44: any, rubricaId: string) {
  if (!rubricaId) throw new Error('Rubrica obrigatória');
  const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);
  if (!rubrica) throw new Error('Rubrica não encontrada');
  return rubrica;
}

async function debitarRealizado(base44: any, rubricaId: string, valor: number) {
  const rubrica = await getRubrica(base44, rubricaId);

  await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
    valor_utilizado: Number(rubrica?.valor_utilizado || 0) + valor,
    saldo_comprometido: Math.max(0, Number(rubrica?.saldo_comprometido || 0) - valor),
  });
}

async function estornarRealizado(base44: any, rubricaId: string, valor: number) {
  const rubrica = await getRubrica(base44, rubricaId);

  await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
    valor_utilizado: Math.max(0, Number(rubrica?.valor_utilizado || 0) - valor),
  });
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

    const valor = getValor(payment);
    const rubricaId = payment.rubrica_id;

    if (['aprovar', 'pagar'].includes(action)) {
      if (!rubricaId) return json({ success: false, error: 'Pagamento sem rubrica vinculada' }, 400);
      if (!valor) return json({ success: false, error: 'Valor do pagamento inválido' }, 400);
    }

    if (action === 'aprovar') {
      const jaDebitado = Boolean(payment.rubrica_debitada_em || payment.financeiro_lancado_em);

      if (!jaDebitado) {
        await debitarRealizado(base44, rubricaId, valor);
      }

      await base44.asServiceRole.entities.TeamPayment.update(id, {
        status: 'APROVADO_COORD',
        valor_nf: valor,
        valor_pago: valor,
        aprov_coord_data: payment.aprov_coord_data || new Date().toISOString(),
        financeiro_lancado_em: payment.financeiro_lancado_em || new Date().toISOString(),
        rubrica_debitada_em: payment.rubrica_debitada_em || new Date().toISOString(),
        rubrica_debitada_valor: valor,
      });

      return json({ success: true, status: 'APROVADO_COORD', valor_debitado: jaDebitado ? 0 : valor });
    }

    if (action === 'pagar') {
      const jaDebitado = Boolean(payment.rubrica_debitada_em || payment.financeiro_lancado_em);

      if (!jaDebitado) {
        await debitarRealizado(base44, rubricaId, valor);
      }

      await base44.asServiceRole.entities.TeamPayment.update(id, {
        status: 'PAGO',
        valor_pago: valor,
        data_pagamento: payment.data_pagamento || new Date().toISOString(),
        pago_em: payment.pago_em || new Date().toISOString(),
        financeiro_lancado_em: payment.financeiro_lancado_em || new Date().toISOString(),
        rubrica_debitada_em: payment.rubrica_debitada_em || new Date().toISOString(),
        rubrica_debitada_valor: valor,
      });

      return json({ success: true, status: 'PAGO', valor_debitado: jaDebitado ? 0 : valor });
    }

    if (action === 'devolver') {
      const jaDebitado = Boolean(payment.rubrica_debitada_em || payment.financeiro_lancado_em);

      if (jaDebitado && rubricaId && valor) {
        await estornarRealizado(base44, rubricaId, valor);
      }

      await base44.asServiceRole.entities.TeamPayment.update(id, {
        status: 'DEVOLVIDO_REVISAO',
        observacoes: [
          payment.observacoes || '',
          body.comentario || body.motivo || body.reason || 'Devolvido para revisão.'
        ].filter(Boolean).join('\n\n'),
        financeiro_lancado_em: null,
        rubrica_debitada_em: null,
        rubrica_debitada_valor: 0,
      });

      return json({ success: true, status: 'DEVOLVIDO_REVISAO' });
    }

    if (action === 'deletar') {
      const jaDebitado = Boolean(payment.rubrica_debitada_em || payment.financeiro_lancado_em);

      if (jaDebitado && rubricaId && valor) {
        await estornarRealizado(base44, rubricaId, valor);
      }

      await base44.asServiceRole.entities.TeamPayment.delete(id);
      return json({ success: true, deleted: true });
    }

    return json({ success: false, error: 'Ação inválida' }, 400);
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Erro interno' }, 500);
  }
});
