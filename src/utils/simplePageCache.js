const memoryCache = new Map();

function now() {
  return Date.now();
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readSimplePageCache(key, ttlMs = 5 * 60 * 1000) {
  if (!key) return null;

  const memory = memoryCache.get(key);
  if (memory && now() - memory.savedAt <= ttlMs) return memory.value;

  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || now() - Number(parsed.savedAt) > ttlMs) return null;
    memoryCache.set(key, { value: parsed.value, savedAt: Number(parsed.savedAt) });
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeSimplePageCache(key, value) {
  if (!key) return;
  const savedAt = now();
  memoryCache.set(key, { value, savedAt });

  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify({ value, savedAt }));
  } catch {
    // cache é otimização; falha não bloqueia a página
  }
}

export function clearSimplePageCache(keyPrefix = '') {
  if (!keyPrefix) return;

  Array.from(memoryCache.keys()).forEach((key) => {
    if (String(key).startsWith(keyPrefix)) memoryCache.delete(key);
  });

  if (!canUseStorage()) return;

  try {
    Object.keys(window.localStorage).forEach((key) => {
      if (String(key).startsWith(keyPrefix)) window.localStorage.removeItem(key);
    });
  } catch {
    // noop
  }
}
