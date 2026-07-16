import viadutoHeaderOriginal from '@/assets/viadutoHeaderOriginal';

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

  const image = document.createElement('img');
  image.className = 'viaduto-pdf-header__image';
  image.src = viadutoHeaderOriginal;
  image.alt = 'Viaduto das Artes - Fundado em 16 de junho de 2015. Av. Olinto Meireles, 45 - Barreiro - Belo Horizonte/MG. CEP 30640-010. E-mail: viadutodasartes@gmail.com';

  header.appendChild(image);
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
      justify-content: flex-start;
      align-items: flex-start;
      border-bottom: 1px solid #4b5563;
      background: #fff;
      margin: 0 0 18px;
      padding: 0;
      box-sizing: border-box;
      break-inside: avoid;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .viaduto-pdf-header__image {
      display: block;
      width: 100%;
      max-width: 886px;
      height: auto;
      margin: 0;
      object-fit: contain;
      object-position: left top;
    }
    @media print {
      .viaduto-pdf-header {
        display: flex !important;
        justify-content: flex-start !important;
        margin-bottom: 8mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .viaduto-pdf-header__image {
        display: block !important;
        width: 100% !important;
        max-width: 186mm !important;
        height: auto !important;
        margin-left: 0 !important;
        object-position: left top !important;
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
