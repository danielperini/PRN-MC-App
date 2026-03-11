import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Use Brazil date (UTC-3)
    const nowBR = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const today = nowBR.toISOString().split('T')[0];
    const month = nowBR.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
    const year = nowBR.getFullYear();

    // 1. Load all active news with museu classification
    const allNews = await base44.asServiceRole.entities.NewsHighlight.list('-created_date', 500);
    const activeNews = allNews.filter(n => n.ativo);

    // Load open/future activities from reports
    const allActivities = await base44.asServiceRole.entities.Activity.list('-created_date', 1000);
    const futureActivities = allActivities.filter(a => {
      if (!a.data_realizacao) return false;
      return a.data_realizacao >= today;
    });

    // 2. Check if today's 15 are already selected (5 notícias + 5 históricos + 5 artigos)
    const todaySelected = activeNews.filter(n => n.data_selecao === today);
    if (todaySelected.length >= 15) {
      return Response.json({
        already_done: true,
        date: today,
        count: todaySelected.length,
        noticias: todaySelected.filter(n => n.fonte === 'web_search').slice(0, 5).map(n => ({ id: n.id, titulo: n.titulo })),
        historicos: todaySelected.filter(n => n.fonte === 'internal').slice(0, 5).map(n => ({ id: n.id, titulo: n.titulo })),
        artigos: todaySelected.filter(n => n.fonte === 'artigos_revistas').slice(0, 5).map(n => ({ id: n.id, titulo: n.titulo }))
      });
    }

    // 3. Find candidates (not shown in last 4 days — avoids repeating)
    // Prioritize news about Museus Centro when there are future activities
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const candidates = activeNews.filter(n => !n.data_selecao || n.data_selecao < fourDaysAgo);

    // If there are future activities, prioritize museu_centro news
    let prioritized = [...candidates];
    if (futureActivities.length > 0) {
      const museuCentroNews = candidates.filter(n => n.museu_classificacao === 'museu_centro');
      const otherNews = candidates.filter(n => n.museu_classificacao !== 'museu_centro');
      prioritized = [...museuCentroNews, ...otherNews];
    }

    let selectedNoticias = [];
    let selectedHistoricos = [];
    let selectedArtigos = [];

    // === PARTE 1: 5 NOTÍCIAS WEB ===
    if (prioritized.length >= 5) {
      // Enough candidates — pick 5, respecting priority for museu_centro when active
      if (futureActivities.length > 0) {
        const museuCentroNews = prioritized.filter(n => n.museu_classificacao === 'museu_centro').slice(0, 3);
        const otherNews = shuffleArray(prioritized.filter(n => n.museu_classificacao !== 'museu_centro')).slice(0, 2);
        selectedNoticias = [...museuCentroNews, ...otherNews];
      } else {
        selectedNoticias = shuffleArray(prioritized).slice(0, 5);
      }
    } else {
      selectedNoticias = [...prioritized];

      const aiResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Hoje é ${today} (${month} de ${year}). Você é especialista em CULTURA, HISTÓRIA, CINEMA MINEIRO e MODA de Belo Horizonte.
    Sugira 8 termos de busca VARIADOS e CRIATIVOS em português brasileiro para encontrar notícias sobre:
    - CULTURA: Viaduto das Artes BH, Projeto Museus Centro, eventos culturais, programação
    - HISTÓRIA de Belo Horizonte: patrimônio, arquitetura, acervo histórico, personagens
    - CINEMA MINEIRO: produção audiovisual, cineastas, documentários, festival
    - MODA em BH: designers mineiros, acervo têxtil, moda contemporânea, história da moda
    - MUSEUS: MUMO (moda), MIS BH (cinema/audiovisual), MHAB (história)

    Seja diverso: ângulos históricos, educativos, acervos, novas aquisições, parcerias, cineastas mineiros, designers, pesquisadores.

    Responda apenas com JSON: {"termos": ["termo1","termo2","termo3","termo4","termo5","termo6","termo7","termo8"]}`,
        response_json_schema: {
          type: 'object',
          properties: { termos: { type: 'array', items: { type: 'string' } } }
        }
      });

      const searchTerms = aiResult?.termos?.length >= 3 ? aiResult.termos : [
        `Viaduto das Artes programação ${month} ${year}`,
        'Museus Centro BH exposição arte cultura',
        'MUMO Museu Moda BH design',
        'MIS BH cinema audiovisual documentário',
        'MHAB Museu Histórico Belo Horizonte patrimônio',
        'Cinema mineiro produção audiovisual',
        'Moda mineira designers belo horizonte',
        'História Belo Horizonte planejamento urbano'
      ];

      const existingLinks = new Set(allNews.map(n => n.link).filter(Boolean));

      for (const term of searchTerms.slice(0, 4)) {
        if (selectedNoticias.length >= 5) break;

        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Pesquise notícias recentes sobre: "${term}"

        FOCO: Cultura, História, Cinema Mineiro, Moda em Belo Horizonte
        Prioridade: Viaduto das Artes, Museus Centro, MUMO (moda), MIS BH (cinema), MHAB (história)

        Retorne 3 notícias reais com links verificados (não invente URLs).
        Priorize: portalbelohorizonte, culturadoria.com.br, agendabh, imprensa local BH

        Formato: {"noticias":[{"titulo":"...","resumo":"resumo em 2 frases...","link":"https://...","imagem_url":"https://... ou vazio","data_publicacao":"YYYY-MM-DD ou vazio"}]}`,
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
                    data_publicacao: { type: 'string' }
                  }
                }
              }
            }
          }
        });

        for (const news of (result?.noticias || [])) {
          if (selectedNoticias.length >= 5) break;
          if (!news?.link || !news.link.startsWith('http') || existingLinks.has(news.link)) continue;

          const created = await base44.asServiceRole.entities.NewsHighlight.create({
            titulo: news.titulo || 'Sem título',
            resumo: news.resumo || '',
            link: news.link,
            fonte: 'web_search',
            imagem_url: news.imagem_url || '',
            data_encontrada: new Date().toISOString(),
            data_publicacao: news.data_publicacao || '',
            data_selecao: today,
            ativo: true,
            visualizacoes: 0
          });

          existingLinks.add(news.link);
          selectedNoticias.push(created);
        }
      }

      // Fill remaining slots
      if (selectedNoticias.length < 5 && prioritized.length > 0) {
        const remaining = prioritized.filter(c => !selectedNoticias.find(s => s.id === c.id));
        selectedNoticias = [...selectedNoticias, ...shuffleArray(remaining)].slice(0, 5);
      }
    }

    // === PARTE 2: 5 LINKS HISTÓRICOS (AÇÕES DO MUSEU CENTRO) ===
    const historicalLinks = [
      {
        titulo: 'Viaduto das Artes - Projeto de Revitalização',
        resumo: 'História e projeto de restauração do Viaduto das Artes em Belo Horizonte.',
        link: 'https://www.museuscentro.com.br/viaduto-artes',
        fonte: 'internal'
      },
      {
        titulo: 'MUMO - Museu da Moda: Acervo e Coleção',
        resumo: 'Conheça o acervo único do Museu da Moda de Belo Horizonte.',
        link: 'https://www.museuscentro.com.br/mumo',
        fonte: 'internal'
      },
      {
        titulo: 'MIS BH - Museu da Imagem e do Som',
        resumo: 'Experiências imersivas e acervo audiovisual do MIS Belo Horizonte.',
        link: 'https://www.museuscentro.com.br/mis',
        fonte: 'internal'
      },
      {
        titulo: 'MHAB - Museu Histórico Abílio Barreto',
        resumo: 'A história de Belo Horizonte contada através de artefatos e documentos.',
        link: 'https://www.museuscentro.com.br/mhab',
        fonte: 'internal'
      },
      {
        titulo: 'Ações Educativas - Programação Regular',
        resumo: 'Programa de educação museológica e ações comunitárias do Museus Centro.',
        link: 'https://www.museuscentro.com.br/educativo',
        fonte: 'internal'
      }
    ];

    const existingHistoricalLinks = new Set(allNews.filter(n => n.fonte === 'internal').map(n => n.link));
    for (const link of historicalLinks) {
      if (selectedHistoricos.length >= 5 || existingHistoricalLinks.has(link.link)) continue;

      const created = await base44.asServiceRole.entities.NewsHighlight.create({
        titulo: link.titulo,
        resumo: link.resumo,
        link: link.link,
        fonte: 'internal',
        imagem_url: '',
        data_encontrada: new Date().toISOString(),
        data_publicacao: today,
        data_selecao: today,
        ativo: true,
        visualizacoes: 0
      });

      existingHistoricalLinks.add(link.link);
      selectedHistoricos.push(created);
    }

    // === PARTE 3: 5 ARTIGOS DE REVISTAS SOBRE MUSEOLOGIA/ARTE/CULTURA/CINEMA ===
     const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

     const aiArticles = await base44.integrations.Core.InvokeLLM({
       model: 'claude_sonnet_4_6',
       prompt: `Você é especialista em revistas especializadas em: museologia, arte, cultura, história de Belo Horizonte, moda mineira e cinema mineiro.

    CRITÉRIO ESSENCIAL: Busque APENAS artigos publicados nos últimos 3 meses (desde ${threeMonthsAgo.toLocaleDateString('pt-BR')}).

    Encontre 8 artigos em revistas GRATUITAS (acesso aberto) sobre esses temas. Priorize:
    1. Revistas de museologia e patrimônio (ICOM, Anais do Museu, Museus.br)
    2. Arte e cultura contemporânea
    3. História de Belo Horizonte e Minas Gerais
    4. Moda mineira e história do design
    5. Cinema de Minas Gerais e videoarte
    6. Revistas de história brasileira com foco regional

    IMPORTANTE: Retorne APENAS artigos com data de publicação verificável (últimos 90 dias).

    Formato: {"artigos":[{"titulo":"...","resumo":"resumo em 2 frases...","link":"https://...","revista":"nome da revista","data_publicacao":"YYYY-MM-DD"}]}`,
       add_context_from_internet: true,
       response_json_schema: {
         type: 'object',
         properties: {
           artigos: {
             type: 'array',
             items: {
               type: 'object',
               properties: {
                 titulo: { type: 'string' },
                 resumo: { type: 'string' },
                 link: { type: 'string' },
                 revista: { type: 'string' },
                 data_publicacao: { type: 'string' }
               }
             }
           }
         }
       }
     });

     const existingArticleLinks = new Set(allNews.filter(n => n.fonte === 'artigos_revistas').map(n => n.link));

     for (const article of (aiArticles?.artigos || [])) {
       if (selectedArtigos.length >= 5 || !article?.link || existingArticleLinks.has(article.link)) continue;

       // Validar data de publicação (máximo 3 meses atrás)
       let pubDate = null;
       if (article.data_publicacao) {
         pubDate = new Date(article.data_publicacao);
         if (isNaN(pubDate.getTime()) || pubDate < threeMonthsAgo) {
           continue; // Skip artigos fora do prazo
         }
       }

       // Verificar se o artigo existe e tem conteúdo válido
       try {
         const contentCheck = await base44.integrations.Core.InvokeLLM({
           model: 'claude_sonnet_4_6',
           prompt: `Verifique rapidamente este artigo: "${article.titulo}"
           Link: ${article.link}
           Data: ${article.data_publicacao}

           É um artigo legítimo sobre museologia, arte, cultura ou cinema? Responda: {"valido": true/false, "motivo": "breve motivo se inválido"}`,
           response_json_schema: {
             type: 'object',
             properties: { valido: { type: 'boolean' }, motivo: { type: 'string' } }
           }
         });

         if (!contentCheck?.valido) continue;
       } catch (e) {
         // Se não conseguir verificar, pula
         continue;
       }

       const created = await base44.asServiceRole.entities.NewsHighlight.create({
         titulo: article.titulo || 'Sem título',
         resumo: `${article.revista ? `[${article.revista}] ` : ''}${article.resumo || ''}`,
         link: article.link,
         fonte: 'artigos_revistas',
         imagem_url: '',
         data_encontrada: new Date().toISOString(),
         data_publicacao: article.data_publicacao || '',
         data_selecao: today,
         ativo: true,
         visualizacoes: 0
       });

       existingArticleLinks.add(article.link);
       selectedArtigos.push(created);
     }

    // Combine all selected
    const selected = [...selectedNoticias, ...selectedHistoricos, ...selectedArtigos];

    // 4. Mark selected news with today's date
    for (const news of selected) {
      if (news.data_selecao !== today) {
        await base44.asServiceRole.entities.NewsHighlight.update(news.id, { data_selecao: today });
      }
    }

    // 5. Deactivate very old news (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const stale = activeNews.filter(n =>
      n.data_encontrada &&
      n.data_encontrada < thirtyDaysAgo &&
      n.fonte !== 'internal'
    );
    for (const n of stale.slice(0, 20)) {
      await base44.asServiceRole.entities.NewsHighlight.update(n.id, { ativo: false });
    }

    return Response.json({
      success: true,
      date: today,
      selected_count: selected.length,
      noticias_count: selectedNoticias.length,
      historicos_count: selectedHistoricos.length,
      artigos_count: selectedArtigos.length,
      candidates_available: candidates.length,
      future_activities: futureActivities.length,
      stale_deactivated: Math.min(stale.length, 20),
      noticias: selectedNoticias.map(n => n.titulo),
      historicos: selectedHistoricos.map(n => n.titulo),
      artigos: selectedArtigos.map(n => n.titulo)
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});