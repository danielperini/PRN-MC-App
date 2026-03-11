import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { museu_sigla } = payload;

    if (!museu_sigla) {
      return new Response(JSON.stringify({ error: 'museu_sigla é obrigatório' }), { status: 400 });
    }

    // Buscar oportunidades ativas do museu
    const opportunities = await base44.asServiceRole.entities.TerritorialOpportunity.filter({
      museu_sigla,
      ativo: true,
    });

    if (opportunities.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhuma oportunidade encontrada' }), { status: 200 });
    }

    // Buscar documentos da base de conhecimento ativos
    const knowledge = await base44.asServiceRole.entities.KnowledgeDocument.filter({
      ativo: true,
    });

    const knowledgeContext = knowledge
      .map(doc => `${doc.titulo}: ${doc.descricao_extraido || doc.descricao}`)
      .join('\n');

    // Preparar dados das oportunidades
    const opportunitiesSummary = opportunities
      .slice(0, 15) // Top 15 para não ficar muito grande
      .map(opp => `- ${opp.nome} (${opp.categoria}): ${opp.publicos_alvo?.join(', ') || 'N/A'} | Aderência: ${opp.nivel_aderencia}%`)
      .join('\n');

    // Buscar grupos sociais e atividades
    const searchPrompt = `Considerando o museu ${museu_sigla}, que trabalha com temas de patrimônio, moda, fotografia e audiovisual, quais são os principais grupos sociais e atividades culturais que podem ser alcançados? Cite atividades de artes, educação, e mobilização cultural.`;

    // Chamar Claude com web search para detectar atividades
    const claudeAnalysis = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um especialista em mobilização cultural e alcance de públicos em museus.

OPORTUNIDADES MAPEADAS:
${opportunitiesSummary}

CONTEXTO DE CONHECIMENTO:
${knowledgeContext}

TAREFA: Analise as oportunidades acima e o contexto da instituição. Gere um resumo conciso em português brasileiro sobre as OPORTUNIDADES DE MOBILIZAÇÃO descobertas, considerando:
1. Públicos prioritários identificados
2. Potencial de parcerias com instituições locais
3. Tipos de atividades que podem gerar impacto
4. Estratégias de alcance para grupos sociais do entorno

Seja objetivo, específico e prático. Máximo 800 caracteres. Foque em ações concretas de mobilização.`,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
    });

    // Limitar a 800 caracteres
    const summary = claudeAnalysis.substring(0, 800);

    // Top 5 oportunidades mais aderentes
    const topOpportunities = opportunities
      .sort((a, b) => (b.nivel_aderencia || 0) - (a.nivel_aderencia || 0))
      .slice(0, 5);

    // Contatos simplificados (sem mais chamadas de IA para cada um)
    const contactsAndPrograms = topOpportunities.map(opp => ({
      nome: opp.nome,
      categoria: opp.categoria,
      aderencia: opp.nivel_aderencia,
      bairro: opp.bairro || 'Barreiro',
      endereco: opp.endereco || 'Não informado'
    }));

    // Sugerir programação com base na análise
    const programSuggestion = await base44.integrations.Core.InvokeLLM({
      prompt: `Como especialista em programação cultural para museus, analise os 5 locais mais aderentes listados abaixo e sugira atividades/programações que podem gerar sinergia com a instituição ${museu_sigla}:

LOCAIS PRINCIPAIS:
${contactsAndPrograms.map(c => `- ${c.nome} (${c.categoria}, aderência: ${c.aderencia}%) em ${c.bairro}`).join('\n')}

CONTEXTO:
${knowledgeContext.substring(0, 300)}

Sugira 3-4 ideias concretas de programação colaborativa e viável. Máximo 400 caracteres.`,
      add_context_from_internet: false,
      model: 'gemini_3_flash',
    });

    const now = new Date().toISOString();

    return new Response(JSON.stringify({
      museu_sigla,
      summary,
      opportunities_count: opportunities.length,
      topContacts: contactsAndPrograms,
      programmingSuggestion: programSuggestion.substring(0, 600),
      generated_at: now,
      character_count: summary.length,
    }), { status: 200 });
  } catch (error) {
    console.error('Erro em generateMobilizationSummary:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});