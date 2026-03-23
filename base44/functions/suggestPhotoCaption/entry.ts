import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { photoUrl, activityId, reportId } = await req.json();

    if (!photoUrl) {
      return Response.json({ error: 'photoUrl é obrigatório' }, { status: 400 });
    }

    // Buscar contexto da atividade e relatório
    let activityContext = '';
    let reportContext = '';

    if (activityId) {
      try {
        const activity = await base44.entities.Activity.get(activityId);
        if (activity) {
          activityContext = `
Tipo de Atividade: ${activity.tipo_equipe || ''}
Título: ${activity.titulo || ''}
Descrição: ${activity.descricao || ''}
Data de Realização: ${activity.data_realizacao || ''}
Público Estimado: ${activity.publico_estimado || 0}
Classificação: ${activity.classificacao || ''}
`;
        }
      } catch (error) {
        console.error('Erro ao buscar atividade:', error.message);
      }
    }

    if (reportId) {
      try {
        const report = await base44.entities.Report.get(reportId);
        if (report) {
          reportContext = `
Autor: ${report.author_name || ''}
Função: ${report.funcao || ''}
Museu: ${report.museu || ''}
Período: ${report.mes_referencia || ''}/${report.ano || ''}
Equipe: ${report.equipe || ''}
`;
        }
      } catch (error) {
        console.error('Erro ao buscar relatório:', error.message);
      }
    }

    // Construir prompt para Claude analisar a imagem
    const prompt = `Analise esta fotografia de um relatório de atividades em museus e sugira uma legenda descritiva e profissional.

Contexto da Atividade:
${activityContext}

Contexto do Relatório:
${reportContext}

Baseado na imagem, forneça:
1. Uma legenda breve (máximo 15 palavras) que descreva o conteúdo visual e a atividade
2. Mantenha um tom profissional e descritivo
3. Considere o contexto da atividade se disponível
4. Responda APENAS com a legenda, sem explicações adicionais

Responda em JSON com este formato:
{
  "caption": "sua legenda aqui"
}`;

    // Usar Claude com visão para analisar a imagem
    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [photoUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          caption: {
            type: 'string',
            description: 'Legenda sugerida para a foto'
          }
        },
        required: ['caption']
      },
      model: 'claude_sonnet_4_6'
    });

    return Response.json({
      success: true,
      caption: result.caption
    });
  } catch (error) {
    console.error('Erro ao sugerir legenda:', error.message);
    return Response.json(
      { error: error.message || 'Erro ao processar sugestão' },
      { status: 500 }
    );
  }
});