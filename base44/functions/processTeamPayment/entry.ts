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

async function resolveRubrica(base44: any, payment: any, member: any, body: any) {
  const bodyRubricaId =
    normalizeString(body?.rubrica_id) ||
    normalizeString(body?.rubricaId);

  const bodyRubricaNome =
    normalizeString(body?.rubrica_nome) ||
    normalizeString(body?.rubricaNome);

  const paymentRubricaId = normalizeString(payment?.rubrica_id);
  const memberRubricaId = normalizeString(member?.rubrica_id);

  const rubricaIdFinal = bodyRubricaId || paymentRubricaId || memberRubricaId;

  if (!rubricaIdFinal) {
    return {
      ok: false,
      error: 'Sem rubrica',
      debug: {
        body_rubrica_id: bodyRubricaId || '',
        payment_rubrica_id: paymentRubricaId || '',
        member_rubrica_id: memberRubricaId || '',
        payment_id: payment?.id || '',
        user_email: payment?.user_email || ''
      }
    };
  }

  const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaIdFinal);

  if (!rubrica?.id) {
    return {
      ok: false,
      error: 'Rubrica não encontrada',
      debug: {
        rubrica_id: rubricaIdFinal
      }
    };
  }

  const rubricaNomeFinal =
    bodyRubricaNome ||
    normalizeString(payment?.rubrica_nome) ||
    normalizeString(member?.rubrica_nome) ||
    normalizeString(rubrica?.rubrica) ||
    normalizeString(rubrica?.nome) ||
    normalizeString(rubrica?.descricao);

  if (
    bodyRubricaId !== paymentRubricaId ||
    (rubricaNomeFinal && rubricaNomeFinal !== normalizeString(payment?.rubrica_nome))
  ) {
    await base44.asServiceRole.entities.TeamPayment.update(payment.id, {
      rubrica_id: rubrica.id,
      rubrica_nome: rubricaNomeFinal || ''
    });
  }

  return {
    ok: true,
    rubrica,
    rubrica_id: rubrica.id,
    rubrica_nome: rubricaNomeFinal || ''
  };
}

async function recalculateRubrica(base44: any, rubricaId: string) {
  try {
    await base44.functions.invoke('recalculateRubrica', { rubrica_id: rubricaId });
  } catch (e) {
    console.warn('Falha ao recalcular rubrica individual', e);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const paymentId = body?.payment_id || body?.paymentId || null;
    const action = String(body?.action || '').trim().toLowerCase();

    if (!paymentId || !action) {
      return Response.json(
        { error: 'payment_id e action obrigatórios' },
        { status: 400 }
      );
    }

    const payment = await base44.asServiceRole.entities.TeamPayment.get(paymentId);

    if (!payment?.id) {
      return Response.json(
        { error: 'Pagamento não encontrado' },
        { status: 404 }
      );
    }

    const valor = toNumber(payment?.valor_nf || payment?.valor_parcela_previsto || payment?.valor_pago);

    if (valor <= 0) {
      return Response.json(
        {
          error: 'Pagamento com valor inválido',
          debug: {
            valor_nf: payment?.valor_nf || 0,
            valor_parcela_previsto: payment?.valor_parcela_previsto || 0
          }
        },
        { status: 400 }
      );
    }

    const member = await findMemberByEmail(base44, payment?.user_email || '');

    const resolved = await resolveRubrica(base44, payment, member, body);

    if (!resolved.ok) {
      return Response.json(
        {
          error: resolved.error,
          debug: resolved.debug || {}
        },
        { status: 400 }
      );
    }

    const rubrica = resolved.rubrica;
    const rubricaId = resolved.rubrica_id;
    const rubricaNome = resolved.rubrica_nome;

    if (!rubricaId) {
      return Response.json(
        {
          error: 'Pagamento sem rubrica vinculada',
          debug: {
            payment_id: payment.id,
            rubrica_id: rubricaId || '',
            rubrica_nome: rubricaNome || ''
          }
        },
        { status: 400 }
      );
    }

    const currentStatus = normalizeStatus(payment.status);
    const shouldAffectBudget = isAfterApril2026(payment.mes_referencia, Number(payment.ano || 0));

    if (action === 'approve') {
      if (currentStatus !== 'AGUARDANDO_APROVACAO') {
        return Response.json(
          {
            error: `Status inválido para aprovação: ${payment.status || '—'}`
          },
          { status: 400 }
        );
      }

      if (shouldAffectBudget) {
        const saldoAtual = computeSaldo(rubrica);

        if (saldoAtual < valor) {
          return Response.json(
            {
              error: `Saldo insuficiente na rubrica "${rubricaNome || rubricaId}".`,
              debug: {
                rubrica_id: rubricaId,
                rubrica_nome: rubricaNome,
                saldo_atual: saldoAtual,
                valor_pagamento: valor
              }
            },
            { status: 400 }
          );
        }

        await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
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
          ano: payment.ano,
          observacao: `Aprovação de TeamPayment por ${user.email || 'usuário autenticado'}`
        });

        await recalculateRubrica(base44, rubrica.id);
      }

      await base44.asServiceRole.entities.TeamPayment.update(payment.id, {
        status: 'APROVADO_COORD',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome,
        aprov_coord_data: new Date().toISOString()
      });

      return Response.json({
        ok: true,
        action: 'approved',
        message: 'Pagamento aprovado com sucesso.',
        payment_id: payment.id,
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });
    }

    if (action === 'pay') {
      if (currentStatus === 'PAGO') {
        return Response.json(
          {
            error: 'Pagamento já está marcado como pago',
            debug: {
              payment_id: payment.id,
              status: payment.status
            }
          },
          { status: 400 }
        );
      }

      if (currentStatus !== 'APROVADO_COORD') {
        return Response.json(
          {
            error: `Pagamento só é permitido após aprovação. Status atual: ${payment.status || '—'}`
          },
          { status: 400 }
        );
      }

      if (!rubrica?.id) {
        return Response.json(
          {
            error: 'Pagamento bloqueado: rubrica obrigatória para marcar como pago',
            debug: {
              payment_id: payment.id,
              rubrica_id: rubricaId || '',
              rubrica_nome: rubricaNome || ''
            }
          },
          { status: 400 }
        );
      }

      if (shouldAffectBudget) {
        const comprometidoAtual = toNumber(rubrica?.saldo_comprometido);

        await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
          valor_utilizado: toNumber(rubrica?.valor_utilizado) + valor,
          saldo_comprometido: Math.max(0, comprometidoAtual - valor)
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
          ano: payment.ano,
          observacao: `Pagamento de TeamPayment por ${user.email || 'usuário autenticado'}`
        });

        await recalculateRubrica(base44, rubrica.id);
      }

      await base44.asServiceRole.entities.TeamPayment.update(payment.id, {
        status: 'PAGO',
        valor_pago: valor,
        data_pagamento: new Date().toISOString(),
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({
        ok: true,
        action: 'paid',
        message: 'Pagamento marcado como pago com sucesso.',
        payment_id: payment.id,
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });
    }

    return Response.json(
      { error: 'Ação inválida' },
      { status: 400 }
    );
  } catch (e: any) {
    console.error('processTeamPayment error:', e);
    return Response.json(
      {
        error: e?.message || 'Erro interno no processamento do pagamento'
      },
      { status: 500 }
    );
  }
});
