import { base44 } from '@/api/base44Client';

function dedupeById(items) {
  if (!Array.isArray(items)) return items;
  const seen = new Set();
  return items.filter((item, index) => {
    const key = item?.id || item?._id || `index:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wrapList(entityName) {
  const entity = base44.entities?.[entityName];
  if (!entity?.list || entity.__dedupeWrapped) return;
  const original = entity.list.bind(entity);
  entity.list = async (...args) => dedupeById(await original(...args));
  entity.__dedupeWrapped = true;
}

function disableMissingProfileEntity() {
  const profile = base44.entities?.Profile;
  if (!profile || profile.__missingEntityGuard) return;

  profile.list = async () => [];
  profile.filter = async () => [];
  profile.get = async () => null;
  profile.__missingEntityGuard = true;
}

function installRechartsMinimumSize() {
  if (typeof document === 'undefined' || document.getElementById('recharts-minimum-size-guard')) return;
  const style = document.createElement('style');
  style.id = 'recharts-minimum-size-guard';
  style.textContent = `
    .recharts-responsive-container {
      min-width: 1px !important;
      min-height: 1px !important;
    }
  `;
  document.head.appendChild(style);
}

export function installRuntimeErrorGuards() {
  disableMissingProfileEntity();
  ['RelatorioExecucaoObjeto', 'ProjectMeta', 'PurchaseRequest', 'DocumentIntake'].forEach(wrapList);
  installRechartsMinimumSize();
}
