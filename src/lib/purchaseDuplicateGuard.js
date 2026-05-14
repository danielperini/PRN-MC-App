export const ACTIVE_PURCHASE_STATUSES = new Set([
  'RASCUNHO',
  'SOLICITADO',
  'ENVIADO',
  'EM_ANALISE',
  'AGUARDANDO_REVISAO',
  'APROVADO',
  'APROVADO_COORD',
  'APROVADO_ADMIN',
  'PAGO',
]);

export const IGNORED_DUPLICATE_STATUSES = new Set([
  'CANCELADO',
  'CANCELADA',
  'RECUSADO',
  'RECUSADA',
  'REJEITADO',
  'REJEITADA',
]);

export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function normalizeMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

  const raw = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/^R\$/i, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

export function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
}

export function getNFNumber(item = {}) {
  return normalizeText(
    item.nf_numero ||
    item.numero_nf ||
    item.numero_nota ||
    item.nota_fiscal_numero ||
    item.resultado_ia?.nf_numero ||
    ''
  ).replace(/[^A-Z0-9]/g, '');
}

export function getSupplierDocument(item = {}) {
  return onlyDigits(
    item.fornecedor_cnpj ||
    item.fornecedor_cpf_cnpj ||
    item.nf_emitente_cpf_cnpj ||
    item.cnpj ||
    item.cpf_cnpj ||
    item.resultado_ia?.nf_emitente_cpf_cnpj ||
    item.resultado_ia?.fornecedor_cpf_cnpj ||
    ''
  );
}

export function getSupplierName(item = {}) {
  return normalizeText(
    item.fornecedor_nome ||
    item.nf_emitente_nome ||
    item.emitente_nome ||
    item.resultado_ia?.nf_emitente_nome ||
    item.resultado_ia?.fornecedor_nome ||
    ''
  );
}

export function getNFValue(item = {}) {
  return normalizeMoney(
    item.valor_solicitado ??
    item.nf_valor_total ??
    item.valor_total ??
    item.valor ??
    item.resultado_ia?.nf_valor_total ??
    item.resultado_ia?.valor_total ??
    item.resultado_ia?.valor ??
    0
  );
}

export function getNFDate(item = {}) {
  return normalizeDate(
    item.nf_data_emissao ||
    item.data_emissao ||
    item.resultado_ia?.nf_data_emissao ||
    item.resultado_ia?.data_emissao ||
    ''
  );
}

export function buildDuplicateKey(item = {}) {
  const nf = getNFNumber(item);
  const doc = getSupplierDocument(item);
  const value = getNFValue(item);

  if (nf && doc) return `NF:${doc}:${nf}`;
  if (nf && value > 0) return `NFVAL:${nf}:${value.toFixed(2)}`;

  const name = getSupplierName(item);
  const date = getNFDate(item);
  if (name && value > 0 && date) return `FNV:${name}:${date}:${value.toFixed(2)}`;

  return '';
}

export function isDuplicateCandidate(existing = {}, incoming = {}, currentId = null) {
  if (!existing || !incoming) return false;
  if (currentId && existing.id === currentId) return false;

  const status = normalizeText(existing.status);
  if (IGNORED_DUPLICATE_STATUSES.has(status)) return false;

  const existingKey = existing.duplicate_key || buildDuplicateKey(existing);
  const incomingKey = incoming.duplicate_key || buildDuplicateKey(incoming);

  if (existingKey && incomingKey && existingKey === incomingKey) return true;

  const existingNF = getNFNumber(existing);
  const incomingNF = getNFNumber(incoming);
  const existingDoc = getSupplierDocument(existing);
  const incomingDoc = getSupplierDocument(incoming);
  const existingValue = getNFValue(existing);
  const incomingValue = getNFValue(incoming);

  if (existingNF && incomingNF && existingNF === incomingNF) {
    if (existingDoc && incomingDoc && existingDoc === incomingDoc) return true;
    if (existingValue > 0 && incomingValue > 0 && Math.abs(existingValue - incomingValue) < 0.01) return true;
  }

  return false;
}

export async function findDuplicatePurchaseRequest({ base44, payload, currentId = null, limit = 500 }) {
  if (!base44?.entities?.PurchaseRequest || !payload) return null;

  const duplicateKey = buildDuplicateKey(payload);
  const candidatePayload = { ...payload, duplicate_key: duplicateKey };

  const all = await base44.entities.PurchaseRequest.list('-created_date', limit).catch(() => []);
  const duplicate = (Array.isArray(all) ? all : []).find((item) =>
    isDuplicateCandidate(item, candidatePayload, currentId)
  );

  return duplicate || null;
}

export function buildDuplicateWarning(duplicate = {}) {
  const nf = getNFNumber(duplicate) || 'sem número identificado';
  const supplier = duplicate.fornecedor_nome || duplicate.nf_emitente_nome || 'fornecedor não identificado';
  const value = getNFValue(duplicate);
  const status = duplicate.status || 'sem status';

  return `Esta nota fiscal já possui solicitação registrada. NF ${nf} · ${supplier} · ${value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · status ${status}.`;
}
