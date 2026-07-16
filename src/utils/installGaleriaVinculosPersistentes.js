import { base44 } from '@/api/base44Client';

const ROUTE_PATTERN = /GaleriaFotos/i;
const MAINTENANCE_TERMS = ['manutencao', 'manutenção', 'reparo', 'reparos', 'eletrico', 'elétrico', 'hidraulico', 'hidráulico', 'peca em destaque', 'peça em destaque', 'traco ao pixel', 'traço ao pixel', 'montagem tecnica', 'montagem técnica'];

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateISO(value) {
  if (!value) return '';
  const direct = text(value).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  if (!a || !b) return 9999;
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function museum(item = {}) {
  const raw = normalize(item.museu || item.unidade || item.centro_custo || item.local || item.localizacao || '');
  if (raw.includes('mis') || raw.includes('imagem') || raw.includes('som')) return 'MIS';
  if (raw.includes('mhab') || raw.includes('abilio') || raw.includes('histor')) return 'MHAB';
  if (raw.includes('mumo') || raw.includes('moda')) return 'MUMO';
  return raw;
}

function title(item = {}) {
  return text(item.titulo || item.nome_atividade || item.nome || item.atividade || item.legenda || item.caption || item.descricao || item.description || item.file_name || item.file_name_original);
}

function photoUrl(item = {}) {
  return text(item.file_url || item.foto_url || item.image_url || item.url || item.arquivo_url || item.photo_url || item.media_url);
}

function photoDate(item = {}) {
  return dateISO(item.data || item.data_atividade || item.data_inicio || item.created_date || item.updated_date);
}

function activityDate(item = {}) {
  return dateISO(item.data || item.data_atividade || item.data_inicio || item.start_date || item.created_date);
}

function activityId(item = {}) {
  return text(item.id || item.activity_id || item.atividade_id || item.programacao_id || item.evento_id);
}

function isMaintenance(item = {}) {
  const value = normalize(title(item));
  return MAINTENANCE_TERMS.some((term) => value.includes(normalize(term)));
}

function scoreMatch(photo, activity) {
  const photoText = normalize(`${title(photo)} ${photo.file_name || ''} ${photo.file_name_original || ''}`);
  const activityText = normalize(title(activity));
  let score = 0;
  if (museum(photo) && museum(photo) === museum(activity)) score += 35;
  const distance = daysBetween(photoDate(photo), activityDate(activity));
  if (distance <= 3) score += 30;
  else if (distance <= 7) score += 22;
  else if (distance <= 15) score += 12;
  const activityTokens = activityText.split(' ').filter((token) => token.length >= 5);
  const common = activityTokens.filter((token) => photoText.includes(token)).length;
  score += Math.min(30, common * 6);
  if (isMaintenance(activity) && MAINTENANCE_TERMS.some((term) => photoText.includes(normalize(term)))) score += 15;
  return score;
}

function qualityScore(photo = {}) {
  const width = Number(photo.width || photo.largura || photo.image_width || 0);
  const height = Number(photo.height || photo.altura || photo.image_height || 0);
  const size = Number(photo.size_bytes || photo.file_size || photo.tamanho || 0);
  const caption = title(photo).length;
  const original = /original/i.test(`${photo.tipo || ''} ${photo.file_name || ''}`) ? 25 : 0;
  return width * height + size + caption * 1000 + original;
}

async function safeList(name, limit = 10000) {
  try {
    const entity = base44?.entities?.[name];
    if (!entity?.list) return [];
    const rows = await entity.list('-created_date', limit);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn(`[Galeria] Falha ao listar ${name}`, error);
    return [];
  }
}

async function updateEntity(name, id, payload) {
  const entity = base44?.entities?.[name];
  if (!entity?.update || !id) return false;
  await entity.update(id, payload);
  return true;
}

async function persistLinksAndDuplicates() {
  const [activities, programacoes, reportPhotos, attachments] = await Promise.all([
    safeList('Atividade'),
    safeList('Programacao'),
    safeList('ReportPhoto'),
    safeList('Attachment'),
  ]);

  const maintenanceActivities = [...activities, ...programacoes]
    .filter(isMaintenance)
    .filter((item) => activityId(item));

  const photos = [
    ...reportPhotos.map((item) => ({ ...item, __entity: 'ReportPhoto' })),
    ...attachments.map((item) => ({ ...item, __entity: 'Attachment' })),
  ].filter((item) => photoUrl(item));

  let linked = 0;
  for (const photo of photos) {
    if (text(photo.activity_id || photo.atividade_id || photo.programacao_id)) continue;
    let best = null;
    for (const activity of maintenanceActivities) {
      const score = scoreMatch(photo, activity);
      if (!best || score > best.score) best = { activity, score };
    }
    if (!best || best.score < 55) continue;
    const id = activityId(best.activity);
    await updateEntity(photo.__entity, photo.id, {
      activity_id: id,
      atividade_id: id,
      atividade_nome: title(best.activity),
      museu: museum(best.activity) || photo.museu,
      vinculo_foto_origem: 'inferido_por_ia',
      vinculo_foto_confianca: Math.min(0.99, best.score / 100),
      vinculo_foto_criterio: 'museu+periodo+titulo+manutencao',
      vinculo_foto_atualizado_em: new Date().toISOString(),
    });
    photo.activity_id = id;
    photo.atividade_id = id;
    linked += 1;
  }

  const groups = new Map();
  for (const photo of photos) {
    const key = text(photo.activity_id || photo.atividade_id || photo.programacao_id);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
  }

  let hidden = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => qualityScore(b) - qualityScore(a));
    const keeper = sorted[0];
    await updateEntity(keeper.__entity, keeper.id, {
      galeria_oculta: false,
      foto_principal_atividade: true,
      duplicada: false,
      duplicada_de: null,
    });
    for (const duplicate of sorted.slice(1)) {
      await updateEntity(duplicate.__entity, duplicate.id, {
        galeria_oculta: true,
        foto_principal_atividade: false,
        duplicada: true,
        duplicada_de: keeper.id,
        motivo_ocultacao: 'foto_repetida_da_mesma_atividade',
        ocultada_em: new Date().toISOString(),
      });
      hidden += 1;
    }
  }

  try {
    window.localStorage.removeItem('museus_centro_galeria_fotos_cache_v2');
  } catch (_) {}

  return { linked, hidden, maintenanceActivities: maintenanceActivities.length };
}

function isGalleryRoute() {
  return typeof window !== 'undefined' && ROUTE_PATTERN.test(window.location.pathname);
}

function installButton() {
  if (!isGalleryRoute()) return;
  const titleNode = [...document.querySelectorAll('h1')].find((node) => normalize(node.textContent).includes('galeria de fotos'));
  const toolbar = titleNode?.closest('.mb-8')?.querySelector('.flex.flex-wrap.gap-2');
  if (!toolbar || toolbar.querySelector('[data-ajustar-vinculos-fotos]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.ajustarVinculosFotos = 'true';
  button.className = 'inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-60';
  button.textContent = 'Ajustar vínculos e repetidas';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Analisando fotos e atividades...';
    try {
      const result = await persistLinksAndDuplicates();
      window.alert(`${result.linked} foto(s) vinculada(s) e ${result.hidden} repetida(s) ocultada(s).`);
      window.location.reload();
    } catch (error) {
      console.error(error);
      window.alert(`Falha ao ajustar vínculos: ${error?.message || String(error)}`);
      button.disabled = false;
      button.textContent = 'Ajustar vínculos e repetidas';
    }
  });
  toolbar.prepend(button);
}

export function installGaleriaVinculosPersistentes() {
  if (typeof window === 'undefined' || window.__galeriaVinculosPersistentesInstalled) return;
  window.__galeriaVinculosPersistentesInstalled = true;
  let timer = null;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(installButton, 100);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
