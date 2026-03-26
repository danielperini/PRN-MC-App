const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
};

const getStoredValue = (key) => {
  if (!storage || typeof storage.getItem !== 'function') return null;
  return storage.getItem(key);
};

const setStoredValue = (key, value) => {
  if (!storage || typeof storage.setItem !== 'function') return;
  storage.setItem(key, value);
};

const removeStoredValue = (key) => {
  if (!storage || typeof storage.removeItem !== 'function') return;
  storage.removeItem(key);
};

const getUrlParam = (paramName, removeFromUrl = false) => {
  if (isNode) return null;

  const urlParams = new URLSearchParams(window.location.search);
  const value = urlParams.get(paramName);

  if (removeFromUrl && value) {
    urlParams.delete(paramName);
    const newUrl = `${window.location.pathname}${
      urlParams.toString() ? `?${urlParams.toString()}` : ''
    }${window.location.hash}`;
    window.history.replaceState({}, document.title, newUrl);
  }

  return value;
};

const getVolatileParam = (paramName, defaultValue = undefined) => {
  if (isNode) return defaultValue;

  const fromUrl = getUrlParam(paramName);
  if (fromUrl) return fromUrl;

  return defaultValue ?? null;
};

const getPersistentParam = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
  if (isNode) return defaultValue;

  const storageKey = `base44_${toSnakeCase(paramName)}`;
  const fromUrl = getUrlParam(paramName, removeFromUrl);

  if (fromUrl) {
    setStoredValue(storageKey, fromUrl);
    return fromUrl;
  }

  const storedValue = getStoredValue(storageKey);
  if (storedValue) return storedValue;

  if (defaultValue !== undefined && defaultValue !== null && defaultValue !== '') {
    setStoredValue(storageKey, defaultValue);
    return defaultValue;
  }

  return null;
};

const getAppParams = () => {
  if (getUrlParam('clear_access_token') === 'true') {
    removeStoredValue('base44_access_token');
    removeStoredValue('token');
  }

  return {
    // infraestrutura: sempre usar URL atual ou env atual, sem cache persistente
    appId: getVolatileParam('app_id', import.meta.env.VITE_BASE44_APP_ID),
    functionsVersion: getVolatileParam(
      'functions_version',
      import.meta.env.VITE_BASE44_FUNCTIONS_VERSION
    ),
    appBaseUrl: getVolatileParam(
      'app_base_url',
      import.meta.env.VITE_BASE44_APP_BASE_URL
    ),

    // token pode continuar persistente
    token: getPersistentParam('access_token', { removeFromUrl: true }),

    fromUrl: getVolatileParam('from_url', window.location.href),
  };
};

export const appParams = {
  ...getAppParams(),
};
