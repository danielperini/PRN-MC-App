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
Tipo de Equipe: ${activity.tipo_equipe || ''}
Título da Atividade: ${activity.titulo || activity.nome || ''}
Descrição: ${activity.descricao || ''}
Data de Realização: ${activity.data_realizacao || activity.data_inicio || ''}
Data de Término: ${activity.data_fim || ''}
Público Estimado: ${activity.publico_estimado || 0}
Repetições no mês: ${activity.quantas_repeticoes || 1}
Público Total: ${activity.publico_total || 0}
Classificação: ${activity.classificacao || ''}
Meta do 3º Aditivo: ${activity.meta_codigo || ''}
Indicador Previsto: ${activity.indicador_previsto || ''}
Resultado Alcançado: ${activity.resultado_alcancado || ''}
Status da Meta: ${activity.status_meta || ''}
Equipe Responsável: ${activity.equipe_responsavel || ''}
Acessibilidade: ${activity.acessibilidade || ''}
Parceria: ${activity.parceria || ''}
Parceiro: ${activity.parceiro_nome || ''}
Produtos Entregues: ${Array.isArray(activity.produtos_entregues) ? activity.produtos_entregues.join(', ') : ''}
Quantidade de Produtos: ${activity.quantidade_produtos || 0}
É Mobilização: ${activity.eh_mobilizacao ? 'Sim' : 'Não'}
Tipo de Mobilização: ${activity.tipo_mobilizacao || ''}
Descrição da Mobilização: ${activity.descricao_mobilizacao || ''}
Houve Contratações: ${activity.houve_contratacoes ? 'Sim' : 'Não'}
Número de Trabalhadores: ${activity.numero_trabalhadores || 0}
Museu: ${activity.museu || ''}
Observações: ${activity.observacoes || ''}
Justificativa Técnica: ${activity.justificativa_tecnica || ''}
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

    const prompt = `Analise esta fotografia de atividades ligadas ao projeto Museus Centro (Viaduto das Artes).

Contexto da Atividade:
${activityContext}

Contexto do Relatório:
${reportContext}

Sua tarefa é identificar visualmente o conteúdo da imagem e gerar uma legenda descritiva e contextualizada, aproveitando ao máximo as informações da atividade registrada no sistema.

Retorne:
1. "caption": uma legenda profissional e descritiva, com 20 a 35 palavras, que contextualize a foto com a atividade realizada. Inclua: o que está acontecendo na imagem, o público/participantes visíveis, e a atividade ou meta a que se refere. Se houver dados como data, museu, tipo de atividade, resultado alcançado ou produtos entregues, integre-os de forma natural e fluida. NÃO use frases genéricas como "registro fotográfico" ou "foto da atividade" — seja específico e informativo.
2. "description": uma descrição objetiva do que aparece na imagem, em até 2 frases
3. "museum": o museu mais provável entre:
   - MIS
   - MHAB
   - MUMO
   - Atuação Geral
4. "location": a localização mais provável visível ou inferível pela imagem/contexto
   - exemplo: "auditório", "sala educativa", "galeria expositiva", "área externa", "recepção", "Atuação Geral"

Regras:
- Use tom profissional, descritivo e informativo
- Aproveite TODAS as informações do contexto da atividade quando disponíveis
- Se houver data de realização, mencione o mês ou período
- Se houver público estimado, considere mencionar a dimensão da atividade
- Se houver meta do 3º aditivo, resultado alcançado ou produtos entregues, integre à legenda
- Se houver tipo de equipe (educativa, produção, comunicação), mencione quando relevante
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