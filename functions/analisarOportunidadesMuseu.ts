import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { museu_sigla } = payload;

    if (!museu_sigla) {
      return new Response(JSON.stringify({ error: 'museu_sigla obrigatório' }), { status: 400 });
    }

    // Buscar todos os pontos do entorno
    const pontos = await base44.asServiceRole.entities.PontoEntorno.filter({
      museu_sigla,
      ativo: true,
    });

    if (pontos.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum ponto encontrado' }), { status: 200 });
    }

    // Buscar atividades relacionadas do museu
    const reports = await base44.asServiceRole.entities.Report.filter({
      museu: museu_sigla,
      status: 'APPROVED',
    });

    // Compilar contexto de atividades
    const activitiesContext = reports
      .slice(0, 20)
      .flatMap(r => r.atividades || [])
      .map(a => `${a.titulo}: ${a.descricao}`)
      .join('\n');

    // Análise de cada ponto
    const analises = [];
    for (const ponto of pontos) {
      const prompt = `Analise esta oportunidade de parceria:
      
INSTITUIÇÃO: ${ponto.nome}
CATEGORIA: ${ponto.categoria}
BAIRRO: ${ponto.bairro}
PÚBLICOS POTENCIAIS: ${ponto.publicos_alvo?.join(', ') || 'A identificar'}

CONTEXTO DE ATIVIDADES DO MUSEU:
${activitiesContext || 'Sem atividades mapeadas ainda'}

Com base nisso, forneça um JSON com:
{
  "aderencia_tematica": (0-100),
  "prioridade": "Alta|Média|Baixa",
  "oportunidades": ["tipo1", "tipo2"],
  "justificativa": "texto curto"
}`;

      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: 'gemini_3_flash',
      });

      try {
        const parsed = JSON.parse(resultado);
        analises.push({
          ponto_id: ponto.id,
          aderencia_tematica: parsed.aderencia_tematica || 50,
          prioridade: parsed.prioridade || 'Média',
          oportunidades_sugeridas: parsed.oportunidades || [],
        });
      } catch (e) {
        analises.push({
          ponto_id: ponto.id,
          aderencia_tematica: 50,
          prioridade: 'Média',
          oportunidades_sugeridas: [],
        });
      }
    }

    // Atualizar pontos com análises
    for (const analise of analises) {
      await base44.asServiceRole.entities.PontoEntorno.update(analise.ponto_id, {
        aderencia_tematica: analise.aderencia_tematica,
        prioridade: analise.prioridade,
        oportunidades_sugeridas: analise.oportunidades_sugeridas,
        data_analise: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({
      museu_sigla,
      pontos_analisados: analises.length,
      timestamp: new Date().toISOString(),
    }), { status: 200 });
  } catch (error) {
    console.error('Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});