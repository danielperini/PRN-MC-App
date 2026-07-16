import { base44 } from '@/api/base44Client';

function isComprasRoute() {
  return typeof window !== 'undefined' && /^\/Compras(?:\/|$)/i.test(window.location.pathname);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
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

let metaNameById = new Map();
let metaMapPromise = null;

async function loadMetaMap() {
  if (metaMapPromise) return metaMapPromise;

  metaMapPromise = (async () => {
    const map = new Map();

    try {
      const metas = await base44.entities.ProjectMeta.list('ordem', 5000);
      for (const meta of Array.isArray(metas) ? metas : []) {
        const id = firstFilled(meta.id, meta.meta_id, meta.codigo, meta.meta_codigo);
        const name = firstFilled(meta.nome, meta.meta_nome, meta.titulo, meta.descricao);
        if (id && name) map.set(id, name);
      }
    } catch (_) {}

    try {
      const purchases = await base44.entities.PurchaseRequest.list('-created_date', 10000);
      for (const purchase of Array.isArray(purchases) ? purchases : []) {
        const id = getMetaId(purchase);
        const name = getMetaName(purchase);
        if (id && name) map.set(id, name);
      }
    } catch (_) {}

    metaNameById = map;
    return map;
  })().finally(() => {
    metaMapPromise = null;
  });

  return metaMapPromise;
}

function extractMetaIdFromDescription(row, descriptionIndex) {
  const descriptionCell = row.children[descriptionIndex];
  if (!descriptionCell) return '';

  const candidates = Array.from(descriptionCell.querySelectorAll('p, span, div'))
    .map((element) => String(element.textContent || '').trim())
    .filter(Boolean);

  return candidates.find((text) =>
    /^(MC[34]A[-\w]*|[a-f0-9]{24}|\d+\s*-\s*.+)$/i.test(text)
  ) || '';
}

function updateMetaCell(row, descriptionIndex, rubricaIndex) {
  const metaId = extractMetaIdFromDescription(row, descriptionIndex);
  const metaName = metaNameById.get(metaId) || '';

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
  name.title = metaName || 'Meta não informada na solicitação';
  wrapper.appendChild(name);

  if (metaId) {
    const id = document.createElement('div');
    id.className = 'break-all text-[10px] text-gray-400';
    id.textContent = metaId;
    wrapper.appendChild(id);
  }

  cell.appendChild(wrapper);
}

function installOnTable(table) {
  if (!table) return;

  const headerRow = table.querySelector('thead tr');
  if (!headerRow) return;

  const headers = Array.from(headerRow.children);
  const descriptionIndex = findHeaderIndex(headers, 'Descrição');
  const rubricaIndex = findHeaderIndex(headers, 'Rubrica');
  if (descriptionIndex < 0 || rubricaIndex < 0) return;

  if (findHeaderIndex(headers, 'Meta') < 0) {
    const metaHeader = document.createElement('th');
    metaHeader.textContent = 'Meta';
    metaHeader.className = 'px-3 py-3 font-medium text-gray-600 w-[12%]';
    metaHeader.dataset.comprasMetaHeader = 'true';
    headerRow.insertBefore(metaHeader, headerRow.children[rubricaIndex]);
  }

  table.querySelectorAll('tbody tr').forEach((row) => {
    updateMetaCell(row, descriptionIndex, rubricaIndex);
  });
}

async function applyMetaColumn() {
  if (!isComprasRoute()) return;
  await loadMetaMap();
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
    run();
  });

  run();
}
