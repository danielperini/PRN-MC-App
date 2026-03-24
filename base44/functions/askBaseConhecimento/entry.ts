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

  const months: Record<string, { label: string; number: number }> = {
    janeiro: { label: 'Janeiro', number: 1 },
    fevereiro: { label: 'Fevereiro', number: 2 },
    marco: { label: 'Março', number: 3 },
    abril: { label: 'Abril', number: 4 },
    maio: { label: 'Maio', number: 5 },
    junho: { label: 'Junho', number: 6 },
    julho: { label: 'Julho', number: 7 },
    agosto: { label: 'Agosto', number: 8 },
    setembro: { label: 'Setembro', number: 9 },
    outubro: { label: 'Outubro', number: 10 },
    novembro: { label: 'Novembro', number: 11 },
    dezembro: { label: 'Dezembro', number: 12 },
  };

  for (const [key, value] of Object.entries(months)) {
    if (text.includes(key)) return value;
  }

  return null;
}

function detectRequestedMuseum(question: string) {
  const text = normalizeText(question);

  if (text.includes('mis')) return 'MIS';
  if (text.includes('mhab') || text.includes('mab')) return 'MHAB';
  if (text.includes('mumo') || text.includes('mumu')) return 'MUMO';
  if (text.includes('externo')) return 'Externo';

  return '';
}

function isAgendaQuestion(question: string) {
  const text = normalizeText(question);

  return [
    'programacao',
    'programação',
    'agenda',
    'atividade',
    'atividades',
    'previsto',
    'prevista',
    'mes',
    'mês',
    'semana',
    'hoje',
    'amanha',
    'amanhã',
    'passou',
    'passadas',
    'proximas',
    'próximas',
    'calendario',
    'calendário',
  ].some((term) => text.includes(term));
}

function isMiniBioQuestion(question: string) {
  const text = normalizeText(question);
  return text.includes('minibio') || text.includes('mini bio') || text.includes('bio');
}

function getMonthFromItem(item: any) {
  if (item?.data_iso) {
    const d = new Date(item.data_iso);
    if (!Number.isNaN(d.getTime())) {
      return d.getUTCMonth() + 1;
    }
  }

  const raw = normalizeText(item?.data || item?.mes || item?.month_label || item?.month_name || '');
  const detected = detectRequestedMonth(raw);
  return detected?.number || null;
}

function getDayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function itemMatchesQuestion(item: any, question: string, requestedMonth: any, requestedMuseum: string) {
  const haystack = normalizeText(JSON.stringify(item || {}));

  if (requestedMonth) {
    const itemMonth = getMonthFromItem(item);
    if (itemMonth !== requestedMonth.number && !haystack.includes(normalizeText(requestedMonth.label))) {
      return false;
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
    .filter(
      (t) =>
        ![
          'qual',
          'quais',
          'para',
          'sobre',
          'programacao',
          'programações',
          'programacao',
          'agenda',
          'atividade',
          'atividades',
          'mes',
          'mês',
          'do',
          'da',
          'de',
          'com',
          'uma',
          'das',
          'dos',
          'minibio',
          'mini',
          'bio',
          'hoje',
          'amanha',
          'amanhã',
          'semana',
          'esta',
          'esse',
          'nesta',
          'neste',
          'previsto',
          'prevista',
          'tem',
          'temos',
          'quero',
          'ver',
          'no',
          'na',
        ].includes(t)
    );

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

function buildAgendaResponse(items: any[], question: string, requestedMonth: any, requestedMuseum: string) {
  if (!items.length) {
    return 'Não encontrei atividades compatíveis na programação.';
  }

  const text = normalizeText(question);
  const now = new Date();
  const todayKey = getDayKey(now);

  let filtered = [...items];

  if (text.includes('hoje')) {
    filtered = filtered.filter((item) => {
      if (!item?.data_iso) return false;
      const d = new Date(item.data_iso);
      return !Number.isNaN(d.getTime()) && getDayKey(d) === todayKey;
    });
  } else if (text.includes('amanha') || text.includes('amanhã')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowKey = getDayKey(tomorrow);

    filtered = filtered.filter((item) => {
      if (!item?.data_iso) return false;
      const d = new Date(item.data_iso);
      return !Number.isNaN(d.getTime()) && getDayKey(d) === tomorrowKey;
    });
  } else if (text.includes('semana')) {
    const start = new Date(now);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    filtered = filtered.filter((item) => {
      if (!item?.data_iso) return false;
      const d = new Date(item.data_iso);
      return !Number.isNaN(d.getTime()) && d >= start && d <= end;
    });
  } else if (text.includes('passou') || text.includes('passadas')) {
    filtered = filtered.filter((item) => {
      if (!item?.data_iso) return false;
      const d = new Date(item.data_iso);
      return !Number.isNaN(d.getTime()) && d < now;
    });
  } else if (text.includes('proximas') || text.includes('próximas') || text.includes('previsto') || text.includes('prevista')) {
    filtered = filtered.filter((item) => {
      if (!item?.data_iso) return false;
      const d = new Date(item.data_iso);
      return !Number.isNaN(d.getTime()) && d >= now;
    });
  }

  filtered.sort((a, b) => {
    const da = a?.data_iso ? new Date(a.data_iso).getTime() : 0;
    const db = b?.data_iso ? new Date(b.data_iso).getTime() : 0;
    return da - db;
  });

  const introParts = [];
  if (requestedMuseum) introParts.push(requestedMuseum);
  if (requestedMonth?.label) introParts.push(requestedMonth.label);

  const intro = introParts.length
    ? `Programação encontrada para ${introParts.join(' · ')}:\n`
    : 'Programação encontrada:\n';

  return intro + buildSummary(filtered);
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
    const groupedByDay = body?.args?.grouped_by_day || body?.grouped_by_day || {};
    const groupedByMonth = body?.args?.grouped_by_month || body?.grouped_by_month || {};
    const countsByMuseum = body?.args?.counts_by_museum || body?.counts_by_museum || {};

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

    if (isAgendaQuestion(pergunta)) {
      resposta = buildAgendaResponse(
        filtered.length ? filtered : contexto,
        pergunta,
        requestedMonth,
        requestedMuseum
      );
    } else if (isMiniBioQuestion(pergunta)) {
      resposta = buildSummary(filtered.length ? filtered : contexto);
    } else {
      resposta = buildSummary(filtered.length ? filtered : contexto);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        resposta,
        total_encontrado: filtered.length,
        month_detected: requestedMonth?.label || '',
        museum_detected: requestedMuseum,
        grouped_by_day: groupedByDay,
        grouped_by_month: groupedByMonth,
        counts_by_museum: countsByMuseum,
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
