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

    // 2. Check if today's 5 are already selected
    const todaySelected = activeNews.filter(n => n.data_selecao === today);
    if (todaySelected.length >= 5) {
      return Response.json({
        already_done: true,
        date: today,
        count: todaySelected.length,
        news: todaySelected.slice(0, 5).map(n => ({ id: n.id, titulo: n.titulo }))
      });
    }

    // 3. Find candidates (not shown in last 4 days — avoids repeating)
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const candidates = activeNews.filter(n => !n.data_selecao || n.data_selecao < fourDaysAgo);

    let selected = [];

    if (candidates.length >= 5) {
      // Enough candidates — pick 5 randomly
      selected = shuffleArray(candidates).slice(0, 5);
    } else {
      // Need more news — use AI to suggest varied search terms
      selected = [...candidates];

      const aiResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Hoje é ${today} (${month} de ${year}). Você é especialista em comunicação cultural de Belo Horizonte.
Sugira 6 termos de busca VARIADOS e CRIATIVOS em português brasileiro para encontrar notícias recentes sobre:
- Viaduto das Artes BH / Projeto Museus Centro Belo Horizonte
- MUMO (Museu da Moda BH), MIS BH (Museu da Imagem e do Som), MHAB (Museu Histórico Abílio Barreto)
- Eventos culturais, exposições, programação cultural em BH

IMPORTANTE — seja diverso: não repita temas óbvios. Considere:
- O que está acontecendo em ${month}: feriados, eventos sazonais
- Ângulos variados: acessibilidade, educação, acervo, novas aquisições, parcerias, bastidores
- Públicos diferentes: famílias, jovens, turistas, escolas
- Notícias de bastidores: novos curadores, concursos, chamadas públicas, licitações culturais

Responda apenas com JSON: {"termos": ["termo1","termo2","termo3","termo4","termo5","termo6"]}`,
        response_json_schema: {
          type: 'object',
          properties: { termos: { type: 'array', items: { type: 'string' } } }
        }
      });

      const searchTerms = aiResult?.termos?.length >= 3 ? aiResult.termos : [
        `Viaduto das Artes programação ${month} ${year}`,
        'Museus Centro BH exposição',
        'MUMO moda belo horizonte',
        'MIS BH atividade educativa',
        'MHAB historia belo horizonte',
        `cultura BH eventos ${month}`
      ];

      const existingLinks = new Set(allNews.map(n => n.link).filter(Boolean));

      for (const term of searchTerms.slice(0, 4)) {
        if (selected.length >= 5) break;

        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Pesquise notícias recentes sobre: "${term}"
Foco em Belo Horizonte — Museus Centro, Viaduto das Artes, MUMO, MIS BH, MHAB.
Retorne 3 notícias reais com links verificados. Não invente URLs.
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
          if (selected.length >= 5) break;
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
          selected.push(created);
        }
      }

      // Fill remaining slots from any available candidates if still short
      if (selected.length < 5 && candidates.length > 0) {
        const remaining = candidates.filter(c => !selected.find(s => s.id === c.id));
        selected = [...selected, ...shuffleArray(remaining)].slice(0, 5);
      }
    }

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
      candidates_available: candidates.length,
      stale_deactivated: Math.min(stale.length, 20),
      titles: selected.map(n => n.titulo)
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});