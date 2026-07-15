const PDF_URL_LIFETIME_MS = 60_000;
const FALLBACK_BUTTON_ID = 'pdf-download-fallback-button';

function isPdfDownload(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  const href = String(anchor.href || '');
  const filename = String(anchor.download || '');
  return href.startsWith('blob:') && filename.toLowerCase().endsWith('.pdf');
}

function removeFallbackButton() {
  document.getElementById(FALLBACK_BUTTON_ID)?.remove();
}

function triggerDownload(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function showFallbackButton(url, filename) {
  removeFallbackButton();

  const button = document.createElement('button');
  button.id = FALLBACK_BUTTON_ID;
  button.type = 'button';
  button.textContent = 'Baixar PDF novamente';
  button.setAttribute('aria-label', `Baixar novamente o arquivo ${filename}`);
  Object.assign(button.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: '2147483647',
    border: '0',
    borderRadius: '10px',
    padding: '12px 16px',
    background: '#111827',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
  });

  button.addEventListener('click', () => triggerDownload(url, filename));
  document.body.appendChild(button);
  window.setTimeout(removeFallbackButton, PDF_URL_LIFETIME_MS);
}

export function installPdfDownloadGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__pdfDownloadGuardInstalled) return;

  window.__pdfDownloadGuardInstalled = true;

  const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const protectedPdfUrls = new Map();

  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[download]') : null;
      if (!isPdfDownload(anchor)) return;

      const url = anchor.href;
      const filename = anchor.download || 'relatorio.pdf';
      protectedPdfUrls.set(url, Date.now() + PDF_URL_LIFETIME_MS);
      showFallbackButton(url, filename);

      console.info('[PDF] Arquivo preparado para download', {
        filename,
        urlCreated: Boolean(url),
      });
    },
    true,
  );

  URL.revokeObjectURL = (url) => {
    const protectedUntil = protectedPdfUrls.get(url) || 0;
    const remaining = protectedUntil - Date.now();

    if (remaining > 0) {
      window.setTimeout(() => {
        protectedPdfUrls.delete(url);
        nativeRevokeObjectURL(url);
      }, remaining);
      return;
    }

    nativeRevokeObjectURL(url);
  };
}
