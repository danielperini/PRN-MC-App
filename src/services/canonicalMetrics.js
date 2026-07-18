/**
 * canonicalMetrics.js
 * Funções puras de cálculo de métricas canônicas do Museus Centro.
 * NÃO fazem chamadas de API — recebem dados já carregados como argumento.
 * Consolidam lógica dispersa em sincronizarRelatorioExecucao.js e reconcileFinancialTotals.js.
 */

import { resolvePublico, resolveValor, resolveData } from '@/utils/fieldResolvers';

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

/**
 * Soma o público total de um array de atividades/registros.
 * Usa resolvePublico (CAMPOS_PUBLICO) canonicamente.
 *
 * @param {Array} atividades
 * @returns {number}
 */
export function calcularTotalPublico(atividades = []) {
  return (Array.isArray(atividades) ? atividades : []).reduce(
    (sum, item) => sum + resolvePublico(item),
    0
  );
}

/**
 * Soma o valor realizado (aprovado/pago) de compras vinculadas a uma rubrica específica.
 *
 * @param {Array} compras   — array de PurchaseRequest
 * @param {string} rubricaId — ID da rubrica
 * @returns {number}
 */
export function calcularRealizadoRubrica(compras = [], rubricaId) {
  if (!rubricaId) return 0;
  return (Array.isArray(compras) ? compras : [])
    .filter((c) => {
      const status = String(c?.status || '').toUpperCase();
      return STATUS_APROVADOS.has(status) && (c?.rubrica_id === rubricaId || c?.budgetline_id === rubricaId);
    })
    .reduce((sum, c) => sum + resolveValor(c), 0);
}

/**
 * Calcula o saldo disponível de uma rubrica.
 * Usa valor_rubrica (previsto) - valor_utilizado (realizado).
 *
 * @param {Object} rubrica
 * @returns {number}
 */
export function calcularSaldoRubrica(rubrica = {}) {
  const previsto =
    Number(rubrica?.valor_rubrica ?? rubrica?.valor_total ?? rubrica?.valor_previsto ?? rubrica?.valor ?? 0);
  const utilizado =
    Number(rubrica?.valor_utilizado ?? rubrica?.valor_executado ?? rubrica?.utilizado ?? rubrica?.realizado ?? 0);
  return previsto - utilizado;
}

/**
 * Filtra atividades por período e opcionalmente por museu.
 *
 * @param {Array}  atividades
 * @param {string} inicio  — YYYY-MM-DD
 * @param {string} fim     — YYYY-MM-DD
 * @param {string} [museu] — nome parcial (case-insensitive)
 * @returns {Array}
 */
export function calcularAtividadesPeriodo(atividades = [], inicio, fim, museu) {
  return (Array.isArray(atividades) ? atividades : []).filter((item) => {
    const data = resolveData(item);
    if (!data) return false;
    if (inicio && data < inicio) return false;
    if (fim && data > fim) return false;
    if (museu) {
      const museuNorm = museu.toLowerCase();
      const origem = (
        item?.museu || item?.unidade || item?.centro_custo || item?.local || item?.localizacao || ''
      ).toLowerCase();
      if (!origem.includes(museuNorm)) return false;
    }
    return true;
  });
}

/**
 * Filtra e soma notas fiscais aprovadas/pagas em um período.
 *
 * @param {Array}  compras
 * @param {string} inicio  — YYYY-MM-DD
 * @param {string} fim     — YYYY-MM-DD
 * @returns {{ count: number, total: number, items: Array }}
 */
export function calcularNotasPeriodo(compras = [], inicio, fim) {
  const items = (Array.isArray(compras) ? compras : []).filter((c) => {
    const status = String(c?.status || '').toUpperCase();
    if (!STATUS_APROVADOS.has(status)) return false;
    const data = resolveData({
      data: c?.nf_data_emissao || c?.data_nf || c?.data_emissao_nf || c?.created_date,
    });
    if (!data) return false;
    if (inicio && data < inicio) return false;
    if (fim && data > fim) return false;
    return true;
  });
  const total = items.reduce((sum, c) => sum + resolveValor(c), 0);
  return { count: items.length, total, items };
}