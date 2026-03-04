import React, { useState } from 'react';
import { FileJson, Image, Video, File } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export default function FilePreview({ backup }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const isImage = backup.fileType?.startsWith('image/');
  const isVideo = backup.fileType?.startsWith('video/');

  return (
    <>
      <div 
        onClick={() => isImage && setIsOpen(true)}
        className={isImage ? 'cursor-pointer hover:opacity-80 transition' : ''}
      >
        {isImage ? (
          <img 
            src={backup.fileUrl} 
            alt={backup.fileName}
            className="w-full h-48 object-cover rounded-lg"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        ) : isVideo ? (
          <video 
            className="w-full h-48 object-cover rounded-lg bg-gray-100"
            controls
          >
            <source src={backup.fileUrl} type={backup.fileType} />
          </video>
        ) : (
          <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
            <File className="w-8 h-8 text-gray-400" />
          </div>
        )}
      </div>

      {isImage && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="max-w-4xl">
            <img 
              src={backup.fileUrl} 
              alt={backup.fileName}
              className="w-full h-auto"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}