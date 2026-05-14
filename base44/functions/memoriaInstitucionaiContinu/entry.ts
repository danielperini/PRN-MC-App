import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Memória institucional contínua: conecta períodos, identifica padrões longos
 * Cria narrativa histórica do projeto Museus Centro
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
      museu,
      anos_analisados = 2,
      tipo_narrativa = 'evolutiva' // evolutiva, tematica, impacto
    } = body;

    // Buscar histórico de relatórios aprovados
    const relatorios = await base44.entities.Report.filter({
      status: 'APPROVED',
      museu: museu
    }, '-ano,-mes_referencia', 200);

    if (!relatorios || relatorios.length === 0) {
      return Response.json({
        error: 'Nenhum relatório aprovado para análise de memória'
      }, { status: 400 });
    }

    // Agrupar por período
    const periodos = {};
    relatorios.forEach(r => {
      const chave = `${r.ano}-${r.mes_referencia}`;
      if (!periodos[chave]) periodos[chave] = [];
      periodos[chave].push(r);
    });

    // Extrair padrões históricos
    const padroes = extrairPadroesHistoricos(relatorios);
    const evolucao = analisarEvolucao(periodos);
    const temastransversais = identificarTemasTransversais(relatorios);

    const prompt = `Construa uma MEMÓRIA INSTITUCIONAL CONTÍNUA do ${museu} analisando ${relatorios.length} relatórios:

PERIODOS ANALISADOS: ${Object.keys(periodos).join(', ')}

PADRÕES HISTÓRICOS DETECTADOS:
${JSON.stringify(padroes, null, 2).substring(0, 1500)}

EVOLUÇÃO AO LONGO DO TEMPO:
${JSON.stringify(evolucao, null, 2).substring(0, 1500)}

TEMAS TRANSVERSAIS:
${temastransversais.slice(0, 10).join(', ')}

TAREFA (tipo: ${tipo_narrativa}):
1. Escreva uma NARRATIVA histórica que conecte os períodos
2. Identifique continuidades e mudanças
3. Marque momentos/marcos significativos
4. Sintetize aprendizados e conhecimentos acumulados
5. Projete legado institucional do projeto

Mínimo 10 parágrafos, baseado exclusivamente nos relatórios analisados.
Use citações e dados reais dos documentos.`;

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
              content: 'Você é historiador institucional. Analise documentos reais e construa narrativa coerente ao longo do tempo. Nunca invente períodos ou dados.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 3500,
          temperature: 0.7
        })
      }
    );

    if (!llmResponse.ok) {
      return Response.json({ error: 'Falha na análise' }, { status: 500 });
    }

    const llmData = await llmResponse.json();
    const memoriaTexto = llmData.choices?.[0]?.message?.content || '';

    // Salvar memória institucional
    const analise = await base44.entities.AIAnalysis.create({
      conteudo_tipo: 'relatorio',
      conteudo_id: museu + '_memoria_institucional',
      tipo_analise: 'editorial',
      resultado: {
        tipo: 'memoria_institucional_continua',
        narrativa: memoriaTexto,
        periodos_analisados: Object.keys(periodos),
        relatorios_analisados: relatorios.length,
        padroes: padroes,
        temas_transversais: temastransversais,
        tipo_narrativa,
        museu
      },
      gerado_por_email: user.email,
      status: 'sucesso',
      data_analise: new Date().toISOString()
    });

    return Response.json({
      sucesso: true,
      memoria_id: analise.id,
      narrativa: memoriaTexto,
      periodos: Object.keys(periodos).length,
      relatorios_analisados: relatorios.length,
      caracteres: memoriaTexto.length
    });
  } catch (error) {
    console.error('memoriaInstitucionaiContinu:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function extrairPadroesHistoricos(relatorios) {
  const padroes = {
    publicos_comuns: [],
    atividades_recorrentes: [],
    desafios_recorrentes: [],
    oportunidades_recorrentes: []
  };

  const publicos = {};
  const desafios = [];

  relatorios.forEach(r => {
    if (r.publico_geral_declarado) {
      publicos[`${r.mes_referencia}/${r.ano}`] = r.publico_geral_declarado;
    }
    if (r.avaliacao_desafios) {
      desafios.push(r.avaliacao_desafios);
    }
  });

  padroes.publicos_comuns = Object.entries(publicos)
    .map(([periodo, valor]) => `${periodo}: ${valor} pessoas`)
    .slice(0, 5);

  return padroes;
}

function analisarEvolucao(periodos) {
  const evolucao = {};

  Object.entries(periodos).forEach(([periodo, relats]) => {
    evolucao[periodo] = {
      relatorios: relats.length,
      publico_medio: relats.reduce((sum, r) => sum + (r.publico_geral_declarado || 0), 0) / relats.length
    };
  });

  return evolucao;
}

function identificarTemasTransversais(relatorios) {
  const temas = new Set();

  relatorios.forEach(r => {
    if (r.avaliacao_pontos_positivos) {
      const palavras = r.avaliacao_pontos_positivos
        .toLowerCase()
        .split(/\W+/)
        .filter(p => p.length > 5);
      palavras.slice(0, 3).forEach(p => temas.add(p));
    }
  });

  return Array.from(temas);
}