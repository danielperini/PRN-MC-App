// Deduplicação de fotos da galeria por URL base, nome de arquivo e drive_file_id
// Retorna grupos de duplicatas (arrays de fotos) com sugestão de "manter"

function normalizeUrlBase(url = '') {
  if (!url) return '';
  return String(url).split('?')[0].split('#')[0].trim().toLowerCase();
}

function normalizeFileName(name = '') {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function isGenericCaption(caption = '') {
  if (!caption) return true;
  const t = String(caption).trim().toLowerCase();
  if (!t) return true;
  const genericos = [
    'gallery:',
    'registro fotográfico',
    'registro fotografico',
    'oficina',
    'foto',
    'imagem',
    'atividade',
  ];
  return genericos.some((g) => t === g || t.startsWith(g));
}

// Agrupa fotos duplicadas. Retorna array de grupos; cada grupo tem { chave, tipo, fotos[] }
export function detectarDuplicatas(fotos = []) {
  const grupos = new Map();

  fotos.forEach((foto) => {
    const urlBase = normalizeUrlBase(foto.fileUrl || foto.file_url);
    const nameNorm = normalizeFileName(foto.fileName || foto.file_name);
    const driveId = (foto.drive_file_id || '').toString().trim();

    const chaves = [];
    if (driveId) chaves.push({ chave: `drive:${driveId}`, tipo: 'drive_file_id' });
    if (urlBase) chaves.push({ chave: `url:${urlBase}`, tipo: 'url' });
    if (nameNorm && nameNorm.length >= 6) chaves.push({ chave: `name:${nameNorm}`, tipo: 'fileName' });

    chaves.forEach(({ chave, tipo }) => {
      if (!grupos.has(chave)) grupos.set(chave, { chave, tipo, fotos: [] });
      grupos.get(chave).fotos.push(foto);
    });
  });

  // Só grupos com 2+ fotos são duplicatas reais
  const gruposDuplicatas = Array.from(grupos.values()).filter((g) => g.fotos.length > 1);

  // Desduplica grupos sobrepostos (mesma foto pode aparecer em vários grupos)
  const vistos = new Set();
  const resultado = [];
  gruposDuplicatas.forEach((g) => {
    const ids = g.fotos.map((f) => f.id || f.fileUrl).sort();
    const key = ids.join('|');
    if (vistos.has(key)) return;
    vistos.add(key);
    resultado.push(g);
  });

  return resultado;
}

// Sugere qual foto manter em cada grupo de duplicatas:
// prioriza a que tem legenda não-genérica; empate → maior created_date
export function sugerirManter(grupo) {
  if (!grupo || !grupo.fotos.length) return null;
  const ordenadas = [...grupo.fotos].sort((a, b) => {
    const aTemLegenda = !isGenericCaption(a.legenda || a.caption);
    const bTemLegenda = !isGenericCaption(b.legenda || b.caption);
    if (aTemLegenda !== bTemLegenda) return aTemLegenda ? -1 : 1;
    const da = new Date(a.created_date || a.date || 0).getTime();
    const db = new Date(b.created_date || b.date || 0).getTime();
    return db - da;
  });
  return ordenadas[0];
}

// Retorna IDs das fotos a remover (duplicatas que não são a "manter")
export function idsParaRemover(gruposDuplicatas = []) {
  const remover = new Set();
  gruposDuplicatas.forEach((g) => {
    const manter = sugerirManter(g);
    g.fotos.forEach((f) => {
      const fid = f.id || f.fileUrl;
      if (manter && (f.id || f.fileUrl) !== (manter.id || manter.fileUrl)) {
        remover.add(fid);
      }
    });
  });
  return Array.from(remover);
}

export function isLegendaGenerica(caption = '') {
  return isGenericCaption(caption);
}

export { normalizeUrlBase, normalizeFileName };