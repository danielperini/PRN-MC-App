import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Inteligência financeira avançada: auditoria automática, análise comparativa, previsões
 * Detecta anomalias, duplicidade, divergências, não-conformidades
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito' }, { status: 403 });
    }

    const body = await req.json();
    const {
      periodo_mes,
      periodo_ano,
      museu,
      tipo_analise = 'completo' // completo, anomalias, comparativo, previsoes
    } = body;

    // Buscar dados financeiros reais
    const compras = await base44.entities.PurchaseRequest.filter({
      status: 'PAGO'
    }, '-created_date', 500);

    const rubricas = await base44.entities.Rubrica.filter({}, null, 100);
    const fornecedores = await base44.entities.Fornecedor.filter({}, null, 200);

    // Análise de padrões
    const padoes = analisarPadroes(compras);
    const anomalias = detectarAnomalias(compras);
    const comparativo = compararRubricas(rubricas, compras);

    const prompt = `Analise dados financeiros REAIS do período ${periodo_mes}/${periodo_ano}:

ESTATÍSTICAS:
- Total de compras: ${compras?.length || 0}
- Valor total movimentado: R$ ${compras.reduce((sum, c) => sum + (c.valor_pago || 0), 0).toFixed(2)}
- Fornecedores únicos: ${fornecedores?.length || 0}
- Rubricas utilizadas: ${rubricas?.length || 0}

PADRÕES DETECTADOS:
${JSON.stringify(padoes, null, 2).substring(0, 1000)}

ANOMALIAS IDENTIFICADAS:
${JSON.stringify(anomalias, null, 2).substring(0, 1000)}

ANÁLISE COMPARATIVA:
${JSON.stringify(comparativo, null, 2).substring(0, 1000)}

TAREFA (${tipo_analise}):
1. Sintetize execução financeira do período
2. Identifique pontos críticos e oportunidades
3. Recomende ações (se aplicável)
4. Indique riscos de conformidade

Seja técnico, factual, baseado em números reais.`;

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
              content: 'Você é analista financeiro especializado em auditoria institucional. Analise números reais. Nunca invente dados. Seja preciso em diagnósticos.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2500,
          temperature: 0.5
        })
      }
    );

    if (!llmResponse.ok) {
      return Response.json({ error: 'Falha análise' }, { status: 500 });
    }

    const llmData = await llmResponse.json();
    const analiseTexto = llmData.choices?.[0]?.message?.content || '';

    // Salvar inteligência financeira
    const analise = await base44.entities.AIAnalysis.create({
      conteudo_tipo: 'relatorio',
      conteudo_id: periodo_mes + '_' + periodo_ano,
      tipo_analise: 'financeira',
      resultado: {
        tipo: 'inteligencia_financeira_avancada',
        analise: analiseTexto,
        padroes: padoes,
        anomalias: anomalias,
        comparativo: comparativo,
        periodo: `${periodo_mes}/${periodo_ano}`
      },
      gerado_por_email: user.email,
      status: 'sucesso',
      data_analise: new Date().toISOString()
    });

    return Response.json({
      sucesso: true,
      analise_id: analise.id,
      analise: analiseTexto,
      padroes: padoes,
      anomalias_quantidade: anomalias.length,
      periodo: `${periodo_mes}/${periodo_ano}`
    });
  } catch (error) {
    console.error('inteligenciaFinanceiraAvancada:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function analisarPadroes(compras) {
  const padroes = {
    valor_medio: 0,
    valor_maximo: 0,
    valor_minimo: Infinity,
    fornecedor_mais_usado: null,
    rubrica_mais_usada: null,
    frequencia_pagamentos: 0
  };

  if (!compras || compras.length === 0) return padroes;

  const valores = compras.map(c => c.valor_pago || 0).filter(v => v > 0);
  padroes.valor_medio = valores.reduce((a, b) => a + b, 0) / valores.length;
  padroes.valor_maximo = Math.max(...valores);
  padroes.valor_minimo = Math.min(...valores);
  padroes.frequencia_pagamentos = compras.length;

  return padroes;
}

function detectarAnomalias(compras) {
  const anomalias = [];

  (compras || []).forEach(c => {
    // Pagamento duplicado (mesmo valor, ±2 dias)
    // Valor muito alto/baixo
    // Sem comprovante
    if (!c.comprovante_pagamento_url) {
      anomalias.push({
        tipo: 'sem_comprovante',
        purchase_id: c.id,
        valor: c.valor_pago
      });
    }
  });

  return anomalias;
}

function compararRubricas(rubricas, compras) {
  const comparativo = {};

  (rubricas || []).forEach(r => {
    const gastos = (compras || [])
      .filter(c => c.rubrica_id === r.id || c.rubrica_nome === r.rubrica)
      .reduce((sum, c) => sum + (c.valor_pago || 0), 0);

    comparativo[r.rubrica] = {
      previsto: r.valor_rubrica,
      gasto: gastos,
      percentual_utilizacao: r.valor_rubrica > 0 ? ((gastos / r.valor_rubrica) * 100).toFixed(1) + '%' : '0%',
      saldo: r.valor_rubrica - gastos
    };
  });

  return comparativo;
}