import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalizeStatus(value: any) {
  return String(value || '').trim().toUpperCase();
}

function normalizeEmail(v: any) {
  return String(v || '').trim().toLowerCase();
}

function computeSaldo(rubrica: any) {
  const total =
    toNumber(rubrica?.valor_total) ||
    toNumber(rubrica?.valor_rubrica);

  const utilizado = toNumber(rubrica?.valor_utilizado);
  const comprometido = toNumber(rubrica?.saldo_comprometido);

  return total - utilizado - comprometido;
}

function isAfterApril2026(mes: string, ano: number) {
  const meses = [
    'JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
    'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'
  ];

  const idx = meses.indexOf(String(mes || '').toUpperCase());
  if (idx === -1) return true;

  if (ano > 2026) return true;
  if (ano < 2026) return false;

  return idx >= 3;
}

/* 🔥 FORÇA RUBRICA REAL (COM FALLBACK + DEBUG) */
async function resolveRubrica(base44: any, payment: any, member: any) {

  const rubrica_id =
    payment?.rubrica_id ||
    member?.rubrica_id;

  if (!rubrica_id) {
    return {
      error: 'Sem rubrica',
      debug: {
        payment_rubrica: payment?.rubrica_id,
        member_rubrica: member?.rubrica_id
      }
    };
  }

  const rubrica = await base44.entities.Rubrica.get(rubrica_id);

  if (!rubrica?.id) {
    return {
      error: 'Rubrica não encontrada',
      debug: { rubrica_id }
    };
  }

  const rubrica_nome =
    payment?.rubrica_nome ||
    member?.rubrica_nome ||
    rubrica?.nome ||
    '';

  // 🔥 GARANTE persistência
  if (!payment?.rubrica_id) {
    await base44.entities.TeamPayment.update(payment.id, {
      rubrica_id,
      rubrica_nome
    });
  }

  return { rubrica, rubrica_id, rubrica_nome };
}

async function logMovimentacao(base44: any, data: any) {
  try {
    await base44.entities.RubricaMovimentacao.create({
      ...data,
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
      return Response.json({ error: 'Valor inválido' }, { status: 400 });
    }

    /* 🔥 MEMBER COM NORMALIZAÇÃO */
    const allMembers = await base44.entities.TeamMember.list();
    const member = allMembers.find(
      (m: any) =>
        normalizeEmail(m.user_email) === normalizeEmail(payment.user_email)
    ) || null;

    /* 🔥 RUBRICA */
    const resolved = await resolveRubrica(base44, payment, member);

    if ((resolved as any)?.error) {
      return Response.json({
        error: resolved.error,
        debug: resolved.debug
      }, { status: 400 });
    }

    const { rubrica, rubrica_id, rubrica_nome } = resolved as any;

    const currentStatus = normalizeStatus(payment.status);
    const requestedAction = String(action || '').toLowerCase();

    const shouldAffectBudget = isAfterApril2026(payment.mes_referencia, payment.ano);

    /* =========================
       APROVAR
    ========================= */
    if (requestedAction === 'approve') {

      if (currentStatus !== 'AGUARDANDO_APROVACAO') {
        return Response.json({
          error: 'Status inválido',
          debug: { status: payment.status }
        }, { status: 400 });
      }

      if (shouldAffectBudget) {
        const saldo = computeSaldo(rubrica);

        if (saldo < valor) {
          return Response.json({
            error: 'Saldo insuficiente',
            debug: {
              rubrica: rubrica_nome,
              saldo,
              valor
            }
          }, { status: 400 });
        }

        await base44.entities.Rubrica.update(rubrica_id, {
          saldo_comprometido: toNumber(rubrica?.saldo_comprometido) + valor
        });

        await logMovimentacao(base44, {
          tipo: 'COMPROMETIDO',
          valor,
          rubrica_id,
          rubrica_nome,
          payment_id: payment.id,
          user_email: payment.user_email,
        });
      }

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'APROVADO_COORD',
        rubrica_id,
        rubrica_nome
      });

      return Response.json({
        ok: true,
        message: 'Pagamento aprovado com sucesso'
      });
    }

    /* =========================
       PAGAR
    ========================= */
    if (requestedAction === 'pay') {

      if (currentStatus !== 'APROVADO_COORD') {
        return Response.json({
          error: 'Precisa estar aprovado',
          debug: { status: payment.status }
        }, { status: 400 });
      }

      if (shouldAffectBudget) {
        await base44.entities.Rubrica.update(rubrica_id, {
          valor_utilizado: toNumber(rubrica?.valor_utilizado) + valor,
          saldo_comprometido: Math.max(0, toNumber(rubrica?.saldo_comprometido) - valor)
        });

        await logMovimentacao(base44, {
          tipo: 'PAGO',
          valor,
          rubrica_id,
          rubrica_nome,
          payment_id: payment.id,
        });
      }

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'PAGO',
        valor_pago: valor,
        data_pagamento: new Date().toISOString(),
        rubrica_id,
        rubrica_nome
      });

      return Response.json({
        ok: true,
        message: 'Pagamento realizado com sucesso'
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (e: any) {
    return Response.json({
      error: e?.message || 'Erro interno',
      stack: e?.stack
    }, { status: 500 });
  }
});
