import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Image, Video, AlertCircle, CheckCircle2, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function MediaUploader({ reportId, onUploadSuccess, isOpen = false, onClose }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadType, setUploadType] = useState(null); // 'photo' ou 'video'
  const [duplicateFile, setDuplicateFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setDuplicateFile(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('reportId', reportId);
      formData.append('fileType', uploadType);

      const response = await base44.functions.invoke('uploadWithDuplicateCheck', {
        file,
        reportId,
        fileType: uploadType
      });

      if (response.data.isDuplicate) {
        setDuplicateFile({
          name: file.name,
          existingFile: response.data.attachment,
          message: response.data.message
        });
        toast.warning('⚠️ Arquivo já existe', {
          description: response.data.message,
          duration: 5000
        });
      } else {
        toast.success(`✓ ${uploadType === 'video' ? 'Vídeo' : 'Foto'} adicionado(a)`, {
          description: response.data.message
        });
        onUploadSuccess?.();
        setUploadType(null);
        fileInputRef.current = null;
      }
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast.error('Erro ao fazer upload do arquivo');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      {/* Botões flutuantes */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            setUploadType('photo');
            setTimeout(() => fileInputRef.current?.click(), 100);
          }}
          disabled={isUploading}
        >
          <Image className="w-4 h-4" />
          Adicionar Foto
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            setUploadType('video');
            setTimeout(() => fileInputRef.current?.click(), 100);
          }}
          disabled={isUploading}
        >
          <Video className="w-4 h-4" />
          Adicionar Vídeo
        </Button>
      </div>

      {/* Input file oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept={uploadType === 'video' ? 'video/*' : 'image/*,video/*'}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Dialog para arquivo duplicado */}
      <Dialog open={!!duplicateFile} onOpenChange={() => setDuplicateFile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Arquivo Duplicado
            </DialogTitle>
            <DialogDescription className="mt-3">
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-900">
                  O arquivo "{duplicateFile?.name}" já existe neste relatório
                </p>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-800">
                    {duplicateFile?.message}
                  </p>
                </div>
                <p className="text-xs text-gray-600">
                  Para economizar espaço, o arquivo duplicado não foi adicionado novamente.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setDuplicateFile(null)}
            >
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}