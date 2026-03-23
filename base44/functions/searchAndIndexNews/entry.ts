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
    model: 'gemini_3_flash',
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
    model: 'gemini_3_flash',
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
      'Cultura Belo Horizonte',
      'História de Belo Horizonte',
      'Cinema mineiro Belo Horizonte',
      'Moda em Belo Horizonte',
    ];

    const shortTailTerms = [
      'Museu da Moda BH',
      'MUMO Belo Horizonte',
      'MUMO Museu da Moda',
      'Museu da Imagem e do Som BH',
      'MIS BH',
      'MIS cinema audiovisual',
      'Museu Histórico Abílio Barreto',
      'MHAB Belo Horizonte',
      'MHAB história BH',
      'Museus Centro Belo Horizonte',
      'circuito museus centro BH',
      'Viaduto das Artes cultural',
      'Patrimônio cultural Belo Horizonte',
      'História BH colonial e contemporânea',
      'Cinema de Minas Gerais',
      'Moda mineira história',
    ];

    const mediumTailTerms = [
      'programação cultural museus centro belo horizonte',
      'eventos museus centro de belo horizonte',
      'atividades museu da moda belo horizonte',
      'exposição mis belo horizonte cinema',
      'museu histórico abílio barreto programação história',
      'circuito cultural museus centro bh',
      'história de belo horizonte século xx',
      'moda mineira acervo têxtil',
      'cinema mineiro documentário',
      'cultura bh viaduto das artes programação',
      'acervo audiovisual mis belo horizonte',
      'patrimônio histórico abílio barreto',
    ];

    const longTailTerms = [
      'notícias recentes sobre o projeto museus centro em belo horizonte',
      'programação cultural recente do viaduto das artes em belo horizonte',
      'eventos e exposições no museu da imagem e do som de belo horizonte',
      'ações educativas do museu histórico abílio barreto em belo horizonte',
      'novidades do projeto museus centro e viaduto das artes em bh',
      'história cultural de belo horizonte e região metropolitana',
      'cinema mineiro produção audiovisual minas gerais',
      'moda contemporânea mineira designers belo horizonte',
      'patrimônio imaterial belo horizonte tradições culturais',
      'exposições temporárias museus belo horizonte',
      'acervo histórico belo horizonte planejamento urbano',
      'documentários sobre história de minas gerais',
      'programação educativa museus belo horizonte',
      'produção têxtil moda mineira história',
      'cinema experimental mineiro videoarte belo horizonte',
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
        tipo_conteudo: 'noticia',
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
        tipo_conteudo: 'noticia',
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
        model: 'gemini_3_flash',
        prompt: `Pesquise notícias recentes e relevantes em Belo Horizonte relacionadas aos seguintes termos:
      ${groupedTermsText}

      FOCO ESPECÍFICO:
      - CULTURA em Belo Horizonte (exposições, eventos, programação)
      - HISTÓRIA de Belo Horizonte (patrimônio, arquitetura, personagens históricos)
      - CINEMA MINEIRO (produção audiovisual, cineastas, documentários)
      - MODA em Belo Horizonte e Minas Gerais (designers, acervo têxtil, moda contemporânea)
      - Viaduto das Artes, MUMO, MIS BH, MHAB

      Priorização:
      1. MÁXIMA: Viaduto das Artes + Projeto Museus Centro
      2. ALTA: MUMO (Moda), MIS (Cinema/Audiovisual), MHAB (História)
      3. ALTA: Histórias culturais de BH, cinema mineiro, moda mineira
      4. DESCARTE: Notícias genéricas que não mencionem especificamente esses temas

      Regras:
      - Priorize fontes: portalbelohorizonte.com.br/museuscentro, culturadoria.com.br, agendabh.com.br, imprensa local BH
      - Retorne máximo 8 notícias
      - Não invente links (omita se não encontrar URL real)
      - Sempre inclua data_publicacao
      - Descarte notícias com +60 dias se houver opções recentes

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
            tipo_conteudo: 'noticia',
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
          model: 'automatic',
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

    // Função para calcular score de pertinência de uma notícia
    const calcScore = (news) => {
      let score = 50;
      const text = `${news.titulo} ${news.resumo}`.toLowerCase();
      if (/viaduto das artes|museus centro|mumo|mis bh|mhab|abílio barreto/.test(text)) score += 20;
      if (/belo horizonte|bh|minas gerais/.test(text)) score += 15;
      if (/museu|patrimônio|memória|acervo/.test(text)) score += 10;
      if (/cinema|audiovisual|fotografia|documentário/.test(text)) score += 10;
      if (/moda|têxtil|design/.test(text)) score += 10;
      if (/história|histórico/.test(text)) score += 5;
      return Math.min(score, 100);
    };

    // Função para decidir status e ativo baseado no score
    const getPublicationStatus = (score) => {
      if (score >= 80) return { status_curadoria: 'PUBLICADO_AUTO', ativo: true };
      if (score >= 50) return { status_curadoria: 'PENDENTE', ativo: false };
      return null; // descartar
    };

    // 5) Publicar SEMPRE primeiro as duas fontes prioritárias
    for (const news of uniquePriorityNews) {
      if (newNewsAdded >= maxNewsPerDay) break;

      const museuClassificacao = classificationMap[news.link];
      const score = calcScore(news);
      const pubStatus = getPublicationStatus(score);
      if (!pubStatus) continue; // score < 50, descarta

      await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: news.titulo,
        resumo: news.resumo,
        link: news.link,
        tipo_conteudo: 'NOTICIA',
        fonte: news.fonte,
        imagem_url: news.imagem_url,
        data_publicacao: news.data_publicacao || '',
        data_encontrada: news.data_encontrada,
        ativo: pubStatus.ativo,
        status_curadoria: pubStatus.status_curadoria,
        score_pertinencia: score,
        publicado_por_ia: pubStatus.ativo,
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
      const score = calcScore(news);
      const pubStatus = getPublicationStatus(score);
      if (!pubStatus) continue; // score < 50, descarta

      await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: news.titulo,
        resumo: news.resumo,
        link: news.link,
        tipo_conteudo: 'NOTICIA',
        fonte: news.fonte,
        imagem_url: news.imagem_url,
        data_publicacao: news.data_publicacao || '',
        data_encontrada: news.data_encontrada,
        ativo: pubStatus.ativo,
        status_curadoria: pubStatus.status_curadoria,
        score_pertinencia: score,
        publicado_por_ia: pubStatus.ativo,
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