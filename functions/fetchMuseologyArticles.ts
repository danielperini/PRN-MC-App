import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const CUTOFF_DATE = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
const CUTOFF_STR = CUTOFF_DATE.toISOString().split('T')[0];

const STATIC_SOURCES = [
  'https://dasartes.com.br/',
  'https://dobras.emnuvens.com.br/dobras',
  'https://funartemaisdigital.funarte.gov.br/periodico-bd/',
  'https://www.relici.org.br/index.php/relici/issue/current',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Step 1: Use AI with internet to find recent article URLs (last 90 days)
    const discoveryResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um especialista em pesquisa acadêmica e cultural. Busque artigos e publicações recentes publicados APÓS ${CUTOFF_STR} (últimos 90 dias) sobre os seguintes temas:

1. Museologia, curadoria, gestão de museus (especialmente Belo Horizonte / Minas Gerais)
2. Cinema brasileiro, cinemas de rua, cinematecas, história do cinema em MG
3. Moda, design de moda, história da indumentária no Brasil
4. História e patrimônio cultural de Belo Horizonte e Minas Gerais
5. Educação patrimonial e cultural

Fontes prioritárias:
- Revistas acadêmicas brasileiras (Scielo, CAPES, BDTD)
- Repositórios: UFMG, UFJF, PUC-MG
- Portais culturais: Funarte, IBRAM, Iphan
- Portais de cultura e arte: dasartes.com.br, select.art.br, artebrasileiros.com.br

REGRAS OBRIGATÓRIAS:
- Apenas artigos com data de publicação APÓS ${CUTOFF_STR}
- Prefira artigos com URL direta ao conteúdo
- Mínimo 12 URLs, máximo 20
- NÃO inclua URLs de buscadores, apenas páginas de artigos

Retorne apenas as URLs.`,
      add_context_from_internet: true,
      model: 'gemini_3_pro',
      response_json_schema: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: { type: 'string' },
          }
        }
      }
    });

    const discoveredUrls = discoveryResponse.urls || [];

    // Step 2: Fetch and read each URL, extract content for AI analysis
    const allUrls = [...new Set([...STATIC_SOURCES, ...discoveredUrls])].slice(0, 20);

    const articlesWithContent = await Promise.all(
      allUrls.map(async (url) => {
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(6000)
          });
          if (!res.ok) return null;
          const html = await res.text();

          // Extract readable text (strip HTML tags, keep meaningful content)
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000); // Limit to 3000 chars for AI

          return { url, text };
        } catch {
          return null;
        }
      })
    );

    const validPages = articlesWithContent.filter(Boolean);

    // Step 3: Use AI to analyze each page content and extract structured data
    const analyzedArticles = await Promise.all(
      validPages.map(async ({ url, text }) => {
        try {
          const analysis = await base44.integrations.Core.InvokeLLM({
            prompt: `Analise o conteúdo desta página e extraia as informações do artigo/publicação mais relevante encontrada.

URL: ${url}
Conteúdo da página: ${text}

Data de corte: ${CUTOFF_STR} — DESCARTE artigos com data de publicação anterior a esta data.

Categorias possíveis: Museuologia, Cinema, Moda, História de BH, Patrimônio Cultural, Curadoria, Educação

Instruções:
- Se não houver artigo relevante ou a data for anterior a ${CUTOFF_STR}, retorne is_valid: false
- Se o conteúdo for irrelevante para os temas culturais/acadêmicos, retorne is_valid: false
- Extraia o título real do artigo (não o título do site)
- Escreva um resumo claro e informativo em português (2-3 frases)
- Identifique a data de publicação se houver no conteúdo
- Classifique até 3 tags relevantes da lista de categorias`,
            response_json_schema: {
              type: 'object',
              properties: {
                is_valid: { type: 'boolean', description: 'true se o artigo for recente e relevante' },
                titulo: { type: 'string', description: 'Título real do artigo' },
                resumo: { type: 'string', description: 'Resumo em 2-3 frases em português' },
                data_publicacao: { type: 'string', description: 'Data no formato YYYY-MM-DD, ou null se não identificada' },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Até 3 categorias da lista disponível'
                }
              }
            }
          });

          if (!analysis.is_valid) return null;
          if (!analysis.titulo || !analysis.resumo) return null;

          // Double-check date if extracted
          if (analysis.data_publicacao) {
            const pubDate = new Date(analysis.data_publicacao);
            if (!isNaN(pubDate.getTime()) && pubDate < CUTOFF_DATE) return null;
          }

          return {
            titulo: analysis.titulo,
            resumo: analysis.resumo,
            link: url,
            fonte: 'academic',
            imagem_url: null,
            data_publicacao: analysis.data_publicacao || new Date().toISOString().split('T')[0],
            tags: (analysis.tags || []).filter(t =>
              ['Museuologia', 'Cinema', 'Moda', 'História de BH', 'Patrimônio Cultural', 'Curadoria', 'Educação'].includes(t)
            ),
            ativo: true,
          };
        } catch {
          return null;
        }
      })
    );

    const articles = analyzedArticles.filter(Boolean);

    // Deduplicate by link
    const unique = Array.from(new Map(articles.map(a => [a.link, a])).values());

    // Sort by most recent first
    unique.sort((a, b) => new Date(b.data_publicacao) - new Date(a.data_publicacao));

    return Response.json({
      articles: unique,
      count: unique.length,
      cutoff: CUTOFF_STR,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});