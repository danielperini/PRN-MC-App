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

const MAX_CONCURRENT_REQUESTS = 1;
const MIN_REQUEST_INTERVAL_MS = 420;
const REQUEST_TIMEOUT_MS = 26000;
const MAX_RATE_LIMIT_RETRIES = 2;
const proxyCache = new WeakMap();
const functionCache = new WeakMap();
let activeRequests = 0;
let lastRequestAt = 0;
const queue = [];

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

function isReadMethod(label = '') {
  return /\.(list|filter|get|find|search)$/i.test(String(label));
}

function fallbackForRead(label = '', error) {
  if (isMissingEntityError(error)) return [];
  if (isRateLimitError(error) && isReadMethod(label)) return [];
  return undefined;
}

function delayForAttempt(attempt) {
  return 1200 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
}

function releaseNext() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) return;
  const next = queue.shift();
  if (!next) return;
  activeRequests += 1;
  next();
}

async function enterQueue() {
  await new Promise((resolve) => {
    queue.push(resolve);
    releaseNext();
  });

  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

function leaveQueue() {
  activeRequests = Math.max(0, activeRequests - 1);
  releaseNext();
}

function withTimeout(promise, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Tempo excedido na consulta Base44: ${label}`));
    }, REQUEST_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function guardedRequest(task, label = 'Base44') {
  let lastError = null;

  await enterQueue();
  try {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      try {
        return await withTimeout(Promise.resolve().then(task), label);
      } catch (error) {
        lastError = error;

        const fallback = fallbackForRead(label, error);
        if (typeof fallback !== 'undefined') {
          if (isMissingEntityError(error)) {
            console.debug(`[${label}] Entidade ausente. Retornando lista vazia.`);
            return fallback;
          }

          if (isRateLimitError(error) && attempt < MAX_RATE_LIMIT_RETRIES) {
            const delay = delayForAttempt(attempt);
            console.warn(`[${label}] Rate limit Base44. Nova tentativa em ${delay}ms.`);
            await sleep(delay);
            continue;
          }

          console.warn(`[${label}] Rate limit persistente. Retornando lista vazia para não travar a tela.`);
          return fallback;
        }

        if (!isRateLimitError(error) || attempt === MAX_RATE_LIMIT_RETRIES) throw error;
        const delay = delayForAttempt(attempt);
        console.warn(`[${label}] Rate limit Base44. Nova tentativa em ${delay}ms.`);
        await sleep(delay);
      }
    }
  } finally {
    leaveQueue();
  }

  throw lastError;
}

function shouldWrap(value) {
  return value && (typeof value === 'object' || typeof value === 'function');
}

function wrapFunction(fn, label) {
  if (functionCache.has(fn)) return functionCache.get(fn);

  function wrapped(...args) {
    return guardedRequest(() => Reflect.apply(fn, this, args), label);
  }

  functionCache.set(fn, wrapped);
  return wrapped;
}

function wrapValue(value, label = 'base44') {
  if (!shouldWrap(value)) return value;
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
