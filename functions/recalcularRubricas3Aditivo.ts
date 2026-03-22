import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MUSEUS = ['MIS', 'MUMO', 'MHAB'];

/* 🔧 helpers mantidos */

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeMuseum(value) {
  const text = normalizeText(value).toUpperCase();
  for (const museu of MUSEUS) {
    if (text.includes(museu)) return museu;
  }
  return null;
}

function getPurchaseValue(compra) {
  return (
    toNumber(compra?.valor_pago) ||
    toNumber(compra?.valor_aprovado_admin) ||
    toNumber(compra?.valor_aprovado) ||
    toNumber(compra?.valor_final) ||
    toNumber(compra?.valor_solicitado) ||
    0
  );
}

/* 🔥 NOVO: considerar aprovados também */
function isFinanceRelevant(compra) {
  const status = String(compra?.status || '').toUpperCase();
  return (
    status === 'PAGO' ||
    status === 'APROVADO_COORD' ||
    status === 'APROVADO_ADMIN'
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 200);
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 300);

    const totalPorRubrica = new Map();
    const countPorRubrica = new Map();

    let comprasSemRubrica = 0;

    for (const compra of purchases) {
      if (!isFinanceRelevant(compra)) continue;

      const rubricaId = compra?.rubrica_id;

      if (!rubricaId) {
        comprasSemRubrica++;
        continue;
      }

      const valor = getPurchaseValue(compra);

      totalPorRubrica.set(
        rubricaId,
        (totalPorRubrica.get(rubricaId) || 0) + valor
      );

      countPorRubrica.set(
        rubricaId,
        (countPorRubrica.get(rubricaId) || 0) + 1
      );
    }

    let totalPrevisto = 0;
    let totalUtilizado = 0;
    let saldoTotal = 0;

    for (const rubrica of rubricas) {
      const valorRubrica = toNumber(rubrica.valor_rubrica);
      const valorUtilizado = toNumber(totalPorRubrica.get(rubrica.id) || 0);
      const saldo = valorRubrica - valorUtilizado;

      const percentualUtilizado =
        valorRubrica > 0
          ? Math.round((valorUtilizado / valorRubrica) * 10000) / 100
          : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
        total_compras: countPorRubrica.get(rubrica.id) || 0,
      });

      totalPrevisto += valorRubrica;
      totalUtilizado += valorUtilizado;
      saldoTotal += saldo;
    }

    return Response.json({
      success: true,
      total_previsto: totalPrevisto,
      total_utilizado: totalUtilizado,
      saldo_total: saldoTotal,
      compras_sem_rubrica: comprasSemRubrica,
    });

  } catch (error) {
    console.error('recalcularRubricas3Aditivo error:', error);

    return Response.json(
      { success: false, error: error.message || 'Erro ao recalcular rubricas' },
      { status: 500 }
    );
  }
});
