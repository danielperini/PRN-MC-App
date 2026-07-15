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

function deepValue(source, keys, depth = 0) {
  if (!source || depth > 5) return undefined;
  if (typeof source === 'string') {
    const text = source.trim();
    if ((text.startsWith('{') || text.startsWith('[')) && text.length > 2) {
      try { return deepValue(JSON.parse(text), keys, depth + 1); } catch { return undefined; }
    }
    return undefined;
  }
  if (typeof source !== 'object') return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  for (const key of ['data', 'result', 'body', 'payload', 'response']) {
    const found = deepValue(source[key], keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function filenameFromPayload(payload = {}, response = {}) {
  const returned = deepValue(response, ['filename', 'pdf_filename']);
  if (returned) return safeFilename(returned);
  const suffix = [payload?.mes || payload?.mes_referencia, payload?.ano, payload?.reportId]
    .filter(Boolean)
    .join('-');
  return safeFilename(suffix ? `Relatorio-Mensal-${suffix}.pdf` : 'Relatorio-Mensal.pdf');
}

function isValidPdfBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 800) return false;
  return String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
}

function bytesToBlob(bytes) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!isValidPdfBytes(array)) return null;
  return new Blob([array], { type: 'application/pdf' });
}

function decodeBase64(value) {
  let raw = String(value || '').trim();
  if (!raw) return null;
  raw = raw.replace(/^data:application\/pdf(?:;charset=[^;,]+)?;base64,/i, '').replace(/\s/g, '');
  if (raw.length < 100) return null;
  try {
    const binary = window.atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
    return bytesToBlob(bytes);
  } catch {
    return null;
  }
}

function candidateToBlob(candidate, depth = 0) {
  if (!candidate || depth > 6) return null;
  if (candidate instanceof Blob) return candidate.size > 800 ? candidate : null;
  if (candidate instanceof ArrayBuffer) return bytesToBlob(new Uint8Array(candidate));
  if (candidate instanceof Uint8Array) return bytesToBlob(candidate);
  if (Array.isArray(candidate)) return bytesToBlob(new Uint8Array(candidate));

  if (typeof candidate === 'string') {
    const text = candidate.trim();
    if ((text.startsWith('{') || text.startsWith('[')) && text.length > 2) {
      try { return candidateToBlob(JSON.parse(text), depth + 1); } catch { /* continua como base64 */ }
    }
    return decodeBase64(text);
  }

  if (typeof candidate === 'object') {
    if (candidate.type === 'Buffer' && Array.isArray(candidate.data)) return bytesToBlob(new Uint8Array(candidate.data));
    if (Array.isArray(candidate.data)) {
      const blob = bytesToBlob(new Uint8Array(candidate.data));
      if (blob) return blob;
    }
    for (const key of ['pdf_base64', 'base64', 'pdfBase64', 'content', 'file', 'blob', 'body', 'data', 'result', 'payload', 'response']) {
      const blob = candidateToBlob(candidate[key], depth + 1);
      if (blob) return blob;
    }
  }
  return null;
}

function normalizePdfResult(response) {
  const directUrl = deepValue(response, ['pdf_url', 'download_url', 'file_url', 'arquivo_url']);
  if (typeof directUrl === 'string' && /^(blob:|https?:)/i.test(directUrl)) {
    return { url: directUrl, isObjectUrl: directUrl.startsWith('blob:') };
  }

  const blob = candidateToBlob(response);
  if (blob) return { url: URL.createObjectURL(blob), isObjectUrl: true };
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
  title.textContent = 'PDF validado e pronto';
  title.style.display = 'block';

  const description = document.createElement('p');
  description.textContent = 'Clique abaixo para baixar o relatório.';
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

  const backendError = deepValue(response, ['error', 'message']);
  const prepared = normalizePdfResult(response);
  if (!prepared?.url) {
    const normalized = response && typeof response === 'object' ? response : { data: {} };
    if (!normalized.data || typeof normalized.data !== 'object') normalized.data = {};
    normalized.data.error = backendError || 'A função não retornou bytes PDF válidos.';
    normalized.data.pdf_url = '';
    return normalized;
  }

  const filename = filenameFromPayload(requestPayload, response);
  if (prepared.isObjectUrl) protectedPdfUrls.set(prepared.url, Date.now() + PDF_URL_LIFETIME_MS);
  showFallbackPanel(prepared.url, filename);
  triggerDownload(prepared.url, filename);

  if (response && typeof response === 'object') {
    if (!response.data || typeof response.data !== 'object') response.data = {};
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
  const nativeWindowOpen = window.open.bind(window);
  const protectedPdfUrls = new Map();
  const protectedPdfFiles = new Map();
  const originalInvoke = base44?.functions?.invoke?.bind(base44.functions);

  if (originalInvoke && !base44.functions.__pdfInvokeWrapped) {
    base44.functions.invoke = async (functionName, payload, ...rest) => {
      const response = await originalInvoke(functionName, payload, ...rest);
      const exposed = exposePdfResponse(response, functionName, payload || {}, protectedPdfUrls);
      const url = exposed?.data?.pdf_url;
      const filename = exposed?.data?.pdf_filename || 'relatorio.pdf';
      if (url && protectedPdfUrls.has(url)) protectedPdfFiles.set(url, filename);
      return exposed;
    };
    base44.functions.__pdfInvokeWrapped = true;
  }

  window.open = (url, target, features) => {
    const normalizedUrl = String(url || '');
    if (protectedPdfFiles.has(normalizedUrl)) {
      triggerDownload(normalizedUrl, protectedPdfFiles.get(normalizedUrl));
      showFallbackPanel(normalizedUrl, protectedPdfFiles.get(normalizedUrl));
      return window;
    }
    return nativeWindowOpen(url, target, features);
  };

  URL.revokeObjectURL = (url) => {
    const remaining = (protectedPdfUrls.get(url) || 0) - Date.now();
    if (remaining > 0) {
      window.setTimeout(() => {
        protectedPdfUrls.delete(url);
        protectedPdfFiles.delete(url);
        nativeRevokeObjectURL(url);
      }, remaining);
      return;
    }
    nativeRevokeObjectURL(url);
  };
}
