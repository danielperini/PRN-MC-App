import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Modal de visualização tipo slideshow (Modo Exposição):
 * - Fundo preto total
 * - Setas laterais visíveis
 * - Indicador de posição (ex: 3/24)
 * - Navegação por teclado (← →)
 * - Swipe no mobile
 *
 * Props:
 *  - open: boolean
 *  - images: array de fotos
 *  - startIndex: número (índice inicial)
 *  - onClose: () => void
 */
export default function ModalExposicao({ open, images = [], startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [touchStart, setTouchStart] = useState(null);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  }, [images.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, goPrev, goNext, onClose]);

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    setTouchStart(null);
  };

  if (!open || images.length === 0) return null;

  const current = images[index];
  if (!current) return null;

  const legendaDisplay =
    current.legenda ||
    current.caption ||
    current.fileName ||
    current.activityTitulo ||
    'Foto da galeria';

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Botão fechar */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-30 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 transition"
        aria-label="Fechar"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Seta esquerda */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={goPrev}
          className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-30 rounded-full bg-white/10 p-2 md:p-3 text-white hover:bg-white/20 transition"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
        </button>
      )}

      {/* Imagem central */}
      <div className="flex flex-col items-center justify-center w-full h-full px-12 md:px-20">
        <img
          src={current.fileUrl}
          alt={legendaDisplay}
          className="max-h-[75vh] max-w-full object-contain"
        />

        {/* Legenda + metadados */}
        <div className="mt-4 text-center max-w-2xl">
          <p className="text-white text-sm md:text-base font-medium leading-snug">
            {legendaDisplay}
          </p>
          {current.sectionKey && current.sectionKey !== 'SEM_IDENTIFICACAO' && (
            <p className="text-white/60 text-xs mt-1">{current.sectionTitle || current.museu}</p>
          )}
          {current.reportMes && (
            <p className="text-white/50 text-xs">{current.reportMes}</p>
          )}
        </div>
      </div>

      {/* Seta direita */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={goNext}
          className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-30 rounded-full bg-white/10 p-2 md:p-3 text-white hover:bg-white/20 transition"
          aria-label="Próxima"
        >
          <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
        </button>
      )}

      {/* Indicador de posição */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-full bg-white/10 px-4 py-1.5 text-white text-xs font-medium">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}