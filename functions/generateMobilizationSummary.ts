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

Seja objetivo, específico e instigante. Máximo 800 caracteres. NÃO inclua "Ação prática:" ou sugestões de ações executáveis. Foque apenas na análise das oportunidades.`,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
    });

    // Limitar a 800 caracteres e remover "Ação prática:"
    let summary = claudeAnalysis.substring(0, 800);
    // Remove "Ação prática:" e suas variações
    summary = summary.replace(/\*?\*?Ação prática:\*?\*?\s*/gi, '')
                     .replace(/^[\s-]*/, '')
                     .trim();

    // Top 10 oportunidades com aderência >= 80%
    const topOpportunities = opportunities
      .filter(opp => (opp.nivel_aderencia || 0) >= 80)
      .sort((a, b) => (b.nivel_aderencia || 0) - (a.nivel_aderencia || 0))
      .slice(0, 10);

    // Contatos simplificados (sem mais chamadas de IA para cada um)
    const contactsAndPrograms = topOpportunities.map(opp => ({
      nome: opp.nome,
      categoria: opp.categoria,
      aderencia: opp.nivel_aderencia,
      bairro: opp.bairro || 'Barreiro',
      endereco: opp.endereco || 'Não informado'
    }));

    // Buscar notícias de eventos e datas comemorativas do mês
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    const monthlyEventsPrompt = `Quais são os principais eventos, datas comemorativas e campanhas do mês de ${currentDate.toLocaleDateString('pt-BR', { month: 'long' })} de ${currentYear} no Brasil? Include: Dia das Crianças, Dia das Mulheres, Dia do Meio Ambiente, semanas temáticas, eventos culturais, etc.`;
    
    const eventsContext = await base44.integrations.Core.InvokeLLM({
      prompt: monthlyEventsPrompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
    });

    // Sugerir programação dinâmica com análise de Claude
    const programSuggestion = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um curador de programação cultural especializado em museus de patrimônio, moda, fotografia e audiovisual.

MÊS ATUAL: ${currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}

EVENTOS E DATAS COMEMORATIVAS DO MÊS:
${eventsContext}

PARCEIROS/LOCAIS ESTRATÉGICOS (≥80% aderência):
${contactsAndPrograms.map(c => `- ${c.nome} (${c.categoria}) em ${c.bairro}`).join('\n')}

TAREFA: Gere um texto em prosa coeso e envolvente (400-600 caracteres) com SUGESTÕES DE PROGRAMAÇÃO COLABORATIVA que explore:
1. As datas comemorativas do mês (ex: Dia das Mulheres = palestras sobre mulheres na moda/fotografia)
2. Parcerias com casas de apoio, escolas e instituições listadas
3. Atividades de alcance cultural e educativo específicas para cada tipo de local
4. Estratégias de mobilização adequadas a cada público

Escreva em tom informativo e inspirador, com ideias práticas e exequíveis.`,
      add_context_from_internet: false,
      model: 'claude_sonnet_4_6',
    });

    const now = currentDate.toISOString();

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