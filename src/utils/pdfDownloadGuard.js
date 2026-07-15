import { base44 } from '@/api/base44Client';

const PDF_URL_LIFETIME_MS = 10 * 60_000;
const FALLBACK_PANEL_ID = 'pdf-download-fallback-panel';
const PDF_FUNCTIONS = new Set(['generateReportPDF', 'generateCustomPDF', 'generateSingleReportPDF']);

function safeFilename(value = 'relatorio.pdf') {
  const normalized = String(value || 'relatorio.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-');
  return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
}

function filenameFromPayload(payload = {}) {
  const suffix = [payload?.mes || payload?.mes_referencia, payload?.ano, payload?.reportId]
    .filter(Boolean)
    .join('-');
  return safeFilename(suffix ? `Relatorio-Mensal-${suffix}.pdf` : 'Relatorio-Mensal.pdf');
}

function bytesToBlob(bytes) {
  if (!bytes?.length) return null;
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new Blob([array], { type: 'application/pdf' });
}

function decodeString(value) {
  const raw = String(value || '');
  if (!raw) return null;

  if (raw.startsWith('%PDF-')) {
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i) & 0xff;
    return bytesToBlob(bytes);
  }

  const base64 = raw.replace(/^data:application\/pdf;base64,/i, '').trim();
  if (base64.length < 16) return null;

  try {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytesToBlob(bytes);
  } catch {
    return null;
  }
}

function candidateToBlob(candidate) {
  if (!candidate) return null;
  if (candidate instanceof Blob) return candidate.size ? candidate : null;
  if (candidate instanceof ArrayBuffer) return candidate.byteLength ? new Blob([candidate], { type: 'application/pdf' }) : null;
  if (candidate instanceof Uint8Array) return candidate.byteLength ? bytesToBlob(candidate) : null;
  if (Array.isArray(candidate)) return bytesToBlob(candidate);
  if (typeof candidate === 'string') return decodeString(candidate);

  if (typeof candidate === 'object') {
    if (Array.isArray(candidate.data)) return bytesToBlob(candidate.data);
    if (candidate.type === 'Buffer' && Array.isArray(candidate.data)) return bytesToBlob(candidate.data);
    for (const key of ['pdf_base64', 'base64', 'body', 'content', 'pdf', 'file', 'blob']) {
      const blob = candidateToBlob(candidate[key]);
      if (blob) return blob;
    }
  }

  return null;
}

function normalizePdfResult(response) {
  const payload = response?.data ?? response;
  const directUrl = payload?.pdf_url || payload?.download_url || payload?.file_url || payload?.url
    || payload?.arquivo_url || payload?.data?.pdf_url || payload?.data?.download_url;

  if (typeof directUrl === 'string' && /^(blob:|data:application\/pdf|https?:)/i.test(directUrl)) {
    return { url: directUrl, isObjectUrl: directUrl.startsWith('blob:') };
  }

  const candidates = [
    response,
    response?.data,
    response?.body,
    response?.blob,
    payload,
    payload?.data,
    payload?.body,
    payload?.result,
  ];

  for (const candidate of candidates) {
    const blob = candidateToBlob(candidate);
    if (blob?.size) return { url: URL.createObjectURL(blob), isObjectUrl: true };
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
  anchor.rel = 'noopener noreferrer';
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
    position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483647',
    width: 'min(370px, calc(100vw - 40px))', border: '1px solid #86efac',
    borderRadius: '14px', padding: '14px', background: '#f0fdf4', color: '#14532d',
    boxShadow: '0 16px 40px rgba(0,0,0,.22)', fontFamily: 'Arial, sans-serif',
  });

  const title = document.createElement('strong');
  title.textContent = 'PDF pronto para download';
  title.style.display = 'block';

  const description = document.createElement('p');
  description.textContent = 'Clique em “Baixar PDF”. O link permanece ativo por 10 minutos.';
  Object.assign(description.style, { margin: '6px 0 12px', fontSize: '12px' });

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.textContent = 'Baixar PDF';
  Object.assign(downloadButton.style, {
    border: '0', borderRadius: '9px', padding: '10px 14px', background: '#166534',
    color: '#fff', fontWeight: '700', cursor: 'pointer',
  });
  downloadButton.addEventListener('click', () => triggerDownload(url, filename));

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Fechar');
  Object.assign(closeButton.style, {
    position: 'absolute', top: '7px', right: '10px', border: '0', background: 'transparent',
    color: '#166534', fontSize: '22px', cursor: 'pointer',
  });
  closeButton.addEventListener('click', removeFallbackPanel);

  panel.append(title, description, downloadButton, closeButton);
  document.body.appendChild(panel);
  window.setTimeout(removeFallbackPanel, PDF_URL_LIFETIME_MS);
}

function exposePdfResponse(response, functionName, requestPayload, protectedPdfUrls) {
  if (!PDF_FUNCTIONS.has(functionName)) return response;

  const prepared = normalizePdfResult(response);
  if (!prepared?.url) {
    const normalized = response && typeof response === 'object' ? response : {};
    if (!normalized.data || typeof normalized.data !== 'object') normalized.data = {};
    normalized.data.error = normalized.data.error || 'A função gerou uma resposta sem arquivo PDF utilizável.';
    return normalized;
  }

  const filename = filenameFromPayload(requestPayload);
  if (prepared.isObjectUrl) protectedPdfUrls.set(prepared.url, Date.now() + PDF_URL_LIFETIME_MS);
  showFallbackPanel(prepared.url, filename);

  if (response && typeof response === 'object') {
    if (!response.data || typeof response.data !== 'object' || response.data instanceof Blob) response.data = {};
    response.data.pdf_url = prepared.url;
    response.data.download_url = prepared.url;
    response.data.pdf_filename = filename;
  }

  return response;
}

export function installPdfDownloadGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__pdfDownloadGuardInstalled) return;
  window.__pdfDownloadGuardInstalled = true;

  const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const protectedPdfUrls = new Map();
  const originalInvoke = base44?.functions?.invoke?.bind(base44.functions);

  if (originalInvoke && !base44.functions.__pdfInvokeWrapped) {
    base44.functions.invoke = async (functionName, payload, ...rest) => {
      const response = await originalInvoke(functionName, payload, ...rest);
      return exposePdfResponse(response, functionName, payload || {}, protectedPdfUrls);
    };
    base44.functions.__pdfInvokeWrapped = true;
  }

  URL.revokeObjectURL = (url) => {
    const remaining = (protectedPdfUrls.get(url) || 0) - Date.now();
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
