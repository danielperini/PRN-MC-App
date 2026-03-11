import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Image as ImageIcon, Search, Grid, List, Loader2, Trash2, Edit2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

function GaleriaFotosInner() {
  const { user: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('grid'); // 'grid' ou 'list'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [editingImage, setEditingImage] = useState(null);
  const [editDescription, setEditDescription] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['galeria-fotos', searchTerm],
    queryFn: async () => {
      try {
        // Buscar relatórios aprovados
        const approvedReports = await base44.entities.Report.filter({ status: 'APPROVED' });
        const approvedReportIds = new Set(approvedReports.map(r => r.id));

        // Buscar todos os anexos
        const allAttachments = await base44.entities.Attachment.list();

        // Filtrar apenas imagens e mapear dados
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
              created_date: att.created_date
            };
          });

        // Filtrar por busca
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          return imageData.filter(img =>
            img.fileName.toLowerCase().includes(term) ||
            img.description.toLowerCase().includes(term) ||
            img.author.toLowerCase().includes(term)
          );
        }

        return imageData.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      } catch (error) {
        toast.error('Erro ao carregar imagens');
        return [];
      }
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-gray-300 mx-auto mb-4 animate-spin" />
          <h2 className="text-xl font-semibold text-gray-900">Carregando galeria...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black tracking-tight mb-2">Galeria de Fotos</h1>
          <p className="text-gray-600">Explore as imagens compartilhadas pelos relatórios aprovados</p>
        </div>

        {/* Filtros */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-8">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Buscar fotos</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Por nome, autor ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 text-sm"
                />
              </div>
            </div>

            {/* View Mode Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={() => setViewMode('grid')}
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                className="w-10 h-10"
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => setViewMode('list')}
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="icon"
                className="w-10 h-10"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Resultados */}
        {images.length === 0 ? (
          <div className="text-center py-16">
            <ImageIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Nenhuma imagem encontrada</p>
            <p className="text-gray-500 text-sm mt-2">
              {searchTerm ? 'Tente ajustar sua busca' : 'As imagens aparecerão aqui conforme forem adicionadas aos relatórios'}
            </p>
          </div>
        ) : (
          <>
            {/* Grid View */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {images.map(img => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className="group cursor-pointer rounded-lg overflow-hidden border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all"
                  >
                    <div className="aspect-square bg-gray-100 overflow-hidden">
                      <img
                        src={img.url}
                        alt={img.fileName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3C/svg%3E'; }}
                      />
                    </div>
                    <div className="p-3 bg-white">
                      <p className="text-xs font-medium text-gray-900 truncate">{img.fileName}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {img.author} • {img.mes}{img.ano ? `/${img.ano}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="space-y-2">
                {images.map(img => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className="group cursor-pointer flex gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all"
                  >
                    <div className="w-20 h-20 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                      <img
                        src={img.url}
                        alt={img.fileName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{img.fileName}</p>
                      <p className="text-sm text-gray-600 mt-1">Autor: {img.author}</p>
                      {img.description && (
                        <p className="text-sm text-gray-500 mt-1 truncate">{img.description}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        {img.mes}{img.ano ? `/${img.ano}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Info Stats */}
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              Mostrando <strong>{images.length}</strong> imagem{images.length !== 1 ? 's' : ''}
            </div>
          </>
        )}

        {/* Modal de Visualização */}
        {selectedImage && (
          <div
            className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <div
              className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
                <h2 className="font-semibold text-gray-900">{selectedImage.fileName}</h2>
                <div className="flex gap-2 items-center">
                  {canEditOrDelete(selectedImage) && (
                    <>
                      <Button
                        onClick={() => {
                          setEditingImage(selectedImage);
                          setEditDescription(selectedImage.description);
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        Editar
                      </Button>
                      <Button
                        onClick={() => handleDeleteImage(selectedImage)}
                        variant="destructive"
                        size="sm"
                        disabled={deleting}
                        className="gap-2"
                      >
                        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Deletar
                      </Button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="text-gray-500 hover:text-gray-700 text-2xl ml-2"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.fileName}
                  className="w-full h-auto rounded-lg mb-6"
                  onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f0f0f0" width="400" height="300"/%3E%3C/svg%3E'; }}
                />

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-600 uppercase">Autor</p>
                    <p className="text-gray-900">{selectedImage.author}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-600 uppercase">Período</p>
                    <p className="text-gray-900">
                      {selectedImage.mes}{selectedImage.ano ? `/${selectedImage.ano}` : ''}
                    </p>
                  </div>

                  {selectedImage.description && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 uppercase">Descrição</p>
                      <p className="text-gray-900">{selectedImage.description}</p>
                    </div>
                  )}

                  <a
                    href={selectedImage.url}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Baixar imagem
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dialog de Edição */}
        <Dialog open={!!editingImage} onOpenChange={(open) => !open && setEditingImage(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Descrição</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Descrição</Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Descreva a imagem..."
                  className="resize-none h-24"
                  disabled={saving}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditingImage(null)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveDescription}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function GaleriaFotos() {
  return <RequireAuth><GaleriaFotosInner /></RequireAuth>;
}