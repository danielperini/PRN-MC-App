const TOTAL_OFICIAL = 1320000;

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

function paragraphize(text) {
  const raw = String(text || '').trim();
  if (!raw) return '<p>Texto não disponível para esta seção.</p>';

  return raw
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');
}

function hasSection(secoesSelecionadas, id) {
  return Array.isArray(secoesSelecionadas) && secoesSelecionadas.includes(id);
}

function renderRows(rows, emptyMessage, columns) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<tr><td colspan="${columns}">${escapeHtml(emptyMessage)}</td></tr>`;
  }

  return rows.join('');
}

export function montarHtmlRelatorioFisicoFinanceiro({
  contexto = {},
  textos = {},
  secoesSelecionadas = [],
  filtros = {},
} = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  const compras = Array.isArray(contexto.compras) ? contexto.compras : [];
  const fotos = Array.isArray(contexto.fotos) ? contexto.fotos : [];
  const porMuseu = contexto.por_museu && typeof contexto.por_museu === 'object'
    ? contexto.por_museu
    : {};

  const atividadesRows = atividades.slice(0, 180).map((a) => `
    <tr>
      <td>${escapeHtml(a.nome || 'Atividade sem título')}</td>
      <td>${escapeHtml(a.museu || '')}</td>
      <td>${escapeHtml(a.mes || '')}</td>
      <td>${escapeHtml(a.classificacao || '')}</td>
      <td class="num">${fmtInt(a.publico)}</td>
    </tr>
  `);

  const museuRows = Object.values(porMuseu).map((m) => `
    <tr>
      <td>${escapeHtml(m.museu || '')}</td>
      <td class="num">${fmtInt(m.atividades)}</td>
      <td class="num">${fmtInt(m.publico)}</td>
    </tr>
  `);

  const compraRows = compras.slice(0, 180).map((c) => `
    <tr>
      <td>${escapeHtml(c.descricao || 'Solicitação de compra')}</td>
      <td>${escapeHtml(c.fornecedor || '')}</td>
      <td>${escapeHtml(c.rubrica || '')}</td>
      <td>${escapeHtml(c.status || '')}</td>
      <td class="num">${fmtBRL(c.valor)}</td>
    </tr>
  `);

  const fotoBlocks = fotos.slice(0, 30).map((foto) => `
    <figure>
      <img src="${escapeHtml(foto.url || '')}" alt="${escapeHtml(foto.caption || foto.fileName || 'Foto')}" />
      <figcaption>${escapeHtml(foto.caption || foto.fileName || 'Registro fotográfico')}</figcaption>
    </figure>
  `).join('');

  const periodo = `${escapeHtml(filtros.dateFrom || '')} a ${escapeHtml(filtros.dateTo || '')}`;
  const museu = escapeHtml(filtros.museu || contexto.museu || 'Todos os museus');
  const percentualExecucao = toNumber(contexto.percentual_execucao).toFixed(1).replace('.', ',');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Relatório Físico-Financeiro Museus Centro</title>
<style>
  :root {
    --ink: #111111;
    --muted: #5f6368;
    --line: #e5e7eb;
    --paper: #ffffff;
    --page: #f4f4f5;
  }

  * { box-sizing: border-box; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    color: var(--ink);
    background: var(--page);
    margin: 0;
    padding: 32px;
  }

  .actions {
    max-width: 1040px;
    margin: 0 auto 24px auto;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  button {
    background: var(--ink);
    color: white;
    border: 0;
    padding: 10px 14px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 13px;
  }

  button.secondary {
    background: white;
    color: var(--ink);
    border: 1px solid #cccccc;
  }

  .page {
    background: var(--paper);
    max-width: 1040px;
    margin: 0 auto 24px auto;
    padding: 56px;
    box-shadow: 0 10px 40px rgba(0,0,0,.08);
    border-radius: 18px;
  }

  .cover {
    min-height: 760px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    margin-bottom: 18px;
    font-weight: 700;
  }

  h1 {
    font-size: 40px;
    line-height: 1.08;
    margin: 0 0 18px;
    letter-spacing: -0.04em;
    max-width: 720px;
  }

  h2 {
    font-size: 22px;
    margin: 40px 0 14px;
    border-bottom: 1px solid var(--line);
    padding-bottom: 10px;
    letter-spacing: -0.02em;
  }

  h3 {
    font-size: 15px;
    margin: 22px 0 8px;
  }

  p {
    font-size: 14px;
    line-height: 1.7;
    margin: 0 0 13px;
  }

  .meta {
    color: var(--muted);
    font-size: 13px;
    margin-top: 8px;
  }

  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin: 34px 0;
  }

  .kpi {
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 18px;
    min-height: 105px;
  }

  .kpi.dark {
    background: var(--ink);
    color: white;
    border-color: var(--ink);
  }

  .kpi small {
    display: block;
    color: var(--muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 10px;
    font-weight: 700;
  }

  .kpi.dark small {
    color: #d1d5db;
  }

  .kpi strong {
    font-size: 24px;
    line-height: 1.1;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0 28px;
    font-size: 12px;
  }

  th, td {
    border-bottom: 1px solid var(--line);
    padding: 10px 8px;
    text-align: left;
    vertical-align: top;
  }

  th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--muted);
    font-weight: 700;
  }

  .num {
    text-align: right;
    white-space: nowrap;
  }

  .photo-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 18px;
  }

  figure {
    margin: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
    background: white;
  }

  figure img {
    width: 100%;
    height: 240px;
    object-fit: cover;
    display: block;
    background: #f3f4f6;
  }

  figcaption {
    padding: 11px;
    font-size: 11px;
    color: #444;
    line-height: 1.45;
  }

  .footer-note {
    margin-top: 42px;
    padding-top: 18px;
    border-top: 1px solid var(--line);
    font-size: 11px;
    color: var(--muted);
  }

  @media print {
    body {
      background: white;
      padding: 0;
    }

    .actions {
      display: none;
    }

    .page {
      box-shadow: none;
      margin: 0;
      max-width: none;
      min-height: 100vh;
      page-break-after: always;
      border-radius: 0;
    }

    h2 {
      page-break-after: avoid;
    }

    table, figure {
      page-break-inside: avoid;
    }
  }
</style>
</head>
<body>
  <div class="actions">
    <button class="secondary" onclick="window.print()">Salvar como PDF</button>
    <button onclick="window.print()">Imprimir / PDF</button>
  </div>

  <section class="page ${hasSection(secoesSelecionadas, 'capa') ? 'cover' : ''}">
    ${hasSection(secoesSelecionadas, 'capa') ? `
      <div>
        <div class="eyebrow">Museus Centro · Relatório institucional</div>
        <h1>Relatório Físico-Financeiro</h1>
        <p class="meta">${museu} · Período: ${periodo}</p>

        <div class="kpis">
          <div class="kpi dark"><small>Atividades</small><strong>${fmtInt(contexto.total_atividades)}</strong></div>
          <div class="kpi"><small>Público</small><strong>${fmtInt(contexto.publico_total)}</strong></div>
          <div class="kpi"><small>Utilizado</small><strong>${fmtBRL(contexto.valor_utilizado)}</strong></div>
          <div class="kpi"><small>Saldo</small><strong>${fmtBRL(contexto.saldo)}</strong></div>
        </div>
      </div>
      <div class="footer-note">
        Documento gerado a partir dos dados registrados no sistema Museus Centro. Orçamento oficial considerado: ${fmtBRL(TOTAL_OFICIAL)}.
      </div>
    ` : ''}

    ${hasSection(secoesSelecionadas, 'introducao') ? `<h2>Introdução executiva</h2>${paragraphize(textos.introducao)}` : ''}
    ${hasSection(secoesSelecionadas, 'resumo_geral') ? `<h2>Resumo geral do período</h2>${paragraphize(textos.resumo_geral)}` : ''}

    ${hasSection(secoesSelecionadas, 'resumo_museu') ? `
      <h2>Resumo por museu</h2>
      <table>
        <thead>
          <tr>
            <th>Museu</th>
            <th class="num">Atividades</th>
            <th class="num">Público</th>
          </tr>
        </thead>
        <tbody>${renderRows(museuRows, 'Nenhum dado por museu encontrado no período.', 3)}</tbody>
      </table>
    ` : ''}

    ${hasSection(secoesSelecionadas, 'publico') ? `
      <h2>Público alcançado</h2>
      <p>O público consolidado no período foi de ${fmtInt(contexto.publico_total)} pessoas, considerando os registros de atividades disponíveis nos relatórios aprovados.</p>
    ` : ''}

    ${hasSection(secoesSelecionadas, 'atividades') ? `
      <h2>Atividades realizadas</h2>
      <table>
        <thead>
          <tr>
            <th>Atividade</th>
            <th>Museu</th>
            <th>Mês</th>
            <th>Classificação</th>
            <th class="num">Público</th>
          </tr>
        </thead>
        <tbody>${renderRows(atividadesRows, 'Nenhuma atividade encontrada no período.', 5)}</tbody>
      </table>
    ` : ''}

    ${hasSection(secoesSelecionadas, 'comunicacao') ? `
      <h2>Comunicação</h2>
      ${paragraphize(textos.comunicacao || 'A seção de comunicação consolida registros disponíveis nos relatórios, atividades e anexos do período. A leitura considera os dados estruturados já existentes no sistema.')}
    ` : ''}

    ${hasSection(secoesSelecionadas, 'financeiro') ? `
      <h2>Execução financeira</h2>
      <table>
        <tbody>
          <tr><th>Orçamento oficial</th><td class="num">${fmtBRL(TOTAL_OFICIAL)}</td></tr>
          <tr><th>Valor utilizado</th><td class="num">${fmtBRL(contexto.valor_utilizado)}</td></tr>
          <tr><th>Saldo disponível</th><td class="num">${fmtBRL(contexto.saldo)}</td></tr>
          <tr><th>Percentual de execução</th><td class="num">${percentualExecucao}%</td></tr>
        </tbody>
      </table>
    ` : ''}

    ${hasSection(secoesSelecionadas, 'notas_fiscais') ? `
      <h2>Notas fiscais e compras</h2>
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Fornecedor</th>
            <th>Rubrica</th>
            <th>Status</th>
            <th class="num">Valor</th>
          </tr>
        </thead>
        <tbody>${renderRows(compraRows, 'Nenhuma compra encontrada no período.', 5)}</tbody>
      </table>
    ` : ''}

    ${hasSection(secoesSelecionadas, 'prestacao') ? `<h2>Prestação de contas</h2>${paragraphize(textos.prestacao)}` : ''}
    ${hasSection(secoesSelecionadas, 'conclusao') ? `<h2>Conclusão</h2>${paragraphize(textos.conclusao)}` : ''}
  </section>

  ${hasSection(secoesSelecionadas, 'fotos') ? `
    <section class="page">
      <h2>Fotos</h2>
      <div class="photo-grid">${fotoBlocks || '<p>Nenhuma foto localizada para o período.</p>'}</div>
    </section>
  ` : ''}
</body>
</html>`;
}

export default montarHtmlRelatorioFisicoFinanceiro;
