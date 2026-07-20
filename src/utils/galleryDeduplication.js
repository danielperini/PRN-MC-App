/**
 * Deduplicação em 3 camadas para a galeria de fotos:
 * 1) URL idêntica
 * 2) Nome de arquivo idêntico dentro do mesmo museu (sectionKey)
 * 3) Nome de arquivo com hash semelhante (sufixos _1, _2, _copy, (1), (2)) dentro do mesmo sectionKey
 *
 * Retorna { deduped, duplicates, totalBruto, totalDeduped, totalOcultadas }
 * - deduped: array de fotos únicas (mantém a versão com melhor legenda)
 * - duplicates: array de { kept, removed, layer, reason } para o painel de revisão
 */

function normalizeFileNameForDedup(fileName = '') {
  return String(fileName || '')
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .pop()
    ?.replace(/\.(jpg|jpeg|png|webp|gif|bmp|avif|heic)$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() || '';
}

/**
 * Remove sufixos de cópia/duplicata do nome normalizado.
 * Ex: "foto_atividade_1" -> "foto atividade"
 *     "foto_atividade_copy" -> "foto atividade"
 *     "foto_atividade (2)" -> "foto atividade"
 */
function stripCopySuffix(normalizedName = '') {
  return normalizedName
    .replace(/[_\s]copy$/i, '')
    .replace(/[_\s]copia$/i, '')
    .replace(/[_\s]cópia$/i, '')
    .replace(/\s*\(\d+\)\s*$/i, '')
    .replace(/[_\s](\d+)$/i, '') // remove _1, _2, _3 no final
    .replace(/\s+$/i, '')
    .trim();
}

function captionScore(photo = {}) {
  const cap = String(photo.legenda || photo.caption || '').trim();
  if (!cap) return 0;
  // Legendas genéricas/importadas têm score menor
  if (/^foto da galeria$/i.test(cap)) return 1;
  if (/^galeria /i.test(cap)) return 2;
  return 3;
}

function chooseBestForDedup(a, b) {
  const scoreA = captionScore(a);
  const scoreB = captionScore(b);
  if (scoreB > scoreA) return b;
  if (scoreA > scoreB) return a;
  // desempate: mais metadados
  const metaA = [a.museu, a.localizacao, a.reportMes, a.authorName, a.activityTitulo].filter(Boolean).length;
  const metaB = [b.museu, b.localizacao, b.reportMes, b.authorName, b.activityTitulo].filter(Boolean).length;
  if (metaB > metaA) return b;
  return a;
}

export function deduplicateGalleryPhotos(photos = []) {
  const input = Array.isArray(photos) ? photos : [];
  const totalBruto = input.length;
  const duplicates = [];

  // Camada 1: URL idêntica
  const seenByUrl = new Map();
  const afterLayer1 = [];
  for (const photo of input) {
    if (!photo) continue;
    const url = String(photo.fileUrl || '').toLowerCase();
    if (!url) {
      afterLayer1.push(photo);
      continue;
    }
    const urlKey = url.includes('drive.google.com/thumbnail') || url.includes('lh3.googleusercontent.com')
      ? url
      : url.split('?')[0];
    if (seenByUrl.has(urlKey)) {
      const kept = seenByUrl.get(urlKey);
      const best = chooseBestForDedup(kept, photo);
      const removed = best === kept ? photo : kept;
      seenByUrl.set(urlKey, best);
      if (best === photo) {
        afterLayer1.splice(afterLayer1.indexOf(kept), 1, best);
      }
      duplicates.push({ kept: best, removed, layer: 'url', reason: 'URL idêntica' });
      continue;
    }
    seenByUrl.set(urlKey, photo);
    afterLayer1.push(photo);
  }

  // Camada 2: Nome de arquivo idêntico dentro do mesmo sectionKey
  const seenByName = new Map();
  const afterLayer2 = [];
  for (const photo of afterLayer1) {
    if (!photo) continue;
    const sectionKey = photo.sectionKey || 'SEM_IDENTIFICACAO';
    const fileNameNorm = normalizeFileNameForDedup(photo.fileName);
    if (!fileNameNorm) {
      afterLayer2.push(photo);
      continue;
    }
    const nameKey = `${sectionKey}::${fileNameNorm}`;
    if (seenByName.has(nameKey)) {
      const kept = seenByName.get(nameKey);
      const best = chooseBestForDedup(kept, photo);
      const removed = best === kept ? photo : kept;
      seenByName.set(nameKey, best);
      if (best === photo) {
        afterLayer2.splice(afterLayer2.indexOf(kept), 1, best);
      }
      duplicates.push({ kept: best, removed, layer: 'filename', reason: 'Nome de arquivo idêntico' });
      continue;
    }
    seenByName.set(nameKey, photo);
    afterLayer2.push(photo);
  }

  // Camada 3: Nome de arquivo com hash semelhante (sufixos _1, _2, _copy) dentro do mesmo sectionKey
  const seenByBaseName = new Map();
  const afterLayer3 = [];
  for (const photo of afterLayer2) {
    if (!photo) continue;
    const sectionKey = photo.sectionKey || 'SEM_IDENTIFICACAO';
    const fileNameNorm = normalizeFileNameForDedup(photo.fileName);
    const baseName = fileNameNorm ? stripCopySuffix(fileNameNorm) : '';
    if (!baseName || baseName === fileNameNorm) {
      afterLayer3.push(photo);
      continue;
    }
    const baseKey = `${sectionKey}::${baseName}`;
    if (seenByBaseName.has(baseKey)) {
      const kept = seenByBaseName.get(baseKey);
      const best = chooseBestForDedup(kept, photo);
      const removed = best === kept ? photo : kept;
      seenByBaseName.set(baseKey, best);
      if (best === photo) {
        afterLayer3.splice(afterLayer3.indexOf(kept), 1, best);
      }
      duplicates.push({ kept: best, removed, layer: 'similar_filename', reason: 'Arquivo similar (cópia/versão)' });
      continue;
    }
    seenByBaseName.set(baseKey, photo);
    afterLayer3.push(photo);
  }

  return {
    deduped: afterLayer3,
    duplicates,
    totalBruto,
    totalDeduped: afterLayer3.length,
    totalOcultadas: totalBruto - afterLayer3.length,
  };
}