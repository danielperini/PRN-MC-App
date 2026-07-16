import { base44 } from '@/api/base44Client';

function isComprasRoute() {
  return typeof window !== 'undefined' && /^\/Compras(?:\/|$)/i.test(window.location.pathname);
}

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function first(...values) {
  return values.map(text).find(Boolean) || '';
}

function metaId(item = {}) {
  return first(
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

function metaName(item = {}) {
  return first(
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

function headerIndex(headers, label) {
  const expected = normalize(label);
  return headers.findIndex((header) => normalize(header.textContent).includes(expected));
}

let metaById = new Map();
let purchaseById = new Map();
let loadPromise = null;

async function loadData() {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.allSettled([
    base44.entities?.ProjectMeta?.list?.('ordem', 5000),
    base44.entities?.PurchaseRequest?.list?.('-created_date', 10000),
  ]).then(([metasResult, purchasesResult]) => {
    const metas = metasResult.status === 'fulfilled' && Array.isArray(metasResult.value) ? metasResult.value : [];
    const purchases = purchasesResult.status === 'fulfilled' && Array.isArray(purchasesResult.value) ? purchasesResult.value : [];

    const nextMetaById = new Map();
    const nextPurchaseById = new Map();

    for (const meta of metas) {
      const id = first(meta.id, meta.meta_id, meta.codigo, meta.meta_codigo);
      const name = first(meta.nome, meta.meta_nome, meta.titulo, meta.descricao);
      if (id && name) nextMetaById.set(id, name);
    }

    for (const purchase of purchases) {
      if (purchase?.id) nextPurchaseById.set(String(purchase.id), purchase);
      const id = metaId(purchase);
      const name = metaName(purchase);
      if (id && name && !nextMetaById.has(id)) nextMetaById.set(id, name);
    }

    metaById = nextMetaById;
    purchaseById = nextPurchaseById;
  }).finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

function purchaseFromRow(row) {
  const visibleIds = text(row?.textContent).match(/\b[a-f0-9]{24}\b/gi) || [];
  for (const id of visibleIds) {
    const purchase = purchaseById.get(id);
    if (purchase) return purchase;
  }
  return null;
}

function ensureMetaCell(row, rubricaIndex) {
  const purchase = purchaseFromRow(row);
  const id = metaId(purchase || {});
  const name = metaName(purchase || {}) || metaById.get(id) || '';
  const signature = `${id}|${name}`;

  let cell = row.querySelector('[data-compras-meta-cell="true"]');
  if (!cell) {
    cell = document.createElement('td');
    cell.className = 'px-3 py-2.5 align-top';
    cell.dataset.comprasMetaCell = 'true';
    row.insertBefore(cell, row.children[rubricaIndex] || null);
  }

  if (cell.dataset.metaSignature === signature) return;
  cell.dataset.metaSignature = signature;
  cell.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'max-w-[220px] space-y-1';

  const nameElement = document.createElement('div');
  nameElement.className = name ? 'break-words text-xs font-medium text-gray-700' : 'text-xs text-gray-400';
  nameElement.textContent = name || '—';
  nameElement.title = name || 'Meta não localizada na solicitação';
  wrapper.appendChild(nameElement);

  if (id) {
    const idElement = document.createElement('div');
    idElement.className = 'break-all text-[10px] text-gray-400';
    idElement.textContent = id;
    wrapper.appendChild(idElement);
  }

  cell.appendChild(wrapper);
}

function applyToTable(table) {
  const headerRow = table.querySelector('thead tr');
  if (!headerRow) return;

  let headers = Array.from(headerRow.children);
  const centroIndex = headerIndex(headers, 'Centro');
  if (centroIndex >= 0 && !headerRow.children[centroIndex]?.dataset?.comprasMetaHeader) {
    headerRow.children[centroIndex]?.remove();
    table.querySelectorAll('tbody tr').forEach((row) => row.children[centroIndex]?.remove());
    headers = Array.from(headerRow.children);
  }

  let rubricaIndex = headerIndex(headers, 'Rubrica');
  if (rubricaIndex < 0) return;

  if (headerIndex(headers, 'Meta') < 0) {
    const metaHeader = document.createElement('th');
    metaHeader.textContent = 'Meta';
    metaHeader.className = 'px-3 py-3 font-medium text-gray-600 w-[12%]';
    metaHeader.dataset.comprasMetaHeader = 'true';
    headerRow.insertBefore(metaHeader, headerRow.children[rubricaIndex] || null);
    rubricaIndex += 1;
  }

  table.querySelectorAll('tbody tr').forEach((row) => ensureMetaCell(row, rubricaIndex));
}

async function apply() {
  if (!isComprasRoute()) return;
  await loadData();
  document.querySelectorAll('table').forEach(applyToTable);
}

export function installComprasMetaColumn() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.__comprasMetaColumnInstalled) return;
  window.__comprasMetaColumnInstalled = true;

  let scheduled = false;
  const run = () => {
    if (!isComprasRoute() || scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      apply().catch((error) => console.error('[ComprasMetaColumn]', error)).finally(() => {
        scheduled = false;
      });
    });
  };

  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  window.addEventListener('purchase:changed', () => {
    metaById = new Map();
    purchaseById = new Map();
    run();
  });
  run();
}
