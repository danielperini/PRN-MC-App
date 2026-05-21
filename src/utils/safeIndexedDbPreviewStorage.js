const PREVIEW_DB_STORE_NAME = 'previews';
const PATCH_FLAG = '__museusCentroSafePreviewPutPatched';

function toCloneSafeValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'undefined') return value;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value;
  if (valueType === 'bigint') return Number(value);
  if (valueType === 'function' || valueType === 'symbol') return undefined;

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Blob || value instanceof File) return value;
  if (value instanceof RegExp) return String(value);

  if (seen.has(value)) return undefined;
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => toCloneSafeValue(item, seen))
      .filter((item) => typeof item !== 'undefined');
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).reduce((acc, [key, item]) => {
      const safeKey = String(key);
      const safeValue = toCloneSafeValue(item, seen);
      if (typeof safeValue !== 'undefined') acc[safeKey] = safeValue;
      return acc;
    }, {});
  }

  if (value instanceof Set) {
    return Array.from(value.values())
      .map((item) => toCloneSafeValue(item, seen))
      .filter((item) => typeof item !== 'undefined');
  }

  const plain = {};
  Object.entries(value).forEach(([key, item]) => {
    const safeValue = toCloneSafeValue(item, seen);
    if (typeof safeValue !== 'undefined') plain[key] = safeValue;
  });
  return plain;
}

function shouldSanitizeIndexedDbPut(store, error) {
  const message = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  return String(store?.name || '') === PREVIEW_DB_STORE_NAME &&
    (name.includes('dataclone') || message.includes('could not be cloned') || message.includes('failed to execute'));
}

export function installSafeIndexedDbPreviewStorage() {
  if (typeof window === 'undefined' || typeof IDBObjectStore === 'undefined') return;

  const prototype = IDBObjectStore.prototype;
  if (prototype[PATCH_FLAG]) return;

  const originalPut = prototype.put;

  Object.defineProperty(prototype, PATCH_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  prototype.put = function patchedPreviewPut(value, key) {
    try {
      return originalPut.call(this, value, key);
    } catch (error) {
      if (!shouldSanitizeIndexedDbPut(this, error)) throw error;

      const safeValue = toCloneSafeValue(value);
      console.warn('[Relatorio] Metadados da previa continham valores nao clonaveis. Salvando versao serializavel.', error);
      return originalPut.call(this, safeValue, key);
    }
  };
}

installSafeIndexedDbPreviewStorage();
