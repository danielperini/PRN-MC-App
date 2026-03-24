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
    'agenda',
    'atividade',
    'atividades',
    'calendario',
    'hoje',
    'amanha',
    'semana',
    'mes',
    'mês',
    'proximas',
    'passadas',
  ].some((term) => text.includes(term));
}

function formatItem(item: any, index: number) {
  const titulo = item?.nome || item?.titulo || `Atividade ${index + 1}`;
  const data = item?.data || '';
  const horario = item?.horario || '';
  const museu = item?.museu || '';
  const tipo = item?.tipo || item?.tipo_atividade || '';
  const vagas = item?.vagas || '';
  const inscricao = item?.inscricao || item?.inscricao_acesso || '';
  const descricao = item?.sinopse || item?.descricao || '';

  const linha1 = `${index + 1}. ${titulo}`;
  const linha2 = [data, horario, museu].filter(Boolean).join(' · ');
  const linha3 = [tipo, vagas && `Vagas: ${vagas}`, inscricao].filter(Boolean).join(' · ');

  return `${linha1}\n${linha2}${linha3 ? `\n${linha3}` : ''}${descricao ? `\n${descricao}` : ''}`;
}

function buildAgendaResponse(items: any[], question: string, requestedMonth: any, requestedMuseum: string) {
  if (!items.length) {
    return 'Não encontrei atividades na programação.';
  }

  const text = normalizeText(question);
  const now = new Date();

  let filtered = [...items];

  if (text.includes('hoje')) {
    filtered = filtered.filter((i) => {
      if (!i.data_iso) return false;
      const d = new Date(i.data_iso);
      return d.toDateString() === now.toDateString();
    });
  }

  if (text.includes('proximas') || text.includes('próximas')) {
    filtered = filtered.filter((i) => {
      if (!i.data_iso) return false;
      return new Date(i.data_iso) >= now;
    });
  }

  if (text.includes('passadas')) {
    filtered = filtered.filter((i) => {
      if (!i.data_iso) return false;
      return new Date(i.data_iso) < now;
    });
  }

  if (requestedMuseum) {
    filtered = filtered.filter((i) => normalizeText(i.museu).includes(normalizeText(requestedMuseum)));
  }

  if (requestedMonth) {
    filtered = filtered.filter((i) => {
      if (!i.data_iso) return false;
      const d = new Date(i.data_iso);
      return d.getMonth() + 1 === requestedMonth.number;
    });
  }

  filtered.sort((a, b) => new Date(a.data_iso).getTime() - new Date(b.data_iso).getTime());

  const intro = 'Programação encontrada:\n\n';

  return intro + filtered.slice(0, 20).map(formatItem).join('\n\n');
}

Deno.serve(async (req) => {
  createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));

    const pergunta = String(body?.args?.pergunta || '').trim();
    const contexto = body?.args?.contexto || [];

    if (!pergunta) {
      return new Response(JSON.stringify({ ok: false, resposta: 'Pergunta vazia' }), { status: 400 });
    }

    const requestedMonth = detectRequestedMonth(pergunta);
    const requestedMuseum = detectRequestedMuseum(pergunta);

    let resposta = '';

    if (isAgendaQuestion(pergunta)) {
      resposta = buildAgendaResponse(contexto, pergunta, requestedMonth, requestedMuseum);
    } else {
      resposta = buildAgendaResponse(contexto, pergunta, requestedMonth, requestedMuseum);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        resposta,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, resposta: String(e) }), { status: 500 });
  }
});
