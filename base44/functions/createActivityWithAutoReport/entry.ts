import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * createActivityWithAutoReport
 * Cria uma atividade e vincula automaticamente ao relatório mensal do usuário.
 * Se o relatório não existir, cria um novo em DRAFT.
 * Payload: { titulo, descricao, classificacao, data_inicio, data_fim, meta_id?, rubrica_id?, usuario_responsavel_id? }
 */
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
      return Response.json({ error: 'Parâmetros obrigatórios: titulo, classificacao' }, { status: 400 });
    }

    // Determinar mês/ano a partir de data_inicio ou hoje
    const dataRef = data_inicio ? new Date(data_inicio) : new Date();
    const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mes_referencia = MESES[dataRef.getMonth()];
    const ano = dataRef.getFullYear();

    // Obter ou criar relatório mensal
    const getOrCreateResponse = await base44.functions.invoke('getOrCreateMonthlyReport', {
      mes_referencia,
      ano
    });

    if (!getOrCreateResponse.data || getOrCreateResponse.data.error) {
      return Response.json({ error: 'Erro ao obter/criar relatório: ' + (getOrCreateResponse.data?.error || 'desconhecido') }, { status: 500 });
    }

    const report = getOrCreateResponse.data.report;

    // Criar atividade vinculada ao relatório
    const newActivity = await base44.entities.Activity.create({
      report_id: report.id,
      titulo,
      descricao: descricao || '',
      classificacao,
      data_inicio: data_inicio || null,
      data_fim: data_fim || null,
      meta_id: activityData.meta_id || null,
      rubrica_id: activityData.rubrica_id || null,
      usuario_responsavel_id: activityData.usuario_responsavel_id || user.email,
      tipo_equipe: activityData.tipo_equipe || 'EDUCATIVO',
      fotos: [],
      documentos: []
    });

    return Response.json({
      activity: newActivity,
      report: report,
      message: 'Atividade criada com sucesso e vinculada ao relatório'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});