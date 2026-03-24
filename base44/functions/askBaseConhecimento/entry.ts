import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function detectRequestedMonth(question: string) {
  const text = normalizeText(question);

  const months: Record<string, string> = {
    janeiro: 'Janeiro',
    fevereiro: 'Fevereiro',
    marco: 'Março',
    abril: 'Abril',
    maio: 'Maio',
    junho: 'Junho',
    julho: 'Julho',
    agosto: 'Agosto',
    setembro: 'Setembro',
    outubro: 'Outubro',
    novembro: 'Novembro',
    dezembro: 'Dezembro',
  };

  for (const [key, label] of Object.entries(months)) {
    if (text.includes(key)) return label;
  }

  return '';
}

function detectRequestedMuseum(question: string) {
  const text = normalizeText(question);

  if (text.includes('mis')) return 'MIS';
  if (text.includes('mhab') || text.includes('mab')) return 'MHAB';
  if (text.includes('mumo') || text.includes('mumu')) return 'MUMO';

  return '';
}

function itemMatchesQuestion(item: any, question: string, requestedMonth: string, requestedMuseum: string) {
  const haystack = normalizeText(JSON.stringify(item || {}));

  if (requestedMonth) {
    const itemMonth = normalizeText(item?.month_label || item?.month_name || item?.mes || '');
    if (!itemMonth.includes(normalizeText(requestedMonth))) {
      if (!haystack.includes(normalizeText(requestedMonth))) return false;
    }
  }

  if (requestedMuseum) {
    const itemMuseum = normalizeText(item?.museu || '');
    if (!itemMuseum.includes(normalizeText(requestedMuseum)) && !haystack.includes(normalizeText(requestedMuseum))) {
      return false;
    }
  }

  const tokens = normalizeText(question)
    .split(/\s+/)
    .filter((t) => t && t.length > 2)
    .filter((t) => !['qual', 'quais', 'para', 'sobre', 'programacao', 'programações', 'programacao', 'mes', 'mês', 'do', 'da', 'de', 'com', 'uma', 'das', 'dos', 'minibio', 'mini', 'bio'].includes(t));

  if (!tokens.length) return true;

  return tokens.some((token) => haystack.includes(token));
}

function buildSummary(items: any[]) {
  if (!items.length) {
    return 'Não encontrei registros compatíveis na base espelhada.';
  }

  return items
    .slice(0, 30)
    .map((item, index) => {
      const titulo = item?.titulo || item?.first_text || `Registro ${index + 1}`;
      const data = item?.data || item?.data_iso || '';
      const museu = item?.museu || '';
      const equipe = item?.equipe || '';
      const descricao = item?.descricao || '';

      const meta = [data, museu, equipe].filter(Boolean).join(' · ');
      return `${index + 1}. ${titulo}${meta ? ` (${meta})` : ''}${descricao ? ` — ${descricao}` : ''}`;
    })
    .join('\n');
}

Deno.serve(async (req) => {
  createClientFromRequest(req);

  try {
    const body =
      req.method === 'POST'
        ? await req.json().catch(() => ({}))
        : {};

    const pergunta = String(body?.args?.pergunta || body?.pergunta || '').trim();
    const contexto = Array.isArray(body?.args?.contexto)
      ? body.args.contexto
      : Array.isArray(body?.contexto)
        ? body.contexto
        : [];

    if (!pergunta) {
      return new Response(
        JSON.stringify({
          ok: false,
          resposta: 'Pergunta vazia.',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const requestedMonth = detectRequestedMonth(pergunta);
    const requestedMuseum = detectRequestedMuseum(pergunta);

    const filtered = contexto.filter((item) =>
      itemMatchesQuestion(item, pergunta, requestedMonth, requestedMuseum)
    );

    let resposta = '';

    if (normalizeText(pergunta).includes('minibio') || normalizeText(pergunta).includes('mini bio')) {
      resposta = buildSummary(filtered.length ? filtered : contexto);
    } else if (normalizeText(pergunta).includes('programacao') || normalizeText(pergunta).includes('programação')) {
      resposta = buildSummary(filtered);
    } else {
      resposta = buildSummary(filtered.length ? filtered : contexto);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        resposta,
        total_encontrado: filtered.length,
        month_detected: requestedMonth,
        museum_detected: requestedMuseum,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        resposta:
          error instanceof Error
            ? error.message
            : 'Erro inesperado na consulta da base.',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
});
