const RUNTIME_FLAG = '__museusCentroFormAccessibilityRuntime';

function slugify(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function makeId(prefix, index) {
  const safePrefix = slugify(prefix) || 'campo';
  return `mc-${safePrefix}-${index}`;
}

function getFieldLabelText(field) {
  const container = field.closest('div, section, article, form') || field.parentElement;
  const label = container?.querySelector?.('label');
  const placeholder = field.getAttribute('placeholder');
  const aria = field.getAttribute('aria-label');
  return aria || placeholder || label?.textContent || field.type || field.tagName || 'campo';
}

function ensureFieldIdentity(root = document) {
  const fields = Array.from(root.querySelectorAll('input, textarea, select'));

  fields.forEach((field, index) => {
    if (field.type === 'hidden') return;

    const labelText = getFieldLabelText(field);
    const fallbackId = field.id || makeId(labelText, index + 1);

    if (!field.id) field.id = fallbackId;
    if (!field.name) field.name = fallbackId;
  });
}

function ensureLabelAssociations(root = document) {
  const labels = Array.from(root.querySelectorAll('label'));

  labels.forEach((label, index) => {
    if (label.htmlFor) return;

    const nestedField = label.querySelector('input, textarea, select');
    if (nestedField) {
      const fallbackId = nestedField.id || makeId(label.textContent || 'campo', index + 1);
      if (!nestedField.id) nestedField.id = fallbackId;
      if (!nestedField.name) nestedField.name = fallbackId;
      label.htmlFor = fallbackId;
      return;
    }

    const parent = label.parentElement;
    const siblingField = parent?.querySelector?.('input, textarea, select');
    if (!siblingField) return;

    const fallbackId = siblingField.id || makeId(label.textContent || 'campo', index + 1);
    if (!siblingField.id) siblingField.id = fallbackId;
    if (!siblingField.name) siblingField.name = fallbackId;
    label.htmlFor = fallbackId;
  });
}

function runFormAccessibilityPass(root = document) {
  if (typeof document === 'undefined') return;
  try {
    ensureFieldIdentity(root);
    ensureLabelAssociations(root);
  } catch (error) {
    console.warn('[Acessibilidade] Não foi possível associar todos os campos de formulário.', error);
  }
}

function schedulePass(root = document) {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => runFormAccessibilityPass(root));
}

export function installFormAccessibilityRuntime() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[RUNTIME_FLAG]) return;
  window[RUNTIME_FLAG] = true;

  schedulePass();
  window.setTimeout(() => schedulePass(), 600);
  window.addEventListener('focusin', () => schedulePass(), { passive: true });
  window.addEventListener('click', () => schedulePass(), { passive: true });

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => Array.from(mutation.addedNodes || []).some((node) => node?.nodeType === 1));
    if (relevant) schedulePass();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

installFormAccessibilityRuntime();
