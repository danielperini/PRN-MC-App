import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function shuffleArray(items) {
  const arr = Array.isArray(items) ? [...items] : [];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function normalizeDate(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return null;
  return d;
}

function getRecencyScore(dateValue) {
  const d = normalizeDate(dateValue);
  if (!d) return 0;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 1) return 100;
  if (diffDays <= 3) return 80;
  if (diffDays <= 7) return 60;
  if (diffDays <= 15) return 40;
  if (diffDays <= 30) return 20;
  return 5;
}

function sortNewsByRecency(newsList) {
  return [...newsList].sort((a, b) => {
    const scoreA = getRecencyScore(a.data_publicacao);
    const scoreB = getRecencyScore(b.data_publicacao);

    if (scoreA !== scoreB) return scoreB - scoreA;

    const dateA = normalizeDate(a.data_publicacao);
    const dateB = normalizeDate(b.data_publicacao);

    if (dateA && dateB) return dateB.getTime() - dateA.getTime();
    if (dateB) return 1;
    if (dateA) return -1;

    return 0;
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const shortTailTerms = [
      'Museu da Moda BH',
      'MUMO Belo Horizonte',
      'Museu da Imagem e do Som BH',
      'MIS BH',
      'Museu Histórico Abílio Barreto',
      'MHAB Belo Horizonte',
      'Viaduto das Artes BH',
      'Museus Centro Belo Horizonte',
      'circuito museus centro BH',
      'projeto museus centro BH'
    ];

    const mediumTailTerms = [
      'programação cultural museus centro belo horizonte',
      'eventos museus centro de belo horizonte',
      'notícias viaduto das artes belo horizonte',
      'agenda viaduto das artes bh',
      'atividades museu da moda belo horizonte',
      'exposição mis belo horizonte',
      'museu histórico abílio barreto programação',
      'circuito cultural museus centro bh',
      'projeto museus centro programação cultural',
      'ações culturais museus centro belo horizonte'
    ];

    const longTailTerms = [
      'notícias recentes sobre o projeto museus centro em belo horizonte',
      'programação cultural recente do viaduto das artes em belo horizonte',
      'eventos e exposições no museu da imagem e do som de belo horizonte',
      'ações educativas do museu histórico abílio barreto em belo horizonte',
      'cobertura de imprensa sobre o museu da moda de belo horizonte',
      'notícias atuais sobre circuito de museus no centro de belo horizonte',
      'atividades culturais gratuitas no viaduto das artes em bh',
      'reportagens sobre exposições nos museus do centro de belo horizonte',
      'novidades do projeto museus centro e viaduto das artes em bh',
      'matérias recentes sobre cultura e museus no centro de belo horizonte'
    ];

    const allSearchTerms = [
      ...shortTailTerms,
      ...mediumTailTerms,
      ...longTailTerms
    ];

    const randomizedTerms = shuffleArray(allSearchTerms);
    const searchGroups = chunkArray(randomizedTerms, 5);

    const existingNews = await base44.entities.NewsHighlight.list('-created_date', 1000);
    const existingLinks = new Set(existingNews.map((n) => n.link).filter(Boolean));

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const maxNewsPerDay = 15;
    let newNewsAdded = 0;

    const collectedNews = [];

    for (const group of searchGroups) {
      if (newNewsAdded >= maxNewsPerDay) break;

      const groupedTermsText = group.map((term) => '- ' + term).join('\n');

      const searchResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Pesquise notícias recentes e relevantes em Belo Horizonte relacionadas aos seguintes termos:
${groupedTermsText}

Regras:
1. Priorize notícias mais atuais.
2. Priorize temas ligados ao Projeto Museus Centro Belo Horizonte e ao Viaduto das Artes.
3. Considere também MUMO, MIS BH e Museu Histórico Abílio Barreto.
4. Retorne no máximo 10 notícias para este grupo.
5. Não invente links.
6. Se não encontrar notícias válidas, retorne lista vazia.
7. Sempre inclua data_publicacao quando conseguir identificar.
8. Priorize publicações jornalísticas, portais culturais, páginas institucionais e cobertura de agenda cultural.

Retorne apenas JSON no formato solicitado.`,
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
                  imagem_url: { type: 'string' },
                  data_publicacao: { type: 'string' },
                  palavra_chave_encontrada: { type: 'string' }
                }
              }
            }
          }
        }
      });

      if (searchResult && Array.isArray(searchResult.noticias)) {
        for (const news of searchResult.noticias) {
          if (!news || !news.link) continue;
          if (existingLinks.has(news.link)) continue;

          collectedNews.push({
            titulo: news.titulo || 'Notícia sem título',
            resumo: news.resumo || '',
            link: news.link,
            imagem_url: news.imagem_url || '',
            data_publicacao: news.data_publicacao || '',
            palavra_chave_encontrada: news.palavra_chave_encontrada || '',
            fonte: 'web_search',
            data_encontrada: new Date().toISOString(),
            ativo: true
          });
        }
      }
    }

    const uniqueCollectedNews = [];
    const seenLinks = new Set();

    for (const news of collectedNews) {
      if (!news.link) continue;
      if (seenLinks.has(news.link)) continue;
      seenLinks.add(news.link);
      uniqueCollectedNews.push(news);
    }

    const prioritizedNews = sortNewsByRecency(uniqueCollectedNews);

    for (const news of prioritizedNews) {
      if (newNewsAdded >= maxNewsPerDay) break;

      await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: news.titulo,
        resumo: news.resumo,
        link: news.link,
        fonte: news.fonte,
        imagem_url: news.imagem_url,
        data_encontrada: news.data_encontrada,
        ativo: news.ativo,
        data_publicacao: news.data_publicacao || null,
        palavra_chave_encontrada: news.palavra_chave_encontrada || ''
      });

      existingLinks.add(news.link);
      newNewsAdded++;
    }

    const updatedNews = await base44.entities.NewsHighlight.list('-created_date', 1000);

    const oldNews = updatedNews.filter((n) => {
      if (n.fonte !== 'web_search') return false;
      if (!n.data_encontrada) return false;
      return new Date(n.data_encontrada) < oneWeekAgo;
    });

    for (const news of oldNews) {
      await base44.asServiceRole.entities.NewsHighlight.update(news.id, {
        ativo: false
      });
    }

    return Response.json({
      success: true,
      message: 'Busca concluída com priorização por atualidade.',
      total_keywords: allSearchTerms.length,
      grupos_processados: searchGroups.length,
      noticias_coletadas: uniqueCollectedNews.length,
      noticias_publicadas: newNewsAdded,
      old_news_deactivated: oldNews.length
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error && error.message ? error.message : String(error)
      },
      { status: 500 }
    );
  }
});