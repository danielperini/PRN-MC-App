import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PhotoGallerySelector({ isOpen, onClose, onSelectPhoto }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [caption, setCaption] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['galeria-fotos-selector', searchTerm],
    queryFn: async () => {
      try {
        const approvedReports = await base44.entities.Report.filter({ status: 'APPROVED' });
        const approvedReportIds = new Set(approvedReports.map(r => r.id));

        const allAttachments = await base44.entities.Attachment.list();

        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
        const imageData = allAttachments
          .filter(att => {
            const ext = att.file_name.split('.').pop().toLowerCase();
            return approvedReportIds.has(att.report_id) && imageExtensions.includes(ext);
          })
          .map(att => {
            const report = approvedReports.find(r => r.id === att.report_id);
            return {
              id: att.id,
              fileName: att.file_name,
              url: att.file_url,
              description: att.description || '',
              author: report?.author_name || 'Desconhecido',
              mes: report?.mes_referencia || '',
              ano: report?.ano || '',
            };
          });

        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          return imageData.filter(img =>
            img.fileName.toLowerCase().includes(term) ||
            img.description.toLowerCase().includes(term)
          );
        }

        return imageData.sort((a, b) => new Date(b.id) - new Date(a.id));
      } catch (error) {
        toast.error('Erro ao carregar fotos');
        return [];
      }
    },
    enabled: isOpen
  });

  const handleAddPhoto = () => {
    if (!selectedPhoto) {
      toast.error('Selecione uma foto');
      return;
    }

    onSelectPhoto({
      ...selectedPhoto,
      caption: caption || selectedPhoto.description
    });

    setSelectedPhoto(null);
    setCaption('');
    setSearchTerm('');
    onClose();
    toast.success('Foto adicionada ao relatório');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar Foto do Relatório</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Busca */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Buscar fotos</Label>
            <Input
              placeholder="Por nome ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Grid de Fotos */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-8">
              <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-600 text-sm">Nenhuma foto encontrada</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {images.map(img => (
                <div
                  key={img.id}
                  onClick={() => setSelectedPhoto(img)}
                  className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                    selectedPhoto?.id === img.id
                      ? 'border-blue-600 ring-2 ring-blue-300'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="aspect-square bg-gray-100">
                    <img
                      src={img.url}
                      alt={img.fileName}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3C/svg%3E'; }}
                    />
                  </div>
                  <p className="text-xs p-2 text-gray-600 truncate">{img.fileName}</p>
                </div>
              ))}
            </div>
          )}

          {/* Info da Foto Selecionada */}
          {selectedPhoto && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
              <p className="text-sm font-medium text-blue-900">Foto selecionada</p>
              <p className="text-xs text-blue-800">{selectedPhoto.fileName}</p>
              <p className="text-xs text-blue-700">Autor: {selectedPhoto.author}</p>
            </div>
          )}

          {/* Legenda */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Legenda (Opcional)</Label>
            <Textarea
              placeholder="Adicione uma legenda para esta foto..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="resize-none h-20 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Ou use a descrição padrão da foto</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleAddPhoto}
            disabled={!selectedPhoto}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Adicionar Foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}