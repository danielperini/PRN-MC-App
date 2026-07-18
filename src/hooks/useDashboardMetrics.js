/**
 * useDashboardMetrics.js
 * Hook canônico para métricas do Dashboard.
 *
 * Centraliza o cálculo de:
 *  - totalPublico (atividades de relatórios aprovados)
 *  - totalAtividades
 *  - totalProdutos
 *  - totalRelatoriosAprovados
 *  - totalPrevisto / totalUtilizado / totalSaldo (rubricas)
 *  - rubricasComProblema (excedidas + em atenção)
 *
 * Garantia: todos os componentes que importam este hook
 * sempre exibem os mesmos números.
 */

import { useMemo } from 'react';
import { resolvePublico } from '@/utils/fieldResolvers';
import { rubricaPrevisto, rubricaUtilizado } from '@/services/canonicalMetrics';

// ─── PÚBLICO ──────────────────────────────────────────────────────────────────
/**
 * Calcula o público total de uma atividade usando a regra canônica:
 *   1. publico_total (já inclui repetições) — usa diretamente se > 0
 *   2. publico_estimado * quantas_repeticoes — fallback
 *   3. resolvePublico (CAMPOS_PUBLICO amplos) — último recurso
 */
function publicoAtividade(a) {
  if (!a) return 0;
  const pt = Number(a.publico_total ?? 0);
  if (pt > 0) return pt;
  const pe = Number(a.publico_estimado ?? 0);
  if (pe > 0) {
    const reps = Math.max(Number(a.quantas_repeticoes ?? 1), 1);
    return pe * reps;
  }
  return resolvePublico(a);
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────
/**
 * @param {Array}  reports  — lista de Report
 * @param {Array}  rubricas — lista de Rubrica
 * @returns {{
 *   totalPublico: number,
 *   totalAtividades: number,
 *   totalProdutos: number,
 *   totalRelatoriosAprovados: number,
 *   mediaPublicoPorAtividade: number,
 *   taxaPreenchimento: string,
 *   taxaAprovacao: string,
 *   museus: Set<string>,
 *   periodosCobertos: Set<string>,
 *   totalPrevisto: number,
 *   totalUtilizado: number,
 *   totalSaldo: number,
 *   percentualExecucao: number,
 *   rubricasExcedidas: number,
 *   rubricasAtencao: number,
 * }}
 */
export function useDashboardMetrics(reports = [], rubricas = []) {
  return useMemo(() => {
    const safeReports = Array.isArray(reports) ? reports : [];
    const safeRubricas = Array.isArray(rubricas) ? rubricas : [];

    // ── Relatórios aprovados ──
    const aprovados = safeReports.filter((r) => r?.status === 'APPROVED');
    const todasAtividades = aprovados.flatMap((r) =>
      Array.isArray(r?.atividades) ? r.atividades : []
    );

    // ── Público total (regra canônica única) ──
    const totalPublico = todasAtividades.reduce(
      (sum, a) => sum + publicoAtividade(a),
      0
    );

    // ── Média de público (apenas atividades com público > 0) ──
    const comPublico = todasAtividades.filter((a) => publicoAtividade(a) > 0);
    const mediaPublicoPorAtividade =
      comPublico.length > 0 ? Math.round(totalPublico / comPublico.length) : 0;

    // ── Produtos ──
    const totalProdutos = todasAtividades.reduce((sum, a) => {
      if (!a) return sum;
      const entregues = Array.isArray(a.produtos_entregues)
        ? a.produtos_entregues.length
        : 0;
      const qtd = Number(a.quantidade_produtos) || 0;
      return sum + entregues + qtd;
    }, 0);

    // ── Taxas ──
    const total = safeReports.length;
    const taxaPreenchimento =
      total > 0
        ? `${Math.round(
            (safeReports.filter((r) => r?.atividades?.length > 0).length / total) * 100
          )}%`
        : '0%';
    const taxaAprovacao =
      total > 0
        ? `${Math.round((aprovados.length / total) * 100)}%`
        : '0%';

    // ── Museus e períodos ──
    const museus = new Set(
      safeReports.map((r) => r?.museu).filter(Boolean)
    );
    const periodosCobertos = new Set(
      safeReports
        .map((r) => `${r?.mes_referencia}-${r?.ano}`)
        .filter((k) => k !== 'undefined-undefined')
    );

    // ── Rubricas (canônico) ──
    // FONTE DE VERDADE: apenas 3º e 4º Aditivo (R$ 1.401.719,85)
    // Rubricas com origem "Repasse / Aditivos Anteriores" NÃO entram no previsto oficial
    const rubricasAtivas = safeRubricas.filter((r) => {
      if (r?.ativo === false) return false;
      const origem = (r?.origem_recurso || '').trim();
      return (
        origem === '3º ADITIVO' || origem === '3º Aditivo' ||
        origem === '4º ADITIVO' || origem === '4º Aditivo'
      );
    });
    let totalPrevisto = 0;
    let totalUtilizado = 0;
    let rubricasExcedidas = 0;
    let rubricasAtencao = 0;

    for (const r of rubricasAtivas) {
      const previsto = rubricaPrevisto(r);
      const utilizado = rubricaUtilizado(r);
      const saldo = previsto - utilizado;
      const pct = previsto > 0 ? (utilizado / previsto) * 100 : 0;

      totalPrevisto += previsto;
      totalUtilizado += utilizado;

      if (saldo < 0) rubricasExcedidas++;
      else if (pct >= 80) rubricasAtencao++;
    }

    const totalSaldo = totalPrevisto - totalUtilizado;
    const percentualExecucao =
      totalPrevisto > 0
        ? Number(((totalUtilizado / totalPrevisto) * 100).toFixed(1))
        : 0;

    return {
      totalPublico,
      totalAtividades: todasAtividades.length,
      totalProdutos,
      totalRelatoriosAprovados: aprovados.length,
      mediaPublicoPorAtividade,
      taxaPreenchimento,
      taxaAprovacao,
      museus,
      periodosCobertos,
      totalPrevisto,
      totalUtilizado,
      totalSaldo,
      percentualExecucao,
      rubricasExcedidas,
      rubricasAtencao,
    };
  }, [reports, rubricas]);
}