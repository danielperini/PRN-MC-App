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

function pickFirst<T = any>(arr: T[] | null | undefined): T | null {
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

function getBudgetLineIdFromMember(member: Record<string, any> | null): string {
  if (!member) return '';
  return String(
    member?.budgetline_id ||
    member?.budget_line_id ||
    member?.linha_orcamentaria_id ||
    member?.budgetLineId ||
    ''
  ).trim();
}

function getRubricaIdFromMember(member: Record<string, any> | null): string {
  if (!member) return '';
  return String(
    member?.rubrica_id ||
    member?.rubricaId ||
    ''
  ).trim();
}

function computeSaldoDisponivel(source: Record<string, any> | null): number {
  if (!source) return 0;

  const saldoDisponivelDireto = toNumber(
    source?.saldo_disponivel ??
    source?.saldoDisponivel
  );
  if (saldoDisponivelDireto > 0) return saldoDisponivelDireto;

  const valorTotal = toNumber(
    source?.valor_total ??
    source?.valor_previsto ??
    source?.orcamento_total ??
    source?.total_previsto
  );

  const valorUtilizado = toNumber(
    source?.valor_utilizado ??
    source?.utilizado
  );

  const saldoComprometido = toNumber(
    source?.saldo_comprometido ??
    source?.comprometido
  );

  const saldoRestante = valorTotal - valorUtilizado - saldoComprometido;
  return Number.isFinite(saldoRestante) ? saldoRestante : 0;
}

async function tryGetEntity(base44: any, entityName: string, id: string) {
  if (!id) return null;
  try {
    const entity = base44?.entities?.[entityName];
    if (!entity?.get) return null;
    return await entity.get(id);
  } catch {
    return null;
  }
}

async function tryFilterFirst(base44: any, entityName: string, filter: Record<string, any>) {
  try {
    const entity = base44?.entities?.[entityName];
    if (!entity?.filter) return null;
    const rows = await entity.filter(filter);
    return pickFirst(rows);
  } catch {
    return null;
  }
}

async function resolveRubricaFromBudgetLine(base44: any, budgetLine: Record<string, any> | null) {
  if (!budgetLine) return null;

  const directRubricaId = String(
    budgetLine?.rubrica_id ||
    budgetLine?.rubricaId ||
    ''
  ).trim();

  if (directRubricaId) {
    const rubrica = await tryGetEntity(base44, 'Rubrica', directRubricaId);
    if (rubrica) return rubrica;
  }

  const budgetLineId = String(
    budgetLine?.id ||
    budgetLine?.budgetline_id ||
    budgetLine?.budget_line_id ||
    ''
  ).trim();

  if (!budgetLineId) return null;

  const rubricaByBudgetLine = await tryFilterFirst(base44, 'Rubrica', { budgetline_id: budgetLineId });
  if (rubricaByBudgetLine) return rubricaByBudgetLine;

  const rubricaByBudgetLineAlt = await tryFilterFirst(base44, 'Rubrica', { budget_line_id: budgetLineId });
  if (rubricaByBudgetLineAlt) return rubricaByBudgetLineAlt;

  return null;
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
        valor_solicitado: valor,
        contexto,
        observacao: 'Valor zerado ou inválido. Nenhum bloqueio aplicado.'
      });
    }

    let member: Record<string, any> | null = null;
    if (userEmail) {
      member = await tryFilterFirst(base44, 'TeamMember', { user_email: userEmail });
    }

    const budgetLineId = getBudgetLineIdFromMember(member);
    const rubricaId = getRubricaIdFromMember(member);

    let budgetLine: Record<string, any> | null = null;
    let rubrica: Record<string, any> | null = null;

    if (budgetLineId) {
      budgetLine = await tryGetEntity(base44, 'BudgetLine', budgetLineId);
    }

    if (rubricaId) {
      rubrica = await tryGetEntity(base44, 'Rubrica', rubricaId);
    }

    if (!rubrica && budgetLine) {
      rubrica = await resolveRubricaFromBudgetLine(base44, budgetLine);
    }

    if (!budgetLine && rubrica?.budgetline_id) {
      budgetLine = await tryGetEntity(base44, 'BudgetLine', String(rubrica.budgetline_id));
    }

    if (!budgetLine && rubrica?.budget_line_id) {
      budgetLine = await tryGetEntity(base44, 'BudgetLine', String(rubrica.budget_line_id));
    }

    const source = rubrica || budgetLine;

    const exigeVinculo =
      contexto === 'TEAM_PAYMENT' ||
      contexto === 'TEAM_PAYMENT_APPROVAL' ||
      contexto === 'TEAM_PAYMENT_PAYMENT';

    if (exigeVinculo && !source) {
      return Response.json({
        ok: true,
        blocked_by_rubrica: true,
        saldo_insuficiente: false,
        saldo_disponivel: 0,
        valor_solicitado: valor,
        contexto,
        mes,
        ano,
        budget_line_id: budgetLineId || '',
        rubrica_id: rubricaId || '',
        observacao: 'Nenhuma rubrica ou BudgetLine vinculada ao membro para este fluxo.'
      });
    }

    const saldoDisponivel = computeSaldoDisponivel(source);
    const saldoComprometido = toNumber(
      source?.saldo_comprometido ??
      source?.comprometido
    );

    const committedCoversPayment =
      contexto === 'TEAM_PAYMENT_PAYMENT' &&
      saldoComprometido >= valor;

    const saldoInsuficiente = committedCoversPayment
      ? false
      : saldoDisponivel < valor;

    return Response.json({
      ok: true,
      blocked_by_rubrica: false,
      saldo_insuficiente: saldoInsuficiente,
      saldo_disponivel: saldoDisponivel,
      valor_solicitado: valor,
      contexto,
      mes,
      ano,
      budget_line_id: String(
        budgetLine?.id ||
        budgetLineId ||
        rubrica?.budgetline_id ||
        rubrica?.budget_line_id ||
        ''
      ),
      rubrica_id: String(
        rubrica?.id ||
        rubricaId ||
        budgetLine?.rubrica_id ||
        ''
      ),
      member_id: String(member?.id || ''),
      member_email: userEmail || String(member?.user_email || ''),
      detalhamento: {
        valor_total: toNumber(
          source?.valor_total ??
          source?.valor_previsto ??
          source?.orcamento_total ??
          source?.total_previsto
        ),
        valor_utilizado: toNumber(
          source?.valor_utilizado ??
          source?.utilizado
        ),
        saldo_comprometido: saldoComprometido
      },
      observacao: saldoInsuficiente
        ? 'Saldo insuficiente para a operação.'
        : committedCoversPayment
          ? 'Pagamento permitido usando saldo já comprometido.'
          : 'Saldo validado com sucesso.'
    });
  } catch (error: any) {
    console.error('check_budget error:', error);

    return Response.json({
      ok: false,
      blocked_by_rubrica: false,
      saldo_insuficiente: false,
      saldo_disponivel: 0,
      error: error?.message || 'Erro interno ao validar saldo.'
    }, { status: 500 });
  }
});
