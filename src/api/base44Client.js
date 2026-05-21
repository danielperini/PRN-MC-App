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
const MIN_READ_INTERVAL_MS = 180;
const MAX_RATE_LIMIT_RETRIES = 2;
const proxyCache = new WeakMap();
const functionCache = new WeakMap();
let activeReads = 0;
let lastReadAt = 0;
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

function delayForAttempt(attempt) {
  return 900 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
}

function releaseNextRead() {
  if (activeReads >= MAX_CONCURRENT_READS) return;
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

async function guardedEntityRead(task, label = 'base44.entities.read') {
  let lastError = null;

  await enterReadQueue();
  try {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      try {
        return await Promise.resolve().then(task);
      } catch (error) {
        lastError = error;

        if (isMissingEntityError(error)) {
          console.debug(`[${label}] Entidade ausente. Retornando lista vazia.`);
          return [];
        }

        if (!isRateLimitError(error)) throw error;

        if (attempt < MAX_RATE_LIMIT_RETRIES) {
          const delay = delayForAttempt(attempt);
          console.warn(`[${label}] Rate limit Base44. Nova tentativa em ${delay}ms.`);
          await sleep(delay);
          continue;
        }

        console.warn(`[${label}] Rate limit persistente. Retornando lista vazia para não travar a tela.`);
        return [];
      }
    }
  } finally {
    leaveReadQueue();
  }

  throw lastError;
}

function shouldWrap(value) {
  return value && (typeof value === 'object' || typeof value === 'function');
}

function wrapFunction(fn, label, receiver) {
  if (!isEntityRead(label)) {
    return function rawBase44Function(...args) {
      return Reflect.apply(fn, receiver || this, args);
    };
  }

  if (functionCache.has(fn)) return functionCache.get(fn);

  function wrappedEntityRead(...args) {
    return guardedEntityRead(() => Reflect.apply(fn, receiver || this, args), label);
  }

  functionCache.set(fn, wrappedEntityRead);
  return wrappedEntityRead;
}

function wrapValue(value, label = 'base44') {
  if (!shouldWrap(value)) return value;

  // Nunca interceptar autenticação. O guard anterior colocava timeout em
  // base44.auth.isAuthenticated e quebrava o bootstrap do app.
  if (label === 'base44.auth' || label.startsWith('base44.auth.')) return value;

  // Também não enfileirar funções, integrações e operações de escrita.
  if (label === 'base44.functions' || label.startsWith('base44.functions.')) return value;
  if (label === 'base44.integrations' || label.startsWith('base44.integrations.')) return value;
  if (isEntityWrite(label)) return value;

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
