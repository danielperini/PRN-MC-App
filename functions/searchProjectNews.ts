import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const PROJECT_THEMES = [
  'museus e cultura',
  'arte e patrimônio cultural',
  'educação cultural',
  'programação cultural',
  'Belo Horizonte museus',
  'exposições de arte',
  'eventos culturais Brasil',
  'arqueologia e história',
  'museus de ciência',
  'turismo cultural'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Selecionar tema aleatório
    const theme = PROJECT_THEMES[Math.floor(Math.random() * PROJECT_THEMES.length)];
    
    // Buscar notícias com IA
    const searchResult = await base44.integrations.Core.InvokeLLM({
      prompt: `Busque 3 notícias recentes sobre "${theme}". Para cada notícia, forneça:
      1. Título
      2. Resumo em 2-3 linhas
      3. URL da fonte (se encontrar)
      4. Data de publicação aproximada
      
      Responda em JSON com array de objetos contendo: titulo, resumo, link, data_publicacao`,
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
                data_publicacao: { type: 'string' }
              }
            }
          }
        }
      },
      model: 'gemini_3_flash'
    });
    
    const noticias = searchResult.noticias || [];
    
    // Salvar notícias no banco
    if (noticias.length > 0) {
      const newsData = noticias.map(n => ({
        titulo: n.titulo,
        resumo: n.resumo,
        link: n.link || '',
        fonte: 'web_search',
        tipo_conteudo: 'noticia',
        data_encontrada: new Date().toISOString(),
        data_publicacao: n.data_publicacao,
        ativo: true,
        visualizacoes: 0
      }));
      
      await base44.asServiceRole.entities.NewsHighlight.bulkCreate(newsData);
    }
    
    return Response.json({
      success: true,
      theme,
      noticiasEncontradas: noticias.length
    });
  } catch (error) {
    console.error('Erro ao buscar notícias:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});