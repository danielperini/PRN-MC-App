import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, X, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function PhotoSelectorModal({ isOpen, onClose, reportId, onSelect, selectedPhotoIds = [] }) {
  const [selected, setSelected] = useState(selectedPhotoIds);

  // Buscar todas as fotos anexadas
  const { data: attachments, isLoading } = useQuery({
    queryKey: ['report-attachments', reportId],
    queryFn: async () => {
      if (!reportId) return [];
      const attachs = await base44.entities.Attachment.filter(
        { report_id: reportId },
        '-created_date',
        100
      );
      // Filtrar apenas imagens
      return attachs.filter(a => 
        a.file_type && 
        (a.file_type.includes('image/') || 
         /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file_name))
      );
    },
    enabled: isOpen && !!reportId,
  });

  const handleTogglePhoto = (photoId) => {
    if (selected.includes(photoId)) {
      setSelected(selected.filter(id => id !== photoId));
    } else {
      if (selected.length >= 3) {
        toast.error('Máximo de 3 fotos permitidas');
        return;
      }
      setSelected([...selected, photoId]);
    }
  };

  const handleConfirm = () => {
    onSelect(selected);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Selecionar Fotos para o Cabeçalho</DialogTitle>
          <DialogDescription>
            Escolha até 3 fotos para compor o cabeçalho do relatório em PDF
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
           {isLoading ? (
             <div className="text-center py-8 text-gray-400">Carregando fotos...</div>
           ) : !attachments || attachments.length === 0 ? (
             <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl">
               <Upload className="w-8 h-8 mx-auto text-gray-300 mb-2" />
               <p className="text-sm text-gray-400">Nenhuma foto anexada neste relatório</p>
               <p className="text-xs text-gray-400 mt-1">Adicione fotos na aba Anexos primeiro</p>
             </div>
           ) : (
             <>
               <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto p-2">
                 {(attachments || []).map(attachment => (
                  <div
                    key={attachment.id}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                      selected.includes(attachment.id)
                        ? 'border-blue-500 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleTogglePhoto(attachment.id)}
                  >
                    <img
                      src={attachment.file_url}
                      alt={attachment.file_name}
                      className="w-full h-32 object-cover"
                    />
                    {selected.includes(attachment.id) && (
                      <div className="absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center">
                        <div className="bg-blue-500 rounded-full p-1.5">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-gray-600 p-1.5 bg-gray-50 truncate">
                      {attachment.file_name}
                    </p>
                  </div>
                ))}
              </div>

              <div className="text-xs text-gray-500 flex items-center justify-between pt-2 border-t">
                <span>Selecionadas: {selected.length} de 3</span>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handleConfirm}
            disabled={selected.length === 0}
          >
            Confirmar Seleção ({selected.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}