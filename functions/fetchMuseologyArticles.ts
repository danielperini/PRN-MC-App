import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MUSEOLOGY_SOURCES = [
  'https://www.patrimoniocultural.gov.pt/publicacoes/revista-museologia-pt-pt/',
  'https://www.relici.org.br/index.php/relici/announcement',
  'https://dasartes.com.br/',
  'https://dobras.emnuvens.com.br/dobras',
  'https://ufjf.repositorio.federado.br/', // Repositório UFJF
  'https://funartemaisdigital.funarte.gov.br/periodico-bd/revista-educacao-artes-e-inclusao/?view_mode=masonry&perpage=12&paged=1&order=ASC&orderby=date&fetch_only=thumbnail%2Ccreation_date%2Ctitle%2Cdescription&fetch_only_meta='
];

const THREE_MONTHS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

    // Use AI to find recent academic articles and sources
    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é especialista em história do cinema, museuologia, moda e história cultural. Busque APENAS fontes e artigos acadêmicos/científicos publicados após ${THREE_MONTHS_AGO} (últimos 3 meses). 

      Prioridades:
      1. CINEMAS DE RUA EM MINAS GERAIS - artigos e pesquisas sobre história dos cinemas de rua, cinema de bairro em MG
      2. Repositórios acadêmicos: UFJF, UFMG, PUC-MG, UNIMONTES
      3. Revistas científicas sobre:
         - Cinema brasileiro e história
         - Patrimônio cultural arquitetônico
         - Memória urbana de Minas Gerais
         - Museologia e curadoria
         - História cultural de Belo Horizonte
      4. Artigos sobre cinemas históricos desativados em cidades mineiras
      5. Pesquisas sobre espaços culturais urbanos
      
      IMPORTANTE:
      - Apenas publicações de ${THREE_MONTHS_AGO} em diante
      - Priorize artigos revisados por pares e acadêmicos
      - Inclua repositórios institucionais de universidades
      
      Formato: Uma URL por linha, apenas a URL sem descrição.
      Liste 10 URLs.`,
      response_json_schema: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'URLs de artigos científicos recentes sobre cinemas de rua MG'
          }
        }
      },
      add_context_from_internet: true,
      model: 'claude_sonnet_4_6'
    });

    // Fetch from AI-discovered links (recent academic articles)
    const aiUrls = aiResponse.urls || [];
    // Adicionar a URL FUNARTE se não estiver já na lista
    const allUrls = [
      'https://funartemaisdigital.funarte.gov.br/periodico-bd/revista-educacao-artes-e-inclusao/?view_mode=masonry&perpage=12&paged=1&order=ASC&orderby=date&fetch_only=thumbnail%2Ccreation_date%2Ctitle%2Cdescription&fetch_only_meta=',
      ...aiUrls
    ];
    const aiArticles = await Promise.all(
      allUrls.slice(0, 10).map(async (url) => {
        try {
          const response = await fetch(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000)
          });
          if (response.ok) {
            const text = await response.text();
            const titleMatch = text.match(/<title>(.*?)<\/title>/i);
            const isAcademic = url.includes('repositorio') || url.includes('ufjf') || url.includes('ufmg') || url.includes('scielo') || url.includes('.edu');
            return {
              titulo: titleMatch ? titleMatch[1] : url,
              resumo: isAcademic 
                ? 'Artigo científico sobre cinemas de rua e história cultural de Minas Gerais' 
                : 'Artigo sobre história do cinema em Minas Gerais',
              link: url,
              fonte: isAcademic ? 'academic' : 'web_search',
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