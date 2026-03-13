import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CATEGORIAS = [
  { key: 'manutencao', label: 'Manutenção de Rotina' },
  { key: 'diarias_educador', label: 'Diárias de Educador' },
  { key: 'lanches', label: 'Lanches' },
  { key: 'alimentacao_cartao', label: 'Alimentação Cartão' },
  { key: 'material', label: 'Material' },
  { key: 'acoes_educativas', label: 'Ações Educativas' },
  { key: 'som_luz', label: 'Som e Luz' },
  { key: 'exposicao', label: 'Exposição' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { museu } = await req.json();
    if (!museu) return Response.json({ error: 'museu é obrigatório' }, { status: 400 });

    // 1. Buscar dados
    const [rubricas, configs, purchases] = await Promise.all([
      base44.entities.Rubrica.list('ordem_exibicao', 200),
      base44.entities.RubricaMuseuConfig.filter({ museu }),
      base44.entities.PurchaseRequest.list('created_date', 500),
    ]);

    // 2. Montar dados por categoria
    const rubricaIds = new Set(configs.map(c => c.rubrica_id));
    const rubricasDoMuseu = rubricas.filter(r => rubricaIds.has(r.id) && r.ativo !== false);

    const categoriasData = CATEGORIAS.map(cat => {
      const rubricasCategoria = rubricasDoMuseu
        .filter(r => configs.some(c => c.rubrica_id === r.id && c.categoria_key === cat.key))
        .map(r => {
          const config = configs.find(c => c.rubrica_id === r.id);
          const divisor = config?.divisor || 1;
          const valorOrcado = (r.valor_rubrica || 0) / divisor;

          const comprasRelevantes = purchases.filter(
            p => p.rubrica_id === r.id && ['APROVADO_COORD', 'PAGO'].includes(p.status)
          );
          const valorUtilizado = comprasRelevantes.reduce((sum, p) => sum + (p.valor_total || 0), 0);
          const saldo = valorOrcado - valorUtilizado;
          const percentualUtilizado = valorOrcado > 0
            ? parseFloat(((valorUtilizado / valorOrcado) * 100).toFixed(1))
            : 0;

          return {
            id: r.id,
            rubrica: r.rubrica,
            valor_rubrica: parseFloat(valorOrcado.toFixed(2)),
            valorUtilizado: parseFloat(valorUtilizado.toFixed(2)),
            saldo: parseFloat(saldo.toFixed(2)),
            percentualUtilizado,
            comprasCount: comprasRelevantes.length,
          };
        });

      const totalOrcado = rubricasCategoria.reduce((s, r) => s + r.valor_rubrica, 0);
      const totalUtilizado = rubricasCategoria.reduce((s, r) => s + r.valorUtilizado, 0);

      return {
        key: cat.key,
        label: cat.label,
        rubricas: rubricasCategoria,
        totalOrcado: parseFloat(totalOrcado.toFixed(2)),
        totalUtilizado: parseFloat(totalUtilizado.toFixed(2)),
        saldo: parseFloat((totalOrcado - totalUtilizado).toFixed(2)),
        percentual: totalOrcado > 0
          ? parseFloat(((totalUtilizado / totalOrcado) * 100).toFixed(1))
          : 0,
      };
    });

    const totais = {
      totalOrcado: parseFloat(categoriasData.reduce((s, c) => s + c.totalOrcado, 0).toFixed(2)),
      totalUtilizado: parseFloat(categoriasData.reduce((s, c) => s + c.totalUtilizado, 0).toFixed(2)),
    };
    totais.saldo = parseFloat((totais.totalOrcado - totais.totalUtilizado).toFixed(2));
    totais.percentual = totais.totalOrcado > 0
      ? parseFloat(((totais.totalUtilizado / totais.totalOrcado) * 100).toFixed(1))
      : 0;

    // 3. Gemini 3 Pro consolida e gera insights
    const aiResult = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é especialista em gestão orçamentária de projetos culturais públicos.
Analise os dados financeiros do museu ${museu} e forneça análise executiva em PT-BR.

Dados por categoria:
${JSON.stringify(categoriasData, null, 2)}

Totais do museu: Orçado R$${totais.totalOrcado}, Utilizado R$${totais.totalUtilizado} (${totais.percentual}%)

Identifique: categorias em risco (>80% utilizado), saldos críticos, padrões de gasto, e recomendações práticas.`,
      model: 'gemini_3_pro',
      response_json_schema: {
        type: 'object',
        properties: {
          insights: { type: 'string' },
          alertas: { type: 'array', items: { type: 'string' } },
          recomendacoes: { type: 'array', items: { type: 'string' } },
          saude_geral: { type: 'string' },
        }
      }
    });

    // 4. Salvar resultado
    const existing = await base44.entities.RubricasConsolidado.filter({ museu });
    const payload = {
      museu,
      categorias_data: categoriasData,
      totais,
      insights_ia: aiResult?.insights || '',
      alertas_ia: aiResult?.alertas || [],
      recomendacoes_ia: aiResult?.recomendacoes || [],
      saude_geral: aiResult?.saude_geral || 'atencao',
      gerado_em: new Date().toISOString(),
    };

    if (existing.length > 0) {
      await base44.entities.RubricasConsolidado.update(existing[0].id, payload);
    } else {
      await base44.entities.RubricasConsolidado.create(payload);
    }

    return Response.json({ success: true, data: payload });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});