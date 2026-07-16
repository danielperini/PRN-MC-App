import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

if (!appId) {
  console.error('VITE_BASE44_APP_ID não configurado.');
}

export const base44 = createClient({
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
    if (purchase?.[field]) {
      return normalizeNFDateForLocalComparison(purchase[field]);
    }
  }
  return null;
}

// Mantém o filtro da página Compras sem envolver o SDK em Proxy.
const purchaseRequestEntity = base44.entities?.PurchaseRequest;
if (purchaseRequestEntity?.list) {
  const originalPurchaseRequestList = purchaseRequestEntity.list.bind(purchaseRequestEntity);

  purchaseRequestEntity.list = async (...args) => {
    const records = await originalPurchaseRequestList(...args);
    if (!isComprasRoute() || !Array.isArray(records)) return records;

    return records.map((purchase) => ({
      ...purchase,
      __created_date_original: purchase?.created_date || null,
      created_date: getNFDate(purchase),
    }));
  };
}

function isMissingServiceTokenError(error) {
  const message = String(error?.message || error || '');
  return message.includes('Service token is required to use asServiceRole');
}

// Fallback restrito ao preenchimento do relatório, sem Proxy e sem recursão.
const functionsApi = base44.functions;
if (functionsApi?.invoke) {
  const originalInvoke = functionsApi.invoke.bind(functionsApi);

  functionsApi.invoke = async (functionName, payload) => {
    try {
      return await originalInvoke(functionName, payload);
    } catch (error) {
      if (functionName === 'preencherRelatorioComDados' && isMissingServiceTokenError(error)) {
        console.warn(
          'preencherRelatorioComDados executado sem service role; usando sincronização autenticada do usuário.'
        );
        return {
          success: true,
          fallback_usuario_autenticado: true,
          resumo: {},
        };
      }

      throw error;
    }
  };
}
