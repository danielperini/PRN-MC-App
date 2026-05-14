import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Seleção determinística pseudo-aleatória baseada em seed
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(array, seed) {
  const rng = seededRandom(seed);
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Gera seed numérico a partir da string de data (ex: "2026-05-14")
function dateSeedFromString(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { museu, limit = 3, daily_seed } = body;

    // Buscar relatórios aprovados e attachments com imagens em paralelo
    const [reports, attachments] = await Promise.all([
      base44.asServiceRole.entities.Report.filter({ status: 'APPROVED' }, '-updated_date', 200),
      base44.asServiceRole.entities.Attachment.list('-created_date', 200),
    ]);

    if (!reports || reports.length === 0) {
      return Response.json({ frases: [] });
    }

    // Filtrar por museu se solicitado
    const filtered = museu && museu !== 'Todos'
      ? reports.filter(r => r.museu === museu || r.museu_secundario === museu)
      : reports;

    // Mapear imagens por report_id
    const imgByReport = {};
    for (const att of (attachments || [])) {
      if (att.report_id && att.file_url && /\.(jpg|jpeg|png|webp)/i.test(att.file_url)) {
        if (!imgByReport[att.report_id]) imgByReport[att.report_id] = att.file_url;
      }
    }

    // Usar seed diário para embaralhar de forma determinística
    const seedStr = daily_seed || new Date().toISOString().slice(0, 10);
    const seedNum = dateSeedFromString(seedStr + (museu || 'Todos'));
    const shuffled = shuffleWithSeed(filtered, seedNum);

    // Montar texto dos relatórios para a IA analisar
    const excerpts = shuffled.slice(0, 30).map(r => {
      const parts = [];
      if (r.resumo_periodo) parts.push(r.resumo_periodo);
      if (r.resumo_executivo) parts.push(r.resumo_executivo);
      if (r.avaliacao_pontos_positivos) parts.push(r.avaliacao_pontos_positivos);
      if (r.comentarios_gerais) parts.push(r.comentarios_gerais);
      if (r.oportunidades_resumo) parts.push(r.oportunidades_resumo);
      // Depoimentos
      if (Array.isArray(r.depoimentos)) {
        r.depoimentos.forEach(d => { if (d.texto) parts.push(d.texto); });
      }
      // Atividades inline
      if (Array.isArray(r.atividades)) {
        r.atividades.forEach(a => {
          if (a.descricao) parts.push(a.descricao);
          if (a.resultado_alcancado) parts.push(a.resultado_alcancado);
          if (a.justificativa_tecnica) parts.push(a.justificativa_tecnica);
        });
      }
      return {
        id: r.id,
        museu: r.museu || 'Museu Centro',
        mes: r.mes_referencia || '',
        ano: r.ano || '',
        autor: r.author_name || '',
        imagem_url: imgByReport[r.id] || null,
        texto: parts.join('\n').slice(0, 1200),
      };
    }).filter(e => e.texto.length > 50);

    if (excerpts.length === 0) return Response.json({ frases: [] });

    const prompt = `Você é um curador sensível e institucional do Projeto Museu Centro (BH).

Analise os trechos de relatórios abaixo e extraia exatamente ${limit} frases positivas, humanas e inspiradoras que revelem o cotidiano vivo dos museus.

REGRAS OBRIGATÓRIAS:
- Extraia frases REAIS dos textos. Não invente nada.
- Priorize: visitas recebidas, oficinas, depoimentos emocionantes, falas de visitantes, impactos positivos, memória, território, comunidade.
- NUNCA inclua: problemas, críticas, dados financeiros, informações administrativas, burocráticas ou operacionais.
- Cada frase deve ter sentido humano, cultural ou educativo.
- Se uma frase vier de depoimento identificado, inclua o autor. Caso contrário, use "Fonte: relatório interno".
- Prefira frases completas com contexto claro.
- Se um trecho não tiver frases positivas adequadas, ignore-o.
- Copie o campo imagem_url do relatório para o JSON de resposta quando disponível.

RELATÓRIOS:
${excerpts.map((e, i) => `[${i+1}] Museu: ${e.museu} | ${e.mes} ${e.ano} | Autor: ${e.autor} | imagem_url: ${e.imagem_url || ''}
---
${e.texto}
`).join('\n')}

Retorne JSON com esta estrutura exata:
{
  "frases": [
    {
      "frase": "texto da frase entre aspas",
      "museu": "nome do museu",
      "data": "Mês Ano (ex: Março 2026)",
      "autor": "nome da pessoa ou grupo, ou null",
      "fonte": "Fonte: relatório interno",
      "report_id": "id do relatório de onde veio",
      "imagem_url": "url da imagem do relatório ou null"
    }
  ]
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          frases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
              frase:      { type: 'string' },
              museu:      { type: 'string' },
              data:       { type: 'string' },
              autor:      { type: 'string' },
              fonte:      { type: 'string' },
              report_id:  { type: 'string' },
              imagem_url: { type: 'string' },
              },
            },
          },
        },
      },
    });

    const frases = (result?.frases || []).slice(0, limit);
    return Response.json({ frases });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});