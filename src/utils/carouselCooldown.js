// Controle de cooldown de fotos no carrossel do Dashboard.
// Fotos exibidas 2+ vezes no mesmo dia entram em cooldown de 7 dias,
// sendo removidas do pool do carrossel (mas continuam visíveis na galeria).

const COOLDOWN_KEY = 'carousel_cooldown';
const IMPRESSIONS_PREFIX = 'carousel_impressions_';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const MAX_DAILY_DISPLAYS = 2; // 2 exibições no dia ativa o cooldown

function getTodayKey() {
  // YYYY-MM-DD em horário local
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readCooldowns() {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeCooldowns(map) {
  try {
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
  } catch {
    // localStorage indisponível — cooldown desativa silenciosamente
  }
}

function readImpressions(dayKey) {
  try {
    const raw = localStorage.getItem(IMPRESSIONS_PREFIX + dayKey);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeImpressions(dayKey, map) {
  try {
    localStorage.setItem(IMPRESSIONS_PREFIX + dayKey, JSON.stringify(map));
  } catch {
    // localStorage indisponível — rastreamento desativa silenciosamente
  }
}

// Limpa cooldowns expirados e registros de dias anteriores.
function cleanup() {
  const now = Date.now();
  const cooldowns = readCooldowns();
  let changed = false;
  for (const url of Object.keys(cooldowns)) {
    if (!cooldowns[url] || cooldowns[url] <= now) {
      delete cooldowns[url];
      changed = true;
    }
  }
  if (changed) writeCooldowns(cooldowns);

  // Remove registros de impressões de dias anteriores (mantém só o de hoje)
  const todayKey = getTodayKey();
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(IMPRESSIONS_PREFIX) && key !== IMPRESSIONS_PREFIX + todayKey) {
      localStorage.removeItem(key);
    }
  }
}

// Retorna true se a URL está em cooldown ativo.
export function isUrlInCooldown(url) {
  if (!url) return false;
  cleanup();
  const cooldowns = readCooldowns();
  return Boolean(cooldowns[url] && cooldowns[url] > Date.now());
}

// Filtra um array de fotos (objetos com .url), removendo as em cooldown.
// Se filtered ficar com menos de minCount itens, retorna o array original
// (cooldown é relaxado para não esvaziar o carrossel).
export function filterByCooldown(photos, minCount = 4) {
  cleanup();
  const photosArr = Array.isArray(photos) ? photos : [];
  if (photosArr.length <= minCount) return photosArr;

  const filtered = photosArr.filter((p) => {
    const url = p?.url || p?.file_url || p?.imagem_url || '';
    return !isUrlInCooldown(url);
  });

  return filtered.length >= minCount ? filtered : photosArr;
}

// Registra a exibição de um conjunto de URLs no dia atual.
// Ativa cooldown para URLs que ultrapassam MAX_DAILY_DISPLAYS.
// Retorna a lista de URLs que acabaram de entrar em cooldown.
export function registerImpressions(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  cleanup();

  const dayKey = getTodayKey();
  const impressions = readImpressions(dayKey);
  const cooldowns = readCooldowns();
  const newlyCooldown = [];

  for (const rawUrl of urls) {
    const url = String(rawUrl || '').trim();
    if (!url) continue;

    impressions[url] = (impressions[url] || 0) + 1;

    if (impressions[url] >= MAX_DAILY_DISPLAYS && !cooldowns[url]) {
      cooldowns[url] = Date.now() + COOLDOWN_MS;
      newlyCooldown.push(url);
    }
  }

  writeImpressions(dayKey, impressions);
  if (newlyCooldown.length > 0) writeCooldowns(cooldowns);

  return newlyCooldown;
}

// Reseta manualmente todo o cooldown (uso administrativo, se necessário).
export function clearAllCooldown() {
  try {
    localStorage.removeItem(COOLDOWN_KEY);
  } catch {
    // ignore
  }
  const todayKey = getTodayKey();
  try {
    localStorage.removeItem(IMPRESSIONS_PREFIX + todayKey);
  } catch {
    // ignore
  }
}