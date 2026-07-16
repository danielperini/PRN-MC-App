const ROUTE_PATTERN = /GaleriaFotos/i;

function text(value) {
  return String(value || '').trim();
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isGalleryRoute() {
  return typeof window !== 'undefined' && ROUTE_PATTERN.test(window.location.pathname);
}

function albumTitle(section) {
  return text(section?.querySelector('h2')?.textContent) || 'Álbum fotográfico';
}

function collectPhotos(section) {
  return [...section.querySelectorAll('button.group')].map((card) => {
    const image = card.querySelector('img');
    if (!image?.src) return null;
    const paragraphs = [...card.querySelectorAll('p')]
      .map((item) => text(item.textContent))
      .filter(Boolean);
    return {
      src: image.currentSrc || image.src,
      caption: paragraphs[0] || image.alt || 'Foto da galeria',
      details: paragraphs.slice(1).join(' · '),
    };
  }).filter(Boolean);
}

function buildHtml(title, photos) {
  const pages = photos.map((photo, index) => `
    <figure class="photo-page">
      <div class="photo-frame"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.caption)}" /></div>
      <figcaption>
        <strong>${escapeHtml(photo.caption)}</strong>
        ${photo.details ? `<small>${escapeHtml(photo.details)}</small>` : ''}
        <span>Imagem ${index + 1} de ${photos.length}</span>
      </figcaption>
    </figure>`).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; background: #fff; }
.cover { min-height: 185mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
.cover h1 { margin: 0 0 8mm; font-size: 28pt; }
.cover p { margin: 2mm 0; color: #555; font-size: 13pt; }
.photo-page { min-height: 185mm; margin: 0; display: grid; grid-template-rows: 1fr auto; gap: 5mm; page-break-after: always; break-after: page; }
.photo-frame { min-height: 145mm; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f5f5f5; border: 1px solid #ddd; }
.photo-frame img { width: 100%; height: 145mm; object-fit: contain; display: block; }
figcaption { border-top: 1px solid #ddd; padding-top: 4mm; }
figcaption strong { display: block; font-size: 15pt; line-height: 1.25; }
figcaption small { display: block; margin-top: 2mm; color: #666; font-size: 9pt; }
figcaption span { float: right; margin-top: 2mm; color: #777; font-size: 8pt; }
</style>
</head>
<body>
<section class="cover">
  <h1>${escapeHtml(title)}</h1>
  <p>Galeria fotográfica completa</p>
  <p>${photos.length} ${photos.length === 1 ? 'imagem' : 'imagens'}</p>
</section>
${pages}
</body>
</html>`;
}

function exportAlbum(section, button) {
  const title = albumTitle(section);
  const photos = collectPhotos(section);
  if (!photos.length) {
    window.alert('Este álbum não possui imagens disponíveis para exportação.');
    return;
  }

  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparando PDF...';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    button.disabled = false;
    button.textContent = previousText;
    window.alert('Não foi possível preparar o PDF deste álbum.');
    return;
  }

  doc.open();
  doc.write(buildHtml(title, photos));
  doc.close();

  const images = [...doc.images];
  const ready = Promise.all(images.map((image) => image.complete
    ? Promise.resolve()
    : new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
      })));

  ready.finally(() => {
    window.setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        window.setTimeout(() => iframe.remove(), 1500);
        button.disabled = false;
        button.textContent = previousText;
      }
    }, 250);
  });
}

export function installGaleriaPdfSemPopup() {
  if (typeof window === 'undefined' || window.__galeriaPdfSemPopupInstalled) return;
  window.__galeriaPdfSemPopupInstalled = true;

  document.addEventListener('click', (event) => {
    if (!isGalleryRoute()) return;
    const button = event.target?.closest?.('[data-galeria-album-pdf]');
    if (!button) return;
    const section = button.closest('section');
    if (!section) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    exportAlbum(section, button);
  }, true);
}
