import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FilePreviewModal({ file, isOpen, onClose }) {
  if (!file) return null;

  const isPdf = file.fileType === 'application/pdf';
  const isImage = file.fileType?.startsWith('image/');
  const canPreview = isPdf || isImage;

  const handleDownload = () => {
    window.open(file.fileUrl, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b sticky top-0 bg-white">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg truncate">{file.fileName}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="h-8 w-8"
              title="Baixar arquivo"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="overflow-auto max-h-[calc(90vh-80px)] bg-gray-50">
          {!canPreview ? (
            <div className="flex flex-col items-center justify-center h-96 text-gray-500">
              <p className="text-sm">Tipo de arquivo não suportado para pré-visualização</p>
              <Button onClick={handleDownload} className="mt-4">
                Baixar arquivo
              </Button>
            </div>
          ) : isPdf ? (
            <iframe
              src={`${file.fileUrl}#toolbar=0`}
              className="w-full h-[calc(90vh-80px)] border-0"
              title="PDF Preview"
            />
          ) : isImage ? (
            <div className="flex items-center justify-center min-h-96 p-4">
              <img
                src={file.fileUrl}
                alt={file.fileName}
                className="max-w-full max-h-[calc(90vh-100px)] object-contain"
              />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}