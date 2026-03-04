import React, { useState } from 'react';
import { File } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export default function FilePreview({ backup }) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const isImage = backup.fileType?.startsWith('image/');
  const isVideo = backup.fileType?.startsWith('video/');

  if (isImage) {
    return (
      <>
        <div 
          onClick={() => setIsOpen(true)}
          className="cursor-pointer hover:opacity-80 transition h-48 bg-gray-100 flex items-center justify-center overflow-hidden rounded-lg"
        >
          {!imageError ? (
            <img 
              src={backup.fileUrl} 
              alt={backup.fileName}
              className="w-full h-full object-cover"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          ) : (
            <File className="w-8 h-8 text-gray-400" />
          )}
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="max-w-4xl">
            <img 
              src={backup.fileUrl} 
              alt={backup.fileName}
              className="w-full h-auto"
              onError={() => setImageError(true)}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (isVideo) {
    return (
      <video 
        className="w-full h-48 object-cover rounded-lg bg-gray-100"
        controls
      >
        <source src={backup.fileUrl} type={backup.fileType} />
        Seu navegador não suporta vídeos
      </video>
    );
  }

  return (
    <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
      <File className="w-8 h-8 text-gray-400" />
    </div>
  );
}