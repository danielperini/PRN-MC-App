import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

if (!appId) {
  console.error('VITE_BASE44_APP_ID não configurado.');
}

const rawBase44 = createClient({
  appId,
  token: token || undefined,
  functionsVersion,
  serverUrl: '',
  requiresAuth: true,
  appBaseUrl,
});

const MAX_CONCURRENT_READS = 2;
const REPORT_MAX_CONCURRENT_READS = 1;
const MIN_READ_INTERVAL_MS = 350;
const MAX_RATE_LIMIT_RETRIES = 2;
const READ_CACHE_TTL_MS = 2 * 60 * 1000;
const STALE_CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MIN_MS = 3000;
const RATE_LIMIT_COOLDOWN_JITTER_MS = 2000;

const proxyCache = new WeakMap();
const functionCache = new WeakMap();
const readCache = new Map();
const inflightReads = new Map();

let activeReads = 0;
let lastReadAt = 0;
let globalRateLimitCooldownUntil = 0;
const readQueue = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return String(error?.message || error?.error || error || '');
}

function isRateLimitError(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('rate limit') || message.includes('429') || message.includes('too many requests');
}

function isMissingEntityError(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('entity schema') && message.includes('not found in app');
}

function isEntityRead(label = '') {
  return /^base44\.entities\.[^.]+\.(list|filter|get|find|search)$/i.test(String(label));
}

function isEntityWrite(label = '') {
  return /^base44\.entities\.[^.]+\.(create|update|delete|bulkCreate|bulkUpdate|bulkDelete)$/i.test(String(label));
}

function getEntityNameFromLabel(label = '') {
  const match = String(label || '').match(/^base44\.entities\.([^.]+)\./i);
  return match?.[1] || '';
}

function getMaxConcurrentReads() {
  if (typeof window !== 'undefined' && window.__MUSEUS_CENTRO_REPORT_GENERATING__) {
    return REPORT_MAX_CONCURRENT_READS;
  }
  return MAX_CONCURRENT_READS;
}

function delayForAttempt(attempt) {
  return 900 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
}

function rateLimitCooldownMs() {
  return RATE_LIMIT_COOLDOWN_MIN_MS + Math.floor(Math.random() * RATE_LIMIT_COOLDOWN_JITTER_MS);
}

function setRateLimitCooldown() {
  globalRateLimitCooldownUntil = Math.max(Date.now() + rateLimitCooldownMs(), globalRateLimitCooldownUntil);
}

function isFreshCache(entry) {
  return Boolean(entry) && Date.now() - entry.savedAt <= READ_CACHE_TTL_MS;
}

function isStaleCache(entry) {
  return Boolean(entry) && Date.now() - entry.savedAt <= STALE_CACHE_TTL_MS;
}

function stableNormalize(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'undefined') return value;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return Number(value);
  if (type === 'function' || type === 'symbol') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => stableNormalize(item, seen));
  if (type === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (value instanceof Map) {
      return Array.from(value.entries())
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([key, item]) => [String(key), stableNormalize(item, seen)]);
    }
    if (value instanceof Set) {
      return Array.from(value.values()).map((item) => stableNormalize(item, seen)).sort();
    }
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableNormalize(value[key], seen);
        return acc;
      }, {});
  }
  return String(value);
}

function stableStringify(value) {
  try {
    return JSON.stringify(stableNormalize(value));
  } catch {
    return String(value);
  }
}

function getReadCacheKey(label, args) {
  return `${label}:${stableStringify(args)}`;
}

function getCachedRead(cacheKey, { allowStale = false } = {}) {
  const entry = readCache.get(cacheKey);
  if (!entry) return null;
  if (isFreshCache(entry) || (allowStale && isStaleCache(entry))) return entry.value;
  if (!isStaleCache(entry)) readCache.delete(cacheKey);
  return null;
}

function setCachedRead(cacheKey, value, label) {
  readCache.set(cacheKey, {
    value,
    label,
    entity: getEntityNameFromLabel(label),
    savedAt: Date.now(),
  });
}

function invalidateReadCacheForEntity(entity = '') {
  if (!entity) {
    readCache.clear();
    return;
  }

  const entityLabelPrefix = `base44.entities.${entity}.`;
  Array.from(readCache.entries()).forEach(([key, entry]) => {
    if (entry?.entity === entity || String(key).startsWith(entityLabelPrefix)) {
      readCache.delete(key);
    }
  });
}

function releaseNextRead() {
  if (activeReads >= getMaxConcurrentReads()) return;
  const next = readQueue.shift();
  if (!next) return;
  activeReads += 1;
  next();
}

async function enterReadQueue() {
  await new Promise((resolve) => {
    readQueue.push(resolve);
    releaseNextRead();
  });

  const elapsed = Date.now() - lastReadAt;
  if (elapsed < MIN_READ_INTERVAL_MS) {
    await sleep(MIN_READ_INTERVAL_MS - elapsed);
  }
  lastReadAt = Date.now();
}

function leaveReadQueue() {
  activeReads = Math.max(0, activeReads - 1);
  releaseNextRead();
}

async function waitForGlobalCooldown(cacheKey, label) {
  const remaining = globalRateLimitCooldownUntil - Date.now();
  if (remaining <= 0) return;

  const stale = getCachedRead(cacheKey, { allowStale: true });
  if (stale !== null) {
    console.warn(`[${label}] cooldown ativo; usando cache antigo`);
    return stale;
  }

  await sleep(remaining);
  return null;
}

async function executeGuardedRead(task, label, cacheKey) {
  let lastError = null;

  await enterReadQueue();
  try {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      try {
        const value = await Promise.resolve().then(task);
        setCachedRead(cacheKey, value, label);
        return value;
      } catch (error) {
        lastError = error;

        if (isMissingEntityError(error)) {
          console.debug(`[${label}] Entidade ausente. Retornando lista vazia.`);
          const empty = [];
          setCachedRead(cacheKey, empty, label);
          return empty;
        }

        if (!isRateLimitError(error)) throw error;

        setRateLimitCooldown();

        const stale = getCachedRead(cacheKey, { allowStale: true });
        if (stale !== null) {
          console.warn(`[${label}] rate limit; usando cache antigo`);
          return stale;
        }

        if (attempt < MAX_RATE_LIMIT_RETRIES) {
          const delay = Math.max(delayForAttempt(attempt), globalRateLimitCooldownUntil - Date.now());
          console.warn(`[${label}] Rate limit Base44. Nova tentativa em ${delay}ms.`);
          await sleep(delay);
          continue;
        }

        console.warn(`[${label}] Rate limit persistente sem cache. Retornando lista vazia para não travar a tela.`);
        return [];
      }
    }
  } finally {
    leaveReadQueue();
  }

  throw lastError;
}

async function guardedEntityRead(task, label = 'base44.entities.read', args = []) {
  const cacheKey = getReadCacheKey(label, args);
  const fresh = getCachedRead(cacheKey);
  if (fresh !== null) {
    console.debug(`[${label}] usando cache`);
    return fresh;
  }

  const inflight = inflightReads.get(cacheKey);
  if (inflight) {
    console.debug(`[${label}] reaproveitando chamada em andamento`);
    return inflight;
  }

  const cooldownResult = await waitForGlobalCooldown(cacheKey, label);
  if (cooldownResult !== null) return cooldownResult;

  const promise = executeGuardedRead(task, label, cacheKey)
    .finally(() => inflightReads.delete(cacheKey));
  inflightReads.set(cacheKey, promise);
  return promise;
}

function shouldWrap(value) {
  return value && (typeof value === 'object' || typeof value === 'function');
}

function wrapFunction(fn, label, receiver) {
  if (functionCache.has(fn)) return functionCache.get(fn);

  let wrapped;

  if (isEntityRead(label)) {
    wrapped = function wrappedEntityRead(...args) {
      return guardedEntityRead(() => Reflect.apply(fn, receiver || this, args), label, args);
    };
  } else if (isEntityWrite(label)) {
    wrapped = async function wrappedEntityWrite(...args) {
      const result = await Reflect.apply(fn, receiver || this, args);
      invalidateReadCacheForEntity(getEntityNameFromLabel(label));
      return result;
    };
  } else {
    wrapped = function rawBase44Function(...args) {
      return Reflect.apply(fn, receiver || this, args);
    };
  }

  functionCache.set(fn, wrapped);
  return wrapped;
}

function wrapValue(value, label = 'base44') {
  if (!shouldWrap(value)) return value;

  // Nunca interceptar autenticação. O guard anterior colocava timeout em
  // base44.auth.isAuthenticated e quebrava o bootstrap do app.
  if (label === 'base44.auth' || label.startsWith('base44.auth.')) return value;

  // Funções e integrações continuam sem fila/cache para não interferir nos fluxos externos.
  if (label === 'base44.functions' || label.startsWith('base44.functions.')) return value;
  if (label === 'base44.integrations' || label.startsWith('base44.integrations.')) return value;

  if (typeof value === 'function') return wrapFunction(value, label);
  if (proxyCache.has(value)) return proxyCache.get(value);

  const proxy = new Proxy(value, {
    get(target, prop, receiver) {
      const child = Reflect.get(target, prop, receiver);
      if (typeof prop === 'symbol') return child;
      return wrapValue(child, `${label}.${String(prop)}`);
    },
    set(target, prop, nextValue, receiver) {
      return Reflect.set(target, prop, nextValue, receiver);
    },
  });

  proxyCache.set(value, proxy);
  return proxy;
}

export const base44 = wrapValue(rawBase44);
