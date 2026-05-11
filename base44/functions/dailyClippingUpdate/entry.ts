type ClippingSource = {
  name: string;
  type: string;
  searchUrl: string;
  enabled: boolean;
};

type ClippingItem = {
  title: string;
  sourceName: string;
  sourceType: string;
  platform: string;
  publishedDate: string;
  url: string;
  summary: string;
  relevance: string;
  relatedTo: string[];
  keywords: string[];
  createdBy: string;
};

const HEAD_KEYWORDS = [
  'Museus Centro',
  'Viaduto das Artes',
  'Museu Histórico Abílio Barreto',
  'Abílio Barreto',
  'MHAB',
  'Museu da Moda',
  'MUMO',
  'Museu da Imagem e do Som',
  'MIS BH',
  'Noturno nos Museus',
  'Semana Nacional de Museus',
  'Fundação Municipal de Cultura',
];

const MEDIUM_TAIL_KEYWORDS = [
  'programação museus centro bh',
  'oficinas museu da moda bh',
  'atividades mhab belo horizonte',
  'exposição mis bh',
  'agenda cultural museus bh',
  'programação viaduto das artes',
  'noturno nos museus programação',
  'eventos culturais centro de bh',
  'museus gratuitos belo horizonte',
  'atividades culturais prefeitura bh',
  'programação museus municipais bh',
  'agenda museu histórico abílio barreto',
];

const LONG_TAIL_KEYWORDS = [
  'programação completa museus centro belo horizonte 2024',
  'programação completa museus centro belo horizonte 2025',
  'programação completa museus centro belo horizonte 2026',
  'atividades gratuitas no museu da imagem e do som bh',
  'oficinas educativas museus centro viaduto das artes',
  'programação cultural do mhab em belo horizonte',
  'agenda de exposições do mumo em bh',
  'atividades do noturno nos museus 2024',
  'atividades do noturno nos museus 2025',
  'atividades do noturno nos museus 2026',
  'programação integrada museus municipais de belo horizonte',
  'museus centro percurso da memória de belo horizonte',
];

const HASHTAGS = [
  '#MuseusCentro',
  '#ViadutoDasArtes',
  '#NoturnoNosMuseus',
  '#MuseuDaModa',
  '#MUMO',
  '#MHAB',
  '#MISBH',
  '#MuseusBH',
  '#MuseusDeBH',
  '#CulturaBH',
  '#CircuitoCultural',
  '#FundacaoMunicipalDeCultura',
  '#MuseuHistoricoAbilioBarreto',
  '#MuseuDaImagemEDoSom',
  '#ProgramacaoCulturalBH',
  '#SemanaNacionalDeMuseus',
];

const SOURCES: ClippingSource[] = [
  { name: 'PBH Notícias', type: 'Imprensa institucional', searchUrl: 'https://prefeitura.pbh.gov.br/noticias', enabled: true },
  { name: 'Portal Belo Horizonte', type: 'Canal institucional', searchUrl: 'https://portalbelohorizonte.com.br', enabled: true },
  { name: 'BH Eventos', type: 'Agenda cultural', searchUrl: 'https://www.bheventos.com.br', enabled: true },
  { name: 'Culturadoria', type: 'Mídia cultural', searchUrl: 'https://culturadoria.com.br', enabled: true },
  { name: 'Agenda BH', type: 'Agenda cultural', searchUrl: 'https://www.agendabh.com.br', enabled: true },
  { name: 'Estado de Minas / Revista Encontro', type: 'Mídia cultural', searchUrl: 'https://www.revistaencontro.com.br', enabled: true },
  { name: 'O Tempo', type: 'Imprensa', searchUrl: 'https://www.otempo.com.br', enabled: true },
  { name: 'Hoje em Dia', type: 'Imprensa', searchUrl: 'https://www.hojeemdia.com.br', enabled: true },
  { name: 'Reddit Belo Horizonte', type: 'Rede social', searchUrl: 'https://www.reddit.com/r/BeloHorizonte/search/', enabled: true },
  { name: 'Instagram', type: 'Rede social', searchUrl: 'https://www.instagram.com/explore/tags/', enabled: false },
  { name: 'Facebook', type: 'Rede social', searchUrl: 'https://www.facebook.com/search/posts/', enabled: false },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function normalize(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildSearchTerms(extraTerms: string[] = []) {
  const terms = [...HEAD_KEYWORDS, ...MEDIUM_TAIL_KEYWORDS, ...LONG_TAIL_KEYWORDS, ...HASHTAGS, ...extraTerms];
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
}

function inferRelevance(text: string) {
  const normalized = normalize(text);
  if (['museus centro', 'viaduto das artes', 'noturno nos museus'].some((term) => normalized.includes(term))) return 'Alta';
  if (['mhab', 'mis bh', 'mumo', 'museu da moda', 'abilio barreto'].some((term) => normalized.includes(term))) return 'Média/Alta';
  return 'Média';
}

async function expandTermsWithAI(baseTerms: string[], recentItems: ClippingItem[]) {
  const generated = new Set<string>();

  for (const item of recentItems) {
    const text = `${item.title} ${item.summary} ${(item.relatedTo || []).join(' ')}`;
    if (normalize(text).includes('mulheres')) generated.add('museus centro mês das mulheres bh');
    if (normalize(text).includes('semana nacional')) generated.add('semana nacional de museus museus centro bh');
    if (normalize(text).includes('animacao') || normalize(text).includes('animação')) generated.add('exposição animação brasileira MIS BH');
    if (normalize(text).includes('noturno')) generated.add('noturno nos museus programação belo horizonte');
  }

  return Array.from(new Set([...baseTerms, ...generated]));
}

async function searchOpenWebFallback(terms: string[]) {
  const items: ClippingItem[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const source of SOURCES.filter((item) => item.enabled).slice(0, 9)) {
    for (const term of terms.slice(0, 18)) {
      items.push({
        title: `Busca diária: ${term}`,
        sourceName: source.name,
        sourceType: source.type,
        platform: source.type.includes('Rede social') ? 'Rede social' : 'Site',
        publishedDate: today,
        url: `${source.searchUrl}?q=${encodeURIComponent(term)}`,
        summary: `Entrada de busca programada para verificar menções a ${term} em ${source.name}.`,
        relevance: inferRelevance(term),
        relatedTo: [term],
        keywords: [term],
        createdBy: 'dailyClippingUpdate',
      });
    }
  }

  return items;
}

function dedupeItems(items: ClippingItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(`${item.url}|${item.title}|${item.sourceName}|${item.publishedDate}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

Deno.serve(async (request: Request) => {
  try {
    if (request.method === 'OPTIONS') return json({ ok: true });

    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const action = body?.action || 'daily-update';
    const extraTerms = Array.isArray(body?.extraTerms) ? body.extraTerms : [];

    const baseTerms = buildSearchTerms(extraTerms);
    const expandedTerms = await expandTermsWithAI(baseTerms, []);
    const foundItems = await searchOpenWebFallback(expandedTerms);
    const items = dedupeItems(foundItems);

    return json({
      ok: true,
      action,
      schedule: '45 23 * * *',
      timezone: 'America/Sao_Paulo',
      recommended_run_time: '23:45',
      sources: SOURCES,
      terms_count: expandedTerms.length,
      items_count: items.length,
      items,
      note: 'Instagram e Facebook ficam preparados, mas exigem Meta Graph API para coleta real. Sem tokens oficiais, são mantidos como fontes planejadas/desabilitadas.',
    });
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Erro inesperado na atualização diária de clipping.' }, 500);
  }
});
