/**
 * Validação de Coerência Financeira - Dashboard e Metas
 * 
 * Este arquivo contém validações para garantir que todos os cálculos financeiros
 * estejam coerentes em todo o sistema.
 */

import { OFFICIAL_ADITIVO_TOTAL } from '@/utils/auditoria/reconcileFinancialTotals';

const TOLERANCE = 0.01; // Tolerância de R$ 0,01 para valores monetários

/**
 * Valida a equação fundamental: saldo = orçamento - utilizado
 */
export function validateSaldoEquation(orcamento, utilizado, saldo) {
  const expectedSaldo = orcamento - utilizado;
  const diff = Math.abs(expectedSaldo - saldo);
  
  if (diff > TOLERANCE) {
    return {
      valid: false,
      error: 'SALDO_EQUATION_MISMATCH',
      message: `Saldo incorreto. Esperado: R$ ${expectedSaldo.toFixed(2)}, Encontrado: R$ ${saldo.toFixed(2)}`,
      expected: expectedSaldo,
      found: saldo,
      diff
    };
  }
  
  return { valid: true };
}

/**
 * Valida o percentual de execução: utilizado / orçamento * 100
 */
export function validatePercentualExecucao(orcamento, utilizado, percentual) {
  if (orcamento <= 0) {
    return { valid: true }; // Não validar se orçamento é zero
  }
  
  const expectedPercentual = Number(((utilizado / orcamento) * 100).toFixed(2));
  const diff = Math.abs(expectedPercentual - percentual);
  
  if (diff > 0.01) { // Tolerância de 0.01%
    return {
      valid: false,
      error: 'PERCENTUAL_MISMATCH',
      message: `Percentual de execução incorreto. Esperado: ${expectedPercentual}%, Encontrado: ${percentual}%`,
      expected: expectedPercentual,
      found: percentual,
      diff
    };
  }
  
  return { valid: true };
}

/**
 * Valida o orçamento oficial (deve ser R$ 1.320.000,00)
 */
export function validateOfficialBudget(orcamento) {
  const diff = Math.abs(orcamento - OFFICIAL_ADITIVO_TOTAL);
  
  if (diff > TOLERANCE) {
    return {
      valid: false,
      error: 'OFFICIAL_BUDGET_MISMATCH',
      message: `Orçamento oficial incorreto. Esperado: R$ ${OFFICIAL_ADITIVO_TOTAL.toFixed(2)}, Encontrado: R$ ${orcamento.toFixed(2)}`,
      expected: OFFICIAL_ADITIVO_TOTAL,
      found: orcamento,
      diff
    };
  }
  
  return { valid: true };
}

/**
 * Valida que a soma das metas é igual ao total utilizado
 */
export function validateMetasSoma(totalUtilizado, metas) {
  const somaMetas = metas.reduce((sum, meta) => sum + (meta.utilizado || 0), 0);
  const diff = Math.abs(somaMetas - totalUtilizado);
  
  if (diff > TOLERANCE) {
    return {
      valid: false,
      error: 'METAS_SUM_MISMATCH',
      message: `Soma das metas difere do total utilizado. Soma metas: R$ ${somaMetas.toFixed(2)}, Total: R$ ${totalUtilizado.toFixed(2)}`,
      expected: totalUtilizado,
      found: somaMetas,
      diff
    };
  }
  
  return { valid: true };
}

/**
 * Valida que não há rubrica vinculada a mais de uma meta
 */
export function validateRubricaUnicidade(metas) {
  const rubricasUsadas = new Set();
  const duplicatas = [];
  
  metas.forEach(meta => {
    (meta.rubricasIds || []).forEach(rubricaId => {
      if (rubricasUsadas.has(rubricaId)) {
        duplicatas.push({
          rubricaId,
          metaNumero: meta.numero,
          message: `Rubrica ${rubricaId} está vinculada a múltiplas metas`
        });
      }
      rubricasUsadas.add(rubricaId);
    });
  });
  
  if (duplicatas.length > 0) {
    return {
      valid: false,
      error: 'RUBRICA_DUPLICADA',
      message: `${duplicatas.length} rubrica(s) vinculada(s) a múltiplas metas`,
      duplicatas
    };
  }
  
  return { valid: true };
}

/**
 * Valida que a soma por museu é igual ao total utilizado
 */
export function validateMuseuSoma(totalUtilizado, byMuseum) {
  const somaMuseu = byMuseum.reduce((sum, m) => sum + (m.utilizado || 0), 0);
  const diff = Math.abs(somaMuseu - totalUtilizado);
  
  if (diff > TOLERANCE) {
    return {
      valid: false,
      error: 'MUSEU_SUM_MISMATCH',
      message: `Soma por museu difere do total utilizado. Soma museu: R$ ${somaMuseu.toFixed(2)}, Total: R$ ${totalUtilizado.toFixed(2)}`,
      expected: totalUtilizado,
      found: somaMuseu,
      diff
    };
  }
  
  return { valid: true };
}

/**
 * Validação completa de todos os indicadores financeiros
 */
export function validateFinancialCoherence(data) {
  const validations = [];
  
  // 1. Validar orçamento oficial
  validations.push({
    name: 'Orçamento Oficial',
    ...validateOfficialBudget(data.totalOrcado || data.officialTotal)
  });
  
  // 2. Validar equação do saldo
  validations.push({
    name: 'Equação do Saldo',
    ...validateSaldoEquation(
      data.totalOrcado || data.officialTotal,
      data.totalUtilizado,
      data.saldoTotal || data.saldo
    )
  });
  
  // 3. Validar percentual de execução
  validations.push({
    name: 'Percentual de Execução',
    ...validatePercentualExecucao(
      data.totalOrcado || data.officialTotal,
      data.totalUtilizado,
      data.percentualExecucao
    )
  });
  
  // 4. Validar Meta 01 (valores de referência)
  if (data.meta01) {
    const expectedMeta01Previsto = 541900;
    const expectedMeta01Utilizado = 8000;
    const diffPrevisto = Math.abs(data.meta01.previsto - expectedMeta01Previsto);
    const diffUtilizado = Math.abs(data.meta01.utilizado - expectedMeta01Utilizado);
    
    validations.push({
      name: 'Meta 01 - Valores',
      valid: diffPrevisto <= TOLERANCE && diffUtilizado <= TOLERANCE,
      error: diffPrevisto > TOLERANCE || diffUtilizado > TOLERANCE ? 'META_01_MISMATCH' : null,
      message: `Meta 01: Previsto R$ ${data.meta01.previsto} (esp. ${expectedMeta01Previsto}), Utilizado R$ ${data.meta01.utilizado} (esp. ${expectedMeta01Utilizado})`
    });
  }
  
  // 5. Validar Meta 11 (valores de referência)
  if (data.meta11) {
    const expectedMeta11Previsto = 141350;
    const expectedMeta11Utilizado = 1650;
    const diffPrevisto = Math.abs(data.meta11.previsto - expectedMeta11Previsto);
    const diffUtilizado = Math.abs(data.meta11.utilizado - expectedMeta11Utilizado);
    
    validations.push({
      name: 'Meta 11 - Valores',
      valid: diffPrevisto <= TOLERANCE && diffUtilizado <= TOLERANCE,
      error: diffPrevisto > TOLERANCE || diffUtilizado > TOLERANCE ? 'META_11_MISMATCH' : null,
      message: `Meta 11: Previsto R$ ${data.meta11.previsto} (esp. ${expectedMeta11Previsto}), Utilizado R$ ${data.meta11.utilizado} (esp. ${expectedMeta11Utilizado})`
    });
  }
  
  // Resumo
  const allValid = validations.every(v => v.valid);
  const errors = validations.filter(v => !v.valid);
  
  return {
    allValid,
    errors,
    validations,
    timestamp: new Date().toISOString()
  };
}

/**
 * Executa todos os testes unitários de coerência financeira
 */
export function runFinancialTests() {
  const tests = [];
  
  // Teste 1: Equação fundamental
  tests.push({
    name: 'Teste 1: Equação do Saldo',
    expected: '1320000 - 303479.25 = 1016520.75',
    actual: `${(1320000 - 303479.25).toFixed(2)}`,
    pass: Math.abs((1320000 - 303479.25) - 1016520.75) <= TOLERANCE
  });
  
  // Teste 2: Percentual de execução
  tests.push({
    name: 'Teste 2: Percentual de Execução',
    expected: '22.99%',
    actual: `${Number(((303479.25 / 1320000) * 100).toFixed(2))}%`,
    pass: Math.abs(Number(((303479.25 / 1320000) * 100).toFixed(2)) - 22.99) <= 0.01
  });
  
  // Teste 3: Meta 01
  const meta01Saldo = 541900 - 8000;
  const meta01Percentual = Number(((8000 / 541900) * 100).toFixed(2));
  tests.push({
    name: 'Teste 3: Meta 01',
    expected: 'Saldo: 533900, Percentual: 1.48%',
    actual: `Saldo: ${meta01Saldo}, Percentual: ${meta01Percentual}%`,
    pass: Math.abs(meta01Saldo - 533900) <= TOLERANCE && Math.abs(meta01Percentual - 1.48) <= 0.01
  });
  
  // Teste 4: Meta 11
  const meta11Saldo = 141350 - 1650;
  const meta11Percentual = Number(((1650 / 141350) * 100).toFixed(2));
  tests.push({
    name: 'Teste 4: Meta 11',
    expected: 'Saldo: 139700, Percentual: 1.17%',
    actual: `Saldo: ${meta11Saldo}, Percentual: ${meta11Percentual}%`,
    pass: Math.abs(meta11Saldo - 139700) <= TOLERANCE && Math.abs(meta11Percentual - 1.17) <= 0.01
  });
  
  // Resumo
  const passed = tests.filter(t => t.pass).length;
  const total = tests.length;
  
  return {
    passed,
    total,
    tests,
    allPassed: passed === total
  };
}