import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X } from 'lucide-react';
import { toast } from 'sonner';

export default function FilePreviewViewer({ file, isOpen, onClose }) {
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  if (!file) return null;

  const fileType = file.file_type || file.fileType || '';
  const fileName = file.file_name || file.fileName || 'Arquivo';
  const fileUrl = file.file_url || file.fileUrl || '';

  const isImage = fileType.startsWith('image/');
  const isPDF = fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isText = fileType.startsWith('text/') || fileName.toLowerCase().endsWith('.txt');

  const handleDownload = () => {
    if (fileUrl) {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      link.click();
      toast.success(`Download iniciado: ${fileName}`);
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 10, 50));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="border-b px-6 py-4 flex flex-row items-center justify-between">
          <div className="flex-1">
            <DialogTitle className="text-lg truncate">{fileName}</DialogTitle>
            <p className="text-xs text-gray-500 mt-1">{fileType}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              title="Download"
              className="h-8 w-8"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Fechar"
              className="h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Preview Area */}
        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center relative">
          {isImage ? (
            <div className="flex flex-col items-center justify-center gap-4 p-4">
              <img
                src={fileUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain rounded-lg"
                style={{ maxWidth: '90%', maxHeight: '70vh' }}
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  toast.error('Erro ao carregar imagem');
                }}
              />
              
              {/* Controles de Zoom */}
              <div className="flex gap-2 bg-white p-2 rounded-lg shadow">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                  className="h-8 w-8"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-sm px-3 py-1 flex items-center text-gray-600">
                  {zoom}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={zoom >= 200}
                  className="h-8 w-8"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <div className="border-l mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetZoom}
                  className="h-8 px-2 text-xs"
                >
                  Reset
                </Button>
              </div>
            </div>
          ) : isPDF ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <iframe
                src={`${fileUrl}#page=${currentPage}`}
                className="w-full h-full rounded-lg"
                title={fileName}
                onLoad={() => setLoading(false)}
              />
              
              {/* Controles de Paginação */}
              <div className="flex gap-2 bg-white p-3 rounded-lg shadow items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage <= 1}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm px-3 py-1 flex items-center text-gray-600 min-w-32">
                  Página {currentPage}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="h-8 w-8"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : isText ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-full h-full p-6 bg-white text-gray-800 overflow-auto font-mono text-sm whitespace-pre-wrap break-words rounded-lg">
                <div className="inline-block">
                  Carregando conteúdo...
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 gap-4">
              <div className="text-6xl">📄</div>
              <p className="text-gray-600 font-medium">Tipo de arquivo não visualizável</p>
              <p className="text-sm text-gray-500">Faça download para visualizar: {fileName}</p>
              <Button onClick={handleDownload} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}