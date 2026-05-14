import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId, pagamentos, agrupadoPorMuseu, agrupadoPorRubrica } = await req.json();

    if (!pagamentos || pagamentos.length === 0) {
      return Response.json({
        sucesso: true,
        analise: 'Nenhum pagamento foi realizado no período.'
      });
    }

    // Preparar contexto para IA
    const totalPago = pagamentos.reduce((sum, p) => sum + (p.valor || 0), 0);
    const totalPagamentos = pagamentos.length;
    const mediaValor = totalPago / totalPagamentos;

    // Identificar padrões
    const museus = Object.keys(agrupadoPorMuseu || {});
    const rubricas = Object.keys(agrupadoPorRubrica || {});

    const maiorGastoMuseu = Object.entries(agrupadoPorMuseu || {}).reduce((max, [museu, pags]) => {
      const total = pags.reduce((s, p) => s + (p.valor || 0), 0);
      return total > (max.total || 0) ? { museu, total, count: pags.length } : max;
    }, {});

    const maiorGastoRubrica = Object.entries(agrupadoPorRubrica || {}).reduce((max, [rubrica, pags]) => {
      const total = pags.reduce((s, p) => s + (p.valor || 0), 0);
      return total > (max.total || 0) ? { rubrica, total, count: pags.length } : max;
    }, {});

    // Gerar análise com IA
    const prompt = `Você é um analista financeiro especializado em relatórios institucionais culturais.

DADOS DO PERÍODO:
- Total de Pagamentos: ${totalPagamentos}
- Valor Total Pago: R$ ${totalPago.toFixed(2)}
- Valor Médio por Pagamento: R$ ${mediaValor.toFixed(2)}
- Museus Envolvidos: ${museus.length} (${museus.join(', ')})
- Rubricas Utilizadas: ${rubricas.length}

MAIOR CONCENTRAÇÃO:
- Museu: ${maiorGastoMuseu.museu} (${maiorGastoMuseu.count} pagamentos, R$ ${maiorGastoMuseu.total.toFixed(2)})
- Rubrica: ${maiorGastoRubrica.rubrica} (${maiorGastoRubrica.count} pagamentos, R$ ${maiorGastoRubrica.total.toFixed(2)})

PADRÕES DETECTADOS:
${JSON.stringify(agrupadoPorMuseu, null, 2).substring(0, 500)}

Gere uma análise financeira textual em português que:
1. Apresente os principais grupos de gasto de forma elegante
2. Analise a concentração de recursos entre museus
3. Destaque dinâmica operacional e estratégica do período
4. Conecte execução financeira com atividades culturais
5. Apresente em linguagem institucional e sofisticada

NÃO use jargão técnico excessivo. Foque em narrativa clara e profissional.

Redija 2-3 parágrafos de análise financeira.`;

    const analiseIA = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'automatic'
    });

    return Response.json({
      sucesso: true,
      analise: analiseIA,
      metricas: {
        totalPago,
        totalPagamentos,
        mediaValor,
        totalMuseus: museus.length,
        totalRubricas: rubricas.length,
        maiorGastoMuseu,
        maiorGastoRubrica
      }
    });

  } catch (error) {
    console.error('Erro ao analisar financeiro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});