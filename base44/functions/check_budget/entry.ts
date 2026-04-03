import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
    .trim();

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function getRubricaIdFromMember(member: Record<string, any> | null): string {
  if (!member) return '';
  return String(
    member?.rubrica_id ||
    member?.rubricaId ||
    ''
  ).trim();
}

function computeRubricaTotals(rubrica: Record<string, any> | null) {
  const valorTotal = toNumber(
    rubrica?.valor_total ??
    rubrica?.valor_previsto ??
    rubrica?.orcamento_total ??
    rubrica?.total_previsto
  );

  const valorUtilizado = toNumber(
    rubrica?.valor_utilizado ??
    rubrica?.utilizado
  );

  const saldoComprometido = toNumber(
    rubrica?.saldo_comprometido ??
    rubrica?.comprometido
  );

  const saldoDisponivelDireto = toNumber(
    rubrica?.saldo_disponivel ??
    rubrica?.saldoDisponivel
  );

  const saldoDisponivel = saldoDisponivelDireto > 0
    ? saldoDisponivelDireto
    : (valorTotal - valorUtilizado - saldoComprometido);

  return {
    valor_total: valorTotal,
    valor_utilizado: valorUtilizado,
    saldo_comprometido: saldoComprometido,
    saldo_disponivel: Number.isFinite(saldoDisponivel) ? saldoDisponivel : 0,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const valor = toNumber(body?.valor);
    const contexto = String(body?.contexto || '').trim().toUpperCase();
    const userEmail = String(body?.user_email || '').trim().toLowerCase();
    const mes = String(body?.mes || body?.mes_referencia || '').trim();
    const ano = toNumber(body?.ano);

    if (valor <= 0) {
      return Response.json({
        ok: true,
        blocked_by_rubrica: false,
        saldo_insuficiente: false,
        saldo_disponivel: 0,
        rubrica_id: '',
        contexto,
        mes,
        ano,
        detalhamento: {
          valor_total: 0,
          valor_utilizado: 0,
          saldo_comprometido: 0,
        },
        observacao: 'Valor zerado ou inválido. Nenhum bloqueio aplicado.',
      });
    }

    let member: Record<string, any> | null = null;
    if (userEmail) {
      try {
        const rows = await base44.entities.TeamMember.filter({ user_email: userEmail });
        member = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      } catch {
        member = null;
      }
    }

    const rubricaId = getRubricaIdFromMember(member);

    const exigeRubrica =
      contexto === 'TEAM_PAYMENT' ||
      contexto === 'TEAM_PAYMENT_APPROVAL' ||
      contexto === 'TEAM_PAYMENT_PAYMENT';

    if (exigeRubrica && !rubricaId) {
      return Response.json({
        ok: true,
        blocked_by_rubrica: true,
        saldo_insuficiente: false,
        saldo_disponivel: 0,
        rubrica_id: '',
        contexto,
        mes,
        ano,
        detalhamento: {
          valor_total: 0,
          valor_utilizado: 0,
          saldo_comprometido: 0,
        },
        observacao: 'Membro sem rubrica vinculada.',
      });
    }

    let rubrica: Record<string, any> | null = null;
    if (rubricaId) {
      try {
        rubrica = await base44.entities.Rubrica.get(rubricaId);
      } catch {
        rubrica = null;
      }
    }

    if (exigeRubrica && !rubrica) {
      return Response.json({
        ok: true,
        blocked_by_rubrica: true,
        saldo_insuficiente: false,
        saldo_disponivel: 0,
        rubrica_id: rubricaId || '',
        contexto,
        mes,
        ano,
        detalhamento: {
          valor_total: 0,
          valor_utilizado: 0,
          saldo_comprometido: 0,
        },
        observacao: 'Rubrica vinculada não encontrada.',
      });
    }

    const totals = computeRubricaTotals(rubrica);
    const committedCoversPayment = contexto === 'TEAM_PAYMENT_PAYMENT'
      && totals.saldo_comprometido >= valor;

    const saldoInsuficiente = committedCoversPayment
      ? false
      : totals.saldo_disponivel < valor;

    return Response.json({
      ok: true,
      blocked_by_rubrica: false,
      saldo_insuficiente: saldoInsuficiente,
      saldo_disponivel: totals.saldo_disponivel,
      valor_solicitado: valor,
      rubrica_id: String(rubrica?.id || rubricaId || ''),
      contexto,
      mes,
      ano,
      member_id: String(member?.id || ''),
      member_email: String(member?.user_email || userEmail || ''),
      detalhamento: {
        valor_total: totals.valor_total,
        valor_utilizado: totals.valor_utilizado,
        saldo_comprometido: totals.saldo_comprometido,
      },
      observacao: saldoInsuficiente
        ? 'Saldo insuficiente para a operação.'
        : committedCoversPayment
          ? 'Pagamento permitido usando saldo já comprometido.'
          : 'Saldo validado com sucesso.',
    });
  } catch (error) {
    console.error('check_budget error:', error);

    return Response.json({
      ok: false,
      blocked_by_rubrica: false,
      saldo_insuficiente: false,
      saldo_disponivel: 0,
      error: error?.message || 'Erro interno ao validar saldo.',
    }, { status: 500 });
  }
});
