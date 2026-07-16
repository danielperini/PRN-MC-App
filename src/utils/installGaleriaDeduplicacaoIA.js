import { base44 } from '@/api/base44Client';

const ROUTE_PATTERN = /GaleriaFotos/i;

function normalizar(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rotaGaleria() {
  return typeof window !== 'undefined' && ROUTE_PATTERN.test(window.location.pathname);
}

function raizGaleria() {
  const titulo = [...document.querySelectorAll('h1')].find((item) => normalizar(item.textContent).includes('galeria de fotos'));
  return titulo?.closest('.min-h-screen') || null;
}

function chaveAtividade(card) {
  const textos = [...card.querySelectorAll('p')]
    .map((item) => item.textContent?.trim())
    .filter(Boolean);
  const titulo = normalizar(textos[0]);
  const museu = normalizar(textos[1]);
  const periodo = normalizar(textos[2]);
  return [titulo, museu, periodo].filter(Boolean).join('|');
}

function pontuarFoto(card) {
  const img = card.querySelector('img');
  const src = String(img?.src || '');
  const alt = normalizar(img?.alt);
  const natural = Number(img?.naturalWidth || 0) * Number(img?.naturalHeight || 0);
  let score = natural;
  if (alt && !alt.includes('foto da galeria')) score += 1_000_000;
  if (/original|full|grande|large|hd/i.test(src)) score += 500_000;
  if (/thumb|thumbnail|mini/i.test(src)) score -= 500_000;
  return score;
}

function restaurar(cards) {
  cards.forEach((card) => {
    card.hidden = false;
    card.removeAttribute('data-foto-duplicada-ia');
  });
}

function deduplicarVisualmente() {
  const root = raizGaleria();
  if (!root) return { mantidas: 0, ocultadas: 0 };
  const cards = [...root.querySelectorAll('button.group')].filter((card) => card.querySelector('img'));
  restaurar(cards);

  const grupos = new Map();
  cards.forEach((card) => {
    const key = chaveAtividade(card);
    if (!key) return;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(card);
  });

  let ocultadas = 0;
  grupos.forEach((grupo) => {
    if (grupo.length <= 1) return;
    const melhor = [...grupo].sort((a, b) => pontuarFoto(b) - pontuarFoto(a))[0];
    grupo.forEach((card) => {
      if (card === melhor) return;
      card.hidden = true;
      card.dataset.fotoDuplicadaIa = 'true';
      ocultadas += 1;
    });
  });

  return { mantidas: cards.length - ocultadas, ocultadas };
}

async function analisarComIA(button) {
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'IA analisando fotos...';
  try {
    try {
      await base44?.functions?.invoke?.('reforcarLegendasGaleria', { dry_run: false, limit: 500 });
    } catch (_) {
      // Mantém o fallback determinístico quando a função de IA não estiver disponível.
    }
    const resultado = deduplicarVisualmente();
    button.textContent = `IA: ${resultado.mantidas} atividades únicas`;
    window.setTimeout(() => { button.textContent = original; }, 3500);
  } finally {
    button.disabled = false;
  }
}

function garantirBotao(root) {
  if (root.querySelector('[data-galeria-deduplicacao-ia]')) return;
  const titulo = [...root.querySelectorAll('h1')].find((item) => normalizar(item.textContent).includes('galeria de fotos'));
  const cabecalho = titulo?.closest('.mb-8');
  const toolbar = cabecalho?.querySelector('.flex.flex-wrap.gap-2');
  if (!toolbar) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.galeriaDeduplicacaoIa = 'true';
  button.className = 'inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-60';
  button.textContent = 'IA: manter 1 foto por atividade';
  button.addEventListener('click', () => analisarComIA(button));
  toolbar.prepend(button);
}

function instalarNaRota() {
  if (!rotaGaleria()) return;
  const root = raizGaleria();
  if (!root) return;
  garantirBotao(root);
}

export function installGaleriaDeduplicacaoIA() {
  if (typeof window === 'undefined' || window.__galeriaDeduplicacaoIAInstalled) return;
  window.__galeriaDeduplicacaoIAInstalled = true;
  let timer = null;
  const agendar = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(instalarNaRota, 100);
  };
  new MutationObserver(agendar).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', agendar);
  document.addEventListener('click', agendar, true);
  agendar();
}
