import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ORCAMENTO_TOTAL = 1320000;
const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function num(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function txt(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isApproved(report) {
  const status = String(report?.status || '').toUpperCase();
  return status === 'APPROVED' || status === 'APROVADO';
}

function isCulturalActivity(activity) {
  const haystack = txt([
    activity?.titulo,
    activity?.nome,
    activity?.atividade,
    activity?.descricao,
    activity?.descricao_executado,
    activity?.classificacao,
    activity?.tipo,
  ].filter(Boolean).join(' '));

  if (!haystack || haystack.length < 4) return false;

  return ![
    'nota fiscal',
    'compras',
    'compra',
    'pagamento',
    'recibo',
    'xml',
    'financeiro',
    'documentacao fiscal',
  ].some((term) => haystack.includes(term));
}

function getAudience(activity) {
  const total = num(activity?.publico_total ?? activity?.publico ?? activity?.publico_geral);
  if (total > 0) return Math.round(total);
  return Math.round(num(activity?.publico_estimado) * Math.max(num(activity?.quantas_repeticoes || 1), 1));
}

function getMuseum(report, activity) {
  const value = String(activity?.museu || activity?.centro_custo || report?.museu || '').toUpperCase();
  if (value.includes('MIS')) return 'MIS';
  if (value.includes('MHAB') || value.includes('MAB')) return 'MHAB';
  if (value.includes('MUMO')) return 'MUMO';
  return 'GERAL';
}

function getRubricaTotal(rubrica) {
  return num(rubrica?.valor_total_original ?? rubrica?.valor_original ?? rubrica?.valor_total ?? rubrica?.valor_rubrica ?? rubrica?.total ?? rubrica?.valor_previsto);
}

function getRubricaUsed(rubrica) {
  return num(rubrica?.valor_utilizado ?? rubrica?.utilizado ?? rubrica?.valor_usado ?? rubrica?.valor_executado);
}

function getGroup(rubrica) {
  return rubrica?.grupo || rubrica?.grupo_rubrica || rubrica?.categoria || rubrica?.eixo || rubrica?.tipo || 'Sem grupo informado';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const [reportsRaw, rubricasRaw, programacoesRaw] = await Promise.all([
      base44.asServiceRole.entities.Report.list('-updated_date', 1000).catch(() => []),
      base44.asServiceRole.entities.Rubrica.list('rubrica', 1000).catch(() => []),
      base44.asServiceRole.entities.Programacao.list('-data_realizacao', 1000).catch(() => []),
    ]);

    const reports = (Array.isArray(reportsRaw) ? reportsRaw : []).filter(isApproved);
    const rubricas = (Array.isArray(rubricasRaw) ? rubricasRaw : []).filter((r) => r?.ativo !== false);
    const programacoes = (Array.isArray(programacoesRaw) ? programacoesRaw : []).filter((p) => {
      const status = String(p?.status || p?.situacao || '').toUpperCase();
      return !['CANCELADO', 'CANCELADA', 'INATIVO', 'INATIVA'].includes(status);
    });

    let totalPublico = 0;
    let totalAtividades = 0;
    const publicoPorMuseu = Object.fromEntries(MUSEUS.map((m) => [m, 0]));
    const atividadesPorMuseu = Object.fromEntries(MUSEUS.map((m) => [m, 0]));
    const publicoPorClassificacao = { META: 0, ROTINA: 0, EXTRA: 0 };
    const publicoPorMes = {};

    for (const report of reports) {
      const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
      for (const activity of atividades) {
        if (!isCulturalActivity(activity)) continue;

        const audience = getAudience(activity);
        const museum = getMuseum(report, activity);
        const classification = String(activity?.classificacao || activity?.tipo || 'EXTRA').toUpperCase();
        const monthKey = `${report?.mes_referencia || 'Sem mês'}/${report?.ano || 'Sem ano'}`;

        totalAtividades += 1;
        totalPublico += audience;

        if (MUSEUS.includes(museum)) {
          publicoPorMuseu[museum] += audience;
          atividadesPorMuseu[museum] += 1;
        }

        if (!publicoPorMes[monthKey]) publicoPorMes[monthKey] = { total: 0, atividades: 0 };
        publicoPorMes[monthKey].total += audience;
        publicoPorMes[monthKey].atividades += 1;

        publicoPorClassificacao[classification] = (publicoPorClassificacao[classification] || 0) + audience;
      }
    }

    const previstoRubricas = rubricas.reduce((sum, r) => sum + getRubricaTotal(r), 0);
    const previsto = previstoRubricas > 0 ? previstoRubricas : ORCAMENTO_TOTAL;
    const utilizado = rubricas.reduce((sum, r) => sum + getRubricaUsed(r), 0);
    const saldo = previsto - utilizado;
    const percentual = previsto > 0 ? Number(((utilizado / previsto) * 100).toFixed(1)) : 0;

    const gruposMap = new Map();
    for (const r of rubricas) {
      const grupo = getGroup(r);
      const atual = gruposMap.get(grupo) || { grupo, previsto: 0, utilizado: 0, saldo: 0, percentual: 0, rubricas: 0 };
      atual.previsto += getRubricaTotal(r);
      atual.utilizado += getRubricaUsed(r);
      atual.rubricas += 1;
      gruposMap.set(grupo, atual);
    }

    const orcamentoPorGrupo = Array.from(gruposMap.values()).map((g) => ({
      ...g,
      saldo: g.previsto - g.utilizado,
      percentual: g.previsto > 0 ? Number(((g.utilizado / g.previsto) * 100).toFixed(1)) : 0,
    }));

    const porMuseu = Object.fromEntries(MUSEUS.map((m) => [m, {
      atividades: atividadesPorMuseu[m] || 0,
      publico: publicoPorMuseu[m] || 0,
    }]));

    const resumo = {
      total_relatorios_aprovados: reports.length,
      total_atividades: totalAtividades,
      total_publico: Math.round(totalPublico),
      media_publico: totalAtividades > 0 ? Math.round(totalPublico / totalAtividades) : 0,
      total_programacoes: programacoes.length,
      percentual_execucao: percentual,
      valor_previsto: previsto,
      valor_utilizado: utilizado,
      saldo_disponivel: saldo,
    };

    return Response.json({
      atualizado_em: new Date().toISOString(),
      metricas: resumo,
      por_museu: porMuseu,
      por_classificacao: publicoPorClassificacao,
      publico_por_mes: publicoPorMes,
      orcamento_por_grupo: orcamentoPorGrupo,
      patrocinador: {
        atualizado_em: new Date().toISOString(),
        resumo,
        distribuicao_publico: porMuseu,
        classificacao_atividades: publicoPorClassificacao,
        publico_por_mes: publicoPorMes,
      },
      detalhes_confiabilidade: {
        relatorios_processados: reports.length,
        atividades_somadas: totalAtividades,
        programacoes_ativas: programacoes.length,
        rubricas_ativas: rubricas.length,
        regra_publico: 'somente atividades culturais aprovadas',
        regra_execucao: 'rubricas ativas do terceiro aditivo',
        ultima_atualizacao: new Date().toISOString(),
      },
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro ao sincronizar dashboard' }, { status: 500 });
  }
});
