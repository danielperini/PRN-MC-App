import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Images, ChevronLeft, ChevronRight, X, Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastMessages } from '@/lib/toastMessages';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'bmp', 'avif'];

function isImageByFileName(fileName = '') {
  const ext = String(fileName).split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.includes(ext);
}

function isImageByMime(fileType = '') {
  return String(fileType).toLowerCase().startsWith('image/');
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function uniqueByFileUrl(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.fileUrl || '';
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function GaleriaFotosInner() {
  const { user: currentUser } = useCurrentUser();
  const [selectedImage, setSelectedImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['galeria-fotos-v3', currentUser?.email],
    queryFn: async () => {
      const allImages = [];

      try {
        const media = await base44.entities.MediaLibrary.list();

        const imageMedia = (Array.isArray(media) ? media : [])
          .filter((item) => {
            const tipo = String(item?.tipo || '').toLowerCase();
            return (
              tipo === 'imagem' ||
              tipo === 'image' ||
              isImageByMime(item?.file_type) ||
              isImageByFileName(item?.file_name)
            );
          })
          .map((item) => ({
            id: `media-${item.id}`,
            fileName: item.file_name || 'imagem',
            fileUrl: item.file_url,
            timestamp: normalizeDate(item.created_at || item.created_date),
            date: normalizeDate(item.created_at || item.created_date).split('T')[0],
            reportLabel: item.origem === 'relatorio' ? 'Relatório' : (item.origem || 'Galeria'),
            description: item.descricao || item.description || item.file_name || 'Imagem',
          }));

        allImages.push(...imageMedia);
      } catch (error) {
        console.warn('MediaLibrary indisponível, usando fallback de Attachment:', error);
      }

      try {
        const approvedReports = await base44.entities.Report.filter({ status: 'APPROVED' });
        const approvedIds = new Set((approvedReports || []).map((r) => r.id));

        const attachments = await base44.entities.Attachment.list();

        const legacyImages = (Array.isArray(attachments) ? attachments : [])
          .filter((att) => {
            return (
              approvedIds.has(att.report_id) &&
              (isImageByMime(att.file_type) || isImageByFileName(att.file_name))
            );
          })
          .map((att) => {
            const report = approvedReports.find((r) => r.id === att.report_id);
            return {
              id: `legacy-${att.id}`,
              fileName: att.file_name || 'imagem',
              fileUrl: att.file_url,
              timestamp: normalizeDate(att.created_date || att.updated_date),
              date: normalizeDate(att.created_date || att.updated_date).split('T')[0],
              reportLabel: report
                ? `${report.author_name || 'Relatório'} — ${report.mes_referencia || ''}/${report.ano || ''}`
                : 'Relatório (legado)',
              description: att.description || att.file_name || 'Imagem',
            };
          });

        allImages.push(...legacyImages);
      } catch (error) {
        console.error('Erro ao carregar imagens legadas da galeria:', error);
        toastMessages.warning('Erro ao carregar imagens da galeria');
      }

      return uniqueByFileUrl(allImages).sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
    },
    enabled: !!currentUser?.email,
  });

  const filteredImages = images.filter((img) => {
    const q = searchTerm.toLowerCase();
    return (
      img.fileName.toLowerCase().includes(q) ||
      img.reportLabel.toLowerCase().includes(q) ||
      String(img.description || '').toLowerCase().includes(q)
    );
  });

  const sortedImages = [...filteredImages].sort((a, b) => {
    if (sortBy === 'recent') return new Date(b.timestamp) - new Date(a.timestamp);
    if (sortBy === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
    if (sortBy === 'name-asc') return a.fileName.localeCompare(b.fileName);
    if (sortBy === 'name-desc') return b.fileName.localeCompare(a.fileName);
    return 0;
  });

  const currentImageIndex = selectedImage
    ? sortedImages.findIndex((img) => img.id === selectedImage.id)
    : -1;

  const handlePrevImage = () => {
    if (currentImageIndex > 0) {
      setSelectedImage(sortedImages[currentImageIndex - 1]);
    }
  };

  const handleNextImage = () => {
    if (currentImageIndex < sortedImages.length - 1) {
      setSelectedImage(sortedImages[currentImageIndex + 1]);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (!selectedImage) return;
      if (e.key === 'ArrowLeft') handlePrevImage();
      if (e.key === 'ArrowRight') handleNextImage();
      if (e.key === 'Escape') setSelectedImage(null);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedImage, sortedImages, currentImageIndex]);

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black tracking-tight mb-2">Galeria de Fotos</h1>
          <p className="text-gray-600">
            {sortedImages.length} {sortedImages.length === 1 ? 'imagem' : 'imagens'}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-600 mb-2 block">Buscar</Label>
              <Input
                placeholder="Nome do arquivo, descrição ou relatório..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-sm"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-600 mb-2 block">Ordenar</Label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="recent">Mais Recentes</option>
                <option value="oldest">Mais Antigas</option>
                <option value="name-asc">Nome (A-Z)</option>
                <option value="name-desc">Nome (Z-A)</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Carregando galeria...</p>
            </div>
          </div>
        ) : sortedImages.length === 0 ? (
          <div className="flex items-center justify-center py-24 bg-gray-50 rounded-lg">
            <div className="text-center">
              <Images className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhuma foto encontrada</p>
              <p className="text-sm text-gray-400 mt-1">
                Fotos enviadas como evidência aparecerão aqui
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {sortedImages.map((image) => (
              <button
                key={image.id}
                onClick={() => setSelectedImage(image)}
                className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:shadow-lg transition-shadow"
              >
                <img
                  src={image.fileUrl}
                  alt={image.fileName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                      <Images className="w-6 h-6 text-gray-900" />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl w-full p-0 bg-black border-0 rounded-lg overflow-hidden">
          {selectedImage && (
            <div className="relative w-full h-screen md:h-auto md:max-h-[90vh] flex items-center justify-center bg-black">
              <div className="relative w-full h-full md:h-auto flex items-center justify-center">
                <img
                  src={selectedImage.fileUrl}
                  alt={selectedImage.fileName}
                  className="max-w-full max-h-[90vh] object-contain"
                />
              </div>

              <div className="absolute inset-0 flex items-center justify-between p-4">
                <button
                  onClick={handlePrevImage}
                  disabled={currentImageIndex === 0}
                  className="p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                  onClick={handleNextImage}
                  disabled={currentImageIndex === sortedImages.length - 1}
                  className="p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/50 to-transparent p-4">
                <div className="flex items-center justify-between text-white">
                  <div className="flex-1">
                    <p className="text-sm opacity-80">{selectedImage.reportLabel}</p>
                    <p className="font-medium truncate">{selectedImage.fileName}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {selectedImage.date} • {currentImageIndex + 1} de {sortedImages.length}
                    </p>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <a
                      href={selectedImage.fileUrl}
                      download={selectedImage.fileName}
                      className="p-2 rounded-full bg-white/20 hover:bg-white/40 transition-colors"
                      title="Download"
                    >
                      <Download className="w-5 h-5" />
                    </a>

                    <button
                      onClick={() => setSelectedImage(null)}
                      className="p-2 rounded-full bg-white/20 hover:bg-white/40 transition-colors"
                      title="Fechar (ESC)"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-4">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-white text-sm">
                    Usar ← → para navegar ou ESC para fechar
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function GaleriaFotos() {
  return (
    <RequireAuth>
      <GaleriaFotosInner />
    </RequireAuth>
  );
}
