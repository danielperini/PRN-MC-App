import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Images, ChevronLeft, ChevronRight, X, Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastMessages } from '@/lib/toastMessages';

function GaleriaFotosInner() {
  const { user: currentUser } = useCurrentUser();
  const [selectedImage, setSelectedImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['galeria-fotos-v2', currentUser?.email],
    queryFn: async () => {
      try {
        // 🔥 NOVO: BUSCAR MEDIA LIBRARY (PRINCIPAL)
        const media = await base44.entities.MediaLibrary.list();

        const imageMedia = (media || [])
          .filter(item => item.tipo === 'imagem')
          .map(item => ({
            id: item.id,
            fileName: item.file_name,
            fileUrl: item.file_url,
            timestamp: item.created_at || new Date().toISOString(),
            date: (item.created_at || '').split('T')[0],
            reportLabel: item.origem === 'relatorio' ? 'Relatório' : 'Sistema',
            description: item.descricao || item.file_name
          }));

        // 🔄 FALLBACK LEGADO (Attachment)
        const approvedReports = await base44.entities.Report.filter({ status: 'APPROVED' });
        const approvedIds = new Set(approvedReports.map(r => r.id));

        const attachments = await base44.entities.Attachment.list();

        const imageExtensions = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'];

        const legacyImages = attachments
          .filter(att => {
            const ext = att.file_name?.split('.')?.pop()?.toLowerCase() || '';
            return approvedIds.has(att.report_id) && imageExtensions.includes(ext);
          })
          .map(att => ({
            id: `legacy-${att.id}`,
            fileName: att.file_name,
            fileUrl: att.file_url,
            timestamp: att.created_date || new Date().toISOString(),
            date: att.created_date?.split('T')[0],
            reportLabel: 'Relatório (legado)',
            description: att.file_name
          }));

        // 🔥 MERGE FINAL
        const allImages = [...imageMedia, ...legacyImages];

        return allImages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      } catch (error) {
        console.error(error);
        toastMessages.warning('Erro ao carregar galeria de fotos');
        return [];
      }
    },
    enabled: !!currentUser?.email
  });

  const filteredImages = images.filter(img =>
    img.fileName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedImages = [...filteredImages].sort((a, b) => {
    if (sortBy === 'recent') return new Date(b.timestamp) - new Date(a.timestamp);
    if (sortBy === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
    if (sortBy === 'name-asc') return a.fileName.localeCompare(b.fileName);
    if (sortBy === 'name-desc') return b.fileName.localeCompare(a.fileName);
    return 0;
  });

  const currentImageIndex = selectedImage
    ? sortedImages.findIndex(img => img.id === selectedImage.id)
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
  }, [selectedImage, sortedImages]);

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full max-w-7xl mx-auto px-6 py-10">

        <h1 className="text-3xl font-semibold mb-2">Galeria de Fotos</h1>
        <p className="text-gray-600 mb-6">
          {sortedImages.length} imagens
        </p>

        <Input
          placeholder="Buscar..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-6"
        />

        {isLoading ? (
          <div className="text-center py-20">
            <Loader2 className="animate-spin mx-auto" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sortedImages.map((img) => (
              <img
                key={img.id}
                src={img.fileUrl}
                onClick={() => setSelectedImage(img)}
                className="rounded-lg object-cover h-48 w-full cursor-pointer hover:opacity-80"
              />
            ))}
          </div>
        )}

        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="bg-black p-0 max-w-4xl">
            {selectedImage && (
              <img src={selectedImage.fileUrl} className="w-full max-h-[90vh] object-contain" />
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}

export default function GaleriaFotos() {
  return <RequireAuth><GaleriaFotosInner /></RequireAuth>;
}
