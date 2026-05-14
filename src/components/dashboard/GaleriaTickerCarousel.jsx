import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Extrair URLs de imagem dos attachments/fotos da galeria
function extractImageUrls(items) {
  const urls = [];
  for (const item of items) {
    const url = item.file_url || item.url || item.imagem_url || item.photo_url;
    if (url && /\.(jpg|jpeg|png|webp|gif)/i.test(url)) {
      urls.push(url);
    }
  }
  return urls;
}

export default function GaleriaTickerCarousel() {
  const [images, setImages] = useState([]);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef(null);

  useEffect(() => {
    async function loadImages() {
      try {
        // Busca de múltiplas fontes em paralelo
        const [attachments, momentos, reportPhotos] = await Promise.allSettled([
          base44.entities.Attachment.list('-created_date', 200),
          base44.entities.Momento.list('-created_date', 100),
          base44.entities.ReportPhoto.list('-created_date', 100),
        ]);

        let allUrls = [];

        if (attachments.status === 'fulfilled') {
          const items = Array.isArray(attachments.value) ? attachments.value : [];
          allUrls.push(...extractImageUrls(items));
        }
        if (momentos.status === 'fulfilled') {
          const items = Array.isArray(momentos.value) ? momentos.value : [];
          allUrls.push(...extractImageUrls(items));
        }
        if (reportPhotos.status === 'fulfilled') {
          const items = Array.isArray(reportPhotos.value) ? reportPhotos.value : [];
          allUrls.push(...extractImageUrls(items));
        }

        // Remover duplicatas
        allUrls = [...new Set(allUrls)];

        if (allUrls.length === 0) return;

        // Embaralhar aleatoriamente a cada reload
        const shuffled = shuffle(allUrls);

        // Pegar no máximo 40 para não sobrecarregar
        const selected = shuffled.slice(0, 40);

        // Garantir pelo menos 20 imagens repetindo se necessário
        let final = [...selected];
        while (final.length < 20) {
          final = [...final, ...selected];
        }
        final = final.slice(0, 40);

        setImages(final);
      } catch (e) {
        console.error('GaleriaTickerCarousel: erro ao carregar imagens', e);
      }
    }
    loadImages();
  }, []);

  if (images.length === 0) return null;

  // Duplicar para loop infinito
  const looped = [...images, ...images];

  // Velocidade: ~3s por imagem visível, 10 visíveis → total ~ 30s para passar o array inteiro
  const totalWidth = images.length * 88; // 80px imagem + 8px gap
  const duration = images.length * 3; // 3s por imagem

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{ height: '88px' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Gradiente fade esquerda/direita */}
      <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, white, transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, white, transparent)' }} />

      <div
        ref={trackRef}
        className="flex items-center gap-2 h-full"
        style={{
          width: `${looped.length * 88}px`,
          animation: `ticker-scroll ${duration}s linear infinite`,
          animationPlayState: paused ? 'paused' : 'running',
          willChange: 'transform',
        }}
      >
        {looped.map((url, idx) => (
          <img
            key={idx}
            src={url}
            alt=""
            loading="lazy"
            className="h-20 w-20 object-cover rounded-lg shrink-0 border border-slate-100"
            style={{ minWidth: '80px' }}
          />
        ))}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-${totalWidth}px); }
        }
      `}</style>
    </div>
  );
}