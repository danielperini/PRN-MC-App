import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchTerms = [
      'Viaduto das Artes',
      'Museu da Moda MUMO',
      'Museu da Imagem e do Som BH',
      'Museu Histórico Abílio Barreto',
      'Museus Centro Belo Horizonte',
      'Projeto Museus Centro',
      'Circuito de Museus do Centro de BH'
    ];

    const existingNews = await base44.entities.NewsHighlight.list('-created_date', 1000);
    const existingLinks = new Set(existingNews.map(n => n.link));
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let newNewsAdded = 0;

    for (const term of searchTerms) {
      const searchResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Busque notícias recentes sobre "${term}" em Belo Horizonte. 
        Retorne um array JSON com no máximo 3 notícias, cada uma com: 
        { "titulo": "...", "resumo": "...", "link": "...", "imagem_url": "..." }
        Se não encontrar notícias válidas, retorne um array vazio.
        Apenas retorne o JSON, sem explicações.`,
        add_context_from_internet: true,
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
                  imagem_url: { type: 'string' }
                }
              }
            }
          }
        }
      });

      if (searchResult.noticias && Array.isArray(searchResult.noticias)) {
        for (const news of searchResult.noticias) {
          if (news.link && !existingLinks.has(news.link)) {
            await base44.asServiceRole.entities.NewsHighlight.create({
              titulo: news.titulo || 'Notícia sem título',
              resumo: news.resumo || '',
              link: news.link,
              fonte: 'web_search',
              imagem_url: news.imagem_url || '',
              data_encontrada: new Date().toISOString(),
              ativo: true
            });
            existingLinks.add(news.link);
            newNewsAdded++;
          }
        }
      }
    }

    // Desativar notícias antigas (mais de 1 semana)
    const oldNews = existingNews.filter(n => 
      n.fonte === 'web_search' && 
      new Date(n.data_encontrada) < oneWeekAgo
    );
    
    for (const news of oldNews) {
      await base44.asServiceRole.entities.NewsHighlight.update(news.id, { ativo: false });
    }

    return Response.json({
      success: true,
      message: `Busca concluída. ${newNewsAdded} notícias novas adicionadas.`,
      old_news_deactivated: oldNews.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});