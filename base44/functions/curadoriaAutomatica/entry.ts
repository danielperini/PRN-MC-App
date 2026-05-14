import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Curadoria automática: extrai frases, destaques, trechos, imagens fortes
 * Alimenta dashboards, carrosséis, destaques institucionais
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
      tipo_fonte = 'relatorio', // relatorio, release, atividade, depoimento
      fonte_id,
      quantidade_destaques = 5
    } = body;

    let conteudo = null;
    let texto_bruto = '';

    // Buscar conteúdo
    if (tipo_fonte === 'relatorio') {
      const rel = await base44.entities.Report.filter({ id: fonte_id });
      conteudo = rel?.[0];
      texto_bruto = `${conteudo?.resumo_executivo || ''} ${conteudo?.avaliacao_pontos_positivos || ''}`;
    } else if (tipo_fonte === 'release') {
      const rel = await base44.entities.Release.filter({ id: fonte_id });
      conteudo = rel?.[0];
      texto_bruto = conteudo?.conteudo_completo || '';
    } else if (tipo_fonte === 'atividade') {
      const ativ = await base44.entities.Activity.filter({ id: fonte_id });
      conteudo = ativ?.[0];
      texto_bruto = conteudo?.descricao || '';
    } else if (tipo_fonte === 'depoimento') {
      // Buscar depoimentos do relatório
      const ativs = await base44.entities.Activity.filter({
        report_id: fonte_id
      });
      texto_bruto = (ativs || []).map(a => a.comentarios || '').join(' ');
    }

    if (!texto_bruto || texto_bruto.length < 100) {
      return Response.json({
        error: 'Conteúdo insuficiente para curadoria'
      }, { status: 400 });
    }

    const prompt = `Curadura AUTOMATICAMENTE o seguinte conteúdo de ${tipo_fonte}:

${texto_bruto.substring(0, 3000)}

EXTRAIA estruturadamente:

SEÇÃO 1 - FRASES IMPACTANTES
Extraia ${quantidade_destaques} frases/trechos mais impactantes (máx 200 chars cada)
Que sintetizem essência, resultado, impacto, visão.
Formato: [ "frase1", "frase2", ... ]

SEÇÃO 2 - DESTAQUES TEMÁTICOS
Identifique 3-4 temas-chave e resuma cada em 50 chars.
Formato: { "tema1": "resumo", "tema2": "resumo" }

SEÇÃO 3 - CITAÇÕES PARA CARROSSEL
Extraia 3 citações diretas ideais para redes/carrossel (140 chars).
Formato: [ "cit1", "cit2", "cit3" ]

SEÇÃO 4 - NÚMEROS/DADOS PARA DESTAQUE
Identifique números/métricas relevantes.
Formato: [ { "dado": "450 pessoas", "contexto": "público" }, ... ]

SEÇÃO 5 - SUGESTÃO DE VISUAL
Que tipo de imagem/visual acompanharia bem este conteúdo?

Retorne como JSON válido. Seja preciso, use citações diretas.`;

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
              content: 'Você é curador editorial especializado em extrair destaques institucionais. Retorne JSON válido. Use citações diretas, não resumos.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.5
        })
      }
    );

    if (!llmResponse.ok) {
      return Response.json({ error: 'Falha na curadoria' }, { status: 500 });
    }

    const llmData = await llmResponse.json();
    const curadoriaTexto = llmData.choices?.[0]?.message?.content || '';

    // Parse JSON
    let curadoriaDados = {};
    try {
      const jsonMatch = curadoriaTexto.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        curadoriaDados = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      curadoriaDados = { texto_bruto: curadoriaTexto };
    }

    // Salvar curadoria
    const analise = await base44.entities.AIAnalysis.create({
      conteudo_tipo: tipo_fonte,
      conteudo_id: fonte_id,
      tipo_analise: 'editorial',
      resultado: {
        tipo: 'curadoria_automatica',
        curadoria: curadoriaDados,
        quantidade_destaques
      },
      gerado_por_email: user.email,
      status: 'sucesso',
      data_analise: new Date().toISOString()
    });

    return Response.json({
      sucesso: true,
      curadoria_id: analise.id,
      curadoria: curadoriaDados,
      frases: curadoriaDados.frases_impactantes || [],
      destaque_visual: curadoriaDados.sugestao_visual
    });
  } catch (error) {
    console.error('curadoriaAutomatica:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});