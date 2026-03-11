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

    // Salvar ou atualizar o resumo (usar uma entity temporária ou cache)
    const now = new Date().toISOString();
    
    // Registrar em log (pode ser expandido para salvar em uma entity específica)
    console.log(`Resumo de mobilização gerado para ${museu_sigla}: ${summary.substring(0, 100)}...`);

    return new Response(JSON.stringify({
      museu_sigla,
      summary,
      opportunities_count: opportunities.length,
      generated_at: now,
      character_count: summary.length,
    }), { status: 200 });
  } catch (error) {
    console.error('Erro em generateMobilizationSummary:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});