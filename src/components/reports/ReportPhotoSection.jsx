import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImagePlus, Trash2, Edit2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import PhotoGallerySelector from './PhotoGallerySelector';
import PhotoCaptionSuggester from './PhotoCaptionSuggester';

export default function ReportPhotoSection({ photos = [], onAddPhoto, onUpdatePhoto, onDeletePhoto, activityId, reportId }) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editCaption, setEditCaption] = useState('');

  const handleAddPhoto = async (photo) => {
    if (onAddPhoto) {
      await onAddPhoto(photo);
      setSelectorOpen(false);
    }
  };

  const handleEditClick = (photo) => {
    setEditingPhotoId(photo.id);
    setEditCaption(photo.caption || '');
  };

  const handleSaveCaption = () => {
    onUpdatePhoto(editingPhotoId, editCaption);
    setEditingPhotoId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Fotos do Relatório</h3>
        <Button
          onClick={() => setSelectorOpen(true)}
          className="bg-green-600 hover:bg-green-700 text-white gap-2"
          size="sm"
        >
          <ImagePlus className="w-4 h-4" />
          Adicionar Foto
        </Button>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
          <ImagePlus className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-600 text-sm">Nenhuma foto adicionada</p>
          <p className="text-gray-500 text-xs mt-1">Clique no botão acima para adicionar fotos da galeria</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {photos.map(photo => (
            <div key={photo.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="aspect-video bg-gray-100 overflow-hidden relative group">
                <img
                  src={photo.url}
                  alt={photo.fileName}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Crect fill="%23f0f0f0" width="400" height="225"/%3E%3C/svg%3E'; }}
                />
                {!photo.caption && (
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <PhotoCaptionSuggester
                      photoUrl={photo.url}
                      activityId={activityId}
                      reportId={reportId}
                      onCaptionSuggested={(caption) => onUpdatePhoto(photo.id, caption)}
                    />
                  </div>
                )}
              </div>

              <div className="p-3 space-y-2">
                <p className="text-sm font-medium text-gray-900 truncate">{photo.fileName}</p>
                <p className="text-xs text-gray-600">Autor: {photo.author}</p>

                {photo.caption && (
                  <div className="bg-gray-50 p-2 rounded text-xs text-gray-700">
                    <strong>Legenda:</strong> {photo.caption}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleEditClick(photo)}
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                  >
                    <Edit2 className="w-3 h-3" />
                    Legenda
                  </Button>
                  <Button
                    onClick={() => onDeletePhoto(photo.id)}
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selector Dialog */}
      <PhotoGallerySelector
        isOpen={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelectPhoto={handleAddPhoto}
      />

      {/* Edit Caption Dialog */}
      <Dialog open={!!editingPhotoId} onOpenChange={(open) => !open && setEditingPhotoId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Legenda da Foto</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Legenda</Label>
              <Textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                placeholder="Digite a legenda para a foto..."
                className="resize-none h-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingPhotoId(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCaption}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}