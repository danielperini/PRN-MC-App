import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function MediaGalleryModal({ isOpen, onClose, mediaItems, initialIndex = 0 }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? (mediaItems || []).length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === (mediaItems || []).length - 1 ? 0 : prev + 1));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') handlePrevious();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Escape') onClose();
  };

  React.useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, (mediaItems || []).length]);

  if (!mediaItems || mediaItems.length === 0) return null;

  const currentMedia = mediaItems[currentIndex];
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(currentMedia.fileName);
  const isVideo = /\.(mp4|webm|mov|avi)$/i.test(currentMedia.fileName);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col bg-black border-0 p-0">
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-black border-b border-gray-800">
          <div className="flex-1">
            <h3 className="text-white font-medium text-sm truncate">{currentMedia.fileName}</h3>
            <p className="text-gray-400 text-xs mt-1">
              {currentIndex + 1} de {mediaItems.length}
            </p>
          </div>
          <DialogClose className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </DialogClose>
        </div>

        {/* Media Container */}
        <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
          {isImage && (
            <img
              src={currentMedia.fileUrl}
              alt={currentMedia.fileName}
              className="max-h-full max-w-full object-contain"
            />
          )}
          {isVideo && (
            <video
              src={currentMedia.fileUrl}
              controls
              className="max-h-full max-w-full object-contain"
            />
          )}
          {!isImage && !isVideo && (
            <div className="text-center text-gray-400">
              <p className="text-sm">Formato não suportado</p>
              <p className="text-xs mt-2">{currentMedia.fileType}</p>
            </div>
          )}

          {/* Navigation Arrows */}
          {mediaItems.length > 1 && (
            <>
              <button
                onClick={handlePrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white p-2 rounded-full transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white p-2 rounded-full transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>

        {/* Footer with Info */}
        <div className="bg-black border-t border-gray-800 p-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Tipo</p>
              <p className="text-white font-medium">{currentMedia.fileType}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Tamanho</p>
              <p className="text-white font-medium">{currentMedia.size}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Data</p>
              <p className="text-white font-medium text-xs">
                {new Date(currentMedia.timestamp).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}