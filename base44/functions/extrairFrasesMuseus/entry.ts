import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { museu, limit = 6 } = body;

    // Buscar relatórios aprovados/submetidos recentes
    const reports = await base44.asServiceRole.entities.Report.filter(
      { status: 'APPROVED' },
      '-updated_date',
      80
    );

    if (!reports || reports.length === 0) {
      return Response.json({ frases: [] });
    }

    // Filtrar por museu se solicitado
    const filtered = museu && museu !== 'Todos'
      ? reports.filter(r => r.museu === museu || r.museu_secundario === museu)
      : reports;

    // Montar texto dos relatórios para a IA analisar
    const excerpts = filtered.slice(0, 30).map(r => {
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

RELATÓRIOS:
${excerpts.map((e, i) => `[${i+1}] Museu: ${e.museu} | ${e.mes} ${e.ano} | Autor: ${e.autor}
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
      "report_id": "id do relatório de onde veio"
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
                frase:     { type: 'string' },
                museu:     { type: 'string' },
                data:      { type: 'string' },
                autor:     { type: 'string' },
                fonte:     { type: 'string' },
                report_id: { type: 'string' },
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