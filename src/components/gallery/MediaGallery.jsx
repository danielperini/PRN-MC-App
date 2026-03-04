import React, { useState } from 'react';
import { Image, Video } from 'lucide-react';
import MediaGalleryModal from './MediaGalleryModal';

export default function MediaGallery({ mediaItems = [] }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (mediaItems.length === 0) {
    return null;
  }

  const handleOpenMedia = (index) => {
    setSelectedIndex(index);
    setIsModalOpen(true);
  };

  return (
    <>
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-black mb-4">Fotos e Vídeos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {mediaItems.map((item, index) => {
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(item.fileName);
            const isVideo = /\.(mp4|webm|mov|avi)$/i.test(item.fileName);

            if (!isImage && !isVideo) return null;

            return (
              <button
                key={item.id}
                onClick={() => handleOpenMedia(index)}
                className="relative group overflow-hidden rounded-lg aspect-square bg-gray-100 hover:shadow-lg transition-shadow"
              >
                {isImage && (
                  <img
                    src={item.fileUrl}
                    alt={item.fileName}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}
                {isVideo && (
                  <video
                    src={item.fileUrl}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  {isVideo && (
                    <Video className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  {isImage && (
                    <Image className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <MediaGalleryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mediaItems={mediaItems.filter(
          (item) =>
            /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|avi)$/i.test(item.fileName)
        )}
        initialIndex={selectedIndex || 0}
      />
    </>
  );
}