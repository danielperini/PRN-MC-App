function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasText(node, pattern) {
  return pattern.test(normalizeText(node?.textContent || ''));
}

function findSection(doc, patterns = []) {
  const sections = Array.from(doc.querySelectorAll('section, article, .premium-section, .premium-museum-block, .premium-communication'));
  return sections.find((section) => patterns.some((pattern) => hasText(section, pattern))) || null;
}

function createInfoBox(doc, className, title, paragraphs = []) {
  const box = doc.createElement('div');
  box.className = className;
  box.innerHTML = `
    <h3>${title}</h3>
    ${paragraphs.map((p) => `<p>${p}</p>`).join('')}
  `;
  return box;
}

function injectStyle(doc) {
  if (doc.getElementById('report-content-final-polish')) return;
  const style = doc.createElement('style');
  style.id = 'report-content-final-polish';
  style.textContent = `
    .report-final-polish-box,
    .daily-frases-final-box,
    .rubricas-final-table-box {
      border: 1px solid rgba(23,23,23,.16);
      background: #fff;
      padding: 14px 16px;
      margin: 14px 0 18px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .report-final-polish-box h3,
    .daily-frases-final-box h3,
    .rubricas-final-table-box h3 {
      margin: 0 0 8px;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 16px;
      line-height: 1.25;
      color: #171717;
    }
    .report-final-polish-box p,
    .daily-frases-final-box p,
    .rubricas-final-table-box p {
      margin: 0 0 8px;
      font-size: 12.5px;
      line-height: 1.58;
      color: #2b2b2b;
    }
    .daily-frases-final-list {
      margin: 10px 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 8px;
    }
    .daily-frases-final-list li {
      border-top: 1px solid rgba(23,23,23,.12);
      padding-top: 8px;
      font-size: 12.5px;
      line-height: 1.5;
      color: #2b2b2b;
    }
    .daily-frases-final-list strong {
      display: block;
      color: #171717;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 2px;
    }
    .budget-exec-grid,
    .budget-group-grid,
    .budget-museum-grid,
    .premium-finance-summary-cards,
    .premium-infographic-grid {
      width: 100% !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    .budget-group-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 12px !important; }
    .budget-museum-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 10px !important; }
    .budget-group-card,
    .budget-museum-card,
    .premium-finance-summary-card { break-inside: avoid !important; page-break-inside: avoid !important; }
    .premium-table-wrap,
    .premium-rubrica-table,
    .premium-table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      overflow: visible !important;
    }
    .premium-rubrica-table th,
    .premium-rubrica-table td,
    .premium-table th,
    .premium-table td {
      font-size: 9.2px !important;
      line-height: 1.28 !important;
      padding: 6px 7px !important;
      overflow-wrap: break-word !important;
      word-break: normal !important;
    }
    .premium-rubrica-name { width: 34% !important; }
    .premium-money-cell { text-align: right !important; font-variant-numeric: tabular-nums !important; }
  `;
  doc.head.appendChild(style);
}

function removeUnwantedSections(doc) {
  const unwanted = [
    /relatorios e atividades consolidadas/i,
    /relatorios individuais das equipes/i,
    /relatorios integrais das equipes/i,
    /relatorios aprovados.*registros integrais/i,
    /tabela geral de atividades/i,
  ];

  Array.from(doc.querySelectorAll('section, article, .premium-section, .activities-section')).forEach((section) => {
    const headingText = Array.from(section.querySelectorAll('h1,h2,h3'))
      .slice(0, 3)
      .map((h) => h.textContent || '')
      .join(' ');
    const normalized = normalizeText(headingText || section.textContent || '');
    if (unwanted.some((pattern) => pattern.test(normalized))) {
      section.remove();
    }
  });
}

function ensureDailyMuseumPhrases(doc) {
  const section = findSection(doc, [/diariamente nos museus/i, /frases do momento/i]);
  if (!section || section.querySelector('.daily-frases-final-box')) return;

  section.querySelectorAll('*').forEach((node) => {
    if (/novas frases/i.test(normalizeText(node.textContent || ''))) node.remove();
  });

  const box = doc.createElement('div');
  box.className = 'daily-frases-final-box';
  box.innerHTML = `
    <h3>Frases do período</h3>
    <p>Os fragmentos abaixo foram inseridos como camada editorial do relatório para valorizar o cotidiano dos museus, a circulação de públicos e a produção de memória institucional do Projeto Museus Centro.</p>
    <ul class="daily-frases-final-list">
      <li><strong>Museu como encontro</strong>Diariamente, os museus produzem encontros entre acervos, territórios, trabalhadores da cultura, escolas, visitantes e memórias urbanas.</li>
      <li><strong>Registro como memória pública</strong>Cada atividade registrada amplia a capacidade de compreender a participação dos Museus Centro na construção da política pública de museus em Belo Horizonte.</li>
      <li><strong>Educação e presença</strong>As ações educativas, oficinas, visitas mediadas e atividades culturais tornam visível o trabalho de mediação que aproxima públicos diversos dos equipamentos culturais.</li>
      <li><strong>Comunicação como evidência</strong>A comunicação, os registros visuais e os documentos digitais não apenas divulgam as ações: eles preservam rastros, comprovam entregas e organizam a memória do projeto.</li>
      <li><strong>Trabalho coletivo</strong>A consistência do período decorre da atuação articulada das equipes dos museus, da produção, da comunicação, da gestão administrativa e da coordenação do projeto.</li>
    </ul>
  `;
  const heading = section.querySelector('h2,h3');
  if (heading?.parentElement) heading.parentElement.insertBefore(box, heading.nextSibling);
  else section.insertBefore(box, section.firstChild);
}

function enhanceCommunicationText(doc) {
  const section = findSection(doc, [/comunicacao registros e evidencias/i, /comunicacao editorial/i, /comunicacao.*visibilidade/i]);
  if (!section || section.querySelector('.communication-final-analysis')) return;

  const box = createInfoBox(doc, 'report-final-polish-box communication-final-analysis', 'Leitura ampliada da comunicação, registros e evidências', [
    'A comunicação do período deve ser lida como uma frente de circulação pública e também como infraestrutura de documentação. Cada registro visual, peça, publicação, clipping, cobertura ou evidência digital contribui para demonstrar a presença do projeto nos museus e para preservar a memória das ações realizadas.',
    'A análise dos dados de comunicação ganha densidade quando cruzada com programação, público, atividades e evidências visuais. Não se trata apenas de divulgar eventos, mas de organizar uma camada verificável de rastreabilidade: o que foi realizado, onde ocorreu, qual museu esteve envolvido, quais públicos foram mobilizados e quais arquivos comprovam a execução.',
    'Esse conjunto fortalece a transparência institucional, qualifica a prestação de contas e amplia a leitura pública do Projeto Museus Centro como política cultural em desenvolvimento, com registros capazes de sustentar acompanhamento, avaliação e memória histórica.'
  ]);

  const heading = section.querySelector('h2,h3');
  if (heading?.parentElement) heading.parentElement.insertBefore(box, heading.nextSibling);
  else section.insertBefore(box, section.firstChild);
}

function enhanceMuseumBudget(doc) {
  const section = findSection(doc, [/orcamento por museu/i, /orçamento por museu/i]);
  if (!section || section.querySelector('.museum-budget-final-analysis')) return;

  const cards = Array.from(section.querySelectorAll('.budget-museum-card, article'))
    .filter((card) => /MIS|MHAB|MUMO/i.test(card.textContent || ''));
  const summary = cards.length > 0
    ? `A seção apresenta ${cards.length} blocos de orçamento por equipamento, permitindo observar a diferença entre valor previsto, valor utilizado, saldo e percentual de execução por museu.`
    : 'A seção organiza o orçamento por equipamento, separando a leitura de MIS, MHAB e MUMO quando os vínculos estão disponíveis no app.';

  const box = createInfoBox(doc, 'report-final-polish-box museum-budget-final-analysis', 'Análise do orçamento por museu', [
    `${summary} Essa leitura é essencial porque a execução financeira não se distribui de modo homogêneo: cada equipamento possui programação, demandas operacionais, ritmos de contratação, vínculos documentais e naturezas de despesa distintas.`,
    'A consolidação por museu permite verificar onde a execução está mais avançada, onde há saldo disponível e onde o registro documental precisa ser mantido coerente com rubricas, solicitações aprovadas e arquivos fiscais. Assim, o orçamento deixa de ser apenas uma soma geral e passa a funcionar como instrumento de acompanhamento territorializado do projeto.'
  ]);

  const heading = section.querySelector('h2,h3');
  if (heading?.parentElement) heading.parentElement.insertBefore(box, heading.nextSibling);
  else section.insertBefore(box, section.firstChild);
}

function ensureGeneralBudgetAlignment(doc) {
  const section = findSection(doc, [/orcamento geral/i, /orçamento geral/i, /execucao financeira/i, /execução financeira/i]);
  if (!section || section.querySelector('.general-budget-final-analysis')) return;

  const box = createInfoBox(doc, 'report-final-polish-box general-budget-final-analysis', 'Alinhamento entre orçamento geral, grupos e rubricas', [
    'O orçamento geral deve ser lido em conjunto com a execução por grupo e com a tabela detalhada de rubricas. O valor previsto representa a base oficial do plano de trabalho; o valor utilizado consolida a execução já registrada; e o saldo indica a capacidade remanescente de realização, sem confundir orçamento aprovado com fluxo de pagamento ou documentação fiscal.',
    'A leitura por grupo orçamentário ajuda a identificar concentração de gastos, ritmo de execução e rubricas ainda pouco utilizadas. Já a tabela de rubricas detalha a unidade mínima de controle financeiro, permitindo conferir nome da rubrica, valor previsto, valor utilizado, saldo e percentual de execução.'
  ]);

  const heading = section.querySelector('h2,h3');
  if (heading?.parentElement) heading.parentElement.insertBefore(box, heading.nextSibling);
  else section.insertBefore(box, section.firstChild);
}

function ensureRubricasTableIntro(doc) {
  const table = doc.querySelector('.premium-rubrica-table, table');
  const rubricaSection = findSection(doc, [/rubricas/i, /governanca financeira/i, /execucao financeira/i]);
  if (!rubricaSection || rubricaSection.querySelector('.rubricas-final-table-box')) return;

  const box = createInfoBox(doc, 'rubricas-final-table-box', 'Tabela de rubricas — controle detalhado', [
    'A tabela de rubricas deve reunir todas as linhas orçamentárias disponíveis no aplicativo, com valor previsto, valor utilizado, saldo e percentual utilizado. Essa organização permite conferir a execução a partir da rubrica como fonte de verdade, preservando a rastreabilidade entre orçamento, solicitações aprovadas e documentação fiscal.',
    table ? 'A tabela abaixo foi mantida em formato A4 com colunas ajustadas para leitura e exportação em PDF.' : 'Quando a tabela detalhada não estiver disponível na prévia, gere novamente o relatório após atualizar rubricas e compras no aplicativo.'
  ]);

  const heading = rubricaSection.querySelector('h2,h3');
  if (heading?.parentElement) heading.parentElement.insertBefore(box, heading.nextSibling);
  else rubricaSection.insertBefore(box, rubricaSection.firstChild);
}

export function polishFinalReportHtml(html, { variant = 'dados' } = {}) {
  const source = String(html || '');
  if (!source.trim()) return source;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');
    injectStyle(doc);

    if (variant === 'dados' || variant === 'single') {
      removeUnwantedSections(doc);
      ensureDailyMuseumPhrases(doc);
      enhanceCommunicationText(doc);
      enhanceMuseumBudget(doc);
      ensureGeneralBudgetAlignment(doc);
      ensureRubricasTableIntro(doc);
    }

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch (error) {
    console.warn('[Relatorio] Falha no polimento editorial final do HTML.', error);
    return source;
  }
}
