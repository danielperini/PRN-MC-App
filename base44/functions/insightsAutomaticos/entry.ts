import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Insights automáticos para dashboards: tendências, crescimento, comparações
 * Gera leitura executiva contínua do sistema
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      periodo_mes,
      periodo_ano,
      museu,
      tipo_insight = 'executivo' // executivo, tendencias, comparativo, anomalias
    } = body;

    // Buscar dados para análise
    const relatorios = await base44.entities.Report.filter({
      mes_referencia: periodo_mes,
      ano: periodo_ano,
      status: 'APPROVED'
    }, null, 10);

    const atividades = await base44.entities.Activity.filter({
      museu: museu
    }, '-created_date', 200);

    const programacao = await base44.entities.Programacao.filter({
      museu: museu
    }, '-created_date', 100);

    const compras = await base44.entities.PurchaseRequest.filter({
      status: 'PAGO'
    }, null, 500);

    // Calcular métricas base
    const metricas = {
      total_atividades: atividades?.length || 0,
      publico_total: (atividades || []).reduce((sum, a) => sum + (a.publico_total || 0), 0),
      programacao_cadastrada: programacao?.length || 0,
      relatorios_aprovados: relatorios?.length || 0,
      gasto_total: (compras || []).reduce((sum, c) => sum + (c.valor_pago || 0), 0),
      fornecedores_utilizados: new Set((compras || []).map(c => c.fornecedor_cnpj)).size
    };

    const prompt = construirPromptInsights(tipo_insight, metricas, periodo_mes, periodo_ano, museu);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'API não configurada' }, { status: 500 });
    }

    const llmResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Você é analista estratégico institucional. Gere insights baseados exclusivamente em números reais fornecidos. Nunca invente métricas.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.6
        })
      }
    );

    if (!llmResponse.ok) {
      return Response.json({ error: 'Falha na análise' }, { status: 500 });
    }

    const llmData = await llmResponse.json();
    const insightTexto = llmData.choices?.[0]?.message?.content || '';

    // Salvar insight
    const analise = await base44.entities.AIAnalysis.create({
      conteudo_tipo: 'relatorio',
      conteudo_id: museu + '_insights_' + periodo_mes + '_' + periodo_ano,
      tipo_analise: 'contextual',
      resultado: {
        tipo: 'insights_automaticos',
        insight: insightTexto,
        metricas: metricas,
        tipo_insight,
        periodo: `${periodo_mes}/${periodo_ano}`
      },
      gerado_por_email: user.email,
      status: 'sucesso',
      data_analise: new Date().toISOString()
    });

    return Response.json({
      sucesso: true,
      insight_id: analise.id,
      insight: insightTexto,
      metricas: metricas,
      tipo: tipo_insight
    });
  } catch (error) {
    console.error('insightsAutomaticos:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function construirPromptInsights(tipo, metricas, periodo_mes, periodo_ano, museu) {
  let prompt = `Gere INSIGHTS AUTOMÁTICOS para o período ${periodo_mes}/${periodo_ano}${museu ? ` do ${museu}` : ''}:

DADOS REAIS:
- Atividades realizadas: ${metricas.total_atividades}
- Público total atingido: ${metricas.publico_total} pessoas
- Programação cadastrada: ${metricas.programacao_cadastrada} eventos
- Relatórios aprovados: ${metricas.relatorios_aprovados}
- Gasto total: R$ ${metricas.gasto_total.toFixed(2)}
- Fornecedores utilizados: ${metricas.fornecedores_utilizados}

`;

  if (tipo === 'executivo') {
    prompt += `TAREFA: Escreva um RESUMO EXECUTIVO de 3-4 parágrafos destacando:
1. Desempenho geral (números principais)
2. Pontos fortes e destaques
3. Desafios identificados
4. Recomendações para próximo período`;
  } else if (tipo === 'tendencias') {
    prompt += `TAREFA: Identifique TENDÊNCIAS E PADRÕES:
1. Evolução mês a mês
2. Crescimento/redução de atividades
3. Mudanças em público/tipo de atividade
4. Previsões conservadoras para próximo período`;
  } else if (tipo === 'comparativo') {
    prompt += `TAREFA: Análise COMPARATIVA:
1. Este período vs período anterior (simulado)
2. Museu vs média de museus (simulado)
3. Categorias de gasto: concentração e dispersão
4. Eficiência de investimento`;
  } else if (tipo === 'anomalias') {
    prompt += `TAREFA: Identifique ANOMALIAS E OPORTUNIDADES:
1. Valores anormais (muito altos/baixos)
2. Gaps em cobertura programática
3. Públicos não alcançados
4. Atividades sub-utilizadas vs super-demandadas`;
  }

  return prompt;
}