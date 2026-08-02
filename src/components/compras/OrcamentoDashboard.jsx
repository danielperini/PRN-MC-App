import React from 'react';
import { AlertTriangle, Users } from 'lucide-react';
// fonte: canonicalMetrics.js — todos os cálculos de Previsto/Utilizado/Saldo via funções canônicas
import { rubricaUtilizado } from '@/services/canonicalMetrics';
import { CONTRATO_3_ADITIVO } from '@/lib/contratoConstants';
import { resolveValor } from '@/utils/fieldResolvers';

function toNumber(v) {
  return Number(v) || 0;
}

function normalizeText(value) {
  return String(value || '').
  toLowerCase().
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  trim();
}



function getRubricaNome(r) {
  return (
    r?.nome ||
    r?.descricao ||
    r?.rubrica_nome ||
    r?.titulo ||
    '');

}

function getRubricaGrupo(r) {
  return (
    r?.grupo ||
    r?.categoria ||
    r?.natureza_nome ||
    r?.grupo_nome ||
    '');

}

function isRubricaEquipe(r) {
  const grupo = normalizeText(getRubricaGrupo(r));
  const nome = normalizeText(getRubricaNome(r));

  const gruposEquipe = [
  'equipe e gestao',
  'manutencao e operacao',
  'noturno nos museus 2026'];


  const nomesEquipeExatos = [
  'coordenador geral',
  'assistente de coordenacao e producao',
  'coordenador de comunicacao',
  'analista administrativo-financeira',
  'analista administrativo financeira',
  'assistente administrativo',
  'producao mis/mumo/mhab',
  'assessor de imprensa',
  'designer',
  'rede social / marketing cultural (mes 19 ao 28)',
  'rede social / marketing cultural (mês 19 ao 28)',
  'fotografo (mes 19 ao 28)',
  'fotografo (mês 19 ao 28)',
  'educador mis / mumo / mhab',
  'producao (ed. 2026)',
  'assistente de producao (ed. 2026)'];


  const palavrasEquipe = [
  'coordenador',
  'coordenacao',
  'coordenação',
  'comunicacao',
  'comunicação',
  'administrativo',
  'administrativa',
  'producao',
  'produção',
  'assessor',
  'designer',
  'fotografo',
  'fotógrafo',
  'marketing cultural',
  'educador',
  'assistente de producao',
  'assistente de produção'];


  const grupoCompativel = gruposEquipe.includes(grupo);
  const nomeExato = nomesEquipeExatos.includes(nome);
  const nomePorPalavra = palavrasEquipe.some((p) => nome.includes(normalizeText(p)));

  if (grupo === 'noturno nos museus 2026') {
    return nome.includes('producao') || nome.includes('produção');
  }

  if (grupo === 'manutencao e operacao') {
    return nome.includes('educador');
  }

  if (grupo === 'equipe e gestao') {
    return true;
  }

  return grupoCompativel || nomeExato || nomePorPalavra;
}

function getIaRiskStatus(p) {
  return String(
    p?.ia_risco_status ||
    p?.ai_risk_status ||
    p?.nf_ia_status ||
    p?.analise_ia_status ||
    ''
  ).toUpperCase();
}

function getIaRiskSummary(p) {
  return (
    p?.ia_risco_resumo ||
    p?.ai_risk_summary ||
    p?.nf_ia_resumo ||
    p?.analise_ia_resumo ||
    '');

}

function getIaRiskDate(p) {
  return (
    p?.ia_risco_data_analise ||
    p?.ai_risk_analyzed_at ||
    p?.updated_date ||
    p?.updatedAt ||
    p?.created_date ||
    p?.createdAt ||
    null);

}

function getItemLabel(p) {
  return (
    p?.titulo ||
    p?.title ||
    p?.descricao ||
    p?.description ||
    p?.nome ||
    p?.fornecedor_nome ||
    p?.supplier_name ||
    p?.profissional_nome ||
    p?.team_member_name ||
    p?.team_member_nome ||
    `Compra ${p?.id || ''}`);

}

function getPrimaryRiskReason(p) {
  const summary = getIaRiskSummary(p);
  if (summary) return summary;

  const motivos = p?.ia_risco_motivos || p?.ai_risk_reasons || p?.nf_ia_motivos;
  if (Array.isArray(motivos) && motivos.length > 0) {
    return String(motivos[0] || '');
  }

  const semRubrica = !p?.rubrica_id && !p?.budgetline_id && !p?.budget_line_id;
  if (semRubrica) return 'sem rubrica vinculada';

  if (p?.nf_valida === false) return 'nota fiscal inválida';

  if (
  p?.nf_valor_extraido &&
  Math.abs(toNumber(p.nf_valor_extraido) - toNumber(p.valor_solicitado)) > 1)
  {
    return 'divergência de valor da nota';
  }

  return 'inconsistência detectada';
}

export default function OrcamentoDashboard({
  budgetLines = [],
  purchases = [],
  rubricas = []
}) {
  /* ================= BASE ================= */

  const totalInicial = CONTRATO_3_ADITIVO;

  const totalComprometido = rubricas.reduce(
    (acc, r) => acc + rubricaUtilizado(r),
    0
  );

  const totalDisponivel = totalInicial - totalComprometido;
  const pctUsado = totalInicial > 0 ? totalComprometido / totalInicial * 100 : 0;

  /* ================= EXECUÇÃO REAL ================= */

  const totalPago = purchases.
  filter((p) => p.status === 'PAGO').
  reduce((acc, p) => acc + resolveValor(p), 0); // fonte: canonicalMetrics.js (via resolveValor)

  const totalAprovado = purchases.
  filter(
    (p) =>
    p.status === 'APROVADO_COORD' ||
    p.status === 'APROVADO_ADMIN' ||
    p.status === 'PAGO'
  ).
  reduce((acc, p) => acc + resolveValor(p), 0); // fonte: canonicalMetrics.js (via resolveValor)

  const pctExecucao = totalInicial > 0 ? totalPago / totalInicial * 100 : 0;

  /* ================= EQUIPE ================= */

  const rubricasEquipe = rubricas.filter(isRubricaEquipe);

  const totalEquipeViaRubrica = rubricasEquipe.reduce(
    (acc, r) => acc + rubricaUtilizado(r),
    0
  );

  const totalEquipeViaPurchases = purchases.
  filter((p) => p.origem === 'TEAM_PAYMENT' || p.team_payment_id).
  reduce((acc, p) => acc + resolveValor(p), 0); // fonte: canonicalMetrics.js (via resolveValor)

  const totalEquipe = totalEquipeViaRubrica > 0 ?
  totalEquipeViaRubrica :
  totalEquipeViaPurchases;

  const totalUtilizadoGeralRubricas = rubricas.reduce(
    (acc, r) => acc + rubricaUtilizado(r),
    0
  );

  const totalCompras = purchases.reduce((acc, p) => acc + resolveValor(p), 0); // fonte: canonicalMetrics.js (via resolveValor)

  const basePercentualEquipe = totalUtilizadoGeralRubricas > 0 ?
  totalUtilizadoGeralRubricas :
  totalCompras;

  const pctEquipe = basePercentualEquipe > 0 ?
  totalEquipe / basePercentualEquipe * 100 :
  0;

  /* ================= RISCO ================= */

  const riscoIaCompras = purchases.
  filter((p) => {
    const status = getIaRiskStatus(p);
    const statusHumanoFinal = String(
      p?.nf_status_final ||
      p?.invoice_final_status ||
      ''
    ).toUpperCase();

    if (statusHumanoFinal === 'APROVADA') return false;
    return status === 'ATENCAO' || status === 'ATENÇÃO' || status === 'CRITICO' || status === 'CRÍTICO';
  }).
  sort((a, b) => {
    const da = new Date(getIaRiskDate(a) || 0).getTime();
    const db = new Date(getIaRiskDate(b) || 0).getTime();
    return db - da;
  });

  const riscoComprasFallback = purchases.filter((p) => {
    const semRubrica = !p?.rubrica_id && !p?.budgetline_id && !p?.budget_line_id;
    const nfInvalida = p?.nf_valida === false;
    const divergenciaValor =
    p?.nf_valor_extraido &&
    Math.abs(toNumber(p.nf_valor_extraido) - toNumber(p.valor_solicitado)) > 1;

    return semRubrica || nfInvalida || divergenciaValor;
  });

  const riscoCompras = riscoIaCompras.length > 0 ? riscoIaCompras : riscoComprasFallback;
  const riscoRecentes = riscoCompras.slice(0, 2);

  /* ================= NATUREZA ================= */

  const porNatureza = budgetLines.reduce((acc, l) => {
    const key = l.natureza_nome || l.natureza_codigo || 'Outros';
    if (!acc[key]) acc[key] = { nome: key, previsto: 0, comprometido: 0 };
    acc[key].previsto += toNumber(l.saldo_inicial);
    acc[key].comprometido += toNumber(l.saldo_comprometido);
    return acc;
  }, {});

  const fmt = (v) =>
    `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  return null;























































































































}