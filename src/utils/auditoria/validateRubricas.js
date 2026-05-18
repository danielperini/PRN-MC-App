import { getRubricaBudget, getRubricaUsed } from './reconcileFinancialTotals';
import { isArchivedRubrica, isCreditRubrica } from '@/utils/finance/exceptionalRubricas';

export function validateRubricas(rubricas = []) {
  const issues = [];
  const keys = new Set();

  (Array.isArray(rubricas) ? rubricas : []).forEach((rubrica) => {
    if (rubrica?.ativo === false || isArchivedRubrica(rubrica)) return;
    const key = String(rubrica.id || rubrica.codigo || rubrica.nome || rubrica.rubrica || '').toLowerCase();
    if (key) {
      if (keys.has(key)) {
        issues.push({
          type: 'DUPLICATE_RUBRICA',
          severity: 'warning',
          message: `Rubrica duplicada detectada: ${rubrica.nome || rubrica.rubrica || rubrica.codigo}`,
          entityId: rubrica.id,
        });
      }
      keys.add(key);
    }

    const previsto = getRubricaBudget(rubrica);
    const utilizado = getRubricaUsed(rubrica);
    if (previsto <= 0 && !isCreditRubrica(rubrica)) {
      issues.push({
        type: 'RUBRICA_WITHOUT_BUDGET',
        severity: 'info',
        message: `Rubrica sem valor previsto: ${rubrica.nome || rubrica.rubrica || rubrica.codigo || rubrica.id}`,
        entityId: rubrica.id,
      });
    }
    if (utilizado < 0) {
      issues.push({
        type: 'RUBRICA_NEGATIVE_USED',
        severity: 'error',
        message: `Rubrica com valor utilizado negativo: ${rubrica.nome || rubrica.rubrica || rubrica.codigo || rubrica.id}`,
        entityId: rubrica.id,
      });
    }
  });

  return { issues };
}
