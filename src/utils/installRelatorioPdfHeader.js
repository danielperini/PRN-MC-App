const HEADER_ATTR = 'data-viaduto-pdf-header';

function isReportRoute() {
  return typeof window !== 'undefined' && /RelatorioExecucaoObjeto/i.test(window.location.pathname);
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function createHeader() {
  const header = document.createElement('header');
  header.setAttribute(HEADER_ATTR, 'true');
  header.className = 'viaduto-pdf-header';
  header.setAttribute('aria-label', 'Cabeçalho institucional do Viaduto das Artes');

  const logo = document.createElement('div');
  logo.className = 'viaduto-pdf-header__logo';
  logo.innerHTML = '<span>VIA</span><span>DU</span><span>TO</span><small>DAS ARTES</small>';

  const info = document.createElement('div');
  info.className = 'viaduto-pdf-header__info';
  info.innerHTML = [
    '<strong>Viaduto das Artes - Fundado em 16 de junho de 2015</strong>',
    '<span>Av. Olinto Meireles, 45 - Barreiro - Belo Horizonte/MG</span>',
    '<span>CEP 30640-010 - E-mail: viadutodasartes@gmail.com</span>',
  ].join('');

  header.append(logo, info);
  return header;
}

function isLikelyReportRoot(element) {
  const text = normalize(element?.textContent);
  return text.includes('relatorio de execucao do objeto') || text.includes('tipo de relatorio');
}

function findReportRoot() {
  const explicit = document.querySelector('[data-relatorio-execucao], [data-report-root], .relatorio-execucao-objeto, .report-preview');
  if (explicit) return explicit;

  return Array.from(document.querySelectorAll('main, article, section, div'))
    .find((element) => isLikelyReportRoot(element) && element.querySelector('h1, h2, h3')) || null;
}

function pageContainers(root) {
  const selectors = [
    '[data-report-page]',
    '[data-pdf-page]',
    '.report-page',
    '.pdf-page',
    '.print-page',
    '.page-a4',
  ].join(',');

  const pages = Array.from(root.querySelectorAll(selectors));
  return pages.length ? pages : [root];
}

function ensureHeader(container) {
  if (!container || container.querySelector(`:scope > [${HEADER_ATTR}]`)) return;
  container.prepend(createHeader());
}

function installStyles() {
  if (document.getElementById('viaduto-pdf-header-style')) return;

  const style = document.createElement('style');
  style.id = 'viaduto-pdf-header-style';
  style.textContent = `
    .viaduto-pdf-header {
      display: flex;
      width: 100%;
      min-height: 92px;
      align-items: stretch;
      border-bottom: 1px solid #4b5563;
      background: #fff;
      color: #171717;
      margin: 0 0 18px;
      box-sizing: border-box;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .viaduto-pdf-header__logo {
      position: relative;
      width: 145px;
      min-width: 145px;
      padding: 10px 38px 8px 18px;
      background: #292522;
      color: #fff;
      box-sizing: border-box;
      font-family: Arial, Helvetica, sans-serif;
      font-weight: 900;
      font-size: 32px;
      line-height: .72;
      letter-spacing: -1px;
    }
    .viaduto-pdf-header__logo span { display: block; }
    .viaduto-pdf-header__logo small {
      position: absolute;
      right: 7px;
      top: 13px;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size: 13px;
      line-height: 1;
      letter-spacing: .3px;
    }
    .viaduto-pdf-header__info {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: flex-start;
      padding: 12px 0 12px 255px;
      box-sizing: border-box;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 19px;
      line-height: 1.15;
      white-space: nowrap;
    }
    .viaduto-pdf-header__info strong,
    .viaduto-pdf-header__info span { display: block; }
    @media (max-width: 900px) {
      .viaduto-pdf-header__info { padding-left: 24px; font-size: 14px; white-space: normal; }
    }
    @media print {
      .viaduto-pdf-header {
        display: flex !important;
        margin-bottom: 12mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .viaduto-pdf-header__logo {
        background: #292522 !important;
        color: #fff !important;
      }
      [data-report-page], [data-pdf-page], .report-page, .pdf-page, .print-page, .page-a4 {
        break-after: page;
        page-break-after: always;
      }
    }
  `;
  document.head.appendChild(style);
}

function applyHeader() {
  if (!isReportRoute()) return;
  installStyles();
  const root = findReportRoot();
  if (!root) return;
  pageContainers(root).forEach(ensureHeader);
}

export function installRelatorioPdfHeader() {
  if (typeof window === 'undefined' || window.__relatorioPdfHeaderInstalled) return;
  window.__relatorioPdfHeaderInstalled = true;

  const run = () => window.requestAnimationFrame(applyHeader);
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('beforeprint', applyHeader);
  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  run();
}
