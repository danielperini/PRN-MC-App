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

function sortNewsByRecency(newsList) {
  return [...newsList].sort((a, b) => {
    const da = normalizeDate(a.data_publicacao);
    const db = normalizeDate(b.data_publicacao);

    if (da && db) return db.getTime() - da.getTime();
    if (db) return 1;
    if (da) return -1;
    return 0;
  });
}

function dedupeByLink(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item || !item.link) continue;
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    result.push(item);
  }

  return result;
}

async function fetchPortalMuseusCentro(base44) {
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Acesse e analise prioritariamente esta página:
https://portalbelohorizonte.com.br/museuscentro/2025/noticias

Objetivo:
- identificar a notícia MAIS RECENTE publicada nessa página
- retornar apenas 1 notícia
- priorizar a notícia mais atual visível
- não inventar link nem data

Retorne JSON no formato:
{
  "noticias": [
    {
      "titulo": "...",
      "resumo": "...",
      "link": "...",
      "imagem_url": "...",
      "data_publicacao": "...",
      "fonte_prioritaria": "portal_museus_centro"
    }
  ]
}`,
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
              fonte_prioritaria: { type: 'string' }
            }
          }
        }
      }
    }
  });

  return result && Array.isArray(result.noticias) ? result.noticias : [];
}

async function fetchCulturadoriaMuseus(base44) {
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Acesse e analise prioritariamente estas páginas:
https://culturadoria.com.br/
https://culturadoria.com.br/?s=MUSEUS

Objetivo:
- identificar a notícia MAIS RECENTE relacionada à busca por MUSEUS
- retornar apenas 1 notícia
- priorizar a notícia mais atual visível
- não inventar link nem data

Retorne JSON no formato:
{
  "noticias": [
    {
      "titulo": "...",
      "resumo": "...",
      "link": "...",
      "imagem_url": "...",
      "data_publicacao": "...",
      "fonte_prioritaria": "culturadoria_museus"
    }
  ]
}`,
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
              fonte_prioritaria: { type: 'string' }
            }
          }
        }
      }
    }
  });

  return result && Array.isArray(result.noticias) ? result.noticias : [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Termos prioritários — Viaduto das Artes e Projeto Museus Centro têm peso dobrado
    const priorityTerms = [
      'Viaduto das Artes BH',
      'Viaduto das Artes Belo Horizonte',
      'Projeto Museus Centro BH',
      'Projeto Museus Centro Belo Horizonte',
      'notícias viaduto das artes belo horizonte',
      'agenda viaduto das artes bh',
      'programação viaduto das artes 2026',
      'novidades viaduto das artes belo horizonte',
      'eventos projeto museus centro belo horizonte',
      'programação projeto museus centro 2026',
      'Quebradas de BH MIS Belo Horizonte',
      'Projeção Quebradas de BH quintal MIS',
    ];

    const shortTailTerms = [
      'Museu da Moda BH',
      'MUMO Belo Horizonte',
      'Museu da Imagem e do Som BH',
      'MIS BH',
      'Museu Histórico Abílio Barreto',
      'MHAB Belo Horizonte',
      'Museus Centro Belo Horizonte',
      'circuito museus centro BH',
    ];

    const mediumTailTerms = [
      'programação cultural museus centro belo horizonte',
      'eventos museus centro de belo horizonte',
      'atividades museu da moda belo horizonte',
      'exposição mis belo horizonte',
      'museu histórico abílio barreto programação',
      'circuito cultural museus centro bh',
    ];

    const longTailTerms = [
      'notícias recentes sobre o projeto museus centro em belo horizonte',
      'programação cultural recente do viaduto das artes em belo horizonte',
      'eventos e exposições no museu da imagem e do som de belo horizonte',
      'ações educativas do museu histórico abílio barreto em belo horizonte',
      'novidades do projeto museus centro e viaduto das artes em bh',
    ];

    const allSearchTerms = [
      ...priorityTerms,
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

    const priorityNews = [];
    const collectedKeywordNews = [];

    // 1) Portal oficial Museus Centro: sempre pegar a mais recente
    const portalNews = await fetchPortalMuseusCentro(base44);
    for (const news of portalNews) {
      if (!news || !news.link) continue;
      if (existingLinks.has(news.link)) continue;

      priorityNews.push({
        titulo: news.titulo || 'Notícia sem título',
        resumo: news.resumo || '',
        link: news.link,
        imagem_url: news.imagem_url || '',
        data_publicacao: news.data_publicacao || '',
        fonte: 'portal_museus_centro',
        data_encontrada: new Date().toISOString(),
        ativo: false  // pendente de revisão pelo curador
      });
    }

    // 2) Culturadoria: sempre pegar a mais recente da busca MUSEUS
    const culturadoriaNews = await fetchCulturadoriaMuseus(base44);
    for (const news of culturadoriaNews) {
      if (!news || !news.link) continue;
      if (existingLinks.has(news.link)) continue;

      priorityNews.push({
        titulo: news.titulo || 'Notícia sem título',
        resumo: news.resumo || '',
        link: news.link,
        imagem_url: news.imagem_url || '',
        data_publicacao: news.data_publicacao || '',
        fonte: 'culturadoria_museus',
        data_encontrada: new Date().toISOString(),
        ativo: false  // pendente de revisão pelo curador
      });
    }

    // 3) Depois pesquisar por palavras-chave, 5 por vez, randomizadas
    for (const group of searchGroups) {
      if (newNewsAdded >= maxNewsPerDay) break;

      const groupedTermsText = group.map((term) => '- ' + term).join('\n');

      const searchResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Pesquise notícias recentes e relevantes em Belo Horizonte relacionadas aos seguintes termos:
${groupedTermsText}

Regras:
1. Priorize SEMPRE notícias sobre "Viaduto das Artes" e "Projeto Museus Centro Belo Horizonte".
2. Em segundo lugar, considere MUMO, MIS BH e Museu Histórico Abílio Barreto.
3. DESCARTE notícias genéricas de museus no Brasil que não mencionem especificamente esses locais.
4. Priorize fontes: portalbelohorizonte.com.br/museuscentro, culturadoria.com.br, agendabh.com.br e imprensa local de BH.
5. Retorne no máximo 8 notícias para este grupo.
6. Não invente links. Se não encontrar link real, omita a notícia.
7. Sempre inclua data_publicacao quando conseguir identificar.
8. Descarte notícias com mais de 60 dias se houver opções mais recentes disponíveis.

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

          collectedKeywordNews.push({
            titulo: news.titulo || 'Notícia sem título',
            resumo: news.resumo || '',
            link: news.link,
            imagem_url: news.imagem_url || '',
            data_publicacao: news.data_publicacao || '',
            palavra_chave_encontrada: news.palavra_chave_encontrada || '',
            fonte: 'web_search',
            data_encontrada: new Date().toISOString(),
            ativo: false  // pendente de revisão pelo curador
          });
        }
      }
    }

    const uniquePriorityNews = dedupeByLink(priorityNews);
    const uniqueKeywordNews = dedupeByLink(collectedKeywordNews);
    const prioritizedKeywordNews = sortNewsByRecency(uniqueKeywordNews);

    // 4) Classificar notícias por museu usando IA
    const classifyNewsByMuseum = async (newsItems) => {
      if (newsItems.length === 0) return [];

      const prompt = `Classifique cada notícia abaixo indicando qual museu ela está relacionada:
      - "museu_centro" se for sobre Viaduto das Artes, Projeto Museus Centro, MUMO, MIS BH, ou MHAB
      - "museu_pbh" se for sobre Museu da PBH ou outros museus de Belo Horizonte
      - null se não for específico de nenhum museu

      Notícias:
      ${newsItems.map((n, i) => `${i+1}. Título: "${n.titulo}"\nResumo: "${n.resumo}"`).join('\n\n')}

      Responda com JSON: {"classificacoes": [{"indice": 1, "museu": "museu_centro"}, ...]}`;

      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              classificacoes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    indice: { type: 'number' },
                    museu: { type: 'string' }
                  }
                }
              }
            }
          }
        });

        return result?.classificacoes || [];
      } catch (e) {
        console.error('Erro ao classificar:', e);
        return [];
      }
    };

    // Classificar notícias prioritárias
    const priorityClassifications = await classifyNewsByMuseum(uniquePriorityNews);
    const classificationMap = {};
    priorityClassifications.forEach(c => {
      if (c.indice > 0 && c.indice <= uniquePriorityNews.length) {
        classificationMap[uniquePriorityNews[c.indice - 1].link] = c.museu;
      }
    });

    // 5) Publicar SEMPRE primeiro as duas fontes prioritárias
    for (const news of uniquePriorityNews) {
      if (newNewsAdded >= maxNewsPerDay) break;

      const museuClassificacao = classificationMap[news.link];

      await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: news.titulo,
        resumo: news.resumo,
        link: news.link,
        fonte: news.fonte,
        imagem_url: news.imagem_url,
        data_encontrada: news.data_encontrada,
        ativo: news.ativo,
        museu_classificacao: museuClassificacao || null
      });

      existingLinks.add(news.link);
      newNewsAdded++;
    }

    // 6) Depois completar com as notícias mais atuais das palavras-chave
    const keywordClassifications = await classifyNewsByMuseum(prioritizedKeywordNews);
    const keywordClassificationMap = {};
    keywordClassifications.forEach(c => {
      if (c.indice > 0 && c.indice <= prioritizedKeywordNews.length) {
        keywordClassificationMap[prioritizedKeywordNews[c.indice - 1].link] = c.museu;
      }
    });

    for (const news of prioritizedKeywordNews) {
      if (newNewsAdded >= maxNewsPerDay) break;
      if (existingLinks.has(news.link)) continue;

      const museuClassificacao = keywordClassificationMap[news.link];

      await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: news.titulo,
        resumo: news.resumo,
        link: news.link,
        fonte: news.fonte,
        imagem_url: news.imagem_url,
        data_encontrada: news.data_encontrada,
        ativo: news.ativo,
        museu_classificacao: museuClassificacao || null
      });

      existingLinks.add(news.link);
      newNewsAdded++;
    }

    const updatedNews = await base44.entities.NewsHighlight.list('-created_date', 1000);

    const oldNews = updatedNews.filter((n) => {
      if (n.fonte !== 'web_search' && n.fonte !== 'portal_museus_centro' && n.fonte !== 'culturadoria_museus') return false;
      if (!n.data_encontrada) return false;
      return new Date(n.data_encontrada) < oneWeekAgo;
    });

    // 7) Deactivate news older than 7 days for memory management
    let deactivatedCount = 0;
    for (const news of oldNews) {
      if (deactivatedCount >= 5) break;
      await base44.asServiceRole.entities.NewsHighlight.update(news.id, {
        ativo: false
      });
      deactivatedCount++;
    }



    const latestNews = await base44.asServiceRole.entities.NewsHighlight.list('-created_date', 10);

    return Response.json({
      success: true,
      message: 'Busca concluída com prioridade para Portal Museus Centro e Culturadoria.',
      total_keywords: allSearchTerms.length,
      grupos_processados: searchGroups.length,
      noticias_prioritarias_coletadas: uniquePriorityNews.length,
      noticias_keywords_coletadas: uniqueKeywordNews.length,
      noticias_publicadas: newNewsAdded,
      old_news_deactivated: oldNews.length,
      ultimas_noticias: latestNews.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        link: n.link,
        fonte: n.fonte,
        ativo: n.ativo,
        data_encontrada: n.data_encontrada,
        created_date: n.created_date
      }))
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