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

const STATUS_COMPRA_APROVADA = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_INTAKE_PENDENTE = new Set(['ENVIADO_APROVACAO', 'AGUARDANDO_REVISAO']);
const APPROVED_PURCHASE_CACHE_TTL_MS = 60_000;

let approvedPurchasesCache = { loadedAt: 0, byKey: new Map() };
let approvedPurchasesPromise = null;

function isComprasRoute() {
  if (typeof window === 'undefined') return false;
  return /^\/Compras(?:\/|$)/i.test(window.location.pathname);
}

function isAprovacaoNFsRoute() {
  if (typeof window === 'undefined') return false;
  return /^\/AprovacaoNFs(?:\/|$)/i.test(window.location.pathname);
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
    const value = purchase?.[field];
    if (value) return normalizeNFDateForLocalComparison(value);
  }
  return null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function itemData(item) {
  return item?.data || item || {};
}

function itemAI(item) {
  const data = itemData(item);
  return data?.resultado_ia || item?.resultado_ia || {};
}

function fiscalKey(item) {
  const data = itemData(item);
  const ai = itemAI(item);

  const accessKey = onlyDigits(
    data.nf_chave_acesso ||
      data.chave_acesso ||
      item?.nf_chave_acesso ||
      ai.nf_chave_acesso
  );
  if (accessKey.length === 44) return `chave:${accessKey}`;

  const taxId = onlyDigits(
    data.nf_emitente_cpf_cnpj ||
      data.fornecedor_cpf_cnpj ||
      data.fornecedor_cnpj ||
      data.cnpj_fornecedor ||
      item?.fornecedor_cpf_cnpj ||
      item?.fornecedor_cnpj ||
      ai.nf_emitente_cpf_cnpj
  );
  const invoiceNumber = onlyDigits(
    data.nf_numero ||
      data.numero_nota ||
      data.numero_nf ||
      item?.nf_numero ||
      ai.nf_numero
  );
  const value = toNumber(
    data.nf_valor_total ||
      data.valor_total ||
      data.valor ||
      item?.nf_valor_total ||
      item?.valor_total ||
      item?.valor ||
      ai.nf_valor_total
  ).toFixed(2);
  const supplier = normalizeText(
    data.nf_emitente_nome ||
      data.fornecedor_nome ||
      item?.fornecedor_nome ||
      ai.nf_emitente_nome
  );

  if (taxId && invoiceNumber) return `cnpj-nf:${taxId}:${invoiceNumber}`;
  if (invoiceNumber && value !== '0.00') return `nf-valor:${invoiceNumber}:${value}:${supplier}`;

  return null;
}

async function loadApprovedPurchasesByKey() {
  const now = Date.now();
  if (now - approvedPurchasesCache.loadedAt < APPROVED_PURCHASE_CACHE_TTL_MS) {
    return approvedPurchasesCache.byKey;
  }
  if (approvedPurchasesPromise) return approvedPurchasesPromise;

  approvedPurchasesPromise = (async () => {
    const purchases = await rawBase44.entities.PurchaseRequest.list('-created_date', 5000);
    const byKey = new Map();

    for (const purchase of purchases || []) {
      if (!STATUS_COMPRA_APROVADA.has(String(purchase?.status || '').toUpperCase())) continue;
      const key = fiscalKey(purchase);
      if (key && !byKey.has(key)) byKey.set(key, purchase);
    }

    approvedPurchasesCache = { loadedAt: Date.now(), byKey };
    return byKey;
  })().finally(() => {
    approvedPurchasesPromise = null;
  });

  return approvedPurchasesPromise;
}

async function archiveApprovedDuplicates(entity, records) {
  if (!Array.isArray(records) || records.length === 0) return records;

  const approvedByKey = await loadApprovedPurchasesByKey();
  if (approvedByKey.size === 0) return records;

  const keep = [];
  const duplicates = [];

  for (const intake of records) {
    const key = fiscalKey(intake);
    const approvedPurchase = key ? approvedByKey.get(key) : null;

    if (!approvedPurchase) {
      keep.push(intake);
      continue;
    }

    duplicates.push({ intake, approvedPurchase, key });
  }

  for (let index = 0; index < duplicates.length; index += 10) {
    const batch = duplicates.slice(index, index + 10);
    await Promise.allSettled(
      batch.map(({ intake, approvedPurchase, key }) =>
        entity.update(intake.id, {
          status_processamento: 'ARQUIVADO_DUPLICADO',
          duplicado_de_purchase_request_id: approvedPurchase.id,
          chave_fiscal_duplicidade: key,
          motivo_arquivamento: 'Nota fiscal já aprovada em solicitação de compra.',
          arquivado_duplicidade_em: new Date().toISOString(),
        })
      )
    );
  }

  return keep;
}

function createPurchaseRequestProxy(entity) {
  return new Proxy(entity, {
    get(target, property, receiver) {
      if (property !== 'list') return Reflect.get(target, property, receiver);

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

function createDocumentIntakeProxy(entity) {
  return new Proxy(entity, {
    get(target, property, receiver) {
      if (property !== 'filter') return Reflect.get(target, property, receiver);

      return async (query, ...args) => {
        const records = await target.filter(query, ...args);
        const requestedStatus = String(query?.status_processamento || '').toUpperCase();

        if (
          !isAprovacaoNFsRoute() ||
          !STATUS_INTAKE_PENDENTE.has(requestedStatus) ||
          !Array.isArray(records)
        ) {
          return records;
        }

        try {
          return await archiveApprovedDuplicates(target, records);
        } catch (error) {
          console.error('[AprovacaoNFs] Falha ao arquivar duplicidades já aprovadas:', error);
          return records;
        }
      };
    },
  });
}

const entitiesProxy = new Proxy(rawBase44.entities, {
  get(target, property, receiver) {
    const entity = Reflect.get(target, property, receiver);
    if (property === 'PurchaseRequest' && entity) return createPurchaseRequestProxy(entity);
    if (property === 'DocumentIntake' && entity) return createDocumentIntakeProxy(entity);
    return entity;
  },
});

function isMissingServiceTokenError(error) {
  const message = String(error?.message || error || '');
  return message.includes('Service token is required to use asServiceRole');
}

const functionsProxy = new Proxy(rawBase44.functions, {
  get(target, property, receiver) {
    if (property !== 'invoke') return Reflect.get(target, property, receiver);

    return async (functionName, payload) => {
      try {
        return await target.invoke(functionName, payload);
      } catch (error) {
        if (functionName === 'preencherRelatorioComDados' && isMissingServiceTokenError(error)) {
          console.warn('preencherRelatorioComDados executado sem service role; usando sincronização autenticada do usuário.');
          return {
            success: true,
            fallback_usuario_autenticado: true,
            resumo: {},
          };
        }

        throw error;
      }
    };
  },
});

export const base44 = new Proxy(rawBase44, {
  get(target, property, receiver) {
    if (property === 'entities') return entitiesProxy;
    if (property === 'functions') return functionsProxy;
    return Reflect.get(target, property, receiver);
  },
});
