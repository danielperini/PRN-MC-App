import { base44 } from '@/api/base44Client';

const PDF_URL_LIFETIME_MS = 10 * 60_000;
const FALLBACK_PANEL_ID = 'pdf-download-fallback-panel';
const PDF_FUNCTIONS = new Set(['generateReportPDF', 'generateCustomPDF', 'generateSingleReportPDF']);

function isPdfDownload(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  const href = String(anchor.href || '');
  const filename = String(anchor.download || '');
  return (href.startsWith('blob:') || href.startsWith('http')) && filename.toLowerCase().endsWith('.pdf');
}

function safeFilename(value = 'relatorio.pdf') {
  const normalized = String(value || 'relatorio.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-');
  return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
}

function filenameFromPayload(payload = {}) {
  const month = payload?.mes || payload?.mes_referencia || '';
  const year = payload?.ano || '';
  const protocol = payload?.reportProtocolo || payload?.protocolo || payload?.reportId || '';
  const suffix = [month, year, protocol].filter(Boolean).join('-');
  return safeFilename(suffix ? `Relatorio-Mensal-${suffix}.pdf` : 'Relatorio-Mensal.pdf');
}

function decodeBase64Pdf(value) {
  const raw = String(value || '').replace(/^data:application\/pdf;base64,/i, '').trim();
  if (!raw || raw.length < 16) return null;
  try {
    const binary = window.atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: 'application/pdf' });
  } catch {
    return null;
  }
}

function normalizePdfResult(response) {
  const payload = response?.data ?? response;
  const directUrl = payload?.pdf_url
    || payload?.download_url
    || payload?.file_url
    || payload?.url
    || payload?.arquivo_url
    || payload?.data?.pdf_url
    || payload?.data?.download_url
    || '';

  if (directUrl) return { url: String(directUrl), isObjectUrl: false };

  const candidates = [
    payload,
    payload?.blob,
    payload?.data,
    payload?.pdf,
    payload?.file,
    response?.blob,
  ];

  for (const candidate of candidates) {
    if (candidate instanceof Blob && candidate.size > 0) {
      const blob = candidate.type?.includes('pdf')
        ? candidate
        : new Blob([candidate], { type: 'application/pdf' });
      return { url: URL.createObjectURL(blob), isObjectUrl: true };
    }
    if (candidate instanceof ArrayBuffer && candidate.byteLength > 0) {
      return { url: URL.createObjectURL(new Blob([candidate], { type: 'application/pdf' })), isObjectUrl: true };
    }
    if (candidate instanceof Uint8Array && candidate.byteLength > 0) {
      return { url: URL.createObjectURL(new Blob([candidate], { type: 'application/pdf' })), isObjectUrl: true };
    }
    if (typeof candidate === 'string') {
      const blob = decodeBase64Pdf(candidate);
      if (blob?.size) return { url: URL.createObjectURL(blob), isObjectUrl: true };
    }
  }

  return null;
}

function removeFallbackPanel() {
  document.getElementById(FALLBACK_PANEL_ID)?.remove();
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

function showFallbackPanel(url, filename) {
  removeFallbackPanel();

  const panel = document.createElement('div');
  panel.id = FALLBACK_PANEL_ID;
  Object.assign(panel.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: '2147483647',
    width: 'min(360px, calc(100vw - 40px))',
    border: '1px solid #bbf7d0',
    borderRadius: '14px',
    padding: '14px',
    background: '#f0fdf4',
    color: '#14532d',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.2)',
    fontFamily: 'Arial, sans-serif',
  });

  const title = document.createElement('strong');
  title.textContent = 'PDF disponível';
  title.style.display = 'block';
  title.style.fontSize = '14px';

  const description = document.createElement('p');
  description.textContent = 'O arquivo foi preparado. Use um dos botões abaixo.';
  Object.assign(description.style, { margin: '6px 0 12px', fontSize: '12px', lineHeight: '1.4' });

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '8px', flexWrap: 'wrap' });

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.textContent = 'Baixar PDF';
  Object.assign(downloadButton.style, {
    border: '0', borderRadius: '9px', padding: '10px 13px', background: '#166534', color: '#fff',
    fontSize: '13px', fontWeight: '700', cursor: 'pointer',
  });
  downloadButton.addEventListener('click', () => triggerDownload(url, filename));

  const openLink = document.createElement('a');
  openLink.href = url;
  openLink.target = '_blank';
  openLink.rel = 'noopener noreferrer';
  openLink.textContent = 'Abrir PDF';
  Object.assign(openLink.style, {
    border: '1px solid #86efac', borderRadius: '9px', padding: '9px 13px', background: '#fff', color: '#166534',
    fontSize: '13px', fontWeight: '700', textDecoration: 'none',
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Fechar opções do PDF');
  Object.assign(closeButton.style, {
    position: 'absolute', top: '7px', right: '10px', border: '0', background: 'transparent', color: '#166534',
    fontSize: '22px', cursor: 'pointer',
  });
  closeButton.addEventListener('click', removeFallbackPanel);

  actions.append(downloadButton, openLink);
  panel.append(title, description, actions, closeButton);
  document.body.appendChild(panel);
  window.setTimeout(removeFallbackPanel, PDF_URL_LIFETIME_MS);
}

function exposePdfResponse(response, functionName, requestPayload, protectedPdfUrls) {
  if (!PDF_FUNCTIONS.has(functionName)) return response;
  const prepared = normalizePdfResult(response);
  if (!prepared?.url) return response;

  const filename = filenameFromPayload(requestPayload);
  if (prepared.isObjectUrl) protectedPdfUrls.set(prepared.url, Date.now() + PDF_URL_LIFETIME_MS);
  showFallbackPanel(prepared.url, filename);

  if (response && typeof response === 'object') {
    if (!response.data || typeof response.data !== 'object' || response.data instanceof Blob) response.data = {};
    response.data.pdf_url = response.data.pdf_url || prepared.url;
    response.data.download_url = response.data.download_url || prepared.url;
    response.data.pdf_filename = response.data.pdf_filename || filename;
  }

  console.info('[PDF] Link disponibilizado ao usuário', {
    functionName,
    filename,
    urlCreated: Boolean(prepared.url),
  });
  return response;
}

export function installPdfDownloadGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__pdfDownloadGuardInstalled) return;
  window.__pdfDownloadGuardInstalled = true;

  const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const protectedPdfUrls = new Map();

  try {
    const originalInvoke = base44?.functions?.invoke?.bind(base44.functions);
    if (originalInvoke && !base44.functions.__pdfInvokeWrapped) {
      base44.functions.invoke = async (functionName, payload, ...rest) => {
        const response = await originalInvoke(functionName, payload, ...rest);
        return exposePdfResponse(response, functionName, payload || {}, protectedPdfUrls);
      };
      base44.functions.__pdfInvokeWrapped = true;
    }
  } catch (error) {
    console.warn('[PDF] Não foi possível instalar o interceptor de links.', error);
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[download]') : null;
    if (!isPdfDownload(anchor)) return;
    const url = anchor.href;
    const filename = anchor.download || 'relatorio.pdf';
    if (url.startsWith('blob:')) protectedPdfUrls.set(url, Date.now() + PDF_URL_LIFETIME_MS);
    showFallbackPanel(url, filename);
  }, true);

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