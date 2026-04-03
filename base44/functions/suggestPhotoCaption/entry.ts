import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { photoUrl, activityId, reportId } = body || {};

    if (!photoUrl) {
      return Response.json({ error: 'photoUrl é obrigatório' }, { status: 400 });
    }

    let activityContext = '';
    let reportContext = '';

    if (activityId) {
      try {
        const activity = await base44.entities.Activity.get(activityId);
        if (activity) {
          activityContext = `
Tipo de Atividade: ${activity.tipo_equipe || activity.tipo_acao || ''}
Título: ${activity.titulo || activity.nome || ''}
Descrição: ${activity.descricao || ''}
Data de Realização: ${activity.data_realizacao || activity.data_inicio || ''}
Público Estimado: ${activity.publico_estimado || 0}
Classificação: ${activity.classificacao || ''}
Museu: ${activity.museu || ''}
Localização informada: ${activity.localizacao || activity.local || ''}
`;
        }
      } catch (error) {
        console.error('Erro ao buscar atividade:', error?.message || error);
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
        console.error('Erro ao buscar relatório:', error?.message || error);
      }
    }

    const prompt = `Analise esta fotografia de atividades ligadas ao projeto Museus Centro.

Contexto da Atividade:
${activityContext}

Contexto do Relatório:
${reportContext}

Sua tarefa é identificar visualmente o conteúdo da imagem e responder em JSON.

Retorne:
1. "caption": uma legenda curta e profissional, com no máximo 15 palavras
2. "description": uma descrição objetiva do que aparece na imagem, em até 2 frases
3. "museum": o museu mais provável entre:
   - MIS
   - MHAB
   - MUMO
   - Atuação Geral
4. "location": a localização mais provável visível ou inferível pela imagem/contexto
   - exemplo: "auditório", "sala educativa", "galeria expositiva", "área externa", "recepção", "Atuação Geral"

Regras:
- Use tom profissional e descritivo
- Considere o contexto acima quando ele existir
- Se não der para afirmar um museu com segurança, use "Atuação Geral"
- Se não der para afirmar a localização com segurança, use "Atuação Geral"
- Responda somente em JSON válido

Formato obrigatório:
{
  "caption": "texto",
  "description": "texto",
  "museum": "MIS | MHAB | MUMO | Atuação Geral",
  "location": "texto"
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [photoUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          caption: {
            type: 'string',
            description: 'Legenda breve e profissional para a foto',
          },
          description: {
            type: 'string',
            description: 'Descrição objetiva do conteúdo visual da imagem',
          },
          museum: {
            type: 'string',
            description: 'Museu provável: MIS, MHAB, MUMO ou Atuação Geral',
            enum: ['MIS', 'MHAB', 'MUMO', 'Atuação Geral'],
          },
          location: {
            type: 'string',
            description: 'Localização provável da cena na imagem',
          },
        },
        required: ['caption', 'description', 'museum', 'location'],
      },
      model: 'claude_sonnet_4_6',
    });

    return Response.json({
      success: true,
      caption: result?.caption || '',
      description: result?.description || '',
      museum: result?.museum || 'Atuação Geral',
      location: result?.location || 'Atuação Geral',
    });
  } catch (error) {
    console.error('Erro ao sugerir legenda:', error?.message || error);
    return Response.json(
      { error: error?.message || 'Erro ao processar sugestão' },
      { status: 500 }
    );
  }
});
