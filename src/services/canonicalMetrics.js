/**
 * canonicalMetrics.js
 * Funções puras de cálculo de métricas canônicas do Museus Centro.
 * NÃO fazem chamadas de API — recebem dados já carregados como argumento.
 * Consolidam lógica dispersa em sincronizarRelatorioExecucao.js e reconcileFinancialTotals.js.
 */

import { resolvePublico, resolveValor, resolveData } from '@/utils/fieldResolvers';
import { CONTRATO_3_ADITIVO, CONTRATO_4_ADITIVO, CONTRATO_5_ADITIVO } from '@/lib/contratoConstants';

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
 * Extrai o valor PREVISTO canônico de uma rubrica.
 * Fonte única de verdade — usar em todos os componentes.
 * @param {Object} rubrica
 * @returns {number}
 */
export function rubricaPrevisto(rubrica = {}) {
  return Number(
    rubrica?.valor_rubrica ??
    rubrica?.valor_total ??
    rubrica?.valor_previsto ??
    rubrica?.valor ??
    0
  );
}

/**
 * Extrai o valor UTILIZADO canônico de uma rubrica.
 * Fonte única de verdade — usar em todos os componentes.
 * @param {Object} rubrica
 * @returns {number}
 */
export function rubricaUtilizado(rubrica = {}) {
  return Number(
    rubrica?.valor_utilizado ??
    rubrica?.valor_executado ??
    rubrica?.utilizado ??
    rubrica?.realizado ??
    0
  );
}

/**
 * Calcula o saldo disponível de uma rubrica.
 * @param {Object} rubrica
 * @returns {number}
 */
export function calcularSaldoRubrica(rubrica = {}) {
  return rubricaPrevisto(rubrica) - rubricaUtilizado(rubrica);
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
 * Verifica se uma rubrica é do 3º ou 4º Aditivo (fonte de verdade orçamentária oficial).
 * @param {Object} r — rubrica
 * @returns {boolean}
 */
export function isOrigemAditivo(r) {
  const origem = (r?.origem_recurso || '').trim();
  return (
    origem === '3º ADITIVO' ||
    origem === '3º Aditivo' ||
    origem === '4º ADITIVO' ||
    origem === '4º Aditivo' ||
    origem === '5º ADITIVO' ||
    origem === '5º Aditivo'
  );
}

/**
 * Calcula a execução orçamentária oficial — ÚNICA FONTE DE VERDADE do orçamento do projeto.
 * Usa apenas rubricas de origem 3º ADITIVO e 4º ADITIVO.
 * Retorna objeto com previsto, utilizado, saldo, percentual, divergencia e a lista de rubricas usadas.
 *
 * @param {Array} rubricas — array completo de rubricas (ativas ou não)
 * @returns {{ previsto: number, utilizado: number, saldo: number, percentual: number,
 *             rubricas_ativas: number, grupos: number, divergencia: number, itens: Array }}
 */
export function calcularExecucaoOrcamentariaOficial(rubricas = []) {
  const ORCAMENTO_OFICIAL = 1_401_719.85;

  // Filtrar por origem e deduplicar por _chave_oficial (grupo::rubrica::meta)
  const vistos = new Map();
  const itens = [];
  for (const r of (Array.isArray(rubricas) ? rubricas : [])) {
    if (r?.ativo === false || !isOrigemAditivo(r)) continue;
    const chave = r._chave_oficial ||
      `${String(r.grupo || '').trim().toLowerCase()}::${String(r.rubrica || r.nome || '').trim().toLowerCase()}::${String(r.meta || '').trim().toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.set(chave, true);
    itens.push(r);
  }

  const previsto = itens.reduce((s, r) => s + rubricaPrevisto(r), 0);
  const utilizado = itens.reduce((s, r) => s + rubricaUtilizado(r), 0);
  const saldo = previsto - utilizado;
  const percentual = previsto > 0 ? (utilizado / previsto) * 100 : 0;
  const grupos = new Set(itens.map((r) => r.grupo).filter(Boolean)).size;
  const divergencia = Math.abs(previsto - ORCAMENTO_OFICIAL);

  return {
    previsto,
    utilizado,
    saldo,
    percentual,
    rubricas_ativas: itens.length,
    grupos,
    divergencia,
    itens,
  };
}

/**
 * Ponto único de entrada para os cards de aditivo.
 * Retorna totais consolidados por aditivo usando as constantes contratuais como Previsto
 * para o 3º e 5º Aditivo, e soma real de rubricas para o 4º Aditivo.
 *
 * @param {Array} rubricas — array completo de rubricas (ativas ou não)
 * @returns {{ terceiro, quarto, quinto, total }}
 */
/**
 * Ponto único de entrada para os cards de aditivo.
 * Previsto de TODOS os aditivos é o valor fixo contratual de contratoConstants.js.
 * Utilizado é a soma de rubricaUtilizado(r) das rubricas filtradas por origem_recurso.
 *
 * @param {Array} rubricas — array completo de rubricas (ativas ou não)
 * @returns {{ terceiro, quarto, quinto, total }}
 *   cada bloco: { previsto, utilizado, saldo, percentual, rubricas }
 */
export function calcularTotaisPorAditivo(rubricas = []) {
  const ativas = (Array.isArray(rubricas) ? rubricas : []).filter((r) => r?.ativo !== false);

  const r3 = ativas.filter((r) => {
    const o = (r.origem_recurso || '').trim();
    return o === '3º ADITIVO' || o === '3º Aditivo';
  });
  const r4 = ativas.filter((r) => {
    const o = (r.origem_recurso || '').trim();
    return o === '4º ADITIVO' || o === '4º Aditivo';
  });
  const r5 = ativas.filter((r) => {
    const o = (r.origem_recurso || '').trim();
    return o === '5º ADITIVO' || o === '5º Aditivo';
  });

  const utilizado3 = r3.reduce((s, r) => s + rubricaUtilizado(r), 0);
  const utilizado4 = r4.reduce((s, r) => s + rubricaUtilizado(r), 0);
  const utilizado5 = r5.reduce((s, r) => s + rubricaUtilizado(r), 0);

  const mkBloco = (previsto, utilizado, rubricas) => ({
    previsto,
    utilizado,
    saldo: previsto - utilizado,
    percentual: previsto > 0 ? (utilizado / previsto) * 100 : 0,
    rubricas,
  });

  const terceiro = mkBloco(CONTRATO_3_ADITIVO, utilizado3, r3);
  const quarto   = mkBloco(CONTRATO_4_ADITIVO, utilizado4, r4);
  const quinto   = mkBloco(CONTRATO_5_ADITIVO, utilizado5, r5);

  const totalPrevisto  = terceiro.previsto + quarto.previsto + quinto.previsto;
  const totalUtilizado = terceiro.utilizado + quarto.utilizado + quinto.utilizado;
  const total = {
    previsto: totalPrevisto,
    utilizado: totalUtilizado,
    saldo: totalPrevisto - totalUtilizado,
    percentual: totalPrevisto > 0 ? (totalUtilizado / totalPrevisto) * 100 : 0,
  };

  return { terceiro, quarto, quinto, total };
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