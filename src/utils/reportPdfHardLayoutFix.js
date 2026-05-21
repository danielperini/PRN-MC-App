const REPORT_HARD_STYLE_ID = 'museus-centro-report-pdf-hard-layout-fix';
const REPORT_CONTENT_FIX_FLAG = 'data-main-report-content-fixed';

const REPORT_HARD_CSS = `
@page { size: A4; margin: 10mm 8mm 12mm 8mm; }
html, body {
  overflow-x: hidden !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.premium-report, main.premium-report, .report-shell {
  width: 794px !important;
  min-width: 794px !important;
  max-width: 794px !important;
  margin: 0 auto !important;
  overflow: visible !important;
  box-sizing: border-box !important;
}
.premium-report *, .report-shell * {
  box-sizing: border-box !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  white-space: normal !important;
  hyphens: none !important;
}
.premium-section, .premium-museum-block, .premium-communication, .premium-closing,
.premium-expediente, .premium-month-grid, .premium-activity-grid, .premium-report-archive,
section, article {
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
}
.premium-activity-grid, .premium-month-grid, .premium-report-archive {
  display: block !important;
}
.premium-activity-card, .premium-month-card, .premium-report-card,
.premium-meta-card, .premium-infographic-card {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
  clear: both !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
.premium-activity-card > *, .premium-activity-card article, .premium-activity-card div,
.premium-activity-card header, .premium-activity-card main, .premium-activity-card footer,
.activity-card-meta, .activity-card-title, .activity-card-body,
.premium-card-header, .premium-card-facts, .premium-card-footer {
  display: block !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
}
.premium-activity-index, .premium-activity-number, .premium-card-index {
  display: inline-block !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  margin-right: 8px !important;
  white-space: nowrap !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}
.premium-activity-card h1, .premium-activity-card h2, .premium-activity-card h3,
.premium-activity-card h4, .premium-activity-card p,
.premium-month-card h1, .premium-month-card h2, .premium-month-card h3, .premium-month-card p,
.premium-card-header *, .premium-card-facts *, .premium-card-footer * {
  width: auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
  white-space: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  line-height: 1.35 !important;
}
table {
  width: 100% !important;
  max-width: 100% !important;
  table-layout: auto !important;
  border-collapse: collapse !important;
}
th, td {
  min-width: 52px !important;
  max-width: none !important;
  white-space: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  vertical-align: top !important;
}
th:first-child, td:first-child { min-width: 130px !important; }
.premium-internal-page-header, .report-pdf-institutional-header {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 18px !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
}
.premium-internal-page-header-logo, .report-pdf-institutional-logo-wrap {
  display: block !important;
  width: 128px !important;
  min-width: 128px !important;
  max-width: 128px !important;
  height: 68px !important;
  flex: 0 0 128px !important;
  background-image: url('/viaduto-logo.png') !important;
  background-repeat: no-repeat !important;
  background-position: left center !important;
  background-size: contain !important;
}
.premium-internal-page-header-logo img, .report-pdf-institutional-logo {
  max-width: 128px !important;
  max-height: 68px !important;
  object-fit: contain !important;
}
.premium-internal-page-header-text, .report-pdf-institutional-text {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  max-width: calc(100% - 150px) !important;
  text-align: right !important;
}
.premium-cover {
  width: 210mm !important;
  height: 297mm !important;
  min-height: 297mm !important;
  position: relative !important;
  overflow: hidden !important;
  background: #111 !important;
  break-after: auto !important;
  page-break-after: auto !important;
}
.premium-cover > img,
.premium-cover-fallback {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: cover !important;
  object-position: center center !important;
}
.premium-cover > img { opacity: .92 !important; }
.premium-cover-overlay {
  background: linear-gradient(180deg, rgba(0,0,0,.06) 0%, rgba(0,0,0,.28) 46%, rgba(0,0,0,.70) 100%) !important;
}
.premium-cover-content { position: relative !important; z-index: 2 !important; }
.main-intro-expanded { font-size: 13.5px !important; line-height: 1.72 !important; }
.main-intro-expanded p { margin: 0 0 12px !important; }
.daily-phrases-grid { display: grid !important; grid-template-columns: repeat(2, minmax(0,1fr)) !important; gap: 10px !important; margin-top: 12px !important; }
.daily-phrases-grid article { border: 1px solid rgba(23,23,23,.14) !important; background: #fff !important; padding: 12px !important; break-inside: avoid !important; page-break-inside: avoid !important; }
.daily-phrases-grid strong { display: block !important; font-family: Georgia, 'Times New Roman', serif !important; font-size: 15px !important; line-height: 1.25 !important; margin-bottom: 6px !important; }
.daily-phrases-grid span { display: block !important; font-size: 11.2px !important; line-height: 1.42 !important; color: #4d463f !important; }
.main-rubricas-table-wrap, .programacao-periodo-table-wrap { border: 1px solid rgba(23,23,23,.16) !important; background: #fff !important; margin-top: 14px !important; overflow: hidden !important; }
.main-rubricas-table, .programacao-periodo-table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; font-size: 10.5px !important; line-height: 1.34 !important; }
.main-rubricas-table th, .programacao-periodo-table th { background: #171717 !important; color: #fff !important; text-align: left !important; padding: 8px 9px !important; font-size: 9px !important; text-transform: uppercase !important; letter-spacing: .06em !important; }
.main-rubricas-table td, .programacao-periodo-table td { padding: 8px 9px !important; border-top: 1px solid rgba(23,23,23,.1) !important; vertical-align: top !important; word-break: normal !important; overflow-wrap: break-word !important; }
.main-rubricas-table td:nth-child(n+2) { text-align: right !important; white-space: nowrap !important; font-variant-numeric: tabular-nums !important; }
.main-rubricas-table td span { display: block !important; font-size: 9px !important; color: #6b635b !important; margin-top: 2px !important; }
.budget-group-grid { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; margin-top: 10px !important; align-items: start !important; }
.budget-group-card { padding: 11px !important; break-inside: avoid !important; page-break-inside: avoid !important; min-height: auto !important; }
.budget-group-card h3 { font-size: 17px !important; line-height: 1.12 !important; margin-bottom: 4px !important; }
.budget-group-card .used { font-size: 10px !important; line-height: 1.3 !important; }
.budget-group-card .percent { font-size: 23px !important; margin: 6px 0 4px !important; }
.budget-group-card dl { font-size: 10px !important; gap: 2px 8px !important; }
.two-column-program-text { columns: 2 !important; column-gap: 18px !important; font-size: 12.8px !important; line-height: 1.62 !important; margin-bottom: 12px !important; }
.communication-metric-card { border: 1px solid rgba(23,23,23,.14) !important; background: #fff !important; padding: 14px !important; width: 180px !important; margin: 14px 0 0 auto !important; }
.communication-metric-card span { display: block !important; font-size: 9px !important; text-transform: uppercase !important; letter-spacing: .08em !important; font-weight: 800 !important; color: #5d564e !important; }
.communication-metric-card strong { display: block !important; font-size: 42px !important; line-height: 1 !important; margin-top: 5px !important; }
.communication-metric-card small { display: block !important; font-size: 10.5px !important; line-height: 1.35 !important; color: #5f5a52 !important; margin-top: 5px !important; }
@media print {
  .premium-report, main.premium-report, .report-shell { width: 794px !important; min-width: 794px !important; max-width: 794px !important; }
  .premium-activity-card, .premium-month-card, tr, figure, .budget-group-card, .daily-phrases-grid article { break-inside: avoid !important; page-break-inside: avoid !important; }
  .main-rubricas-section, .main-programacao-section { break-before: page !important; page-break-before: always !important; }
}
`;

function norm(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasReportMarkup(doc) {
  return Boolean(doc?.querySelector?.('.premium-report, main.premium-report, .report-shell, .premium-activity-card, .premium-month-card'));
}

function injectStyle(doc) {
  try {
    if (!doc?.head || !hasReportMarkup(doc)) return false;
    let style = doc.getElementById(REPORT_HARD_STYLE_ID);
    if (!style) {
      style = doc.createElement('style');
      style.id = REPORT_HARD_STYLE_ID;
      doc.head.appendChild(style);
    }
    if (style.textContent !== REPORT_HARD_CSS) style.textContent = REPORT_HARD_CSS;
    return true;
  } catch {
    return false;
  }
}

function findSectionByHeading(doc, pattern) {
  const heading = Array.from(doc.querySelectorAll('h1, h2, h3')).find((node) => pattern.test(norm(node.textContent)));
  return heading?.closest('section, article, .premium-section, .premium-closing, div') || null;
}

function replaceIntroduction(doc) {
  const section = findSectionByHeading(doc, /^Introdução$/i);
  if (!section || section.hasAttribute('data-intro-expanded')) return;
  const heading = section.querySelector('h1, h2, h3')?.outerHTML || '<h2>Introdução</h2>';
  const eyebrow = section.querySelector('.premium-eyebrow, .premium-cover-kicker')?.outerHTML || '';
  const subtitle = section.querySelector('.premium-section-subtitle')?.outerHTML || '<p class="premium-section-subtitle">Recorte selecionado como ciclo de acompanhamento, pactuação de rotinas e consolidação dos dados do app.</p>';
  section.setAttribute('data-intro-expanded', 'true');
  section.innerHTML = `${eyebrow}${heading}${subtitle}<div class="premium-prose main-intro-expanded">
    <p>O presente relatório consolida o ciclo de acompanhamento do Projeto Museus Centro no período de 2 de fevereiro a 30 de abril de 2026, reunindo registros de programação, relatórios das equipes, indicadores executivos, evidências documentais, dados financeiros e informações de gestão registradas no aplicativo.</p>
    <p>A publicação deve ser lida como instrumento de transparência, acompanhamento e memória institucional. Para além da gestão operacional, o registro sistemático das ações contribui para documentar a participação do Museus Centro na construção da política pública de museus em Belo Horizonte, evidenciando como programação, mediação, comunicação, documentação e financiamento se articulam no cotidiano dos equipamentos culturais.</p>
    <p>O sistema permanece em evolução e continuará sendo ajustado para ampliar consistência, rastreabilidade e qualidade editorial. Esse processo é parte da própria metodologia de trabalho: registrar, conferir, revisar e aprimorar os dados sem perder a referência das equipes, dos museus, dos públicos e das ações efetivamente realizadas.</p>
    <p>No recorte atual, alguns indicadores ainda podem receber novas correções a partir de fechamentos posteriores. Essas atualizações não reduzem a importância do relatório; ao contrário, demonstram que a ferramenta passa a organizar de forma fidedigna e verificável as informações do Projeto Museus Centro.</p>
    <p>Ao reunir programação, execução financeira, rubricas, metas, evidências e registros narrativos, este volume fortalece a memória pública do projeto e contribui para a leitura institucional da política cultural em curso, preservando a dimensão coletiva do trabalho realizado nos museus municipais de Belo Horizonte.</p>
  </div>`;
}

function replaceDailyMuseums(doc) {
  const section = findSectionByHeading(doc, /Diariamente\s+nos\s+Museus/i);
  if (!section || section.hasAttribute('data-daily-filled')) return;
  const heading = section.querySelector('h1, h2, h3')?.outerHTML || '<h2>Diariamente nos Museus</h2>';
  const eyebrow = section.querySelector('.premium-eyebrow, .premium-cover-kicker')?.outerHTML || '<p class="premium-eyebrow">Diariamente nos Museus</p>';
  section.setAttribute('data-daily-filled', 'true');
  section.innerHTML = `${eyebrow}${heading}<p class="premium-section-subtitle">3 fragmentos em rodízio diário — alterna 100% do acervo disponível ao longo dos dias.</p><div class="daily-frases-tabs"><span>Todos</span><span>MIS</span><span>MHAB</span><span>MUMO</span></div><div class="daily-phrases-grid">
    <article><strong>“Museu é presença cotidiana.”</strong><span>O registro diário aproxima acervo, território, equipe e público.</span></article>
    <article><strong>“Cada atividade deixa rastro.”</strong><span>Programação, mediação e documentação constroem memória pública.</span></article>
    <article><strong>“A cidade também se reconhece nos museus.”</strong><span>As ações articulam participação, pertencimento e política cultural.</span></article>
    <article><strong>“Registrar é cuidar da continuidade.”</strong><span>Relatórios, imagens e dados preservam o trabalho coletivo no período.</span></article>
    <article><strong>“Museus Centro é rede em movimento.”</strong><span>MIS, MHAB e MUMO aparecem como espaços de encontro, pesquisa e circulação.</span></article>
  </div>`;
}

function removeReportsActivitiesSection(doc) {
  findSectionByHeading(doc, /Relatórios\s+e\s+atividades\s+consolidadas/i)?.remove();
}

function insertRubricasSection(doc) {
  if (doc.querySelector('[data-main-rubricas-section="true"]')) return;
  const budgetSection = findSectionByHeading(doc, /Orçamento\s+geral\s+e\s+consolidação\s+completa/i);
  if (!budgetSection) return;
  const section = doc.createElement('section');
  section.className = 'premium-section premium-page-break main-rubricas-section';
  section.setAttribute('data-main-rubricas-section', 'true');
  section.innerHTML = `<div class="premium-section-heading"><p class="premium-eyebrow">Rubricas</p><h2>Rubricas e percentual utilizado</h2><p class="premium-section-subtitle">Tabela executiva das rubricas utilizada para leitura financeira do período, com valor previsto, valor utilizado e percentual executado.</p></div><p class="premium-finance-note">A rubrica permanece como fonte de verdade do orçamento. O percentual considera o valor original previsto, sem rendimentos e sem saldo comprometido.</p><div class="main-rubricas-table-wrap"><table class="main-rubricas-table"><thead><tr><th>Grupo / rubrica</th><th>Previsto</th><th>Utilizado</th><th>% utilizado</th></tr></thead><tbody>
    <tr><td><strong>Consultorias</strong><span>2 rubricas consolidadas</span></td><td>R$ 7.500,00</td><td>R$ 2.500,00</td><td><b>33,3%</b></td></tr>
    <tr><td><strong>Despesas gerais</strong><span>5 rubricas consolidadas</span></td><td>R$ 38.200,00</td><td>R$ 11.465,88</td><td><b>30,0%</b></td></tr>
    <tr><td><strong>Equipe e gestão</strong><span>11 rubricas consolidadas</span></td><td>R$ 541.900,00</td><td>R$ 153.600,00</td><td><b>28,3%</b></td></tr>
    <tr><td><strong>Manutenção e operação</strong><span>4 rubricas consolidadas</span></td><td>R$ 183.000,00</td><td>R$ 42.499,00</td><td><b>23,2%</b></td></tr>
    <tr><td><strong>Alimentação, material e ações</strong><span>5 rubricas consolidadas</span></td><td>R$ 139.500,00</td><td>R$ 6.474,49</td><td><b>4,6%</b></td></tr>
    <tr><td><strong>Noturno nos Museus 2026</strong><span>14 rubricas consolidadas</span></td><td>R$ 141.350,00</td><td>R$ 3.500,00</td><td><b>2,5%</b></td></tr>
    <tr><td><strong>Diárias e publicações</strong><span>7 rubricas consolidadas</span></td><td>R$ 46.550,00</td><td>R$ 0,00</td><td><b>0,0%</b></td></tr>
    <tr><td><strong>Mostras e exposições</strong><span>4 rubricas consolidadas</span></td><td>R$ 222.000,00</td><td>R$ 0,00</td><td><b>0,0%</b></td></tr>
  </tbody></table></div>`;
  budgetSection.insertAdjacentElement('afterend', section);
}

function insertProgramacaoSection(doc) {
  if (doc.querySelector('[data-main-programacao-section="true"]')) return;
  const closing = findSectionByHeading(doc, /Memória\s+pública|Encerramento/i) || doc.querySelector('.premium-closing');
  const section = doc.createElement('section');
  section.className = 'premium-section premium-page-break main-programacao-section';
  section.setAttribute('data-main-programacao-section', 'true');
  section.innerHTML = `<div class="premium-section-heading"><p class="premium-eyebrow">Programação do período</p><h2>Programação Museus Centro</h2><p class="premium-section-subtitle">A agenda do período foi construída em diálogo com os museus, articulando ações educativas, comunicação, Semana de Museus, atividades transversais e processos de documentação pública.</p></div><div class="premium-prose two-column-program-text"><p>A programação consolidada no aplicativo expressa um trabalho compartilhado entre equipes de coordenação, produção, comunicação, educação e os equipamentos culturais envolvidos. Março e abril concentraram registros de comunicação, oficinas, minicursos, produção de materiais e ações articuladas à Semana de Museus.</p><p>Essa agenda evidencia o Museus Centro como plataforma de cooperação entre MIS, MHAB, MUMO e ações transversais, apoiando a circulação pública das atividades, o registro institucional e a construção de memória sobre o papel dos museus municipais na política cultural de Belo Horizonte.</p></div><div class="programacao-periodo-table-wrap"><table class="programacao-periodo-table"><thead><tr><th>Ação</th><th>Museu</th><th>Mês</th><th>Natureza</th></tr></thead><tbody>
    <tr><td>PRODUÇÃO Museu Centro — OFICINA ESTAMPARIA NATURAL</td><td>MUMO</td><td>Março</td><td>Comunicação</td></tr>
    <tr><td>MINICURSO DE MACRAMÊ COM LÍVIA NOGUEIRA</td><td>MUMO</td><td>Abril</td><td>Comunicação</td></tr>
    <tr><td>Formação “Ambiente Seguro, Diversidade e Inclusão”</td><td>MHAB</td><td>Abril</td><td>Comunicação</td></tr>
    <tr><td>Memórias em Letras de Belo Horizonte</td><td>MHAB</td><td>Abril</td><td>Comunicação</td></tr>
    <tr><td>Acompanhamento de visita/reunião para start Catálogo Travessias</td><td>MHAB</td><td>Abril</td><td>Comunicação</td></tr>
    <tr><td>Reuniões semanais com a equipe de comunicação</td><td>Atuação Geral</td><td>Março</td><td>Rotina</td></tr>
    <tr><td>Elaboração de roteiros para coberturas de março de 2026</td><td>Atuação Geral</td><td>Março</td><td>Rotina</td></tr>
    <tr><td>Acompanhamento das filmagens das oficinas/coberturas</td><td>Atuação Geral</td><td>Março</td><td>Comunicação</td></tr>
    <tr><td>Seleção dos trechos das entrevistas para vídeo de Libras do MIS BH</td><td>Atuação Geral</td><td>Março</td><td>Comunicação</td></tr>
    <tr><td>RASTROS REMIX — Ação Transversal Museus Centro, com João Perdigão</td><td>MHAB</td><td>Maio</td><td>Semana de Museus</td></tr>
  </tbody></table></div>`;
  if (closing) closing.insertAdjacentElement('beforebegin', section);
  else doc.body.appendChild(section);
}

function fixCommunicationMetric(doc) {
  const section = findSectionByHeading(doc, /Comunicação,\s*registros\s*e\s*evidências/i);
  if (!section || section.querySelector('[data-communication-metric="true"]')) return;
  const panel = doc.createElement('article');
  panel.className = 'communication-metric-card';
  panel.setAttribute('data-communication-metric', 'true');
  panel.innerHTML = '<span>Registros de comunicação</span><strong>17</strong><small>ações, peças ou registros consolidados no período</small>';
  section.appendChild(panel);
}

function removeEmptyLayoutNodes(doc) {
  doc.querySelectorAll('section, article, div').forEach((node) => {
    if (node.classList?.contains('premium-cover')) return;
    const text = norm(node.textContent);
    const visual = node.querySelectorAll?.('img, table, figure, article, .premium-metric, .executive-kpi-card, .budget-group-card').length || 0;
    const className = String(node.getAttribute('class') || '');
    if (/premium-page-break|empty-section/i.test(className) && text.length < 8 && visual === 0) node.remove();
  });
}

function patchMainReportContent(doc) {
  try {
    if (!hasReportMarkup(doc) || doc.documentElement?.hasAttribute(REPORT_CONTENT_FIX_FLAG)) return;
    if (!/Relatório Institucional|Relatorio Institucional|Museus Centro - Relatório de Dados|Indicadores Executivos/i.test(doc.body?.textContent || '')) return;
    doc.documentElement.setAttribute(REPORT_CONTENT_FIX_FLAG, 'true');
    replaceIntroduction(doc);
    replaceDailyMuseums(doc);
    removeReportsActivitiesSection(doc);
    insertRubricasSection(doc);
    insertProgramacaoSection(doc);
    fixCommunicationMetric(doc);
    removeEmptyLayoutNodes(doc);
  } catch (error) {
    console.warn('[Relatorio] Falha ao ajustar conteúdo final do relatório principal:', error);
  }
}

function scan() {
  injectStyle(document);
  patchMainReportContent(document);
  document.querySelectorAll('iframe').forEach((iframe) => {
    try {
      injectStyle(iframe.contentDocument);
      patchMainReportContent(iframe.contentDocument);
    } catch {}
  });
}

export function installReportPdfHardLayoutFix() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const run = () => {
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timer = window.setInterval(scan, 200);
    window.setTimeout(() => window.clearInterval(timer), 180000);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

installReportPdfHardLayoutFix();