import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, Trash2, Image } from 'lucide-react';
import { toast } from 'sonner';

export default function AttachmentsSection({
  attachments = [],
  setAttachments,
  reportId
}) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files) => {
    try {
      setUploading(true);

      const novos = [];

      for (const file of files) {
        const uploaded = await base44.storage.upload(file);

        const item = {
          name: file.name,
          url: uploaded.url,
          type: file.type,
          size: file.size,
          created_at: new Date().toISOString()
        };

        novos.push(item);

        // 🔥 NOVO: SALVAR NA GALERIA GLOBAL
        try {
          await base44.entities.MediaLibrary.create({
            file_url: uploaded.url,
            file_name: file.name,
            tipo: file.type?.includes('image') ? 'imagem' : 'documento',
            origem: 'relatorio',
            report_id: reportId,
            created_at: new Date().toISOString()
          });
        } catch (e) {
          console.warn('Erro ao salvar na galeria:', e);
        }
      }

      setAttachments([...attachments, ...novos]);

      toast.success('Arquivo enviado com sucesso');
    } catch (e) {
      console.error(e);
      toast.error('Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (index) => {
    const updated = [...attachments];
    updated.splice(index, 1);
    setAttachments(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Image className="w-5 h-5" />
          Anexos
        </h2>

        <Button
          onClick={() => inputRef.current.click()}
          disabled={uploading}
          className="gap-2"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Enviar
        </Button>

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {attachments.map((file, idx) => (
          <div
            key={idx}
            className="border rounded-lg p-2 text-xs space-y-2 relative"
          >
            {file.type?.includes('image') ? (
              <img
                src={file.url}
                className="w-full h-24 object-cover rounded"
              />
            ) : (
              <div className="h-24 flex items-center justify-center bg-gray-100 rounded">
                Documento
              </div>
            )}

            <div className="truncate">{file.name}</div>

            <button
              onClick={() => handleRemove(idx)}
              className="absolute top-1 right-1 text-red-500"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
