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
  return payment?.rubrica_id || member?.rubrica_id || null;
}

function pickRubricaNome(payment: any, rubrica: any) {
  return payment?.rubrica_nome || rubrica?.nome || '';
}

async function logMovimentacao(base44: any, data: any) {
  try {
    await base44.entities.RubricaMovimentacao.create({
      tipo: data.tipo,
      valor: data.valor,
      rubrica_id: data.rubrica_id,
      payment_id: data.payment_id,
      user_email: data.user_email,
      mes: data.mes,
      ano: data.ano,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Erro ao registrar log financeiro', e);
  }
}

async function removeDuplicados(base44: any, payment: any) {
  const duplicates = await base44.entities.TeamPayment.filter({
    user_email: payment.user_email,
    mes_referencia: payment.mes_referencia,
    ano: payment.ano
  });

  if (!duplicates || duplicates.length <= 1) return true;

  const sorted = duplicates.sort((a: any, b: any) => {
    const va = toNumber(a.valor_nf || a.valor_parcela_previsto);
    const vb = toNumber(b.valor_nf || b.valor_parcela_previsto);

    if (vb !== va) return vb - va;

    return new Date(b.created_date || 0).getTime() -
           new Date(a.created_date || 0).getTime();
  });

  const keep = sorted[0];
  const toDelete = sorted.slice(1);

  for (const d of toDelete) {
    try {
      await base44.entities.TeamPayment.delete(d.id);
    } catch {
      console.error('Erro ao deletar duplicado:', d.id);
    }
  }

  return keep.id === payment.id;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { payment_id, action } = body;

    if (!payment_id || !action) {
      return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    let payment = await base44.entities.TeamPayment.get(payment_id);

    if (!payment) {
      return Response.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    // 🔥 REMOVE DUPLICADOS
    const stillValid = await removeDuplicados(base44, payment);

    if (!stillValid) {
      return Response.json({
        error: 'Pagamento duplicado removido automaticamente'
      }, { status: 409 });
    }

    const member = (await base44.entities.TeamMember.filter({
      user_email: payment.user_email
    }))?.[0] || null;

    const rubricaId = pickRubricaId(payment, member);

    if (!rubricaId) {
      return Response.json({ error: 'Sem rubrica vinculada' }, { status: 400 });
    }

    const rubrica = await base44.entities.Rubrica.get(rubricaId);

    const valor = toNumber(payment?.valor_nf || payment?.valor_parcela_previsto);
    const rubricaNome = pickRubricaNome(payment, rubrica);

    // ========================
    // APROVAR
    // ========================
    if (action === 'approve') {
      if (payment.status !== 'AGUARDANDO_APROVACAO') {
        return Response.json({ error: 'Status inválido' }, { status: 400 });
      }

      const saldo = computeSaldo(rubrica);

      if (saldo < valor) {
        return Response.json({ error: 'Saldo insuficiente' }, { status: 400 });
      }

      await base44.entities.Rubrica.update(rubrica.id, {
        saldo_comprometido: toNumber(rubrica.saldo_comprometido) + valor
      });

      await logMovimentacao(base44, {
        tipo: 'COMPROMETIDO',
        valor,
        rubrica_id: rubrica.id,
        payment_id: payment.id,
        user_email: payment.user_email,
        mes: payment.mes_referencia,
        ano: payment.ano
      });

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'APROVADO_COORD',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({ ok: true });
    }

    // ========================
    // PAGAR
    // ========================
    if (action === 'pay') {
      if (payment.status !== 'APROVADO_COORD') {
        return Response.json({ error: 'Pagamento só após aprovação' }, { status: 400 });
      }

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: toNumber(rubrica.valor_utilizado) + valor,
        saldo_comprometido: Math.max(0, toNumber(rubrica.saldo_comprometido) - valor)
      });

      await logMovimentacao(base44, {
        tipo: 'PAGO',
        valor,
        rubrica_id: rubrica.id,
        payment_id: payment.id,
        user_email: payment.user_email,
        mes: payment.mes_referencia,
        ano: payment.ano
      });

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'PAGO',
        valor_pago: valor,
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({ ok: true });
    }

    // ========================
    // DEVOLVER
    // ========================
    if (action === 'return') {
      await logMovimentacao(base44, {
        tipo: 'ESTORNO',
        valor,
        rubrica_id: rubrica.id,
        payment_id: payment.id,
        user_email: payment.user_email,
        mes: payment.mes_referencia,
        ano: payment.ano
      });

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'DEVOLVIDO_REVISAO',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});
