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

function extractMetaText(row, descriptionIndex) {
  const cells = Array.from(row.children);
  const descriptionCell = cells[descriptionIndex];
  if (!descriptionCell) return '—';

  const candidates = Array.from(descriptionCell.querySelectorAll('p, span, div'))
    .map((element) => String(element.textContent || '').trim())
    .filter(Boolean);

  const explicit = candidates.find((text) =>
    /^(MC[34]A[-\w]*|\d+\s*-\s*.+|[a-f0-9]{24})$/i.test(text)
  );

  if (explicit) return explicit;

  const dataMeta = descriptionCell.querySelector('[data-meta-id], [data-meta], [title*="Meta"]');
  if (dataMeta) {
    return String(
      dataMeta.getAttribute('data-meta-id') ||
      dataMeta.getAttribute('data-meta') ||
      dataMeta.textContent ||
      ''
    ).trim() || '—';
  }

  return '—';
}

function installOnTable(table) {
  if (!table || table.dataset.comprasMetaColumn === 'true') return;

  const headerRow = table.querySelector('thead tr');
  if (!headerRow) return;

  const headers = Array.from(headerRow.children);
  const descriptionIndex = findHeaderIndex(headers, 'Descrição');
  const centerIndex = findHeaderIndex(headers, 'Centro');
  const rubricaIndex = findHeaderIndex(headers, 'Rubrica');

  if (descriptionIndex < 0 || centerIndex < 0 || rubricaIndex < 0) return;
  if (findHeaderIndex(headers, 'Meta') >= 0) {
    table.dataset.comprasMetaColumn = 'true';
    return;
  }

  const metaHeader = document.createElement('th');
  metaHeader.textContent = 'Meta';
  metaHeader.className = 'px-3 py-3 font-medium text-gray-600 w-[12%]';
  metaHeader.dataset.comprasMetaHeader = 'true';
  headerRow.insertBefore(metaHeader, headerRow.children[rubricaIndex]);

  table.querySelectorAll('tbody tr').forEach((row) => {
    if (row.querySelector('[data-compras-meta-cell="true"]')) return;

    const metaText = extractMetaText(row, descriptionIndex);
    const metaCell = document.createElement('td');
    metaCell.className = 'px-3 py-2.5 align-top';
    metaCell.dataset.comprasMetaCell = 'true';

    const value = document.createElement('span');
    value.className = metaText === '—'
      ? 'text-xs text-gray-400'
      : 'inline-block max-w-[180px] break-words text-xs font-medium text-gray-700';
    value.textContent = metaText;
    value.title = metaText === '—' ? 'Meta não informada' : metaText;

    metaCell.appendChild(value);
    row.insertBefore(metaCell, row.children[rubricaIndex]);
  });

  table.dataset.comprasMetaColumn = 'true';
}

function applyMetaColumn() {
  if (!isComprasRoute()) return;

  document.querySelectorAll('table').forEach((table) => {
    installOnTable(table);
  });
}

export function installComprasMetaColumn() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__comprasMetaColumnInstalled) return;
  window.__comprasMetaColumnInstalled = true;

  const run = () => window.requestAnimationFrame(applyMetaColumn);

  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  document.addEventListener('visibilitychange', run);

  run();
}
