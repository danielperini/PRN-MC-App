import { toAuditNumber } from './deduplicateAudience';
import { getRubricaCredit, isArchivedRubrica, isCreditRubrica } from '@/utils/finance/exceptionalRubricas';

export const OFFICIAL_ADITIVO_TOTAL = 1320000;

export function getRubricaBudget(rubrica = {}) {
  return toAuditNumber(
    rubrica.valor_total ??
      rubrica.valor_previsto ??
      rubrica.valor_orcado ??
      rubrica.valor_original ??
      rubrica.valor ??
      0
  );
}

export function getRubricaUsed(rubrica = {}) {
  return toAuditNumber(rubrica.valor_utilizado ?? rubrica.valor_executado ?? rubrica.utilizado ?? 0);
}

export function reconcileFinancialTotals(rubricas = [], options = {}) {
  const officialTotal = toAuditNumber(options.officialTotal || OFFICIAL_ADITIVO_TOTAL);
  const active = (Array.isArray(rubricas) ? rubricas : []).filter((rubrica) => rubrica?.ativo !== false && !isArchivedRubrica(rubrica));
  const byId = new Map();

  active.forEach((rubrica) => {
    const key = rubrica.id || rubrica.codigo || rubrica.nome || rubrica.rubrica;
    if (!key || byId.has(key)) return;
    byId.set(key, rubrica);
  });

  const uniqueRubricas = Array.from(byId.values());
  const budgetRubricas = uniqueRubricas.filter((rubrica) => !isCreditRubrica(rubrica));
  const creditRubricas = uniqueRubricas.filter(isCreditRubrica);
  const totalPrevistoRubricas = budgetRubricas.reduce((sum, rubrica) => sum + getRubricaBudget(rubrica), 0);
  const totalCreditosProjeto = creditRubricas.reduce((sum, rubrica) => sum + getRubricaCredit(rubrica), 0);
  const totalUtilizado = uniqueRubricas.reduce((sum, rubrica) => sum + getRubricaUsed(rubrica), 0);
  const saldo = officialTotal + totalCreditosProjeto - totalUtilizado;
  const percentualExecucao = officialTotal > 0 ? Number(((totalUtilizado / officialTotal) * 100).toFixed(2)) : 0;

  const byGroupMap = {};
  uniqueRubricas.forEach((rubrica) => {
    const grupo = rubrica.grupo || rubrica.categoria || rubrica.eixo || 'Sem grupo';
    if (!byGroupMap[grupo]) byGroupMap[grupo] = { grupo, previsto: 0, utilizado: 0, saldo: 0, rubricas: 0 };
    byGroupMap[grupo].previsto += isCreditRubrica(rubrica) ? getRubricaCredit(rubrica) : getRubricaBudget(rubrica);
    byGroupMap[grupo].utilizado += getRubricaUsed(rubrica);
    byGroupMap[grupo].rubricas += 1;
  });

  Object.values(byGroupMap).forEach((group) => {
    group.saldo = group.previsto - group.utilizado;
    group.percentual = group.previsto > 0 ? Number(((group.utilizado / group.previsto) * 100).toFixed(2)) : 0;
  });

  const inconsistencies = [];
  if (Math.abs(totalPrevistoRubricas - officialTotal) > 1) {
    inconsistencies.push({
      type: 'FINANCE_TOTAL_DIVERGENCE',
      severity: 'warning',
      message: 'A soma das rubricas difere do total oficial do 3º Aditivo.',
      expected: officialTotal,
      found: totalPrevistoRubricas,
    });
  }

  uniqueRubricas.forEach((rubrica) => {
    const previsto = getRubricaBudget(rubrica);
    const utilizado = getRubricaUsed(rubrica);
    if (utilizado > previsto && previsto > 0) {
      inconsistencies.push({
        type: 'RUBRICA_OVERUSED',
        severity: 'error',
        message: `Rubrica com execução acima do previsto: ${rubrica.nome || rubrica.rubrica || rubrica.codigo || rubrica.id}`,
        entityId: rubrica.id,
        expected: previsto,
        found: utilizado,
      });
    }
  });

  return {
    officialTotal,
    totalPrevistoRubricas,
    totalCreditosProjeto,
    totalDisponivelComCreditos: officialTotal + totalCreditosProjeto,
    totalUtilizado,
    saldo,
    percentualExecucao,
    rubricas: uniqueRubricas,
    byGroup: Object.values(byGroupMap).sort((a, b) => a.grupo.localeCompare(b.grupo)),
    inconsistencies,
  };
}
