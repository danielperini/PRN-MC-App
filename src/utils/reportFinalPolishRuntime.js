import { polishFinalReportHtml } from '@/utils/reportContentFinalPolish';

const RUNTIME_FLAG = '__museusCentroReportFinalPolishRuntime';

function detectVariantFromKey(key = '') {
  const text = String(key || '').toLowerCase();
  if (text.includes('galeria')) return 'galeria';
  if (text.includes('atividades')) return 'atividades';
  if (text.includes('dados') || text.includes('fisico_financeiro_html') || text.includes('latest_html')) return 'dados';
  return 'single';
}

function shouldPolishStorageKey(key = '') {
  const text = String(key || '');
  return /relatorio_fisico_financeiro_(dados_)?html$|relatorio_fisico_financeiro_html$/.test(text);
}

function shouldPolishIdbPayload(value, key) {
  if (!value || typeof value !== 'object' || typeof value.html !== 'string') return false;
  const variant = value?.meta?.reportVariant || value?.reportVariant || detectVariantFromKey(key);
  return variant === 'dados' || variant === 'single';
}

function polishHtmlValue(value, variant = 'dados') {
  if (typeof value !== 'string' || !value.trim()) return value;
  if (variant === 'galeria' || variant === 'atividades') return value;
  return polishFinalReportHtml(value, { variant });
}

function installStoragePatch() {
  try {
    ['localStorage', 'sessionStorage'].forEach((storageName) => {
      const storage = window?.[storageName];
      if (!storage || storage.__museusCentroReportPolishPatched) return;
      const originalSetItem = storage.setItem.bind(storage);
      const originalGetItem = storage.getItem.bind(storage);

      storage.setItem = (key, value) => {
        if (shouldPolishStorageKey(key)) {
          const variant = detectVariantFromKey(key);
          return originalSetItem(key, polishHtmlValue(value, variant));
        }
        return originalSetItem(key, value);
      };

      storage.getItem = (key) => {
        const value = originalGetItem(key);
        if (shouldPolishStorageKey(key)) {
          const variant = detectVariantFromKey(key);
          return polishHtmlValue(value, variant);
        }
        return value;
      };

      Object.defineProperty(storage, '__museusCentroReportPolishPatched', {
        value: true,
        enumerable: false,
      });
    });
  } catch (error) {
    console.warn('[Relatorio] Não foi possível instalar polimento de Storage.', error);
  }
}

function installIndexedDbPatch() {
  try {
    if (typeof IDBObjectStore === 'undefined') return;
    const proto = IDBObjectStore.prototype;
    if (proto.__museusCentroReportPolishPatched) return;

    const originalPut = proto.put;
    proto.put = function patchedPut(value, key) {
      try {
        if (shouldPolishIdbPayload(value, key)) {
          const variant = value?.meta?.reportVariant || detectVariantFromKey(key);
          const next = {
            ...value,
            html: polishHtmlValue(value.html, variant),
            meta: {
              ...(value.meta || {}),
              finalPolishApplied: true,
              finalPolishAppliedAt: new Date().toISOString(),
            },
          };
          return originalPut.call(this, next, key);
        }
      } catch (error) {
        console.warn('[Relatorio] Falha ao aplicar polimento antes do IndexedDB. Salvando versão original.', error);
      }
      return originalPut.call(this, value, key);
    };

    Object.defineProperty(proto, '__museusCentroReportPolishPatched', {
      value: true,
      enumerable: false,
    });
  } catch (error) {
    console.warn('[Relatorio] Não foi possível instalar polimento de IndexedDB.', error);
  }
}

export function installReportFinalPolishRuntime() {
  if (typeof window === 'undefined') return;
  if (window[RUNTIME_FLAG]) return;
  window[RUNTIME_FLAG] = true;
  window.__museusCentroPolishReportHtml = polishFinalReportHtml;
  installStoragePatch();
  installIndexedDbPatch();
}

installReportFinalPolishRuntime();
