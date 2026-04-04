import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalizeStatus(value: any) {
  return String(value || '').trim().toUpperCase();
}

function normalizeString(value: any) {
  return String(value || '').trim();
}

function normalizeEmail(value: any) {
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

function isAfterApril2026(mes: string, ano: number) {
  const meses = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
  ];

  const idx = meses.indexOf(String(mes || '').toUpperCase());
  if (idx === -1) return true;
  if (ano > 2026) return true;
  if (ano < 2026) return false;
  return idx >= 3;
}

async function logMovimentacao(base44: any, data: any) {
  try {
    const entity =
      base44?.asServiceRole?.entities?.RubricaMovimentacao ||
      base44?.entities?.RubricaMovimentacao;

    if (!entity) return;

    await entity.create({
      tipo: data.tipo,
      valor: data.valor,
      rubrica_id: data.rubrica_id,
      rubrica_nome: data.rubrica_nome || '',
      payment_id: data.payment_id,
      user_email: data.user_email || '',
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

async function findMemberByEmail(base44: any, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  try {
    const rows = await base44.asServiceRole.entities.TeamMember.filter({
      user_email: normalized
    });
    if (Array.isArray(rows) && rows.length > 0) return rows[0];
  } catch {}

  try {
    const all = await base44.asServiceRole.entities.TeamMember.list('user_email', 500);
    if (Array.isArray(all)) {
      return all.find((m: any) => normalizeEmail(m?.user_email) === normalized) || null;
    }
  } catch {}

  return null;
}

/* 🔥 GARANTE RUBRICA OBRIGATÓRIA */
async function resolveRubrica(base44: any, payment: any, member: any, body: any) {

  const bodyRubricaId =
    normalizeString(body?.rubrica_id) ||
    normalizeString(body?.rubricaId);

  const paymentRubricaId = normalizeString(payment?.rubrica_id);
  const memberRubricaId = normalizeString(member?.rubrica_id);

  const rubricaIdFinal = bodyRubricaId || paymentRubricaId || memberRubricaId;

  if (!rubricaIdFinal) {
    return {
      ok: false,
      error: 'Sem rubrica',
      debug: {
        payment_id: payment?.id,
        user_email: payment?.user_email
      }
    };
  }

  const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaIdFinal);

  if (!rubrica?.id) {
    return {
      ok: false,
      error: 'Rubrica não encontrada'
    };
  }

  /* 🔥 FORÇA PERSISTÊNCIA SEMPRE */
  await base44.asServiceRole.entities.TeamPayment.update(payment.id, {
    rubrica_id: rubrica.id,
    rubrica_nome:
      rubrica?.rubrica ||
      rubrica?.nome ||
      rubrica?.descricao ||
      ''
  });

  return {
    ok: true,
    rubrica,
    rubrica_id: rubrica.id,
    rubrica_nome:
      rubrica?.rubrica ||
      rubrica?.nome ||
      rubrica?.descricao ||
      ''
  };
}

async function recalculateRubrica(base44: any, rubricaId: string) {
  try {
    await base44.functions.invoke('recalculateRubrica', { rubrica_id: rubricaId });
  } catch (e) {
    console.warn('Falha ao recalcular rubrica', e);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const paymentId = body?.payment_id;
    const action = String(body?.action || '').toLowerCase();

    const payment = await base44.asServiceRole.entities.TeamPayment.get(paymentId);

    const valor = toNumber(payment?.valor_nf || payment?.valor_parcela_previsto);

    const member = await findMemberByEmail(base44, payment?.user_email || '');

    const resolved = await resolveRubrica(base44, payment, member, body);

    if (!resolved.ok) {
      return Response.json({ error: resolved.error }, { status: 400 });
    }

    const rubrica = resolved.rubrica;

    const currentStatus = normalizeStatus(payment.status);

    /* =========================
       APROVAR
    ========================= */
    if (action === 'approve') {

      if (currentStatus !== 'AGUARDANDO_APROVACAO') {
        return Response.json({ error: 'Status inválido' }, { status: 400 });
      }

      const saldoAtual = computeSaldo(rubrica);

      if (saldoAtual < valor) {
        return Response.json({ error: 'Saldo insuficiente' }, { status: 400 });
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        saldo_comprometido: toNumber(rubrica.saldo_comprometido) + valor
      });

      await logMovimentacao(base44, {
        tipo: 'COMPROMETIDO',
        valor,
        rubrica_id: rubrica.id,
        payment_id: payment.id
      });

      await recalculateRubrica(base44, rubrica.id);

      await base44.asServiceRole.entities.TeamPayment.update(payment.id, {
        status: 'APROVADO_COORD'
      });

      return Response.json({ ok: true });
    }

    /* =========================
       PAGAR
    ========================= */
    if (action === 'pay') {

      if (currentStatus !== 'APROVADO_COORD') {
        return Response.json({ error: 'Precisa estar aprovado' }, { status: 400 });
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: toNumber(rubrica.valor_utilizado) + valor,
        saldo_comprometido: Math.max(0, toNumber(rubrica.saldo_comprometido) - valor)
      });

      await logMovimentacao(base44, {
        tipo: 'PAGO',
        valor,
        rubrica_id: rubrica.id,
        payment_id: payment.id
      });

      await recalculateRubrica(base44, rubrica.id);

      await base44.asServiceRole.entities.TeamPayment.update(payment.id, {
        status: 'PAGO',
        valor_pago: valor,
        data_pagamento: new Date().toISOString()
      });

      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});
