import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MUSEOLOGY_SOURCES = [
  'https://www.patrimoniocultural.gov.pt/publicacoes/revista-museologia-pt-pt/',
  'https://www.relici.org.br/index.php/relici/announcement',
  'https://dasartes.com.br/',
  'https://dobras.emnuvens.com.br/dobras'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch articles from known sources
    const sourceArticles = await Promise.all(
      MUSEOLOGY_SOURCES.map(async (url) => {
        try {
          const response = await fetch(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000)
          });
          if (response.ok) {
            const text = await response.text();
            // Extract basic info from page content
            const titleMatch = text.match(/<title>(.*?)<\/title>/i);
            return {
              titulo: titleMatch ? titleMatch[1] : url,
              resumo: 'Artigo de museuologia de fonte reconhecida',
              link: url,
              fonte: 'web_search',
              imagem_url: null,
              data_publicacao: new Date().toISOString().split('T')[0]
            };
          }
        } catch {
          return null;
        }
      })
    );

    // Use AI to find additional relevant links
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é especialista em museuologia. Liste 5 URLs de fontes confiáveis sobre museuologia, curadoria, gestão de museus e patrimônio cultural. 
      
      Deve incluir:
      - Revistas acadêmicas sobre museologia
      - Portais de patrimônio cultural
      - Sites de museus reconhecidos
      - Bases de dados de pesquisa
      - Publicações sobre curadoria
      
      Formato: Uma URL por linha, apenas a URL sem descrição.
      Deve ser URLs reais e acessíveis.`,
      response_json_schema: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de URLs sobre museuologia'
          }
        }
      },
      add_context_from_internet: true
    });

    // Fetch from AI-discovered links
    const aiUrls = aiResponse.urls || [];
    const aiArticles = await Promise.all(
      aiUrls.slice(0, 3).map(async (url) => {
        try {
          const response = await fetch(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000)
          });
          if (response.ok) {
            const text = await response.text();
            const titleMatch = text.match(/<title>(.*?)<\/title>/i);
            return {
              titulo: titleMatch ? titleMatch[1] : url,
              resumo: 'Recurso sobre museuologia e patrimônio cultural',
              link: url,
              fonte: 'web_search',
              imagem_url: null,
              data_publicacao: new Date().toISOString().split('T')[0]
            };
          }
        } catch {
          return null;
        }
      })
    );

    // Combine and filter
    const allArticles = [...sourceArticles, ...aiArticles].filter(a => a !== null);

    // Save to database or return directly
    const uniqueArticles = Array.from(
      new Map(allArticles.map(item => [item.link, item])).values()
    );

    return Response.json({ 
      articles: uniqueArticles,
      count: uniqueArticles.length,
      sources: MUSEOLOGY_SOURCES.length + aiUrls.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});