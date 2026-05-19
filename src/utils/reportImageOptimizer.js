export const PDF_MAX_TOTAL_SIZE_MB = 200;
export const PDF_IMAGE_MAX_WIDTH = 1000;
export const PDF_IMAGE_MAX_HEIGHT = 1000;
export const PDF_IMAGE_QUALITY = 0.68;
export const PDF_IMAGE_MIME_TYPE = 'image/jpeg';

export const DEFAULT_OPTIONS = {
  maxWidth: PDF_IMAGE_MAX_WIDTH,
  maxHeight: PDF_IMAGE_MAX_HEIGHT,
  quality: PDF_IMAGE_QUALITY,
  mimeType: PDF_IMAGE_MIME_TYPE,
};

const SKIP_IMAGE_PATTERNS = [
  /viaduto-logo/i,
  /logo/i,
  /\.svg(\?|#|$)/i,
];

function shouldSkipImage(url = '') {
  const value = String(url || '');
  if (!value) return true;
  return SKIP_IMAGE_PATTERNS.some((pattern) => pattern.test(value));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('Imagem sem URL'));
      return;
    }

    if (typeof Image === 'undefined') {
      reject(new Error('API de imagem indisponivel neste ambiente'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Nao foi possivel carregar imagem: ${url}`));
    img.src = url;
  });
}

function getOptimizedDimensions(width, height, options = DEFAULT_OPTIONS) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const ratio = Math.min(
    1,
    options.maxWidth / safeWidth,
    options.maxHeight / safeHeight
  );

  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  };
}

export async function optimizeImageUrlForReport(url, options = DEFAULT_OPTIONS) {
  if (shouldSkipImage(url) || typeof document === 'undefined') return url;

  try {
    const img = await loadImage(url);
    const naturalWidth = img.naturalWidth || img.width || 1;
    const naturalHeight = img.naturalHeight || img.height || 1;
    const dimensions = getOptimizedDimensions(naturalWidth, naturalHeight, options);

    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return url;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL(options.mimeType, options.quality);
  } catch (error) {
    console.warn('Imagem mantida sem compressao para exportacao:', url, error);
    return url;
  }
}

async function optimizeUrlWithCache(url, cache, options) {
  if (!url || shouldSkipImage(url)) return url;
  if (cache.has(url)) return cache.get(url);

  const optimized = await optimizeImageUrlForReport(url, options);
  cache.set(url, optimized);
  return optimized;
}

export async function optimizeReportHtmlImages(html = '', options = DEFAULT_OPTIONS) {
  if (!html || typeof DOMParser === 'undefined') return html;

  const cache = new Map();
  const parser = new DOMParser();
  const documentHtml = parser.parseFromString(String(html), 'text/html');
  const images = Array.from(documentHtml.querySelectorAll('img[src]'));

  for (const image of images) {
    const src = image.getAttribute('src');
    const optimized = await optimizeUrlWithCache(src, cache, options);
    if (optimized && optimized !== src) {
      image.setAttribute('src', optimized);
    }
  }

  const styledElements = Array.from(documentHtml.querySelectorAll('[style*="url("]'));

  for (const element of styledElements) {
    const style = element.getAttribute('style') || '';
    const matches = Array.from(style.matchAll(/url\((['"]?)(.*?)\1\)/gi));
    let nextStyle = style;

    for (const match of matches) {
      const originalUrl = match[2];
      const optimized = await optimizeUrlWithCache(originalUrl, cache, options);
      if (optimized && optimized !== originalUrl) {
        nextStyle = nextStyle.replace(match[0], `url("${optimized}")`);
      }
    }

    if (nextStyle !== style) {
      element.setAttribute('style', nextStyle);
    }
  }

  const doctype = /^<!doctype/i.test(String(html).trim()) ? '<!doctype html>\n' : '';
  return `${doctype}${documentHtml.documentElement.outerHTML}`;
}
