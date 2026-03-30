import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Image, X, ExternalLink, Loader2 } from 'lucide-react';

export default function ActivityPhotoLinker({ activityId, onPhotosChange, disabled = false }) {
  const [photos, setPhotos] = useState([]);
  const [allPhotos, setAllPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState(new Set());

  // Carregar fotos vinculadas à atividade
  useEffect(() => {
    if (!activityId) return;
    
    async function load() {
      try {
        const activity = await base44.entities.Activity.get(activityId);
        const fotos = Array.isArray(activity.fotos) ? activity.fotos : [];
        setPhotos(fotos);
      } catch (err) {
        console.error('Erro ao carregar fotos:', err);
      }
    }

    load();
  }, [activityId]);

  // Carregar galeria de fotos disponíveis
  const loadAvailablePhotos = async () => {
    setLoading(true);
    try {
      const attachments = await base44.entities.Attachment.list('-created_date', 1000);
      const imageAttachments = (attachments || []).filter(a => 
        a.file_type && a.file_type.startsWith('image/')
      );
      setAllPhotos(imageAttachments);
      
      // Marcar fotos já vinculadas
      const linkedIds = new Set(photos.map(p => p.file_url || p.attachment_id));
      setSelectedPhotos(linkedIds);
    } catch (err) {
      console.error('Erro ao carregar galeria:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setDialogOpen(true);
    loadAvailablePhotos();
  };

  const togglePhotoSelection = (fileUrl, attachmentId) => {
    const key = fileUrl || attachmentId;
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    try {
      const fotos = Array.from(selectedPhotos).map(key => {
        const photo = allPhotos.find(p => (p.file_url || p.id) === key);
        return {
          file_url: photo?.file_url,
          attachment_id: photo?.id,
          file_name: photo?.file_name,
        };
      });

      await base44.entities.Activity.update(activityId, { fotos });
      setPhotos(fotos);
      setDialogOpen(false);
      
      if (onPhotosChange) {
        onPhotosChange(fotos);
      }
    } catch (err) {
      console.error('Erro ao salvar fotos:', err);
    }
  };

  const removePhoto = async (index) => {
    const updated = photos.filter((_, i) => i !== index);
    try {
      await base44.entities.Activity.update(activityId, { fotos: updated });
      setPhotos(updated);
      if (onPhotosChange) {
        onPhotosChange(updated);
      }
    } catch (err) {
      console.error('Erro ao remover foto:', err);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Fotos da Atividade</label>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleOpenDialog}
              disabled={disabled}
              className="gap-2"
            >
              <Image className="w-4 h-4" />
              Vincular Fotos
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Selecionar Fotos</DialogTitle>
            </DialogHeader>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {allPhotos.map((photo) => {
                  const key = photo.file_url || photo.id;
                  const isSelected = selectedPhotos.has(key);
                  
                  return (
                    <div
                      key={key}
                      onClick={() => togglePhotoSelection(photo.file_url, photo.id)}
                      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {photo.file_url && (
                        <img 
                          src={photo.file_url} 
                          alt={photo.file_name}
                          className="w-full h-32 object-cover"
                        />
                      )}
                      <div className="p-2 bg-white">
                        <p className="text-xs text-gray-600 truncate">{photo.file_name}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                Salvar Seleção
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Exibir fotos vinculadas */}
      {photos.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photos.map((photo, idx) => (
            <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
              {photo.file_url && (
                <img 
                  src={photo.file_url} 
                  alt={photo.file_name}
                  className="w-full h-24 object-cover"
                />
              )}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                {photo.file_url && (
                  <a 
                    href={photo.file_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-1 bg-white rounded hover:bg-gray-100"
                  >
                    <ExternalLink className="w-4 h-4 text-blue-600" />
                  </a>
                )}
                {!disabled && (
                  <button 
                    onClick={() => removePhoto(idx)}
                    className="p-1 bg-white rounded hover:bg-gray-100"
                  >
                    <X className="w-4 h-4 text-red-600" />
                  </button>
                )}
              </div>
              <div className="p-1 bg-white text-center">
                <p className="text-xs text-gray-600 truncate">{photo.file_name}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 border border-dashed border-gray-300 rounded-lg text-center text-sm text-gray-500">
          Nenhuma foto vinculada
        </div>
      )}
    </div>
  );
}