import {
  DATA_REPORT_HTML_KEY,
  DATA_REPORT_META_KEY,
  GALLERY_REPORT_HTML_KEY,
  GALLERY_REPORT_META_KEY,
  ACTIVITIES_REPORT_HTML_KEY,
  ACTIVITIES_REPORT_META_KEY,
  SINGLE_REPORT_HTML_KEY,
  SINGLE_REPORT_META_KEY,
  PREVIEW_DB_NAME,
  PREVIEW_DB_STORE,
  getVolumeHtmlKey,
  getVolumeMetaKey,
} from '@/services/reportExportPipeline';

const REPORT_PURGE_PREFIXES = [
  'relatorio_fisico_financeiro_',
  'museus_centro_report_',
  'report_preview_',
];

export const REPORT_PURGE_KEYS = [
  SINGLE_REPORT_HTML_KEY,
  SINGLE_REPORT_META_KEY,
  DATA_REPORT_HTML_KEY,
  DATA_REPORT_META_KEY,
  GALLERY_REPORT_HTML_KEY,
  GALLERY_REPORT_META_KEY,
  ACTIVITIES_REPORT_HTML_KEY,
  ACTIVITIES_REPORT_META_KEY,
  `${SINGLE_REPORT_HTML_KEY}_storage`,
  `${DATA_REPORT_HTML_KEY}_storage`,
  `${GALLERY_REPORT_HTML_KEY}_storage`,
  `${ACTIVITIES_REPORT_HTML_KEY}_storage`,
  `${SINGLE_REPORT_HTML_KEY}_saved_at`,
  `${DATA_REPORT_HTML_KEY}_saved_at`,
  `${GALLERY_REPORT_HTML_KEY}_saved_at`,
  `${ACTIVITIES_REPORT_HTML_KEY}_saved_at`,
  'relatorio_fisico_financeiro_selected_chapters',
  'relatorio_fisico_financeiro_all_chapters',
  'relatorio_fisico_financeiro_export_mode',
  'relatorio_fisico_financeiro_export_volume',
  'relatorio_fisico_financeiro_generation_settings',
  getVolumeHtmlKey(1),
  getVolumeHtmlKey(2),
  getVolumeHtmlKey(3),
  getVolumeMetaKey(1),
  getVolumeMetaKey(2),
  getVolumeMetaKey(3),
];

function safeRemove(storage, key) {
  try {
    storage?.removeItem?.(key);
  } catch {}
}

function purgeStorage(storage) {
  if (!storage) return 0;
  let removed = 0;

  REPORT_PURGE_KEYS.forEach((key) => {
    safeRemove(storage, key);
    removed += 1;
  });

  try {
    Object.keys(storage).forEach((key) => {
      if (REPORT_PURGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        safeRemove(storage, key);
        removed += 1;
      }
    });
  } catch {}

  return removed;
}

function deletePreviewDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const request = indexedDB.deleteDatabase(PREVIEW_DB_NAME);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
      request.onblocked = () => finish(false);
      setTimeout(() => finish(false), 1500);
    } catch {
      finish(false);
    }
  });
}

function clearObjectStore() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const request = indexedDB.open(PREVIEW_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PREVIEW_DB_STORE)) db.createObjectStore(PREVIEW_DB_STORE);
      };
      request.onerror = () => finish(false);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction(PREVIEW_DB_STORE, 'readwrite');
          tx.objectStore(PREVIEW_DB_STORE).clear();
          tx.oncomplete = () => {
            db.close();
            finish(true);
          };
          tx.onerror = () => {
            db.close();
            finish(false);
          };
        } catch {
          db.close();
          finish(false);
        }
      };
      setTimeout(() => finish(false), 1500);
    } catch {
      finish(false);
    }
  });
}

export async function purgeReportPreviewHard({ reason = 'manual', deleteDatabase = true } = {}) {
  const storageRemoved =
    purgeStorage(typeof sessionStorage !== 'undefined' ? sessionStorage : null) +
    purgeStorage(typeof localStorage !== 'undefined' ? localStorage : null);

  const storeCleared = await clearObjectStore();
  const dbDeleted = deleteDatabase ? await deletePreviewDatabase() : false;

  try {
    window.dispatchEvent(new CustomEvent('museus-centro-report-preview-purged', {
      detail: {
        reason,
        storageRemoved,
        storeCleared,
        dbDeleted,
        purgedAt: new Date().toISOString(),
      },
    }));
  } catch {}

  return {
    storageRemoved,
    storeCleared,
    dbDeleted,
    purgedAt: new Date().toISOString(),
  };
}

export function purgeReportPreviewStorageOnly({ reason = 'before-save' } = {}) {
  const storageRemoved =
    purgeStorage(typeof sessionStorage !== 'undefined' ? sessionStorage : null) +
    purgeStorage(typeof localStorage !== 'undefined' ? localStorage : null);

  try {
    window.dispatchEvent(new CustomEvent('museus-centro-report-preview-storage-purged', {
      detail: { reason, storageRemoved, purgedAt: new Date().toISOString() },
    }));
  } catch {}

  return { storageRemoved, purgedAt: new Date().toISOString() };
}

export function detectReportVariantFromUrl() {
  if (typeof window === 'undefined') return 'dados';
  const params = new URLSearchParams(window.location.search || '');
  return params.get('report') || params.get('variant') || 'dados';
}
