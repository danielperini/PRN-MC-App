import React, { useEffect, useRef, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ images, index, onClose, onPrev, onNext }) {
  const touchStartX = useRef(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, onPrev, onNext]);

  // Preload next/prev
  useEffect(() => {
    const preload = (idx) => {
      if (images[idx]) {
        const img = new Image();
        img.src = images[idx];
      }
    };
    preload((index + 1) % images.length);
    preload((index - 1 + images.length) % images.length);
  }, [index, images]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      diff > 0 ? onNext() : onPrev();
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(8px)',
        animation: 'lb-fade-in 0.2s ease',
      }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Fechar */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Anterior */}
      <button
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        className="absolute left-4 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      {/* Imagem */}
      <div
        className="relative flex items-center justify-center"
        style={{ maxWidth: '90vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          key={index}
          src={images[index]}
          alt=""
          className="rounded-xl shadow-2xl"
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            objectFit: 'contain',
            animation: 'lb-img-in 0.25s ease',
          }}
        />
        {/* Contador */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full">
          {index + 1} / {images.length}
        </div>
      </div>

      {/* Próximo */}
      <button
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        className="absolute right-4 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      <style>{`
        @keyframes lb-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lb-img-in  { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}

// ── Carrossel ─────────────────────────────────────────────────────────────────
export default function GaleriaTickerCarousel() {
  const [images, setImages] = useState([]);
  const [paused, setPaused] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    async function loadImages() {
      try {
        const [attachments, momentos, reportPhotos] = await Promise.allSettled([
          base44.entities.Attachment.list('-created_date', 200),
          base44.entities.Momento.list('-created_date', 100),
          base44.entities.ReportPhoto.list('-created_date', 100),
        ]);

        let allUrls = [];
        if (attachments.status === 'fulfilled') allUrls.push(...extractImageUrls(Array.isArray(attachments.value) ? attachments.value : []));
        if (momentos.status === 'fulfilled')    allUrls.push(...extractImageUrls(Array.isArray(momentos.value) ? momentos.value : []));
        if (reportPhotos.status === 'fulfilled') allUrls.push(...extractImageUrls(Array.isArray(reportPhotos.value) ? reportPhotos.value : []));

        allUrls = [...new Set(allUrls)];
        if (allUrls.length === 0) return;

        const shuffled = shuffle(allUrls).slice(0, 40);
        let final = [...shuffled];
        while (final.length < 20) final = [...final, ...shuffled];
        setImages(final.slice(0, 40));
      } catch (e) {
        console.error('GaleriaTickerCarousel: erro ao carregar imagens', e);
      }
    }
    loadImages();
  }, []);

  const openLightbox = useCallback((idx) => {
    setPaused(true);
    setLightboxIndex(idx);
  }, []);

  const closeLightbox = useCallback(() => {
    setPaused(false);
    setLightboxIndex(null);
  }, []);

  const goPrev = useCallback(() =>
    setLightboxIndex((i) => (i - 1 + images.length) % images.length),
    [images.length]
  );
  const goNext = useCallback(() =>
    setLightboxIndex((i) => (i + 1) % images.length),
    [images.length]
  );

  if (images.length === 0) return null;

  // Duplicar para loop visual infinito
  const looped = [...images, ...images];
  const totalWidth = images.length * 88; // 80px + 8px gap
  const duration = images.length * 3;

  return (
    <>
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ height: '88px' }}
        onMouseEnter={() => !lightboxIndex && setPaused(true)}
        onMouseLeave={() => !lightboxIndex && setPaused(false)}
      >
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, white, transparent)' }} />
        <div className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, white, transparent)' }} />

        <div
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
              onClick={() => openLightbox(idx % images.length)}
              className="h-20 w-20 object-cover rounded-lg shrink-0 border border-slate-100 cursor-pointer transition-transform duration-200 hover:scale-105 hover:shadow-md"
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

      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}
    </>
  );
}