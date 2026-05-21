const PATCH_FLAG = '__museusCentroGalleryPdfA4ExportGuard';

function isGalleryReportHtml(value = '') {
  const html = String(value || '');
  return html.includes('Relatório Galeria') || html.includes('Relatorio Galeria') || html.includes('gallery-report') || html.includes('gallery-section') || html.includes('gallery-card');
}

function normalizeGalleryPdfHtml(value = '') {
  let html = String(value || '');
  if (!isGalleryReportHtml(html)) return html;

  // O exportador PDF usa seletores como .report-content e .gallery-activity
  // para escolher blocos A4. Quando .report-content envolve a galeria inteira,
  // sua altura pode passar de 16000px e a exportação é bloqueada como "fora da escala A4".
  // A correção abaixo transforma a galeria em blocos menores, preservando layout e conteúdo.
  html = html
    .replace(/class=(['"])report-content\1/g, 'class=$1report-content-pdf-wrap$1')
    .replace(/class=(['"])([^'"]*\bgallery-section\b(?![^'"]*\bgallery-activity\b)[^'"]*)\1/g, 'class=$1$2 gallery-activity$1')
    .replace(/class=(['"])([^'"]*\bgallery-page\b(?![^'"]*\bgallery-activity\b)[^'"]*)\1/g, 'class=$1$2 gallery-activity$1');

  const injectedCss = `
<style id="gallery-pdf-a4-export-guard">
  .report-content-pdf-wrap {
    width: 794px !important;
    max-width: 794px !important;
    padding: 34px 42px 42px !important;
    margin: 0 !important;
    overflow: visible !important;
  }
  .gallery-section.gallery-activity,
  .gallery-page.gallery-activity,
  .gallery-activity {
    width: 794px !important;
    max-width: 794px !important;
    min-height: auto !important;
    height: auto !important;
    padding: 28px 0 34px !important;
    margin: 0 !important;
    overflow: visible !important;
    transform: none !important;
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  .gallery-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 22px !important;
    width: 100% !important;
    max-width: 100% !important;
  }
  .gallery-card,
  .gallery-grid figure {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  .gallery-card img,
  .gallery-grid img {
    width: 100% !important;
    max-width: 100% !important;
    height: 205px !important;
    max-height: 205px !important;
    object-fit: cover !important;
    transform: none !important;
  }
</style>`;

  if (!html.includes('gallery-pdf-a4-export-guard')) {
    html = html.includes('</head>')
      ? html.replace('</head>', `${injectedCss}</head>`)
      : `${injectedCss}${html}`;
  }

  return html;
}

function patchDocumentWrite() {
  if (typeof Document === 'undefined') return;
  if (Document.prototype.__galleryPdfA4WritePatched) return;
  Document.prototype.__galleryPdfA4WritePatched = true;

  const originalWrite = Document.prototype.write;
  Document.prototype.write = function patchedWrite(...args) {
    return originalWrite.apply(
      this,
      args.map((arg) => (typeof arg === 'string' ? normalizeGalleryPdfHtml(arg) : arg)),
    );
  };
}

function patchStorage() {
  if (typeof Storage === 'undefined') return;
  if (Storage.prototype.__galleryPdfA4StoragePatched) return;
  Storage.prototype.__galleryPdfA4StoragePatched = true;

  const originalSetItem = Storage.prototype.setItem;
  const originalGetItem = Storage.prototype.getItem;

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const shouldNormalize = String(key || '') === 'relatorio_fisico_financeiro_galeria_html' && typeof value === 'string';
    return originalSetItem.call(this, key, shouldNormalize ? normalizeGalleryPdfHtml(value) : value);
  };

  Storage.prototype.getItem = function patchedGetItem(key) {
    const value = originalGetItem.call(this, key);
    const shouldNormalize = String(key || '') === 'relatorio_fisico_financeiro_galeria_html' && typeof value === 'string';
    return shouldNormalize ? normalizeGalleryPdfHtml(value) : value;
  };
}

function patchIndexedDbPutGet() {
  if (typeof IDBObjectStore === 'undefined') return;
  if (IDBObjectStore.prototype.__galleryPdfA4IdbPatched) return;
  IDBObjectStore.prototype.__galleryPdfA4IdbPatched = true;

  const originalPut = IDBObjectStore.prototype.put;
  const originalGet = IDBObjectStore.prototype.get;

  IDBObjectStore.prototype.put = function patchedPut(value, key) {
    const shouldNormalize = String(key || '') === 'relatorio_fisico_financeiro_galeria_html';
    if (shouldNormalize && value && typeof value === 'object' && typeof value.html === 'string') {
      return originalPut.call(this, { ...value, html: normalizeGalleryPdfHtml(value.html) }, key);
    }
    if (shouldNormalize && typeof value === 'string') {
      return originalPut.call(this, normalizeGalleryPdfHtml(value), key);
    }
    return originalPut.call(this, value, key);
  };

  IDBObjectStore.prototype.get = function patchedGet(key) {
    const request = originalGet.call(this, key);
    const shouldNormalize = String(key || '') === 'relatorio_fisico_financeiro_galeria_html';
    if (!shouldNormalize) return request;

    request.addEventListener('success', () => {
      const value = request.result;
      if (value && typeof value === 'object' && typeof value.html === 'string') {
        value.html = normalizeGalleryPdfHtml(value.html);
      }
    });
    return request;
  };
}

export function installGalleryPdfA4ExportGuard() {
  if (typeof window === 'undefined') return;
  if (window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  patchDocumentWrite();
  patchStorage();
  patchIndexedDbPutGet();
}

installGalleryPdfA4ExportGuard();
