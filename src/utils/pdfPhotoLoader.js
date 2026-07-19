function fileFormat(blob) {
  return blob.type.includes('png') ? 'PNG' : 'JPEG';
}

async function toPdfAsset(url) {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`não foi possível carregar a imagem (${response.status})`);
  const blob = await response.blob();
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  const dimensions = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('a imagem carregada é inválida'));
    image.src = dataUrl;
  });
  return { dataUrl, format: fileFormat(blob), ...dimensions };
}

export async function preloadPdfPhotos(photos) {
  const entries = await Promise.all(photos.map(async (photo) => {
    const key = photo.id || photo.fileUrl;
    return [key, await toPdfAsset(photo.fileUrl)];
  }));
  return new Map(entries);
}