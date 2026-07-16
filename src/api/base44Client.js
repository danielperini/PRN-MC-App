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

const NF_DATE_FIELDS = [
  'nf_data_emissao',
  'data_nf',
  'data_emissao_nf',
  'nota_fiscal_data_emissao',
  'nf_emissao',
];

function isComprasRoute() {
  if (typeof window === 'undefined') return false;
  return /^\/Compras(?:\/|$)/i.test(window.location.pathname);
}

function getNFDate(purchase) {
  for (const field of NF_DATE_FIELDS) {
    const value = purchase?.[field];
    if (value) return String(value).split('T')[0];
  }
  return null;
}

function createPurchaseRequestProxy(entity) {
  return new Proxy(entity, {
    get(target, property, receiver) {
      if (property !== 'list') {
        return Reflect.get(target, property, receiver);
      }

      return async (...args) => {
        const records = await target.list(...args);
        if (!isComprasRoute() || !Array.isArray(records)) return records;

        return records.map((purchase) => ({
          ...purchase,
          __created_date_original: purchase?.created_date || null,
          created_date: getNFDate(purchase),
        }));
      };
    },
  });
}

const entitiesProxy = new Proxy(rawBase44.entities, {
  get(target, property, receiver) {
    const entity = Reflect.get(target, property, receiver);
    if (property === 'PurchaseRequest' && entity) {
      return createPurchaseRequestProxy(entity);
    }
    return entity;
  },
});

export const base44 = new Proxy(rawBase44, {
  get(target, property, receiver) {
    if (property === 'entities') return entitiesProxy;
    return Reflect.get(target, property, receiver);
  },
});
