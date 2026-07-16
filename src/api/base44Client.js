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

function normalizeNFDateForLocalComparison(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0];

  // O filtro legado usa new Date(). Data ISO sem horário é interpretada como UTC,
  // fazendo 01/07 virar 30/06 no fuso de Belo Horizonte. Meio-dia local evita
  // deslocamento de dia e mantém a comparação inclusiva do período selecionado.
  if (isoDate) return `${isoDate}T12:00:00`;

  const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brDate) {
    const [, day, month, year] = brDate;
    return `${year}-${month}-${day}T12:00:00`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T12:00:00`;
}

function getNFDate(purchase) {
  for (const field of NF_DATE_FIELDS) {
    const value = purchase?.[field];
    if (value) return normalizeNFDateForLocalComparison(value);
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
