/**
 * Cálculos Financeiros por Meta - Fonte Única de Verdade
 * 
 * Esta função centraliza todos os cálculos financeiros relacionados às metas.
 * Tanto DashboardPatrocinadorSync quanto MetasAditivoSection devem usar esta função.
 */

import { normalizeText } from '@/utils/constants';
import { getRubricaBudget, getRubricaUsed } from '@/utils/auditoria/reconcileFinancialTotals';

// Mapeamento oficial de metas do 3º Aditivo + 4º Aditivo (Noturno Pampulha)
// Fonte: Plano de Trabalho oficial — excluídas metas 5, 6, 24 e 25 (não constam no plano)
export const METAS_OFICIAIS = [
  // METAS CONCLUÍDAS — 3º Aditivo
  { numero: '1', numeroFormatado: 'META 01', titulo: 'Equipe principal', status: 'CONCLUÍDA' },
  { numero: '2', numeroFormatado: 'META 02', titulo: 'Plano de comunicação', status: 'CONCLUÍDA' },
  { numero: '7', numeroFormatado: 'META 07', titulo: 'Contratação de educadores', status: 'CONCLUÍDA' },
  { numero: '14', numeroFormatado: 'META 14', titulo: 'Acessibilidade', status: 'CONCLUÍDA' },
  { numero: '15', numeroFormatado: 'META 15', titulo: 'Inscrição em Leis de Incentivo', status: 'CONCLUÍDA' },

  // METAS EM EXECUÇÃO — EXPOSIÇÕES
  { numero: '3', numeroFormatado: 'META 03', titulo: 'Manutenção das exposições', status: 'EM EXECUÇÃO' },
  { numero: '4', numeroFormatado: 'META 04', titulo: 'Alteração de núcleos e salas expositivas', status: 'EM EXECUÇÃO' },
  { numero: '8', numeroFormatado: 'META 08', titulo: 'Exposição e evento MHAB', status: 'EM EXECUÇÃO' },
  { numero: '9', numeroFormatado: 'META 09', titulo: 'Exposição e evento MIS', status: 'EM EXECUÇÃO' },
  { numero: '12', numeroFormatado: 'META 12', titulo: 'Exposição MHAB (pesquisa e curadoria)', status: 'EM EXECUÇÃO' },
  { numero: '13', numeroFormatado: 'META 13', titulo: 'Exposição MUMO (pesquisa e curadoria)', status: 'EM EXECUÇÃO' },
  { numero: '21', numeroFormatado: 'META 21', titulo: 'Exposição e evento MUMO', status: 'EM EXECUÇÃO' },

  // METAS EM EXECUÇÃO — ATIVIDADES
  { numero: '10', numeroFormatado: 'META 10', titulo: 'Mostras de baixa/média complexidade (18 mostras)', status: 'EM EXECUÇÃO' },
  { numero: '11', numeroFormatado: 'META 11', titulo: 'Noturno nos Museus (edições 2024, 2025 e 2026)', status: 'EM EXECUÇÃO' },
  { numero: '20', numeroFormatado: 'META 20', titulo: 'Ações educativas e culturais — MHAB, MIS e MUMO (30 ações)', status: 'EM EXECUÇÃO' },
  { numero: '16', numeroFormatado: 'META 16', titulo: 'Diárias de educadores (101 diárias)', status: 'EM EXECUÇÃO' },

  // METAS EM EXECUÇÃO — CUSTEIO E PUBLICAÇÕES
  { numero: '17', numeroFormatado: 'META 17', titulo: 'Publicações e catálogos', status: 'EM EXECUÇÃO' },
  { numero: '18', numeroFormatado: 'META 18', titulo: 'Custeio das atividades educativas e culturais', status: 'EM EXECUÇÃO' },

  // METAS EM EXECUÇÃO — CONSULTORIA E DESPESAS
  { numero: '22', numeroFormatado: 'META 22', titulo: 'Consultoria para execução do projeto', status: 'EM EXECUÇÃO' },
  { numero: '23', numeroFormatado: 'META 23', titulo: 'Despesas Gerais', status: 'EM EXECUÇÃO' },

  // 4º ADITIVO — Noturno Pampulha
  { numero: '11B', numeroFormatado: 'META 11B', titulo: 'Noturno Pampulha (4º Aditivo)', status: 'EM EXECUÇÃO', metaPai: '11' },
];

/**
 * Normaliza o número da meta para comparação
 */
export function normalizeMetaNumber(metaText) {
  const text = normalizeText(metaText || '');
  const match = text.match(/^(\d+(?:[A-Z])?)/i);
  if (match) {
    return match[1].toUpperCase();
  }
  const matchAny = text.match(/(\d+(?:[A-Z])?)/i);
  if (matchAny) {
    return matchAny[1].toUpperCase();
  }
  return text;
}

/**
 * Verifica se uma rubrica está vinculada a uma meta específica.
 * Fonte de verdade: meta_manual_ids (vínculo manual explícito).
 * Fallback legado removido — vínculos são 100% manuais a partir de agora.
 */
export function isRubricaLinkedToMeta(rubrica, meta) {
  const metaNum = meta?.numero || '';
  if (Array.isArray(rubrica?.meta_manual_ids) && rubrica.meta_manual_ids.length > 0) {
    return rubrica.meta_manual_ids.includes(metaNum);
  }
  // Sem meta_manual_ids: não está vinculada
  return false;
}

/**
 * Calcula métricas financeiras para todas as metas do 3º e 4º Aditivo
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
      rubricasIds: rubricasVinculadas.map(r => r.id),
      indicador
    };
  });
}

/**
 * Calcula gastos por museu e por projeto
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
  const byMuseum = {};
  const byProject = {};
  
  ['MIS', 'MHAB', 'MUMO', 'Noturno', 'Pampulha', 'Geral'].forEach(nome => {
    byMuseum[nome] = { museu: nome, previsto: 0, utilizado: 0, saldo: 0, percentual: 0, rubricasCount: 0 };
  });
  
  ['Museus Centro', 'Noturno 2026', 'Noturno Pampulha', 'Transversal'].forEach(nome => {
    byProject[nome] = { projeto: nome, previsto: 0, utilizado: 0, saldo: 0, percentual: 0, rubricasCount: 0 };
  });
  
  // Classificar rubricas
  rubricasArray.forEach((rubrica) => {
    const centroCusto = normalizeText(rubrica?.centro_custo || '');
    const escopo = normalizeText(rubrica?.escopo_orcamentario || '');
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

// Nota: usar diretamente calculateMetaFinancialMetrics e calculateGastosPorMuseuEProjeto