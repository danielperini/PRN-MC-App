import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * createActivityWithAutoReport
 * Cria uma atividade e vincula automaticamente ao relatório mensal do usuário.
 * Se o relatório não existir, cria um novo em DRAFT.
 * Payload:
 * {
 *   titulo,
 *   descricao,
 *   classificacao,
 *   data_inicio,
 *   data_fim,
 *   meta_id?,
 *   rubrica_id?,
 *   usuario_responsavel_id?,
 *   museu?,
 *   tipo_acao?,
 *   produto_realizado?,
 *   quantas_repeticoes?,
 *   quantidade_produto?,
 *   publico_estimado?
 * }
 */

function gerarAtividadeId() {
  return `ATI_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function toInt(value: unknown, fallback = 0): number {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
}

function normalizeOptionalInt(value: unknown) {
  if (value === '' || value === null || value === undefined) return '';
  return toInt(value, 0);
}

function normalizeAtividadeForReport(activityData: any, user: any) {
  const quantasRepeticoes = normalizeOptionalInt(activityData.quantas_repeticoes);
  const quantidadeProduto = normalizeOptionalInt(activityData.quantidade_produto);
  const publicoEstimado = normalizeOptionalInt(activityData.publico_estimado);

  const repeticoesNum = quantasRepeticoes === '' ? 0 : toInt(quantasRepeticoes, 0);
  const quantidadeProdutoNum = quantidadeProduto === '' ? 0 : toInt(quantidadeProduto, 0);

  return {
    activity_id: activityData.activity_id || gerarAtividadeId(),
    data_inicio: activityData.data_inicio || '',
    data_fim: activityData.data_fim || '',
    museu: activityData.museu || user.museu || '',
    tipo_acao: activityData.tipo_acao || '',
    nome: activityData.nome || activityData.titulo || '',
    publico_estimado: publicoEstimado,
    quantas_repeticoes: quantasRepeticoes,
    publico_total: '',
    produto_realizado: activityData.produto_realizado || '',
    quantidade_produto: quantidadeProduto,
    atividades_total: repeticoesNum,
    produtos_total: repeticoesNum * quantidadeProdutoNum,
    objetivo: activityData.objetivo || '',
    descricao_executado: activityData.descricao_executado || activityData.descricao || '',
    equipe_envolvida: activityData.equipe_envolvida || '',
    equipe_envolvida_lista: Array.isArray(activityData.equipe_envolvida_lista)
      ? activityData.equipe_envolvida_lista
      : [],
    co_responsavel_email: activityData.co_responsavel_email || '',
    resultados_impactos: activityData.resultados_impactos || '',
    problemas: activityData.problemas || '',
    solucoes: activityData.solucoes || '',
    equipe_responsavel: activityData.equipe_responsavel || '',
    classificacao: activityData.classificacao || '',
    meta_codigo: activityData.meta_codigo || '',
    indicador_previsto: activityData.indicador_previsto || '',
    meta_quantitativa: activityData.meta_quantitativa || '',
    resultado_alcancado: activityData.resultado_alcancado || '',
    status_meta: activityData.status_meta || '',
    justificativa_tecnica: activityData.justificativa_tecnica || '',
    depoimento_participantes: activityData.depoimento_participantes || '',
    eh_mobilizacao: !!activityData.eh_mobilizacao,
    tipo_mobilizacao: activityData.tipo_mobilizacao || '',
    descricao_mobilizacao: activityData.descricao_mobilizacao || '',
    houve_contratacoes: !!activityData.houve_contratacoes,
    numero_trabalhadores: activityData.numero_trabalhadores || '',
    numero_empresas: activityData.numero_empresas || '',
    valor_aproximado: activityData.valor_aproximado || '',
    clipping_automatico: activityData.clipping_automatico || null,
    is_template: !!activityData.is_template,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const activityData = await req.json();
    const { titulo, descricao, classificacao, data_inicio, data_fim } = activityData;

    if (!titulo || !classificacao) {
      return Response.json(
        { error: 'Parâmetros obrigatórios: titulo, classificacao' },
        { status: 400 }
      );
    }

    // Determinar mês/ano a partir de data_inicio ou hoje
    const dataRef = data_inicio ? new Date(data_inicio) : new Date();
    const MESES = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro'
    ];

    const mes_referencia = MESES[dataRef.getMonth()];
    const ano = dataRef.getFullYear();

    // Obter ou criar relatório mensal
    const getOrCreateResponse = await base44.functions.invoke('getOrCreateMonthlyReport', {
      mes_referencia,
      ano
    });

    if (!getOrCreateResponse.data || getOrCreateResponse.data.error) {
      return Response.json(
        {
          error:
            'Erro ao obter/criar relatório: ' +
            (getOrCreateResponse.data?.error || 'desconhecido')
        },
        { status: 500 }
      );
    }

    const report = getOrCreateResponse.data.report;

    const atividadeRelatorio = normalizeAtividadeForReport(
      {
        ...activityData,
        titulo,
        descricao,
        classificacao,
        data_inicio,
        data_fim,
      },
      user
    );

    // Criar atividade vinculada ao relatório na entity Activity
    const newActivity = await base44.entities.Activity.create({
      report_id: report.id,
      activity_id: atividadeRelatorio.activity_id,
      titulo,
      nome: atividadeRelatorio.nome,
      descricao: descricao || '',
      descricao_executado: atividadeRelatorio.descricao_executado,
      classificacao,
      data_inicio: data_inicio || null,
      data_fim: data_fim || null,
      meta_id: activityData.meta_id || null,
      rubrica_id: activityData.rubrica_id || null,
      usuario_responsavel_id: activityData.usuario_responsavel_id || user.email,
      user_email: user.email,
      user_name: user.full_name || '',
      museu: atividadeRelatorio.museu,
      tipo_acao: atividadeRelatorio.tipo_acao,
      produto_realizado: atividadeRelatorio.produto_realizado,
      quantas_repeticoes: atividadeRelatorio.quantas_repeticoes,
      quantidade_produto: atividadeRelatorio.quantidade_produto,
      publico_estimado: atividadeRelatorio.publico_estimado,
      atividades_total: atividadeRelatorio.atividades_total,
      produtos_total: atividadeRelatorio.produtos_total,
      tipo_equipe: activityData.tipo_equipe || 'EDUCATIVO',
      fotos: Array.isArray(activityData.fotos) ? activityData.fotos : [],
      documentos: Array.isArray(activityData.documentos) ? activityData.documentos : []
    });

    // Sincronizar também no array principal do relatório
    const atividadesAtuais = Array.isArray(report.atividades)
      ? report.atividades.map((item: any) => ({ ...item }))
      : [];

    await base44.asServiceRole.entities.Report.update(report.id, {
      atividades: [...atividadesAtuais, atividadeRelatorio]
    });

    const updatedReport = await base44.asServiceRole.entities.Report.get(report.id);

    return Response.json({
      activity: newActivity,
      report: updatedReport,
      message: 'Atividade criada com sucesso e vinculada ao relatório'
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
});
