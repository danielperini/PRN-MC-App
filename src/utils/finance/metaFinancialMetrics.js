/**
 * Cálculos Financeiros por Meta - Fonte Única de Verdade
 * 
 * Esta função centraliza todos os cálculos financeiros relacionados às metas.
 * Tanto DashboardPatrocinadorSync quanto MetasAditivoSection devem usar esta função.
 */

import { normalizeText } from '@/utils/constants';
import { getRubricaBudget, getRubricaUsed } from '@/utils/auditoria/reconcileFinancialTotals';

// Mapeamento oficial de metas do 3º e 4º Aditivo
const METAS_OFICIAIS = [
  // METAS CONCLUÍDAS
  { numero: '1', numeroFormatado: 'META 01', titulo: 'Equipe principal', status: 'CONCLUÍDA' },
  { numero: '2', numeroFormatado: 'META 02', titulo: 'Plano de comunicação', status: 'CONCLUÍDA' },
  { numero: '7', numeroFormatado: 'META 07', titulo: 'Contratação de educadores', status: 'CONCLUÍDA' },
  { numero: '14', numeroFormatado: 'META 14', titulo: 'Acessibilidade', status: 'CONCLUÍDA' },
  { numero: '15', numeroFormatado: 'META 15', titulo: 'Inscrição em Leis de Incentivo', status: 'CONCLUÍDA' },
  
  // METAS EM EXECUÇÃO - EXPOSIÇÕES
  { numero: '3', numeroFormatado: 'META 03', titulo: 'Manutenção das exposições', status: 'EM EXECUÇÃO' },
  { numero: '4', numeroFormatado: 'META 04', titulo: 'Alteração de núcleos e salas expositivas', status: 'EM EXECUÇÃO' },
  { numero: '8', numeroFormatado: 'META 08', titulo: 'Exposição e evento MHAB', status: 'EM EXECUÇÃO' },
  { numero: '9', numeroFormatado: 'META 09', titulo: 'Exposição e evento MIS', status: 'EM EXECUÇÃO' },
  { numero: '12', numeroFormatado: 'META 12', titulo: 'Exposição MHAB (pesquisa e curadoria)', status: 'EM EXECUÇÃO' },
  { numero: '13', numeroFormatado: 'META 13', titulo: 'Exposição MUMO (pesquisa e curadoria)', status: 'EM EXECUÇÃO' },
  { numero: '21', numeroFormatado: 'META 21', titulo: 'Exposição e evento MUMO', status: 'EM EXECUÇÃO' },
  
  // METAS EM EXECUÇÃO - ATIVIDADES
  { numero: '5', numeroFormatado: 'META 05', titulo: 'Ações educativas (mín. 60)', status: 'EM EXECUÇÃO' },
  { numero: '6', numeroFormatado: 'META 06', titulo: 'Ações culturais (mín. 36)', status: 'EM EXECUÇÃO' },
  { numero: '10', numeroFormatado: 'META 10', titulo: 'Mostras de baixa/média complexidade', status: 'EM EXECUÇÃO' },
  { numero: '11', numeroFormatado: 'META 11', titulo: 'Noturno nos Museus', status: 'EM EXECUÇÃO' },
  { numero: '11A', numeroFormatado: 'META 11A', titulo: 'Noturno 2026', status: 'EM EXECUÇÃO', metaPai: '11' },
  { numero: '11B', numeroFormatado: 'META 11B', titulo: 'Noturno Pampulha', status: 'EM EXECUÇÃO', metaPai: '11' },
  { numero: '19', numeroFormatado: 'META 19', titulo: 'Atividade Presente de Iemanjá', status: 'EM EXECUÇÃO' },
  { numero: '20', numeroFormatado: 'META 20', titulo: 'Ações educativas e/ou culturais (30 ações)', status: 'EM EXECUÇÃO' },
  
  // METAS EM EXECUÇÃO - CUSTEIO E PUBLICAÇÕES
  { numero: '16', numeroFormatado: 'META 16', titulo: 'Diárias de educadores', status: 'EM EXECUÇÃO' },
  { numero: '17', numeroFormatado: 'META 17', titulo: 'Publicações e catálogos', status: 'EM EXECUÇÃO' },
  { numero: '18', numeroFormatado: 'META 18', titulo: 'Custeio das atividades educativas e culturais', status: 'EM EXECUÇÃO' },
  
  // METAS EM EXECUÇÃO - CONSULTORIA E DESPESAS
  { numero: '22', numeroFormatado: 'META 22', titulo: 'Consultoria para execução do projeto', status: 'EM EXECUÇÃO' },
  { numero: '23', numeroFormatado: 'META 23', titulo: 'Despesas Gerais', status: 'EM EXECUÇÃO' },
  { numero: '24', numeroFormatado: 'META 24', titulo: 'Emenda Parlamentar', status: 'EM EXECUÇÃO' },
  { numero: '25', numeroFormatado: 'META 25', titulo: 'Outras Ações', status: 'EM EXECUÇÃO' },
];

/**
 * Calcula métricas financeiras para todas as metas do 3º e 4º Aditivo
 * @param {Array} rubricas - Lista de rubricas do sistema
 * @returns {Array} Lista de metas com métricas calculadas
 */
export function calculateMetaFinancialMetrics(rubricas = []) {
  return METAS_OFICIAIS.map(meta => {
    // Filtrar rubricas vinculadas a esta meta
    const rubricasVinculadas = (rubricas || []).filter(rubrica => {
      const metaRubrica = normalizeText(rubrica?.meta || rubrica?.meta_numero || rubrica?.meta_titulo || '');
      const numeroMeta = normalizeText(meta.numero);
      const numeroFormatado = normalizeText(meta.numeroFormatado);
      
      // Verificar vínculo direto pelo número da meta
      const vinculoDireto = metaRubrica === numeroMeta || 
                           metaRubrica.includes(numeroMeta) || 
                           metaRubrica.includes(normalizeText(meta.titulo));
      
      // Verificar vínculo pelo número formatado (META 01, META 11A, etc)
      const vinculoFormatado = metaRubrica === numeroFormatado || 
                              metaRubrica.includes(numeroFormatado);
      
      return vinculoDireto || vinculoFormatado;
    });

    // Calcular valores financeiros
    const previsto = rubricasVinculadas.reduce((sum, r) => sum + getRubricaBudget(r), 0);
    const utilizado = rubricasVinculadas.reduce((sum, r) => sum + getRubricaUsed(r), 0);
    const saldo = previsto - utilizado;
    const percentualFinanceiro = previsto > 0 ? Number(((utilizado / previsto) * 100).toFixed(2)) : 0;
    
    // Indicador de execução
    const indicador = previsto > 0 
      ? `${Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(utilizado)} de ${Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(previsto)}`
      : meta.status === 'CONCLUÍDA' ? '100% concluído' : 'Sem rubricas vinculadas';

    return {
      ...meta,
      previsto,
      utilizado,
      saldo,
      percentualFinanceiro,
      percentualFisico: meta.status === 'CONCLUÍDA' ? 100 : percentualFinanceiro,
      rubricasCount: rubricasVinculadas.length,
      indicador,
      rubricasIds: rubricasVinculadas.map(r => r.id)
    };
  });
}

/**
 * Calcula gastos por museu e por projeto
 * @param {Array} rubricas - Lista de rubricas do sistema
 * @returns {Object} Objeto com gastos por museu e por projeto
 */
export function calculateGastosPorMuseuEProjeto(rubricas = []) {
  const byMuseum = {};
  const byProject = {};
  
  // Inicializar museus
  ['MIS', 'MHAB', 'MUMO', 'Noturno', 'Pampulha', 'Geral'].forEach(nome => {
    byMuseum[nome] = {
      museu: nome,
      previsto: 0,
      utilizado: 0,
      saldo: 0,
      percentual: 0,
      rubricasCount: 0
    };
  });
  
  // Inicializar projetos
  ['Museus Centro', 'Noturno 2026', 'Noturno Pampulha', 'Transversal'].forEach(nome => {
    byProject[nome] = {
      projeto: nome,
      previsto: 0,
      utilizado: 0,
      saldo: 0,
      percentual: 0,
      rubricasCount: 0
    };
  });
  
  // Agrupar por centro de custo
  (rubricas || []).forEach(rubrica => {
    const centroCusto = normalizeText(rubrica?.centro_custo || '');
    const previsto = getRubricaBudget(rubrica);
    const utilizado = getRubricaUsed(rubrica);
    
    // Determinar museu
    let museu = 'Geral';
    if (centroCusto.includes('mis') || centroCusto.includes('imagem e som')) museu = 'MIS';
    else if (centroCusto.includes('mhab') || centroCusto.includes('abh') || centroCusto.includes('abílio')) museu = 'MHAB';
    else if (centroCusto.includes('mumo') || centroCusto.includes('moda')) museu = 'MUMO';
    else if (centroCusto.includes('pampulha') || centroCusto.includes('kubitschek') || centroCusto.includes('casa do baile')) museu = 'Pampulha';
    else if (centroCusto.includes('noturno') && !centroCusto.includes('pampulha')) museu = 'Noturno';
    
    // Determinar projeto
    let projeto = 'Museus Centro';
    if (centroCusto.includes('noturno 2026') || centroCusto.includes('noturno nos museus centro')) projeto = 'Noturno 2026';
    else if (centroCusto.includes('noturno pampulha') || centroCusto.includes('noturno nos museus pampulha')) projeto = 'Noturno Pampulha';
    else if (centroCusto.includes('transversal') || centroCusto.includes('geral')) projeto = 'Transversal';
    
    // Atualizar museu
    if (!byMuseum[museu]) {
      byMuseum[museu] = { museu, previsto: 0, utilizado: 0, saldo: 0, percentual: 0, rubricasCount: 0 };
    }
    byMuseum[museu].previsto += previsto;
    byMuseum[museu].utilizado += utilizado;
    byMuseum[museu].rubricasCount += 1;
    
    // Atualizar projeto
    if (!byProject[projeto]) {
      byProject[projeto] = { projeto, previsto: 0, utilizado: 0, saldo: 0, percentual: 0, rubricasCount: 0 };
    }
    byProject[projeto].previsto += previsto;
    byProject[projeto].utilizado += utilizado;
    byProject[projeto].rubricasCount += 1;
  });
  
  // Calcular saldos e percentuais
  Object.values(byMuseum).forEach(m => {
    m.saldo = m.previsto - m.utilizado;
    m.percentual = m.previsto > 0 ? Number(((m.utilizado / m.previsto) * 100).toFixed(2)) : 0;
  });
  
  Object.values(byProject).forEach(p => {
    p.saldo = p.previsto - p.utilizado;
    p.percentual = p.previsto > 0 ? Number(((p.utilizado / p.previsto) * 100).toFixed(2)) : 0;
  });
  
  return {
    byMuseum: Object.values(byMuseum).filter(m => m.previsto > 0 || m.utilizado > 0),
    byProject: Object.values(byProject).filter(p => p.previsto > 0 || p.utilizado > 0)
  };
}

/**
 * Normaliza o número da meta para comparação
 * Exemplos:
 * - 'META 01' => '1'
 * - 'Meta 1' => '1'
 * - '1 - Contratação...' => '1'
 * - '11A' => '11A'
 * - '11B' => '11B'
 */
export function normalizeMetaNumber(metaText) {
  const text = normalizeText(metaText || '');
  
  // Extrair número principal (com sufixo A/B se existir)
  const match = text.match(/^(\d+(?:[A-Z])?)/i);
  if (match) {
    return match[1].toUpperCase();
  }
  
  // Fallback: tentar encontrar número em qualquer posição
  const matchAny = text.match(/(\d+(?:[A-Z])?)/i);
  if (matchAny) {
    return matchAny[1].toUpperCase();
  }
  
  return text;
}

/**
 * Verifica se uma rubrica está vinculada a uma meta específica
 * Prioridade:
 * 1. ID oficial da meta salvo na rubrica
 * 2. Número normalizado da meta
 * 3. Mapeamento oficial explícito
 */
export function isRubricaLinkedToMeta(rubrica, meta) {
  // Verificar vínculo por ID da meta (prioridade máxima)
  if (rubrica.meta_id && meta.id) {
    return rubrica.meta_id === meta.id;
  }
  
  // Verificar vínculo por número da meta
  const rubricaMeta = normalizeMetaNumber(rubrica.meta || rubrica.meta_numero || rubrica.meta_titulo || '');
  const metaNumero = normalizeMetaNumber(meta.numero || meta.numeroFormatado || '');
  
  if (rubricaMeta && metaNumero) {
    // Verificar correspondência exata
    if (rubricaMeta === metaNumero) {
      return true;
    }
    
    // Verificar se é subdivisão (ex: 11A pertence a 11)
    if (meta.metaPai && rubricaMeta === meta.numero) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calcula métricas financeiras para cada meta
 * @param {Array} rubricas - Lista de rubricas
 * @returns {Array} Metas com dados financeiros calculados
 */
export function calculateMetaFinancialMetrics(rubricas = []) {
  // Deduplicar rubricas por ID
  const rubricasUnicas = new Map();
  (rubricas || []).forEach((rubrica) => {
    const key = rubrica.id || rubrica.codigo;
    if (!key || rubrica.ativo === false) return;
    if (!rubricasUnicas.has(key)) {
      rubricasUnicas.set(key, rubrica);
    }
  });
  
  const rubricasArray = Array.from(rubricasUnicas.values());
  
  // Calcular métricas para cada meta
  return METAS_OFICIAIS.map(meta => {
    // Filtrar rubricas vinculadas a esta meta
    const rubricasVinculadas = rubricasArray.filter(r => isRubricaLinkedToMeta(r, meta));
    
    // Calcular valores
    const previsto = rubricasVinculadas.reduce((sum, r) => sum + getRubricaBudget(r), 0);
    const utilizado = rubricasVinculadas.reduce((sum, r) => sum + getRubricaUsed(r), 0);
    const saldo = previsto - utilizado;
    const percentualFinanceiro = previsto > 0 ? Number(((utilizado / previsto) * 100).toFixed(2)) : 0;
    
    return {
      ...meta,
      previsto,
      utilizado,
      saldo,
      percentualFinanceiro,
      percentualFisico: meta.status === 'CONCLUÍDA' ? 100 : 0,
      rubricasCount: rubricasVinculadas.length,
      rubricasIds: rubricasVinculadas.map(r => r.id),
      indicador: previsto > 0
        ? `${formatBRL(utilizado)} utilizado de ${formatBRL(previsto)}`
        : meta.status === 'CONCLUÍDA' ? '100% concluído' : '0%'
    };
  });
}

/**
 * Calcula gastos por museu/projeto
 * @param {Array} rubricas - Lista de rubricas
 * @returns {Object} com byMuseum e byProject
 */
export function calculateGastosPorMuseuEProjeto(rubricas = []) {
  // Deduplicar rubricas
  const rubricasUnicas = new Map();
  (rubricas || []).forEach((rubrica) => {
    const key = rubrica.id || rubrica.codigo;
    if (!key || rubrica.ativo === false) return;
    if (!rubricasUnicas.has(key)) {
      rubricasUnicas.set(key, rubrica);
    }
  });
  
  const rubricasArray = Array.from(rubricasUnicas.values());
  
  // Inicializar agrupamentos
  const byMuseum = {
    MIS: { museu: 'MIS', previsto: 0, utilizado: 0, saldo: 0, rubricasCount: 0 },
    MHAB: { museu: 'MHAB', previsto: 0, utilizado: 0, saldo: 0, rubricasCount: 0 },
    MUMO: { museu: 'MUMO', previsto: 0, utilizado: 0, saldo: 0, rubricasCount: 0 },
    Geral: { museu: 'Geral', previsto: 0, utilizado: 0, saldo: 0, rubricasCount: 0 }
  };
  
  const byProject = {
    'Noturno 2026': { projeto: 'Noturno 2026', previsto: 0, utilizado: 0, saldo: 0, rubricasCount: 0 },
    'Noturno Pampulha': { projeto: 'Noturno Pampulha', previsto: 0, utilizado: 0, saldo: 0, rubricasCount: 0 },
    'Geral': { projeto: 'Geral', previsto: 0, utilizado: 0, saldo: 0, rubricasCount: 0 }
  };
  
  // Classificar rubricas
  rubricasArray.forEach((rubrica) => {
    const centroCusto = normalizeText(rubrica.centro_custo || '');
    const escopo = normalizeText(rubrica.escopo_orcamentario || '');
    const nome = normalizeText(rubrica.rubrica || rubrica.nome || '');
    
    const previsto = getRubricaBudget(rubrica);
    const utilizado = getRubricaUsed(rubrica);
    
    // Classificação por museu (centro de custo)
    let museu = 'Geral';
    if (centroCusto.includes('mis') || centroCusto.includes('imagem') || centroCusto.includes('som')) {
      museu = 'MIS';
    } else if (centroCusto.includes('mhab') || centroCusto.includes('abh') || centroCusto.includes('hist')) {
      museu = 'MHAB';
    } else if (centroCusto.includes('mumo') || centroCusto.includes('moda')) {
      museu = 'MUMO';
    }
    
    // Classificação por projeto
    let projeto = 'Geral';
    if (centroCusto.includes('noturno') && centroCusto.includes('pampulha')) {
      projeto = 'Noturno Pampulha';
    } else if (centroCusto.includes('noturno')) {
      projeto = 'Noturno 2026';
    } else if (escopo.includes('noturno') && escopo.includes('pampulha')) {
      projeto = 'Noturno Pampulha';
    } else if (escopo.includes('noturno')) {
      projeto = 'Noturno 2026';
    }
    
    // Somar nos agrupamentos
    if (!byMuseum[museu]) {
      byMuseum[museu] = { museu, previsto: 0, utilizado: 0, saldo: 0, rubricasCount: 0 };
    }
    byMuseum[museu].previsto += previsto;
    byMuseum[museu].utilizado += utilizado;
    byMuseum[museu].rubricasCount += 1;
    
    if (!byProject[projeto]) {
      byProject[projeto] = { projeto, previsto: 0, utilizado: 0, saldo: 0, rubricasCount: 0 };
    }
    byProject[projeto].previsto += previsto;
    byProject[projeto].utilizado += utilizado;
    byProject[projeto].rubricasCount += 1;
  });
  
  // Calcular saldos
  Object.values(byMuseum).forEach(m => {
    m.saldo = m.previsto - m.utilizado;
    m.percentual = m.previsto > 0 ? Number(((m.utilizado / m.previsto) * 100).toFixed(2)) : 0;
  });
  
  Object.values(byProject).forEach(p => {
    p.saldo = p.previsto - p.utilizado;
    p.percentual = p.previsto > 0 ? Number(((p.utilizado / p.previsto) * 100).toFixed(2)) : 0;
  });
  
  return {
    byMuseum: Object.values(byMuseum),
    byProject: Object.values(byProject)
  };
}

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}