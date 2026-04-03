import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalizeStatus(value: any) {
  return String(value || '').trim().toUpperCase();
}

function computeSaldo(rubrica: any) {
  const total =
    toNumber(rubrica?.valor_total) ||
    toNumber(rubrica?.valor_rubrica);

  const utilizado = toNumber(rubrica?.valor_utilizado);
  const comprometido = toNumber(rubrica?.saldo_comprometido);

  return total - utilizado - comprometido;
}

/* 🔒 REGRA CRÍTICA: SOMENTE A PARTIR DE ABRIL/2026 */
function isAfterApril2026(mes: string, ano: number) {
  const meses = [
    'JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
    'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'
  ];

  const idx = meses.indexOf(String(mes || '').toUpperCase());
  if (idx === -1) return true;

  if (ano > 2026) return true;
  if (ano < 2026) return false;

  return idx >= 3; // abril = index 3
}

/* 🔥 NOVO: RESOLVE RUBRICA COM FALLBACK */
function resolveRubrica(payment: any, member: any) {
  return {
    rubrica_id: payment?.rubrica_id || member?.rubrica_id || null,
    rubrica_nome: payment?.rubrica_nome || member?.rubrica_nome || ''
  };
}

async function logMovimentacao(base44: any, data: any) {
  try {
    await base44.entities.RubricaMovimentacao.create({
      tipo: data.tipo,
      valor: data.valor,
      rubrica_id: data.rubrica_id,
      rubrica_nome: data.rubrica_nome || '',
      payment_id: data.payment_id,
      user_email: data.user_email,
      user_name: data.user_name || '',
      mes: data.mes,
      ano: data.ano,
      observacao: data.observacao || '',
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Erro ao registrar log financeiro', e);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { payment_id, action } = body;

    if (!payment_id || !action) {
      return Response.json({ error: 'payment_id e action obrigatórios' }, { status: 400 });
    }

    let payment = await base44.entities.TeamPayment.get(payment_id);

    if (!payment) {
      return Response.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    const valor = toNumber(payment?.valor_nf || payment?.valor_parcela_previsto);

    if (valor <= 0) {
      return Response.json({ error: 'Pagamento com valor inválido' }, { status: 400 });
    }

    const member = (await base44.entities.TeamMember.filter({
      user_email: payment?.user_email
    }))?.[0] || null;

    /* 🔥 NOVO: RESOLVE RUBRICA AUTOMATICAMENTE */
    const resolved = resolveRubrica(payment, member);

    if (!resolved.rubrica_id) {
      return Response.json({ error: 'Pagamento sem rubrica vinculada' }, { status: 400 });
    }

    const rubrica = await base44.entities.Rubrica.get(resolved.rubrica_id);

    if (!rubrica?.id) {
      return Response.json({ error: 'Rubrica não encontrada' }, { status: 404 });
    }

    const rubricaNome = resolved.rubrica_nome || rubrica?.nome || '';
    const currentStatus = normalizeStatus(payment.status);
    const requestedAction = String(action || '').trim().toLowerCase();

    const shouldAffectBudget = isAfterApril2026(payment.mes_referencia, payment.ano);

    /* =========================
       APROVAÇÃO
    ========================= */

    if (requestedAction === 'approve') {
      if (currentStatus !== 'AGUARDANDO_APROVACAO') {
        return Response.json({ error: 'Status inválido para aprovação' }, { status: 400 });
      }

      if (shouldAffectBudget) {
        const saldo = computeSaldo(rubrica);

        if (saldo < valor) {
          return Response.json({ error: 'Saldo insuficiente' }, { status: 400 });
        }

        await base44.entities.Rubrica.update(rubrica.id, {
          saldo_comprometido: toNumber(rubrica?.saldo_comprometido) + valor
        });

        await logMovimentacao(base44, {
          tipo: 'COMPROMETIDO',
          valor,
          rubrica_id: rubrica.id,
          rubrica_nome: rubricaNome,
          payment_id: payment.id,
          user_email: payment.user_email,
          user_name: payment.user_name,
          mes: payment.mes_referencia,
          ano: payment.ano
        });
      }

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'APROVADO_COORD',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({ ok: true, action: 'approved' });
    }

    /* =========================
       PAGAMENTO
    ========================= */

    if (requestedAction === 'pay') {
      if (currentStatus !== 'APROVADO_COORD') {
        return Response.json({ error: 'Pagamento só após aprovação' }, { status: 400 });
      }

      if (shouldAffectBudget) {
        const comprometido = toNumber(rubrica?.saldo_comprometido);

        await base44.entities.Rubrica.update(rubrica.id, {
          valor_utilizado: toNumber(rubrica?.valor_utilizado) + valor,
          saldo_comprometido: Math.max(0, comprometido - valor)
        });

        await logMovimentacao(base44, {
          tipo: 'PAGO',
          valor,
          rubrica_id: rubrica.id,
          rubrica_nome: rubricaNome,
          payment_id: payment.id,
          user_email: payment.user_email,
          user_name: payment.user_name,
          mes: payment.mes_referencia,
          ano: payment.ano
        });
      }

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'PAGO',
        valor_pago: valor,
        data_pagamento: new Date().toISOString(),
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({ ok: true, action: 'paid' });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (e: any) {
    return Response.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
});
