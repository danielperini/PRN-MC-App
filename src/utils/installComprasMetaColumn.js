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

function meaningfulTexts(cell) {
  if (!cell) return [];
  return Array.from(cell.querySelectorAll('p, span, div'))
    .map((element) => String(element.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((text, index, list) => list.indexOf(text) === index)
    .filter((text) => !/^\d{6}\s*[–-]/.test(text))
    .filter((text) => !/^\d{2}\.\d{2}\.\d{2}/.test(text))
    .filter((text) => !/^(geral|rateado|mis|mumo|mhab)$/i.test(text));
}

function extractMetaFromRubricaCell(row, rubricaIndex) {
  const rubricaCell = row.children[rubricaIndex];
  const candidates = meaningfulTexts(rubricaCell)
    .filter((text) => !/^(equipe e gest[aã]o|manuten[cç][aã]o e opera[cç][aã]o|despesas gerais|noturno nos museus 2026)$/i.test(text))
    .filter((text) => !/^(outros servi[cç]os|servi[cç]os de terceiros)/i.test(text));

  if (!candidates.length) return '';

  return [...candidates].sort((a, b) => b.length - a.length)[0];
}

function extractMetaFromDescription(row, descriptionIndex) {
  const descriptionCell = row.children[descriptionIndex];
  if (!descriptionCell) return '';

  const dataMeta = descriptionCell.querySelector('[data-meta-nome], [data-meta-name], [data-meta]');
  if (dataMeta) {
    const value = String(
      dataMeta.getAttribute('data-meta-nome') ||
      dataMeta.getAttribute('data-meta-name') ||
      dataMeta.getAttribute('data-meta') ||
      dataMeta.textContent ||
      ''
    ).trim();
    if (value && !/^[a-f0-9]{24}$/i.test(value) && !/^MC[34]A[-\w]*$/i.test(value)) return value;
  }

  return '';
}

function extractMetaText(row, descriptionIndex, rubricaIndex) {
  return extractMetaFromDescription(row, descriptionIndex)
    || extractMetaFromRubricaCell(row, rubricaIndex)
    || '—';
}

function installOnTable(table) {
  if (!table) return;

  const headerRow = table.querySelector('thead tr');
  if (!headerRow) return;

  let headers = Array.from(headerRow.children);
  const descriptionIndex = findHeaderIndex(headers, 'Descrição');
  const rubricaIndex = findHeaderIndex(headers, 'Rubrica');
  if (descriptionIndex < 0 || rubricaIndex < 0) return;

  const existingMetaIndex = findHeaderIndex(headers, 'Meta');
  if (existingMetaIndex >= 0) {
    table.querySelectorAll('[data-compras-meta-cell="true"]').forEach((cell) => cell.remove());
    const header = headers[existingMetaIndex];
    if (header?.dataset?.comprasMetaHeader === 'true') header.remove();
  }

  headers = Array.from(headerRow.children);
  const currentRubricaIndex = findHeaderIndex(headers, 'Rubrica');
  if (currentRubricaIndex < 0) return;

  const metaHeader = document.createElement('th');
  metaHeader.textContent = 'Meta';
  metaHeader.className = 'px-3 py-3 font-medium text-gray-600 w-[15%]';
  metaHeader.dataset.comprasMetaHeader = 'true';
  headerRow.insertBefore(metaHeader, headerRow.children[currentRubricaIndex]);

  table.querySelectorAll('tbody tr').forEach((row) => {
    const metaText = extractMetaText(row, descriptionIndex, currentRubricaIndex);
    const metaCell = document.createElement('td');
    metaCell.className = 'px-3 py-2.5 align-top';
    metaCell.dataset.comprasMetaCell = 'true';

    const value = document.createElement('span');
    value.className = metaText === '—'
      ? 'text-xs text-gray-400'
      : 'inline-block max-w-[220px] break-words text-xs font-medium text-gray-700';
    value.textContent = metaText;
    value.title = metaText === '—' ? 'Meta não informada' : metaText;

    metaCell.appendChild(value);
    row.insertBefore(metaCell, row.children[currentRubricaIndex]);
  });

  table.dataset.comprasMetaColumn = 'true';
}

function applyMetaColumn() {
  if (!isComprasRoute()) return;
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
    window.requestAnimationFrame(() => {
      scheduled = false;
      applyMetaColumn();
    });
  };

  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  document.addEventListener('visibilitychange', run);
  run();
}
