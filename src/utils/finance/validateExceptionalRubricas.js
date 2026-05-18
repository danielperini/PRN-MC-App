import { calculateRubricaBalance, isArchivedRubrica, isCreditRubrica, isExceptionalRubrica } from './exceptionalRubricas';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateExceptionalRubricas(rubricas = []) {
  const issues = [];
  const seen = new Map();

  (Array.isArray(rubricas) ? rubricas : []).forEach((rubrica) => {
    if (isArchivedRubrica(rubrica)) return;

    const name = rubrica.rubrica || rubrica.nome_rubrica || rubrica.nome || rubrica.descricao || rubrica.id;
    const key = normalize([name, rubrica.grupo, rubrica.centro_custo, rubrica.tipo_especial || rubrica.tipo].filter(Boolean).join('|'));
    if (key && seen.has(key)) {
      issues.push({
        type: 'RUBRICA_DUPLICADA',
        severity: 'warning',
        message: `Possível rubrica duplicada: ${name}`,
        entityId: rubrica.id,
      });
    }
    seen.set(key, rubrica);

    const balance = calculateRubricaBalance(rubrica);
    if (balance.saldo < 0 && !isCreditRubrica(rubrica)) {
      issues.push({
        type: 'SALDO_NEGATIVO',
        severity: 'error',
        message: `Rubrica com saldo negativo: ${name}`,
        entityId: rubrica.id,
        found: balance.saldo,
      });
    }

    if (isExceptionalRubrica(rubrica) && !rubrica.motivo_criacao && !rubrica.motivo_ajuste) {
      issues.push({
        type: 'RUBRICA_EXCEPCIONAL_SEM_MOTIVO',
        severity: 'info',
        message: `Rubrica extraordinária sem motivo registrado: ${name}`,
        entityId: rubrica.id,
      });
    }

    if (isCreditRubrica(rubrica) && balance.credit <= 0) {
      issues.push({
        type: 'CREDITO_SEM_VALOR',
        severity: 'warning',
        message: `Crédito/reposição sem valor creditado: ${name}`,
        entityId: rubrica.id,
      });
    }
  });

  return { issues };
}
