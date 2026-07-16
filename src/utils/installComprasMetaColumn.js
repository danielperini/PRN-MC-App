import { base44 } from '@/api/base44Client';

function isComprasRoute() {
  return typeof window !== 'undefined' && /^\/Compras(?:\/|$)/i.test(window.location.pathname);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function findHeaderIndex(headers, label) {
  const normalizedLabel = normalizeText(label);
  return headers.findIndex((header) => normalizeText(header.textContent).includes(normalizedLabel));
}

function firstFilled(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function getMetaId(item = {}) {
  return firstFilled(
    item.meta_id,
    item.project_meta_id,
    item.meta_projeto_id,
    item.meta_codigo,
    item.codigo_meta,
    item.metaId,
    item.meta?.id,
    item.project_meta?.id,
  );
}

function getMetaName(item = {}) {
  return firstFilled(
    item.meta_nome,
    item.nome_meta,
    item.meta_titulo,
    item.titulo_meta,
    item.meta_descricao,
    item.descricao_meta,
    item.meta?.nome,
    item.meta?.titulo,
    item.project_meta?.nome,
    item.project_meta?.titulo,
  );
}

function purchaseValue(item = {}) {
  return Number(
    item.valor_pago ||
      item.valor_aprovado_admin ||
      item.valor_aprovado ||
      item.valor_final ||
      item.valor_solicitado ||
      item.valor_total ||
      item.nf_valor_total ||
      item.valor ||
      0,
  );
}

function formatMoneyVariants(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return [];
  return [
    number.toFixed(2),
    number.toFixed(2).replace('.', ','),
    number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  ].map(normalizeText);
}

function formatDateVariants(value) {
  if (!value) return [];
  const raw = String(value).split('T')[0];
  const parts = raw.split('-');
  const variants = [raw];
  if (parts.length === 3) variants.push(`${parts[2]}/${parts[1]}/${parts[0]}`);
  return variants.map(normalizeText);
}

let metaNameById = new Map();
let purchasesCache = [];
let dataPromise = null;

async function loadData() {
  if (dataPromise) return dataPromise;

  dataPromise = (async () => {
    const map = new Map();
    let purchases = [];

    try {
      const metas = await base44.entities.ProjectMeta.list('ordem', 5000);
      for (const meta of Array.isArray(metas) ? metas : []) {
        const id = firstFilled(meta.id, meta.meta_id, meta.codigo, meta.meta_codigo);
        const name = firstFilled(meta.nome, meta.meta_nome, meta.titulo, meta.descricao);
        if (id && name) map.set(id, name);
      }
    } catch (_) {}

    try {
      const result = await base44.entities.PurchaseRequest.list('-created_date', 10000);
      purchases = Array.isArray(result) ? result : [];
      for (const purchase of purchases) {
        const id = getMetaId(purchase);
        const name = getMetaName(purchase);
        if (id && name) map.set(id, name);
      }
    } catch (_) {}

    metaNameById = map;
    purchasesCache = purchases;
    return { map, purchases };
  })().finally(() => {
    dataPromise = null;
  });

  return dataPromise;
}

function extractVisibleIds(row) {
  const text = String(row?.textContent || '');
  return Array.from(new Set(text.match(/\b[a-f0-9]{24}\b/gi) || []));
}

function scorePurchaseForRow(purchase, rowText, visibleIds) {
  if (!purchase) return 0;
  let score = 0;

  if (purchase.id && visibleIds.includes(String(purchase.id))) score += 100;

  const nfNumber = firstFilled(purchase.nf_numero, purchase.numero_nf, purchase.numero_nota);
  if (nfNumber && rowText.includes(normalizeText(nfNumber))) score += 12;

  const supplier = firstFilled(purchase.fornecedor_nome, purchase.nf_emitente_nome);
  if (supplier && rowText.includes(normalizeText(supplier))) score += 10;

  const cnpj = firstFilled(purchase.fornecedor_cnpj, purchase.nf_emitente_cpf_cnpj, purchase.fornecedor_cpf_cnpj);
  if (cnpj && rowText.includes(normalizeText(cnpj))) score += 8;

  const description = firstFilled(purchase.descricao_item, purchase.descricao, purchase.rubrica_nome);
  if (description && rowText.includes(normalizeText(description).slice(0, 35))) score += 5;

  if (formatMoneyVariants(purchaseValue(purchase)).some((value) => value && rowText.includes(value))) score += 6;

  const date = firstFilled(purchase.nf_data_emissao, purchase.data_nf, purchase.data_emissao_nf, purchase.created_date);
  if (formatDateVariants(date).some((value) => value && rowText.includes(value))) score += 4;

  return score;
}

function findPurchaseForRow(row) {
  const rowText = normalizeText(row?.textContent || '');
  const visibleIds = extractVisibleIds(row);
  let best = null;
  let bestScore = 0;

  for (const purchase of purchasesCache) {
    const score = scorePurchaseForRow(purchase, rowText, visibleIds);
    if (score > bestScore) {
      best = purchase;
      bestScore = score;
    }
  }

  return bestScore >= 10 ? best : null;
}

function updateMetaCell(row, rubricaIndex) {
  const purchase = findPurchaseForRow(row);
  const metaId = getMetaId(purchase || {});
  const metaName = getMetaName(purchase || {}) || metaNameById.get(metaId) || '';

  let cell = row.querySelector('[data-compras-meta-cell="true"]');
  if (!cell) {
    cell = document.createElement('td');
    cell.className = 'px-3 py-2.5 align-top';
    cell.dataset.comprasMetaCell = 'true';
    row.insertBefore(cell, row.children[rubricaIndex]);
  }

  cell.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.className = 'max-w-[220px] space-y-1';

  const name = document.createElement('div');
  name.className = metaName ? 'break-words text-xs font-medium text-gray-700' : 'text-xs text-gray-400';
  name.textContent = metaName || '—';
  name.title = metaName || 'Meta não localizada na solicitação';
  wrapper.appendChild(name);

  if (metaId) {
    const id = document.createElement('div');
    id.className = 'break-all text-[10px] text-gray-400';
    id.textContent = metaId;
    wrapper.appendChild(id);
  }

  cell.appendChild(wrapper);
}

function removeCentroColumn(table) {
  const headerRow = table.querySelector('thead tr');
  if (!headerRow) return;

  const headers = Array.from(headerRow.children);
  const centerIndex = findHeaderIndex(headers, 'Centro');
  if (centerIndex < 0) return;

  headerRow.children[centerIndex]?.remove();
  table.querySelectorAll('tbody tr').forEach((row) => row.children[centerIndex]?.remove());
}

function installOnTable(table) {
  if (!table) return;
  removeCentroColumn(table);

  const headerRow = table.querySelector('thead tr');
  if (!headerRow) return;

  const headers = Array.from(headerRow.children);
  const rubricaIndex = findHeaderIndex(headers, 'Rubrica');
  if (rubricaIndex < 0) return;

  if (findHeaderIndex(headers, 'Meta') < 0) {
    const metaHeader = document.createElement('th');
    metaHeader.textContent = 'Meta';
    metaHeader.className = 'px-3 py-3 font-medium text-gray-600 w-[12%]';
    metaHeader.dataset.comprasMetaHeader = 'true';
    headerRow.insertBefore(metaHeader, headerRow.children[rubricaIndex]);
  }

  table.querySelectorAll('tbody tr').forEach((row) => updateMetaCell(row, rubricaIndex));
}

async function applyMetaColumn() {
  if (!isComprasRoute()) return;
  await loadData();
  document.querySelectorAll('table').forEach(installOnTable);
}

export function installComprasMetaColumn() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__comprasMetaColumnInstalled) return;
  window.__comprasMetaColumnInstalled = true;

  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(async () => {
      scheduled = false;
      await applyMetaColumn();
    });
  };

  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  document.addEventListener('visibilitychange', run);
  window.addEventListener('purchase:changed', () => {
    metaNameById = new Map();
    purchasesCache = [];
    run();
  });

  run();
}
