const ROUTE_PATTERN = /GaleriaFotos/i;

function normalize(value) {
  return String(value || '').trim().toLowerCase();
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

function galleryRoot() {
  const title = [...document.querySelectorAll('h1')].find((item) => normalize(item.textContent).includes('galeria de fotos'));
  return title?.closest('.min-h-screen') || document.querySelector('main') || document.body;
}

async function loadAllImages() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const button = [...document.querySelectorAll('button')].find((item) => normalize(item.textContent) === 'carregar mais');
    if (!button || button.disabled) break;
    button.click();
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
}

function albumTitle(section) {
  return section.querySelector('h2')?.textContent?.trim() || 'Álbum fotográfico';
}

function imageCaption(card, image) {
  const paragraphs = [...card.querySelectorAll('p')]
    .map((item) => item.textContent?.trim())
    .filter(Boolean);
  return paragraphs[0] || image.alt || 'Foto da galeria';
}

function imageDetails(card) {
  return [...card.querySelectorAll('p')]
    .slice(1)
    .map((item) => item.textContent?.trim())
    .filter(Boolean)
    .join(' · ');
}

function openAlbumPdf(section) {
  const title = albumTitle(section);
  const cards = [...section.querySelectorAll('button.group')];
  const photos = cards.map((card) => {
    const image = card.querySelector('img');
    if (!image?.src) return null;
    return {
      src: image.src,
      caption: imageCaption(card, image),
      details: imageDetails(card),
    };
  }).filter(Boolean);

  if (!photos.length) {
    window.alert('Este álbum não possui imagens disponíveis para exportação.');
    return;
  }

  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.alert('Permita pop-ups para gerar o PDF deste álbum.');
    return;
  }

  const pages = photos.map((photo, index) => `
    <figure class="photo-page">
      <div class="photo-frame"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.caption)}" /></div>
      <figcaption>
        <strong>${escapeHtml(photo.caption)}</strong>
        ${photo.details ? `<small>${escapeHtml(photo.details)}</small>` : ''}
        <span>Imagem ${index + 1} de ${photos.length}</span>
      </figcaption>
    </figure>`).join('');

  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, sans-serif; color: #111; background: #fff; }
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
@media screen {
  body { padding: 12px; background: #e5e7eb; }
  .cover, .photo-page { max-width: 277mm; margin: 0 auto 12px; padding: 10mm; background: white; box-shadow: 0 2px 10px rgba(0,0,0,.12); }
}
</style>
</head>
<body>
<section class="cover">
  <h1>${escapeHtml(title)}</h1>
  <p>Galeria fotográfica completa</p>
  <p>${photos.length} ${photos.length === 1 ? 'imagem' : 'imagens'}</p>
</section>
${pages}
<script>
const images = Array.from(document.images);
Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
  img.onload = resolve;
  img.onerror = resolve;
}))).then(() => setTimeout(() => window.print(), 250));
<\/script>
</body>
</html>`);
  popup.document.close();
}

function ensureStyles() {
  if (document.getElementById('galeria-exposicao-completa-style')) return;
  const style = document.createElement('style');
  style.id = 'galeria-exposicao-completa-style';
  style.textContent = `
    .galeria-modo-exposicao section > .grid { grid-template-columns: minmax(0, 1fr) !important; gap: 2rem !important; }
    .galeria-modo-exposicao section > .grid > button.group { border-radius: 1rem !important; }
    .galeria-modo-exposicao section > .grid > button.group > div:first-child { aspect-ratio: auto !important; min-height: 60vh !important; max-height: 82vh !important; background: #f3f4f6 !important; }
    .galeria-modo-exposicao section > .grid > button.group img { width: 100% !important; height: 100% !important; max-height: 82vh !important; object-fit: contain !important; transform: none !important; }
    .galeria-modo-exposicao section > .grid > button.group > div:last-child { padding: 1.25rem !important; }
    .galeria-modo-exposicao section > .grid > button.group > div:last-child p:first-child { font-size: 1.125rem !important; line-height: 1.5 !important; -webkit-line-clamp: unset !important; }
    .galeria-album-pdf-button { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; border-radius: .75rem; border: 1px solid #111; background: #111; color: white; padding: .55rem .9rem; font-size: .875rem; font-weight: 600; }
    .galeria-album-pdf-button:hover { background: #333; }
  `;
  document.head.appendChild(style);
}

function ensureAlbumButtons(root) {
  const sections = [...root.querySelectorAll('section')].filter((section) => section.querySelector('h2') && section.querySelector('button.group img'));
  sections.forEach((section) => {
    const header = section.querySelector(':scope > div:first-child');
    if (!header || header.querySelector('[data-galeria-album-pdf]')) return;
    header.classList.add('flex', 'flex-col', 'gap-3', 'md:flex-row', 'md:items-center', 'md:justify-between');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.galeriaAlbumPdf = 'true';
    button.className = 'galeria-album-pdf-button';
    button.textContent = 'Gerar PDF deste álbum';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openAlbumPdf(section);
    });
    header.appendChild(button);
  });
}

async function toggleExhibition(button) {
  const root = galleryRoot();
  if (!root) return;
  const enabling = !root.classList.contains('galeria-modo-exposicao');
  button.disabled = true;
  button.textContent = enabling ? 'Preparando exposição...' : 'Modo exposição';
  if (enabling) {
    await loadAllImages();
    root.classList.add('galeria-modo-exposicao');
    ensureAlbumButtons(root);
    button.textContent = 'Voltar à grade';
  } else {
    root.classList.remove('galeria-modo-exposicao');
    button.textContent = 'Modo exposição';
  }
  button.disabled = false;
}

function ensureToolbarButton(root) {
  if (root.querySelector('[data-galeria-exposicao]')) return;
  const title = [...root.querySelectorAll('h1')].find((item) => normalize(item.textContent).includes('galeria de fotos'));
  const header = title?.closest('.mb-8');
  const toolbar = header?.querySelector('.flex.flex-wrap.gap-2');
  if (!toolbar) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.galeriaExposicao = 'true';
  button.className = 'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-100 disabled:opacity-60';
  button.textContent = 'Modo exposição';
  button.addEventListener('click', () => toggleExhibition(button));
  toolbar.prepend(button);
}

function installOnRoute() {
  if (!isGalleryRoute()) return;
  ensureStyles();
  const root = galleryRoot();
  if (!root) return;
  ensureToolbarButton(root);
  if (root.classList.contains('galeria-modo-exposicao')) ensureAlbumButtons(root);
}

export function installGaleriaExposicaoCompleta() {
  if (typeof window === 'undefined' || window.__galeriaExposicaoCompletaInstalled) return;
  window.__galeriaExposicaoCompletaInstalled = true;
  let timer = null;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(installOnRoute, 80);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  document.addEventListener('click', schedule, true);
  schedule();
}
