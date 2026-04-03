import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Images, ChevronLeft, ChevronRight, X, Download, Loader2, MapPin } from 'lucide-react';
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
    queryKey: ['galeria-fotos-v4', currentUser?.email],
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
            description: item.descricao || item.description || '',
            legenda: item.legenda || '',
            museu: item.museu || '',
            localizacao: item.localizacao || '',
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
              description: att.description || '',
              legenda: '',
              museu: '',
              localizacao: '',
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
      String(img.description || '').toLowerCase().includes(q) ||
      String(img.legenda || '').toLowerCase().includes(q) ||
      String(img.museu || '').toLowerCase().includes(q) ||
      String(img.localizacao || '').toLowerCase().includes(q)
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
                placeholder="Nome, legenda, museu ou local..."
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
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
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {sortedImages.map((image) => (
              <button
                key={image.id}
                onClick={() => setSelectedImage(image)}
                className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
              >
                <img
                  src={image.fileUrl}
                  alt={image.fileName}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl w-full p-0 bg-black border-0">

          {selectedImage && (
            <div className="relative">

              <img
                src={selectedImage.fileUrl}
                className="w-full max-h-[80vh] object-contain"
              />

              <div className="p-4 text-white bg-black/70">

                {/* 🔥 LEGENDA IA */}
                {selectedImage.legenda && (
                  <p className="text-lg font-semibold mb-2">
                    {selectedImage.legenda}
                  </p>
                )}

                {/* 🔥 DESCRIÇÃO */}
                {selectedImage.description && (
                  <p className="text-sm opacity-80 mb-2">
                    {selectedImage.description}
                  </p>
                )}

                {/* 🔥 MUSEU + LOCALIZAÇÃO */}
                <div className="flex gap-4 text-xs opacity-80 items-center">
                  {selectedImage.museu && (
                    <span>{selectedImage.museu}</span>
                  )}
                  {selectedImage.localizacao && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {selectedImage.localizacao}
                    </span>
                  )}
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
