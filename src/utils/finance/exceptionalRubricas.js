export const RUBRICA_SPECIAL_TYPES = {
  NORMAL: 'NORMAL',
  EXCEPCIONAL: 'EXCEPCIONAL',
  CREDITO_PROJETO: 'CREDITO_PROJETO',
  REPOSICAO_FINANCEIRA: 'REPOSICAO_FINANCEIRA',
  AJUSTE_FINANCEIRO: 'AJUSTE_FINANCEIRO',
  AJUDA_CUSTO: 'AJUDA_CUSTO',
  CORRECAO: 'CORRECAO',
  DEVOLUCAO: 'DEVOLUCAO',
  COMPENSACAO: 'COMPENSACAO',
};

export const RUBRICA_STATUS = {
  ATIVA: 'ATIVA',
  INATIVA: 'INATIVA',
  TEMPORARIA: 'TEMPORARIA',
  EXCEPCIONAL: 'EXCEPCIONAL',
  ARQUIVADA: 'ARQUIVADA',
};

export function toMoneyNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/^R\$/i, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function isCreditRubrica(rubrica = {}) {
  const type = String(rubrica.tipo_especial || rubrica.tipo || '').toUpperCase();
  return [
    RUBRICA_SPECIAL_TYPES.CREDITO_PROJETO,
    RUBRICA_SPECIAL_TYPES.REPOSICAO_FINANCEIRA,
    RUBRICA_SPECIAL_TYPES.DEVOLUCAO,
    RUBRICA_SPECIAL_TYPES.COMPENSACAO,
    RUBRICA_SPECIAL_TYPES.CORRECAO,
  ].includes(type);
}

export function isExceptionalRubrica(rubrica = {}) {
  const type = String(rubrica.tipo_especial || rubrica.tipo || '').toUpperCase();
  return rubrica.excepcional === true ||
    rubrica.sem_meta === true ||
    rubrica.meta_opcional === true ||
    [
      RUBRICA_SPECIAL_TYPES.EXCEPCIONAL,
      RUBRICA_SPECIAL_TYPES.CREDITO_PROJETO,
      RUBRICA_SPECIAL_TYPES.REPOSICAO_FINANCEIRA,
      RUBRICA_SPECIAL_TYPES.AJUSTE_FINANCEIRO,
      RUBRICA_SPECIAL_TYPES.AJUDA_CUSTO,
      RUBRICA_SPECIAL_TYPES.CORRECAO,
      RUBRICA_SPECIAL_TYPES.DEVOLUCAO,
      RUBRICA_SPECIAL_TYPES.COMPENSACAO,
    ].includes(type);
}

export function isArchivedRubrica(rubrica = {}) {
  const status = String(rubrica.status_rubrica || rubrica.status || '').toUpperCase();
  return rubrica.ativo === false || status === RUBRICA_STATUS.ARQUIVADA || status === RUBRICA_STATUS.INATIVA;
}

export function getRubricaTotal(rubrica = {}) {
  return toMoneyNumber(rubrica.valor_rubrica ?? rubrica.valor_total ?? rubrica.valor_previsto ?? 0);
}

export function getRubricaUsed(rubrica = {}) {
  return toMoneyNumber(rubrica.valor_utilizado ?? rubrica.valor_executado ?? rubrica.utilizado ?? 0);
}

export function getRubricaCredit(rubrica = {}) {
  return toMoneyNumber(rubrica.valor_creditado ?? rubrica.valor_reposto ?? (isCreditRubrica(rubrica) ? getRubricaTotal(rubrica) : 0));
}

export function calculateRubricaBalance(rubrica = {}) {
  const total = getRubricaTotal(rubrica);
  const used = getRubricaUsed(rubrica);
  const credit = getRubricaCredit(rubrica);
  const saldo = isCreditRubrica(rubrica) ? credit - used : total - used;
  const base = isCreditRubrica(rubrica) ? Math.max(credit, 1) : Math.max(total, 1);
  return {
    total,
    used,
    credit,
    saldo,
    percentual: base > 0 ? Number(((used / base) * 100).toFixed(2)) : 0,
  };
}

export function classifyRubricaBucket(rubrica = {}) {
  const type = String(rubrica.tipo_especial || rubrica.tipo || '').toUpperCase();
  if (type === RUBRICA_SPECIAL_TYPES.CREDITO_PROJETO) return 'Créditos do Projeto';
  if (type === RUBRICA_SPECIAL_TYPES.REPOSICAO_FINANCEIRA) return 'Reposições Financeiras';
  if (isExceptionalRubrica(rubrica)) return 'Rubricas Extraordinárias';
  return 'Rubricas Orçamentárias';
}
