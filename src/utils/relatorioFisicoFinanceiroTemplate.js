const TOTAL_OFICIAL = 1320000;

const memoriaRedacional = new Set();

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(value) {
  return Math.round(toNumber(value));
}

function fmtInt(value) {
  return inteiro(value).toLocaleString('pt-BR');
}

function fmtPublico(value) {
  if (value === null || value === undefined || value === 'N/A') return 'N/A';
  const n = inteiro(value);
  return n > 0 ? n.toLocaleString('pt-BR') : 'N/A';
}

function fmtBRL(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizarTexto(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assinaturaParagrafo(value) {
  return normalizarTexto(value)
    .split(' ')
    .filter((word) => word.length > 3)
    .slice(0, 28)
    .join(' ');
}

function similaridadeTexto(a, b) {
  const wa = new Set(normalizarTexto(a).split(' ').filter((w) => w.length > 4));
  const wb = new Set(normalizarTexto(b).split(' ').filter((w) => w.length > 4));
  if (wa.size === 0 || wb.size === 0) return 0;
  let comum = 0;
  wa.forEach((w) => { if (wb.has(w)) comum += 1; });
  return comum / Math.min(wa.size, wb.size);
}

function paragrafoJaUsado(paragrafo) {
  const assinatura = assinaturaParagrafo(paragrafo);
  if (!assinatura || assinatura.length < 24) return false;
  if (memoriaRedacional.has(assinatura)) return true;
  for (const item of memoriaRedacional) {
    if (similaridadeTexto(assinatura, item) >= 0.82) return true;
  }
  memoriaRedacional.add(assinatura);
  return false;
}

function paragraphize(text) {
  const raw = String(text || '').trim();
  if (!raw) return '<p class="empty-section">Texto não disponível para esta seção.</p>';
  const paragrafos = raw
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !paragrafoJaUsado(p));
  if (paragrafos.length === 0) return '';
  return paragrafos.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

function hasSection(secoesSelecionadas, id) {
  return Array.isArray(secoesSelecionadas) && secoesSelecionadas.includes(id);
}

function categoriaLabel(categoria) {
  const map = {
    gestao_governanca: 'Gestão e Governança',
    producao_operacao: 'Produção e Operações',
    comunicacao_produtos: 'Comunicação',
    atividade_publico: 'Atividades com Público',
  };
  return map[categoria] || 'Eixo Institucional';
}

function categoriaColor(categoria) {
  const map = {
    gestao_governanca: '#1a1a2e',
    producao_operacao: '#16213e',
    comunicacao_produtos: '#0f3460',
    atividade_publico: '#533483',
  };
  return map[categoria] || '#111111';
}

function categoriaBadgeColor(categoria) {
  const map = {
    gestao_governanca: '#e8f4f8',
    producao_operacao: '#f0f7f4',
    comunicacao_produtos: '#f5f0ff',
    atividade_publico: '#fff5e6',
  };
  return map[categoria] || '#f4f4f5';
}

function categoriaBadgeText(categoria) {
  const map = {
    gestao_governanca: '#1a4a6e',
    producao_operacao: '#1a5c3a',
    comunicacao_produtos: '#3d1a8a',
    atividade_publico: '#7a3600',
  };
  return map[categoria] || '#333333';
}

// ===== CURADORIA DE FOTOS =====
// Prioriza fotos com presença humana/ação e descarta duplicatas

function scoreImagem(foto, atividadeNome = '') {
  let score = 50;
  const url = String(foto?.url || foto?.file_url || '').toLowerCase();
  const caption = String(foto?.caption || foto?.legenda || foto?.fileName || '').toLowerCase();
  const ativNorm = atividadeNome.toLowerCase();

  // Penalizar formatos ruins
  if (url.includes('thumb') || url.includes('_s.') || url.includes('_xs.')) score -= 20;
  if (url.includes('placeholder') || url.includes('generic') || url.includes('stock')) score -= 50;

  // Beneficiar fotos vinculadas à atividade
  if (caption.includes(ativNorm.slice(0, 10)) && ativNorm.length > 5) score += 20;

  // Beneficiar fotos de origem mais específica
  if (foto?.origem === 'activity.fotos') score += 30;
  if (foto?.origem === 'activity.attachments') score += 20;
  if (foto?.origem === 'Attachment') score += 15;
  if (foto?.origem === 'report.fotos') score += 10;

  // Beneficiar palavras-chave editoriais na legenda
  const keywords = ['oficina', 'público', 'publico', 'atividade', 'evento', 'artista',
    'mediação', 'mediacao', 'performance', 'exposição', 'exposicao', 'museu', 'arte', 'cultura',
    'noturno', 'viaduto', 'formação', 'formacao', 'criança', 'crianca', 'escola', 'educativo'];
  keywords.forEach(kw => { if (caption.includes(kw)) score += 5; });

  return score;
}

function selecionarFotosCuradas(fotos, atividadeNome = '', max = 4) {
  if (!Array.isArray(fotos) || fotos.length === 0) return [];
  const fotosValidas = fotos.filter(f => {
    const url = f?.url || f?.file_url || '';
    return url && url.startsWith('http');
  });
  const scored = fotosValidas.map(f => ({ ...f, _score: scoreImagem(f, atividadeNome) }));
  scored.sort((a, b) => b._score - a._score);
  // Desduplicar por URL
  const seen = new Set();
  return scored.filter(f => {
    const url = f?.url || f?.file_url || '';
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, max);
}

function selecionarFotoCapa(todasFotos) {
  if (!Array.isArray(todasFotos) || todasFotos.length === 0) return null;
  const validas = todasFotos.filter(f => {
    const url = f?.url || f?.file_url || '';
    return url && url.startsWith('http');
  });
  if (validas.length === 0) return null;
  const scored = validas.map(f => ({
    ...f,
    _score: scoreImagem(f, '') + (f?.origem === 'activity.fotos' ? 40 : 0),
  }));
  scored.sort((a, b) => b._score - a._score);
  return scored[0];
}

// ===== RENDER COMPONENTS =====

function renderFotosAtividade(atividade) {
  const todasFotos = [
    ...(Array.isArray(atividade?.fotos_destaque) ? atividade.fotos_destaque : []),
    ...(Array.isArray(atividade?.fotos_demais) ? atividade.fotos_demais : []),
  ];

  const selecionadas = selecionarFotosCuradas(todasFotos, atividade?.nome || '', 4);
  const demais = selecionarFotosCuradas(todasFotos, atividade?.nome || '', 8).slice(4);

  if (selecionadas.length === 0 && demais.length === 0) {
    return '<p class="no-photo">Registros fotográficos não vinculados.</p>';
  }

  const getUrl = f => escapeHtml(f?.url || f?.file_url || '');
  const getCaption = f => escapeHtml(f?.caption || f?.legenda || f?.fileName || atividade?.nome || 'Registro fotográfico');

  let html = '';

  if (selecionadas.length === 1) {
    html = `<div class="photo-single">
      <figure>
        <img src="${getUrl(selecionadas[0])}" alt="${getCaption(selecionadas[0])}" loading="lazy" />
        <figcaption>${getCaption(selecionadas[0])}</figcaption>
      </figure>
    </div>`;
  } else if (selecionadas.length === 2) {
    html = `<div class="photo-duo">
      ${selecionadas.map(f => `<figure><img src="${getUrl(f)}" alt="${getCaption(f)}" loading="lazy" /><figcaption>${getCaption(f)}</figcaption></figure>`).join('')}
    </div>`;
  } else if (selecionadas.length >= 3) {
    const [first, ...rest] = selecionadas;
    html = `<div class="photo-grid-editorial">
      <figure class="photo-main"><img src="${getUrl(first)}" alt="${getCaption(first)}" loading="lazy" /><figcaption>${getCaption(first)}</figcaption></figure>
      <div class="photo-side">
        ${rest.map(f => `<figure><img src="${getUrl(f)}" alt="${getCaption(f)}" loading="lazy" /><figcaption>${getCaption(f)}</figcaption></figure>`).join('')}
      </div>
    </div>`;
  }

  if (demais.length > 0) {
    html += `<div class="more-photos">
      <p class="more-label">Demais registros</p>
      <div class="photo-strip">
        ${demais.map(f => `<a href="${getUrl(f)}" target="_blank" rel="noopener noreferrer" class="strip-item">
          <img src="${getUrl(f)}" alt="${getCaption(f)}" loading="lazy" />
        </a>`).join('')}
      </div>
    </div>`;
  }

  return html;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getOriginalActivityText(atividade = {}) {
  return cleanText(
    atividade.descricao_original ||
    atividade.descricao ||
    atividade.relato ||
    atividade.observacoes ||
    atividade.resultados ||
    atividade.resultado ||
    atividade.sintese ||
    atividade.sinopse ||
    ''
  );
}

function getDescricaoAtividade(textos, atividade, index) {
  const descricoes = Array.isArray(textos?.atividades_descricoes) ? textos.atividades_descricoes : [];
  const byIndex = descricoes.find((item) => Number(item?.indice) === index + 1) || descricoes[index];
  const generated = cleanText(byIndex?.descricao);
  const original = getOriginalActivityText(atividade);
  if (generated) return generated;
  if (original) return original;
  const partes = [
    atividade?.nome
      ? `A atividade "${atividade.nome}" foi realizada no período consolidado.`
      : 'Atividade consolidada a partir dos relatórios aprovados.',
    atividade?.publico && atividade.publico !== 'N/A'
      ? `O público registrado foi de ${fmtPublico(atividade.publico)} participantes.`
      : '',
    atividade?.local ? `Local de realização: ${atividade.local}.` : '',
  ].filter(Boolean);
  return partes.join(' ');
}

function renderAtividadesPorCategoria(contexto, textos, categoria) {
  const atividades = contexto?.atividades_por_categoria?.[categoria] || [];
  if (!Array.isArray(atividades) || atividades.length === 0) {
    return '<p class="empty-section">Nenhum registro localizado para este eixo no período consolidado.</p>';
  }

  const cor = categoriaColor(categoria);
  const badgeBg = categoriaBadgeColor(categoria);
  const badgeTxt = categoriaBadgeText(categoria);

  return atividades.map((atividade) => {
    const globalIndex = (contexto.atividades || []).findIndex((a) => a.id === atividade.id);
    const index = globalIndex >= 0 ? globalIndex : 0;
    const descricao = getDescricaoAtividade(textos, atividade, index);
    const temPublico = atividade.publico && atividade.publico !== 'N/A';
    const temData = atividade.data || atividade.mes;
    const temLocal = atividade.local;

    return `
      <article class="activity-card" style="--cat-color: ${cor}; --badge-bg: ${badgeBg}; --badge-txt: ${badgeTxt};">
        <div class="activity-card-inner">
          <div class="activity-card-content">
            <div class="activity-eyebrow">
              <span class="cat-badge">${escapeHtml(categoriaLabel(atividade.categoria_editorial))}</span>
              ${atividade.museu ? `<span class="museu-badge">${escapeHtml(atividade.museu)}</span>` : ''}
            </div>

            <h3 class="activity-title">${escapeHtml(atividade.nome || 'Atividade sem título')}</h3>

            ${(temData || temLocal) ? `
            <div class="activity-meta-tags">
              ${atividade.mes ? `<span>${escapeHtml(atividade.mes)}${atividade.ano ? `/${atividade.ano}` : ''}</span>` : ''}
              ${atividade.data ? `<span>${escapeHtml(String(atividade.data).slice(0, 10))}</span>` : ''}
              ${temLocal ? `<span>${escapeHtml(atividade.local)}</span>` : ''}
              ${atividade.classificacao ? `<span>${escapeHtml(atividade.classificacao)}</span>` : ''}
              ${atividade.equipe ? `<span>${escapeHtml(atividade.equipe)}</span>` : ''}
            </div>` : ''}

            <div class="activity-desc">${paragraphize(descricao)}</div>
          </div>

          ${temPublico ? `
          <aside class="activity-kpi-aside">
            <div class="kpi-bubble">
              <span class="kpi-label">Público</span>
              <span class="kpi-value">${fmtPublico(atividade.publico)}</span>
              <span class="kpi-sub">participantes</span>
            </div>
          </aside>` : ''}
        </div>

        <div class="activity-photos">
          ${renderFotosAtividade(atividade)}
        </div>
      </article>
    `;
  }).join('');
}

function renderQuadroSintetico(contexto) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  if (atividades.length === 0) return '<p class="empty-section">Nenhuma atividade encontrada no período.</p>';

  const rows = atividades.map((a) => `
    <tr>
      <td class="act-name">${escapeHtml(a.nome || 'Atividade')}</td>
      <td><span class="table-badge">${escapeHtml(categoriaLabel(a.categoria_editorial))}</span></td>
      <td>${escapeHtml(a.museu || '—')}</td>
      <td>${escapeHtml(a.mes || '—')}</td>
      <td class="num">${fmtPublico(a.publico)}</td>
    </tr>
  `).join('');

  return `
    <div class="table-scroll">
      <table class="editorial-table">
        <thead>
          <tr>
            <th>Atividade</th>
            <th>Eixo</th>
            <th>Museu</th>
            <th>Mês</th>
            <th class="num">Público</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderPorMuseu(porMuseu) {
  const museus = Object.values(porMuseu || {});
  if (museus.length === 0) return '';

  const items = museus.map(m => `
    <div class="museu-stat">
      <div class="museu-sigla">${escapeHtml(m.museu || '?')}</div>
      <div class="museu-nums">
        <div class="museu-num-item"><strong>${fmtInt(m.atividades)}</strong><small>atividades</small></div>
        ${m.publico > 0 ? `<div class="museu-num-item"><strong>${fmtInt(m.publico)}</strong><small>público</small></div>` : ''}
      </div>
    </div>
  `).join('');

  return `<div class="museu-stats-grid">${items}</div>`;
}

function renderCompras(compras) {
  if (!Array.isArray(compras) || compras.length === 0) {
    return '<p class="empty-section">Nenhuma transação registrada no período.</p>';
  }

  const rows = compras.slice(0, 30).map(c => `
    <tr>
      <td class="act-name">${escapeHtml(c.descricao || '—')}</td>
      <td>${escapeHtml(c.fornecedor || '—')}</td>
      <td>${escapeHtml(c.rubrica || '—')}</td>
      <td><span class="status-badge status-${escapeHtml(String(c.status || '').toLowerCase())}">${escapeHtml(c.status || '—')}</span></td>
      <td class="num">${fmtBRL(c.valor)}</td>
    </tr>
  `).join('');

  return `
    <div class="table-scroll">
      <table class="editorial-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Fornecedor</th>
            <th>Rubrica</th>
            <th>Status</th>
            <th class="num">Valor</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ===== MAIN TEMPLATE =====

export function montarHtmlRelatorioFisicoFinanceiro({
  contexto = {},
  textos = {},
  secoesSelecionadas = [],
  filtros = {},
} = {}) {
  memoriaRedacional.clear();

  const periodo = escapeHtml(contexto.periodo_extenso || '2 de fevereiro a 30 de abril de 2026');
  const museu = escapeHtml(filtros.museu || contexto.museu || 'Todos os museus');
  const percentualExecucao = toNumber(contexto.percentual_execucao).toFixed(1).replace('.', ',');
  const todasFotos = Array.isArray(contexto.fotos) ? contexto.fotos : [];
  const fotoCapa = selecionarFotoCapa(todasFotos);
  const fotoCovUrl = fotoCapa ? escapeHtml(fotoCapa?.url || fotoCapa?.file_url || '') : '';

  // Totais por eixo
  const atividadesPorCat = contexto.atividades_por_categoria || {};
  const totalPorEixo = {
    gestao_governanca: (atividadesPorCat.gestao_governanca || []).length,
    producao_operacao: (atividadesPorCat.producao_operacao || []).length,
    comunicacao_produtos: (atividadesPorCat.comunicacao_produtos || []).length,
    atividade_publico: (atividadesPorCat.atividade_publico || []).length,
  };

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Museus Centro — Relatório Institucional 2026</title>
<style>
  /* ============================
     TOKENS & RESET
  ============================= */
  :root {
    --ink: #111111;
    --ink-light: #444444;
    --muted: #777777;
    --muted-light: #aaaaaa;
    --line: #e4e4e7;
    --line-strong: #d1d5db;
    --paper: #ffffff;
    --page-bg: #f5f5f4;
    --accent: #111111;
    --accent-warm: #c8a96e;
    --cover-dark: rgba(10,10,20,0.55);
    --radius: 16px;
    --radius-sm: 10px;
    --radius-xs: 6px;
    --font-main: 'Georgia', 'Times New Roman', serif;
    --font-ui: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--font-ui);
    color: var(--ink);
    background: var(--page-bg);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    padding: 24px 16px 48px;
  }

  /* ============================
     ACTIONS BAR
  ============================= */
  .actions-bar {
    max-width: 1080px;
    margin: 0 auto 20px;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
  }

  .btn {
    border: 0;
    padding: 10px 18px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    font-family: var(--font-ui);
    letter-spacing: .02em;
    transition: opacity .15s;
  }
  .btn:hover { opacity: .8; }
  .btn-primary { background: var(--ink); color: white; }
  .btn-secondary { background: white; color: var(--ink); border: 1.5px solid var(--line-strong); }

  /* ============================
     PAGE WRAPPER
  ============================= */
  .page {
    background: var(--paper);
    max-width: 1080px;
    margin: 0 auto 28px;
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: 0 8px 48px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04);
  }

  .page-inner {
    padding: 56px 64px;
  }

  /* ============================
     COVER
  ============================= */
  .cover-page {
    min-height: 680px;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    overflow: hidden;
    background: #0a0a12;
  }

  .cover-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .cover-bg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
  }

  .cover-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(5,5,15,0.2) 0%,
      rgba(5,5,15,0.35) 40%,
      rgba(5,5,15,0.72) 70%,
      rgba(5,5,15,0.90) 100%
    );
    z-index: 1;
  }

  .cover-content {
    position: relative;
    z-index: 2;
    padding: 56px 64px;
  }

  .cover-eyebrow {
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .22em;
    color: rgba(255,255,255,.55);
    margin-bottom: 20px;
  }

  .cover-title {
    font-family: var(--font-main);
    font-size: 52px;
    line-height: 1.05;
    letter-spacing: -.03em;
    color: #ffffff;
    margin-bottom: 12px;
    max-width: 680px;
  }

  .cover-subtitle {
    font-family: var(--font-ui);
    font-size: 14px;
    line-height: 1.65;
    color: rgba(255,255,255,.72);
    max-width: 560px;
    margin-bottom: 36px;
  }

  .cover-kpis {
    display: flex;
    gap: 0;
    flex-wrap: wrap;
    border-top: 1px solid rgba(255,255,255,.15);
    padding-top: 28px;
    margin-bottom: 28px;
  }

  .cover-kpi {
    padding: 0 32px 0 0;
    margin-right: 32px;
    border-right: 1px solid rgba(255,255,255,.12);
  }
  .cover-kpi:last-child { border-right: 0; }

  .cover-kpi-label {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .14em;
    color: rgba(255,255,255,.45);
    display: block;
    margin-bottom: 6px;
  }

  .cover-kpi-value {
    font-family: var(--font-main);
    font-size: 26px;
    font-weight: normal;
    color: #ffffff;
    display: block;
    line-height: 1;
  }

  .cover-footer-line {
    font-family: var(--font-ui);
    font-size: 10px;
    letter-spacing: .15em;
    text-transform: uppercase;
    color: rgba(255,255,255,.35);
    border-top: 1px solid rgba(255,255,255,.1);
    padding-top: 16px;
  }

  /* ============================
     SECTION OPENER
  ============================= */
  .section-opener {
    padding: 48px 64px 32px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 40px;
  }

  .section-number {
    font-family: var(--font-ui);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .2em;
    color: var(--muted);
    display: block;
    margin-bottom: 12px;
  }

  .section-title {
    font-family: var(--font-main);
    font-size: 36px;
    line-height: 1.1;
    letter-spacing: -.025em;
    color: var(--ink);
    margin-bottom: 14px;
  }

  .section-lead {
    font-family: var(--font-main);
    font-size: 16px;
    line-height: 1.75;
    color: var(--ink-light);
    max-width: 680px;
  }

  /* ============================
     TYPOGRAPHY
  ============================= */
  h2 {
    font-family: var(--font-main);
    font-size: 26px;
    font-weight: normal;
    letter-spacing: -.02em;
    line-height: 1.2;
    color: var(--ink);
    margin: 52px 0 18px;
    padding-bottom: 12px;
    border-bottom: 2px solid var(--ink);
  }

  h3 {
    font-family: var(--font-main);
    font-size: 20px;
    font-weight: normal;
    letter-spacing: -.015em;
    line-height: 1.3;
    color: var(--ink);
    margin: 0 0 10px;
  }

  p {
    font-family: var(--font-ui);
    font-size: 14.5px;
    line-height: 1.8;
    color: #333333;
    margin: 0 0 16px;
  }

  a {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
    word-break: break-word;
  }

  .empty-section {
    font-style: italic;
    color: var(--muted);
    font-size: 13px;
    padding: 16px 0;
  }

  /* ============================
     KPI GRID — INTRO
  ============================= */
  .kpis-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin: 36px 0;
  }

  .kpi-card {
    border: 1.5px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 20px 18px;
  }

  .kpi-card.kpi-dark {
    background: var(--ink);
    border-color: var(--ink);
    color: white;
  }

  .kpi-card-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .14em;
    color: var(--muted);
    display: block;
    margin-bottom: 10px;
  }
  .kpi-card.kpi-dark .kpi-card-label { color: rgba(255,255,255,.5); }

  .kpi-card-value {
    font-family: var(--font-main);
    font-size: 28px;
    line-height: 1;
    display: block;
    color: var(--ink);
  }
  .kpi-card.kpi-dark .kpi-card-value { color: white; }

  /* ============================
     MUSEU STATS
  ============================= */
  .museu-stats-grid {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin: 24px 0;
  }

  .museu-stat {
    flex: 1;
    min-width: 140px;
    border: 1.5px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 20px;
    text-align: center;
  }

  .museu-sigla {
    font-family: var(--font-main);
    font-size: 22px;
    font-weight: normal;
    color: var(--ink);
    letter-spacing: .05em;
    margin-bottom: 12px;
  }

  .museu-nums { display: flex; gap: 16px; justify-content: center; }

  .museu-num-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .museu-num-item strong {
    font-family: var(--font-main);
    font-size: 20px;
    font-weight: normal;
  }

  .museu-num-item small {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--muted);
    font-weight: 700;
  }

  /* ============================
     ACTIVITY CARDS
  ============================= */
  .activity-card {
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    margin: 0 0 28px;
    page-break-inside: avoid;
    transition: border-color .2s;
  }

  .activity-card:hover { border-color: var(--line-strong); }

  .activity-card-inner {
    display: flex;
    gap: 0;
    align-items: stretch;
  }

  .activity-card-content {
    flex: 1;
    padding: 28px 28px 24px;
    min-width: 0;
  }

  .activity-eyebrow {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
    align-items: center;
  }

  .cat-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12em;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--badge-bg);
    color: var(--badge-txt);
  }

  .museu-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .1em;
    padding: 4px 10px;
    border-radius: 999px;
    background: #f4f4f5;
    color: #555;
    border: 1px solid var(--line);
  }

  .activity-title {
    font-family: var(--font-main);
    font-size: 19px;
    font-weight: normal;
    line-height: 1.3;
    margin: 0 0 12px;
    color: var(--ink);
  }

  .activity-meta-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .activity-meta-tags span {
    font-size: 10.5px;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 10px;
    color: var(--ink-light);
  }

  .activity-desc p {
    font-size: 13.5px;
    line-height: 1.75;
    color: #444;
  }

  .activity-kpi-aside {
    min-width: 110px;
    background: var(--page-bg);
    border-left: 1.5px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
  }

  .kpi-bubble {
    text-align: center;
  }

  .kpi-label {
    display: block;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .kpi-value {
    display: block;
    font-family: var(--font-main);
    font-size: 26px;
    line-height: 1;
    color: var(--ink);
    margin-bottom: 5px;
  }

  .kpi-sub {
    display: block;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--muted-light);
  }

  .activity-photos {
    border-top: 1.5px solid var(--line);
    padding: 20px 28px;
    background: #fafafa;
  }

  /* ============================
     PHOTO LAYOUTS
  ============================= */
  .photo-single figure {
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: #f3f4f6;
    border: 1px solid var(--line);
  }

  .photo-single img {
    width: 100%;
    height: 320px;
    object-fit: cover;
    display: block;
  }

  .photo-duo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .photo-duo figure {
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--line);
    background: #f3f4f6;
  }

  .photo-duo figure img {
    width: 100%;
    height: 220px;
    object-fit: cover;
    display: block;
  }

  .photo-grid-editorial {
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 14px;
    align-items: stretch;
  }

  .photo-main {
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--line);
    background: #f3f4f6;
  }

  .photo-main img {
    width: 100%;
    height: 280px;
    object-fit: cover;
    display: block;
  }

  .photo-side {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .photo-side figure {
    flex: 1;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--line);
    background: #f3f4f6;
  }

  .photo-side figure img {
    width: 100%;
    height: 130px;
    object-fit: cover;
    display: block;
  }

  figure figcaption {
    padding: 8px 12px;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.4;
    font-style: italic;
  }

  .more-photos {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }

  .more-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    margin-bottom: 10px;
  }

  .photo-strip {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .strip-item {
    display: block;
    width: 80px;
    height: 60px;
    border-radius: var(--radius-xs);
    overflow: hidden;
    border: 1px solid var(--line);
    flex-shrink: 0;
  }

  .strip-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform .3s;
  }

  .strip-item:hover img { transform: scale(1.05); }

  .no-photo {
    font-size: 11.5px;
    color: var(--muted);
    font-style: italic;
    padding: 8px 0;
  }

  /* ============================
     TABLES
  ============================= */
  .table-scroll { overflow-x: auto; margin: 16px 0 28px; }

  .editorial-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }

  .editorial-table th {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    padding: 10px 12px;
    text-align: left;
    border-bottom: 2px solid var(--ink);
    white-space: nowrap;
  }

  .editorial-table td {
    padding: 11px 12px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
    color: var(--ink-light);
  }

  .editorial-table tr:last-child td { border-bottom: 0; }
  .editorial-table tr:hover td { background: #fafafa; }

  .act-name { font-weight: 600; color: var(--ink); }

  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }

  .table-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    padding: 3px 8px;
    border-radius: 999px;
    background: #f4f4f5;
    color: #444;
    white-space: nowrap;
  }

  .status-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    padding: 3px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .status-aprovado_coord, .status-aprovado_admin, .status-aprovado, .status-pago {
    background: #d1fae5;
    color: #065f46;
  }

  .status-solicitado {
    background: #dbeafe;
    color: #1e40af;
  }

  .status-recusado, .status-cancelado {
    background: #fee2e2;
    color: #991b1b;
  }

  .status-devolvido, .status-rascunho {
    background: #fef9c3;
    color: #854d0e;
  }

  /* ============================
     FINANCIAL SECTION
  ============================= */
  .financial-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 24px 0 32px;
  }

  .fin-row {
    border: 1.5px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 20px;
  }

  .fin-row.fin-dark {
    background: var(--ink);
    border-color: var(--ink);
    color: white;
  }

  .fin-row.fin-full { grid-column: 1 / -1; }

  .fin-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .14em;
    color: var(--muted);
    display: block;
    margin-bottom: 10px;
  }

  .fin-row.fin-dark .fin-label { color: rgba(255,255,255,.5); }

  .fin-value {
    font-family: var(--font-main);
    font-size: 26px;
    line-height: 1;
    display: block;
  }

  .fin-row.fin-dark .fin-value { color: white; }

  /* ============================
     EIXOS SUMMARY
  ============================= */
  .eixos-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin: 28px 0;
  }

  .eixo-card {
    border: 1.5px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 18px;
    text-align: center;
  }

  .eixo-num {
    font-family: var(--font-main);
    font-size: 28px;
    color: var(--ink);
    line-height: 1;
    margin-bottom: 8px;
  }

  .eixo-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--muted);
    line-height: 1.4;
  }

  /* ============================
     DIVIDER / BREATH PAGES
  ============================= */
  .divider-line {
    border: none;
    border-top: 1px solid var(--line);
    margin: 48px 0;
  }

  .divider-heavy {
    border: none;
    border-top: 2px solid var(--ink);
    margin: 52px 0;
  }

  .breath-block {
    background: var(--page-bg);
    border-radius: var(--radius);
    padding: 40px 48px;
    margin: 32px 0;
  }

  .breath-quote {
    font-family: var(--font-main);
    font-size: 20px;
    line-height: 1.65;
    color: var(--ink-light);
    font-style: italic;
    border-left: 3px solid var(--ink);
    padding-left: 24px;
    margin: 0;
  }

  /* ============================
     FOOTER
  ============================= */
  .report-footer {
    padding: 32px 64px 40px;
    border-top: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
  }

  .footer-brand {
    font-family: var(--font-main);
    font-size: 15px;
    color: var(--ink);
    letter-spacing: -.01em;
  }

  .footer-meta {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.6;
    text-align: right;
  }

  /* ============================
     PRINT
  ============================= */
  @media print {
    body { background: white; padding: 0; }
    .actions-bar { display: none; }
    .page {
      box-shadow: none;
      margin: 0;
      max-width: none;
      border-radius: 0;
      page-break-after: always;
    }
    .page-inner { padding: 40px 48px; }
    .cover-content { padding: 40px 48px; }
    .activity-card, figure, .editorial-table { page-break-inside: avoid; }
    h2 { page-break-after: avoid; }
  }
</style>
</head>
<body>

  <div class="actions-bar">
    <button class="btn btn-secondary" onclick="window.print()">Salvar como PDF</button>
    <button class="btn btn-primary" onclick="window.print()">Imprimir</button>
  </div>

  <!-- ====== CAPA ====== -->
  ${hasSection(secoesSelecionadas, 'capa') ? `
  <div class="page">
    <div class="cover-page">
      <div class="cover-bg">
        ${fotoCovUrl
          ? `<img src="${fotoCovUrl}" alt="Imagem de capa — Museus Centro" />`
          : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#0a0a1a 0%,#1a1040 50%,#0a0a12 100%);"></div>`
        }
      </div>
      <div class="cover-overlay"></div>
      <div class="cover-content">
        <div class="cover-eyebrow">Museus Centro · Relatório Institucional Consolidado · ${new Date().getFullYear()}</div>
        <h1 class="cover-title">Museus Centro<br>Relatório Anual 2026</h1>
        <p class="cover-subtitle">Território, memória, cultura e transformação social no centro de Belo Horizonte. ${museu !== 'Todos os museus' ? `Museu: ${museu}.` : ''} Período: ${periodo}.</p>

        <div class="cover-kpis">
          <div class="cover-kpi">
            <span class="cover-kpi-label">Relatórios</span>
            <span class="cover-kpi-value">${fmtInt(contexto.total_relatorios)}</span>
          </div>
          <div class="cover-kpi">
            <span class="cover-kpi-label">Público</span>
            <span class="cover-kpi-value">${fmtInt(contexto.publico_total)}</span>
          </div>
          <div class="cover-kpi">
            <span class="cover-kpi-label">Atividades</span>
            <span class="cover-kpi-value">${fmtInt(contexto.total_atividades)}</span>
          </div>
          <div class="cover-kpi">
            <span class="cover-kpi-label">Execução</span>
            <span class="cover-kpi-value">${percentualExecucao}%</span>
          </div>
        </div>

        <div class="cover-footer-line">MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus</div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- ====== INTRODUÇÃO ====== -->
  ${hasSection(secoesSelecionadas, 'introducao') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">01 — Apresentação</span>
      <h2 class="section-title">Introdução</h2>
      ${textos.introducao ? `<p class="section-lead">${escapeHtml(String(textos.introducao).slice(0, 300))}...</p>` : ''}
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.introducao)}
      ${textos.contexto_territorial ? `
      <div class="breath-block">
        <blockquote class="breath-quote">${escapeHtml(String(textos.contexto_territorial || '').slice(0, 400))}</blockquote>
      </div>` : ''}
    </div>
  </div>
  ` : ''}

  <!-- ====== RESUMO GERAL ====== -->
  ${hasSection(secoesSelecionadas, 'resumo_geral') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">02 — Período</span>
      <h2 class="section-title">Resumo do período</h2>
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.resumo_geral)}

      <div class="kpis-grid">
        <div class="kpi-card kpi-dark">
          <span class="kpi-card-label">Relatórios aprovados</span>
          <span class="kpi-card-value">${fmtInt(contexto.total_relatorios)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card-label">Público total</span>
          <span class="kpi-card-value">${fmtInt(contexto.publico_total)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card-label">Atividades</span>
          <span class="kpi-card-value">${fmtInt(contexto.total_atividades)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card-label">Programação</span>
          <span class="kpi-card-value">${fmtInt(contexto.programacao_total)}</span>
        </div>
      </div>

      ${Object.keys(contexto.por_museu || {}).length > 0 ? `
      <h2>Distribuição por museu</h2>
      ${renderPorMuseu(contexto.por_museu)}` : ''}
    </div>
  </div>
  ` : ''}

  <!-- ====== PÚBLICO ====== -->
  ${hasSection(secoesSelecionadas, 'publico') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">03 — Alcance</span>
      <h2 class="section-title">Público alcançado</h2>
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.publico_alcancado)}
    </div>
  </div>
  ` : ''}

  <!-- ====== ATIVIDADES ====== -->
  ${hasSection(secoesSelecionadas, 'atividades') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">04 — Ações e Projetos</span>
      <h2 class="section-title">Atividades realizadas</h2>
      <p class="section-lead">Documentação consolidada das ações executadas no período, organizadas por eixo institucional a partir dos relatórios aprovados pela coordenação.</p>
    </div>
    <div class="page-inner" style="padding-top:0">

      <div class="eixos-summary">
        <div class="eixo-card">
          <div class="eixo-num">${totalPorEixo.gestao_governanca}</div>
          <div class="eixo-label">Gestão e Governança</div>
        </div>
        <div class="eixo-card">
          <div class="eixo-num">${totalPorEixo.producao_operacao}</div>
          <div class="eixo-label">Produção e Operações</div>
        </div>
        <div class="eixo-card">
          <div class="eixo-num">${totalPorEixo.comunicacao_produtos}</div>
          <div class="eixo-label">Comunicação</div>
        </div>
        <div class="eixo-card">
          <div class="eixo-num">${totalPorEixo.atividade_publico}</div>
          <div class="eixo-label">Atividades com Público</div>
        </div>
      </div>

      <hr class="divider-heavy">

      <h2>Gestão e Governança</h2>
      ${textos.capitulos?.gestao_governanca ? `<div class="breath-block"><blockquote class="breath-quote">${escapeHtml(String(textos.capitulos.gestao_governanca).slice(0, 320))}</blockquote></div>` : ''}
      ${renderAtividadesPorCategoria(contexto, textos, 'gestao_governanca')}

      <hr class="divider-line">

      <h2>Produção e Operações</h2>
      ${textos.capitulos?.producao_operacao ? `<div class="breath-block"><blockquote class="breath-quote">${escapeHtml(String(textos.capitulos.producao_operacao).slice(0, 320))}</blockquote></div>` : ''}
      ${renderAtividadesPorCategoria(contexto, textos, 'producao_operacao')}

      <hr class="divider-line">

      <h2>Comunicação</h2>
      ${textos.capitulos?.comunicacao_produtos ? `<div class="breath-block"><blockquote class="breath-quote">${escapeHtml(String(textos.capitulos.comunicacao_produtos).slice(0, 320))}</blockquote></div>` : ''}
      ${renderAtividadesPorCategoria(contexto, textos, 'comunicacao_produtos')}

      <hr class="divider-line">

      <h2>Atividades com Público</h2>
      ${textos.capitulos?.atividade_publico ? `<div class="breath-block"><blockquote class="breath-quote">${escapeHtml(String(textos.capitulos.atividade_publico).slice(0, 320))}</blockquote></div>` : ''}
      ${renderAtividadesPorCategoria(contexto, textos, 'atividade_publico')}

      <hr class="divider-heavy">

      <h2>Quadro sintético das ações</h2>
      ${renderQuadroSintetico(contexto)}
    </div>
  </div>
  ` : ''}

  <!-- ====== FINANCEIRO ====== -->
  ${hasSection(secoesSelecionadas, 'financeiro') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">05 — Execução Financeira</span>
      <h2 class="section-title">Orçamento e execução</h2>
      <p class="section-lead">Síntese da execução orçamentária do 3º Termo Aditivo, com base nos lançamentos aprovados e nas rubricas oficiais do projeto.</p>
    </div>
    <div class="page-inner" style="padding-top:0">

      <div class="financial-summary">
        <div class="fin-row fin-dark">
          <span class="fin-label">Orçamento oficial — 3º Aditivo</span>
          <span class="fin-value">${fmtBRL(TOTAL_OFICIAL)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Valor utilizado</span>
          <span class="fin-value">${fmtBRL(contexto.valor_utilizado)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Saldo disponível</span>
          <span class="fin-value">${fmtBRL(contexto.saldo)}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Percentual de execução</span>
          <span class="fin-value">${percentualExecucao}%</span>
        </div>
      </div>

      ${contexto.compras?.length > 0 ? `
      <h2>Transações do período</h2>
      ${renderCompras(contexto.compras)}` : ''}
    </div>
  </div>
  ` : ''}

  <!-- ====== PRESTAÇÃO ====== -->
  ${hasSection(secoesSelecionadas, 'prestacao') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">06 — Prestação de Contas</span>
      <h2 class="section-title">Prestação de contas</h2>
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.prestacao)}
    </div>
  </div>
  ` : ''}

  <!-- ====== CONCLUSÃO ====== -->
  ${hasSection(secoesSelecionadas, 'conclusao') ? `
  <div class="page">
    <div class="section-opener">
      <span class="section-number">07 — Encerramento</span>
      <h2 class="section-title">Conclusão</h2>
    </div>
    <div class="page-inner" style="padding-top:0">
      ${paragraphize(textos.conclusao)}
    </div>
    <div class="report-footer">
      <div class="footer-brand">Museus Centro</div>
      <div class="footer-meta">
        MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus<br>
        Plataforma de gestão cultural — ${periodo}<br>
        Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
      </div>
    </div>
  </div>
  ` : ''}

</body>
</html>`;
}

export default montarHtmlRelatorioFisicoFinanceiro;