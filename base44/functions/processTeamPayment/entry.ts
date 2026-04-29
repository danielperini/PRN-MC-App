import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function getValor(p: any) {
  return Number(
    p?.valor ??
    p?.valor_nf ??
    p?.nf_valor_total ??
    p?.valor_total ??
    p?.valor_pago ??
    0
  ) || 0;
}

function normalizeAction(action: any) {
  const a = String(action || '').toLowerCase();

  if (a.includes('aprov') || a.includes('approve')) return 'aprovar';
  if (a.includes('devol') || a.includes('reject')) return 'devolver';
  if (a.includes('pag') || a.includes('pay')) return 'pagar';
  if (a.includes('del') || a.includes('remov')) return 'deletar';

  return a;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    console.log('ACTION RECEBIDA:', body.action);

    const action = normalizeAction(body.action);
    const id = body.id || body.paymentId;

    const payment = await base44.asServiceRole.entities.TeamPayment.get(id);

    if (!payment) return json({ success: false });

    const valor = getValor(payment);
    const rubricaId = payment.rubrica_id;

    console.log('AÇÃO NORMALIZADA:', action);

    // ================= APROVAR =================
    if (action === 'aprovar') {
      const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        saldo_comprometido: (rubrica?.saldo_comprometido || 0) + valor,
      });

      await base44.asServiceRole.entities.TeamPayment.update(id, {
        status: 'APROVADO_COORD',
      });

      return json({ success: true });
    }

    // ================= PAGAR =================
    if (action === 'pagar') {
      const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        valor_utilizado: (rubrica?.valor_utilizado || 0) + valor,
        saldo_comprometido: Math.max(0, (rubrica?.saldo_comprometido || 0) - valor),
      });

      await base44.asServiceRole.entities.TeamPayment.update(id, {
        status: 'PAGO',
      });

      return json({ success: true });
    }

    // ================= DEVOLVER =================
    if (action === 'devolver') {
      await base44.asServiceRole.entities.TeamPayment.update(id, {
        status: 'DEVOLVIDO_REVISAO',
      });

      return json({ success: true });
    }

    // ================= DELETAR =================
    if (action === 'deletar') {
      await base44.asServiceRole.entities.TeamPayment.delete(id);
      return json({ success: true });
    }

    return json({ success: false, error: 'ação não reconhecida' });

  } catch (e: any) {
    console.error(e);
    return json({ success: false, error: e.message });
  }
});
