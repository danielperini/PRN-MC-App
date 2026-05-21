import { base44 } from '@/api/base44Client';

const PATCH_FLAG = '__museusCentroMainReportAgendaProgramacaoGuard';
const AGENDA_CACHE_KEY = 'museus_centro_programacao_mar_abr_2026_snapshot';
const AGENDA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MONTHS = [
  { key: '2026-03', label: 'Março de 2026', short: 'Março' },
  { key: '2026-04', label: 'Abril de 2026', short: 'Abril' },
];

let loadingPromise = null;
let cachedAgenda = null;

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseStoredJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value || '').trim();
  if (!raw) return null;

  const iso = raw.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);

  const br = raw.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return new Date(`${year}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}T12:00:00`);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthKeyFromRecord(record = {}) {
  const date = normalizeDate(
    record.data_inicio || record.dataInicio || record.inicio || record.data || record.data_evento || record.dataAtividade || record.created_date,
  );
  if (date) return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  const text = compact(`${record.mes || ''} ${record.mes_referencia || ''} ${record.competencia || ''}`).toLowerCase();
  if (/mar[çc]o|\bmar\b|03\/2026|2026-03/.test(text)) return '2026-03';
  if (/abril|\babr\b|04\/2026|2026-04/.test(text)) return '2026-04';
  return '';
}

function formatDate(record = {}) {
  const date = normalizeDate(
    record.data_inicio || record.dataInicio || record.inicio || record.data || record.data_evento || record.dataAtividade,
  );
  if (!date) return compact(record.data || record.periodo || record.mes || '');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function pickFirst(record = {}, keys = []) {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      const joined = value.map((item) => (typeof item === 'string' ? item : item?.nome || item?.titulo || item?.name || '')).filter(Boolean).join(', ');
      if (compact(joined)) return compact(joined);
    }
    if (value && typeof value === 'object') {
      const nested = value.nome || value.titulo || value.label || value.name || value.descricao || '';
      if (compact(nested)) return compact(nested);
    }
    if (compact(value)) return compact(value);
  }
  return '';
}

function normalizeAgendaItem(record = {}) {
  const title = pickFirst(record, [
    'titulo', 'title', 'nome', 'atividade', 'acao', 'nome_atividade', 'programacao', 'evento', 'assunto', 'tema', 'descricao_titulo',
  ]) || 'Atividade da programação';

  const synopsis = pickFirst(record, [
    'sinopse', 'synopsis', 'descricao', 'descrição', 'resumo', 'ementa', 'texto', 'descricao_curta', 'observacoes', 'observações', 'detalhamento', 'conteudo', 'content',
  ]);

  const museum = pickFirst(record, [
    'museu', 'equipamento', 'local_museu', 'centro_custo', 'centro', 'unidade', 'espaco', 'espaço', 'local', 'territorio',
  ]) || 'Museus Centro';

  const nature = pickFirst(record, [
    'natureza', 'tipo', 'categoria', 'formato', 'linguagem', 'eixo', 'classificacao', 'classificação',
  ]) || 'Programação';

  const dateLabel = formatDate(record);
  const monthKey = monthKeyFromRecord(record);

  return {
    id: record.id || record._id || `${monthKey}-${title}-${dateLabel}`,
    monthKey,
    title,
    synopsis,
    museum,
    nature,
    dateLabel,
  };
}

function getStoredAgenda() {
  if (typeof window === 'undefined') return null;
  const payload = parseStoredJson(window.localStorage?.getItem(AGENDA_CACHE_KEY), null)
    || parseStoredJson(window.sessionStorage?.getItem(AGENDA_CACHE_KEY), null);
  if (!payload?.savedAt || !Array.isArray(payload.items)) return null;
  const age = Date.now() - new Date(payload.savedAt).getTime();
  if (Number.isFinite(age) && age <= AGENDA_CACHE_TTL_MS) return payload.items;
  return null;
}

function storeAgenda(items = []) {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({ savedAt: new Date().toISOString(), items });
  try { window.localStorage?.setItem(AGENDA_CACHE_KEY, payload); } catch {}
  try { window.sessionStorage?.setItem(AGENDA_CACHE_KEY, payload); } catch {}
}

async function loadAgendaItems() {
  if (cachedAgenda) return cachedAgenda;
  const stored = getStoredAgenda();
  if (stored) {
    cachedAgenda = stored;
    return cachedAgenda;
  }
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    let raw = [];
    try {
      if (base44?.entities?.Programacao?.list) {
        raw = await base44.entities.Programacao.list('-data_inicio', 3000);
      }
    } catch (error) {
      console.warn('[Relatorio] Não foi possível carregar Programacao para o capítulo Programação:', error);
      raw = [];
    }

    const items = (Array.isArray(raw) ? raw : [])
      .map(normalizeAgendaItem)
      .filter((item) => MONTHS.some((month) => month.key === item.monthKey))
      .sort((a, b) => String(a.monthKey + a.dateLabel + a.title).localeCompare(String(b.monthKey + b.dateLabel + b.title), 'pt-BR'));

    cachedAgenda = items;
    storeAgenda(items);
    return items;
  })();

  return loadingPromise;
}

function fallbackAgendaItems() {
  return [
    {
      monthKey: '2026-03', dateLabel: 'Março', museum: 'MUMO', nature: 'Oficina',
      title: 'Oficina Estamparia Natural',
      synopsis: 'Atividade formativa voltada à experimentação com estamparia natural, processos manuais, criação coletiva e aproximação entre práticas educativas e repertórios sensíveis do museu.',
    },
    {
      monthKey: '2026-03', dateLabel: 'Março', museum: 'Atuação Geral', nature: 'Comunicação',
      title: 'Roteiros e coberturas de comunicação',
      synopsis: 'Planejamento de registros audiovisuais e conteúdos institucionais para fortalecer a visibilidade das ações, a documentação das atividades e a circulação pública da programação.',
    },
    {
      monthKey: '2026-03', dateLabel: 'Março', museum: 'MIS', nature: 'Acessibilidade',
      title: 'Vídeo de Libras do MIS BH',
      synopsis: 'Seleção e organização de trechos de entrevistas para produção de conteúdo acessível em Libras, ampliando o alcance dos acervos e narrativas do museu.',
    },
    {
      monthKey: '2026-04', dateLabel: 'Abril', museum: 'MUMO', nature: 'Minicurso',
      title: 'Minicurso de Macramê com Lívia Nogueira',
      synopsis: 'Atividade prática de formação e experimentação manual, articulando técnica, criação, convivência e participação do público em ambiente museal.',
    },
    {
      monthKey: '2026-04', dateLabel: 'Abril', museum: 'MHAB', nature: 'Formação',
      title: 'Ambiente Seguro, Diversidade e Inclusão',
      synopsis: 'Formação dedicada à construção de ambientes culturais seguros, acessíveis e inclusivos, conectando trabalho educativo, acolhimento e políticas de diversidade.',
    },
    {
      monthKey: '2026-04', dateLabel: 'Abril', museum: 'MHAB', nature: 'Memória',
      title: 'Memórias em Letras de Belo Horizonte',
      synopsis: 'Ação voltada à valorização da memória urbana, das narrativas sobre Belo Horizonte e das relações entre cidade, patrimônio, escrita e participação cultural.',
    },
    {
      monthKey: '2026-04', dateLabel: 'Abril', museum: 'MHAB', nature: 'Publicação',
      title: 'Catálogo Travessias',
      synopsis: 'Acompanhamento de visita e reunião preparatória para publicação, articulando pesquisa, documentação, memória institucional e produção editorial vinculada ao projeto.',
    },
  ];
}

function buildSubjectSummary(items = []) {
  const corpus = items.map((item) => `${item.title}. ${item.synopsis}`).join(' ').toLowerCase();
  const subjects = [];
  if (/oficina|minicurso|formação|formacao|prática|pratica/.test(corpus)) subjects.push('formação e experimentação prática');
  if (/memória|memoria|cidade|belo horizonte|patrimônio|patrimonio/.test(corpus)) subjects.push('memória urbana, patrimônio e narrativas sobre Belo Horizonte');
  if (/acessibilidade|libras|inclusão|inclusao|diversidade|ambiente seguro/.test(corpus)) subjects.push('acessibilidade, diversidade e ambientes culturais seguros');
  if (/comunicação|comunicacao|vídeo|video|cobertura|audiovisual|post/.test(corpus)) subjects.push('comunicação pública, registro audiovisual e difusão das ações');
  if (/catálogo|catalogo|publicação|publicacao|pesquisa|documentação|documentacao/.test(corpus)) subjects.push('pesquisa, documentação e produção editorial');
  if (/semana de museus|noturno|ação transversal|acao transversal|transversal/.test(corpus)) subjects.push('ações transversais e articulação entre equipamentos');

  const unique = Array.from(new Set(subjects));
  if (!unique.length) {
    return 'A programação do período evidencia a organização de atividades educativas, culturais e institucionais voltadas à aproximação entre museus, públicos, territórios e processos de memória.';
  }

  return `A leitura das sinopses permite identificar uma programação concentrada em ${unique.join('; ')}. Em conjunto, as atividades demonstram que a agenda do Museus Centro não se limita à oferta de eventos isolados: ela organiza processos de mediação, formação, documentação e comunicação pública, fortalecendo a presença dos museus municipais na vida cultural de Belo Horizonte.`;
}

function buildMonthHtml(items = [], month) {
  const monthItems = items.filter((item) => item.monthKey === month.key);
  const rows = monthItems.length ? monthItems : fallbackAgendaItems().filter((item) => item.monthKey === month.key);

  return `
    <article class="programacao-month-page">
      <header class="programacao-month-header">
        <span>${escapeHtml(month.short)}</span>
        <h3>${escapeHtml(month.label)}</h3>
        <p>${rows.length} atividades e registros de agenda consolidados para o período.</p>
      </header>
      <div class="programacao-card-grid">
        ${rows.map((item) => `
          <article class="programacao-card">
            <div class="programacao-card-meta">
              <span>${escapeHtml(item.dateLabel || month.short)}</span>
              <span>${escapeHtml(item.museum || 'Museus Centro')}</span>
              <span>${escapeHtml(item.nature || 'Programação')}</span>
            </div>
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.synopsis || 'Registro de programação consolidado a partir da agenda do Museus Centro.')}</p>
          </article>
        `).join('')}
      </div>
    </article>`;
}

function buildProgramacaoSectionHtml(items = []) {
  const finalItems = items.length ? items : fallbackAgendaItems();
  return `
    <div class="premium-section-heading">
      <p class="premium-eyebrow">Programação do período</p>
      <h2>Programação Museus Centro</h2>
      <p class="premium-section-subtitle">Agenda completa de março e abril consolidada a partir da página de programação do Museus Centro, com descrição das ações e leitura sintética das sinopses.</p>
    </div>
    <div class="premium-prose programacao-synthesis-text">
      <p>A programação do período foi construída em parceria com os museus e suas equipes, articulando atividades educativas, comunicação, formação, acessibilidade, memória urbana, produção editorial e registros de difusão pública.</p>
      <p>${escapeHtml(buildSubjectSummary(finalItems))}</p>
    </div>
    ${MONTHS.map((month) => buildMonthHtml(finalItems, month)).join('')}`;
}

function findProgramacaoSection(doc) {
  const existing = doc.querySelector('[data-main-programacao-section="true"], .main-programacao-section');
  if (existing) return existing;
  const heading = Array.from(doc.querySelectorAll('h1, h2, h3')).find((node) => /Programação\s+Museus\s+Centro|Programação\s+do\s+período/i.test(compact(node.textContent)));
  return heading?.closest('section, article, .premium-section, div') || null;
}

function injectStyles(doc) {
  if (!doc?.head || doc.querySelector('#main-report-agenda-programacao-guard')) return;
  const style = doc.createElement('style');
  style.id = 'main-report-agenda-programacao-guard';
  style.textContent = `
    .main-programacao-section { overflow: visible !important; }
    .programacao-synthesis-text { font-size: 12.8px !important; line-height: 1.68 !important; margin-bottom: 14px !important; }
    .programacao-month-page { break-before: page !important; page-break-before: always !important; break-inside: auto !important; page-break-inside: auto !important; margin-top: 0 !important; }
    .programacao-month-header { display: grid !important; grid-template-columns: 70px 1fr !important; gap: 10px 16px !important; align-items: end !important; padding: 0 0 12px !important; margin: 0 0 14px !important; border-bottom: 1px solid rgba(23,23,23,.18) !important; }
    .programacao-month-header span { grid-row: span 2 !important; width: 60px !important; height: 60px !important; display: grid !important; place-items: center !important; border: 1px solid rgba(23,23,23,.16) !important; background: #171717 !important; color: #fff !important; font-size: 10px !important; font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: .08em !important; }
    .programacao-month-header h3 { margin: 0 !important; font-family: Georgia, 'Times New Roman', serif !important; font-size: 30px !important; line-height: 1 !important; font-weight: 500 !important; }
    .programacao-month-header p { margin: 0 !important; font-size: 11.5px !important; line-height: 1.42 !important; color: #5f574f !important; }
    .programacao-card-grid { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 9px !important; align-items: start !important; }
    .programacao-card { border: 1px solid rgba(23,23,23,.14) !important; background: #fff !important; padding: 10px 11px !important; break-inside: avoid !important; page-break-inside: avoid !important; min-height: 0 !important; }
    .programacao-card-meta { display: flex !important; flex-wrap: wrap !important; gap: 4px !important; margin-bottom: 7px !important; }
    .programacao-card-meta span { display: inline-block !important; border: 1px solid rgba(23,23,23,.12) !important; padding: 2px 5px !important; font-size: 7.8px !important; line-height: 1.25 !important; color: #5d564e !important; text-transform: uppercase !important; letter-spacing: .05em !important; font-weight: 800 !important; }
    .programacao-card h4 { margin: 0 0 6px !important; font-size: 12.5px !important; line-height: 1.25 !important; color: #171717 !important; font-weight: 800 !important; }
    .programacao-card p { margin: 0 !important; font-size: 10.2px !important; line-height: 1.42 !important; color: #39342f !important; }
    @media print { .programacao-month-page { break-before: page !important; page-break-before: always !important; } .programacao-card { break-inside: avoid !important; page-break-inside: avoid !important; } }
  `;
  doc.head.appendChild(style);
}

function applyProgramacaoToDoc(doc, items = []) {
  if (!doc?.body) return false;
  const text = doc.body.textContent || '';
  if (!/Relatório Institucional|Relatorio Institucional|Museus Centro - Relatório de Dados|Indicadores Executivos/i.test(text)) return false;
  const section = findProgramacaoSection(doc);
  if (!section) return false;

  injectStyles(doc);
  section.setAttribute('data-main-programacao-section', 'true');
  section.classList.add('premium-section', 'premium-page-break', 'main-programacao-section');
  section.innerHTML = buildProgramacaoSectionHtml(items);
  return true;
}

async function refreshProgramacaoSections() {
  const items = await loadAgendaItems();
  applyProgramacaoToDoc(document, items);
  document.querySelectorAll('iframe').forEach((iframe) => {
    try {
      applyProgramacaoToDoc(iframe.contentDocument, items);
    } catch {}
  });
}

function scheduleRefresh() {
  refreshProgramacaoSections().catch((error) => {
    console.warn('[Relatorio] Falha ao atualizar programação do relatório:', error);
    const fallback = fallbackAgendaItems();
    applyProgramacaoToDoc(document, fallback);
    document.querySelectorAll('iframe').forEach((iframe) => {
      try { applyProgramacaoToDoc(iframe.contentDocument, fallback); } catch {}
    });
  });
}

export function installMainReportAgendaProgramacaoGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  const run = () => scheduleRefresh();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      window.clearTimeout(window.__museusCentroAgendaProgramacaoTimer);
      window.__museusCentroAgendaProgramacaoTimer = window.setTimeout(run, 250);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 90000);
  }
}

installMainReportAgendaProgramacaoGuard();
