import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// News is considered stale if published more than 90 days ago OR found more than 20 days ago
const STALE_PUBLICATION_DAYS = 90;
const STALE_FOUND_DAYS = 20;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const nowBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const today = nowBR.toISOString().split('T')[0];

    const stalePubDate = new Date(Date.now() - STALE_PUBLICATION_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const staleFoundDate = new Date(Date.now() - STALE_FOUND_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // 1. Load all active news (non-internal)
    const allNews = await base44.asServiceRole.entities.NewsHighlight.list('-created_date', 500);
    const activeNews = allNews.filter(n => n.ativo && n.fonte !== 'internal');

    // 2. Identify stale news
    const staleNews = activeNews.filter(n => {
      const pubTooOld = n.data_publicacao && n.data_publicacao < stalePubDate;
      const foundTooOld = n.data_encontrada && n.data_encontrada < staleFoundDate;
      return pubTooOld || foundTooOld;
    });

    if (staleNews.length === 0) {
      return Response.json({ success: true, message: 'No stale news found', replaced: 0, date: today });
    }

    // 3. Use AI to double-check which ones are truly stale and confirm deactivation
    const titlesForAI = staleNews.map((n, i) => `${i + 1}. [${n.data_publicacao || 'sem data'}] ${n.titulo}`).join('\n');

    const aiReview = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é curador de conteúdo cultural. Analise esta lista de notícias/artigos e identifique quais estão desatualizados e devem ser removidos do painel.

Hoje é ${today}. As notícias abaixo foram marcadas como potencialmente antigas:

${titlesForAI}

Critérios para remover:
- Data de publicação muito antiga (mais de 90 dias)
- Conteúdo que perdeu relevância (eventos já passados, chamadas abertas encerradas etc.)
- Informações provavelmente desatualizadas

Retorne os índices (1-based) dos itens que devem ser removidos.`,
      response_json_schema: {
        type: 'object',
        properties: {
          indices_remover: { type: 'array', items: { type: 'number' }, description: 'Índices (1-based) dos itens a remover' },
          justificativa: { type: 'string' }
        }
      }
    });

    const indicesToRemove = new Set((aiReview.indices_remover || []).map(i => i - 1));
    // If AI returned nothing, fall back to all stale
    const toDeactivate = staleNews.filter((_, i) =>
      indicesToRemove.size === 0 ? true : indicesToRemove.has(i)
    );

    // 4. Deactivate stale news
    await Promise.all(
      toDeactivate.map(n =>
        base44.asServiceRole.entities.NewsHighlight.update(n.id, { ativo: false })
      )
    );

    const slotsToFill = toDeactivate.length;

    // 5. Fetch fresh replacements using AI + internet
    const freshResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é especialista em comunicação cultural de Belo Horizonte. Hoje é ${today}.

Busque ${slotsToFill + 2} notícias ou artigos recentes (publicados nos últimos 60 dias) sobre:
1. Viaduto das Artes BH / Museus Centro / MUMO / MIS BH / MHAB
2. Museologia, curadoria, patrimônio cultural em Minas Gerais
3. Cinema mineiro, moda mineira, história de Belo Horizonte
4. Eventos culturais recentes em BH

REGRAS:
- Apenas conteúdo com data de publicação após ${new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
- Links reais e verificáveis
- Não repita estes links já existentes: ${allNews.filter(n => n.ativo).map(n => n.link).filter(Boolean).slice(0, 20).join(', ')}

Retorne JSON com as notícias encontradas.`,
      add_context_from_internet: true,
      model: 'gemini_3_pro',
      response_json_schema: {
        type: 'object',
        properties: {
          noticias: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titulo: { type: 'string' },
                resumo: { type: 'string' },
                link: { type: 'string' },
                fonte: { type: 'string', description: 'web_search ou academic' },
                data_publicacao: { type: 'string', description: 'YYYY-MM-DD' },
                tags: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    });

    const existingLinks = new Set(allNews.filter(n => n.ativo).map(n => n.link).filter(Boolean));
    const created = [];

    for (const noticia of (freshResult.noticias || [])) {
      if (created.length >= slotsToFill) break;
      if (!noticia?.link || !noticia.link.startsWith('http') || existingLinks.has(noticia.link)) continue;

      const validTags = ['Museuologia', 'Cinema', 'Moda', 'História de BH', 'Patrimônio Cultural', 'Curadoria', 'Educação'];
      const tags = (noticia.tags || []).filter(t => validTags.includes(t));

      const record = await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: noticia.titulo || 'Sem título',
        resumo: noticia.resumo || '',
        link: noticia.link,
        fonte: noticia.fonte === 'academic' ? 'academic' : 'web_search',
        imagem_url: '',
        data_encontrada: new Date().toISOString(),
        data_publicacao: noticia.data_publicacao || today,
        data_selecao: today,
        ativo: true,
        visualizacoes: 0,
        tags,
      });

      existingLinks.add(noticia.link);
      created.push(record);
    }

    return Response.json({
      success: true,
      date: today,
      stale_found: staleNews.length,
      deactivated: toDeactivate.length,
      replaced: created.length,
      ai_justificativa: aiReview.justificativa,
      new_titles: created.map(n => n.titulo),
    });

  } catch (error) {
    console.error('refreshStaleNews error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});