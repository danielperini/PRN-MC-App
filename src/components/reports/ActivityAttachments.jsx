import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Paperclip, Upload, Trash2, FileText, FileImage,
  FileVideo, FileAudio, File, ExternalLink, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['jpg','jpeg','png','mp4','mp3','wav','pdf','doc','docx','xls','xlsx'];

function getFileIcon(fileType = '') {
  if (fileType.startsWith('image/')) return FileImage;
  if (fileType.startsWith('video/')) return FileVideo;
  if (fileType.startsWith('audio/')) return FileAudio;
  if (fileType.includes('pdf') || fileType.includes('word') || fileType.includes('excel') || fileType.includes('sheet')) return FileText;
  return File;
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Gerencia anexos vinculados a uma atividade específica dentro de um relatório.
 * Props:
 *  - reportId: string (obrigatório)
 *  - activityIndex: number (índice da atividade)
 *  - activityId: string (ID único da atividade para renomeação de arquivos)
 *  - activityName: string (nome da atividade para organização)
 *  - canEdit: boolean
 */
export default function ActivityAttachments({ reportId, activityIndex, activityId, activityName = 'Atividade', canEdit }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  // Query key única por relatório + atividade
  const qKey = ['act-attachments', reportId, activityId || activityIndex];

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      // Busca todos os anexos do relatório e filtra pela atividade
      const all = await base44.entities.Attachment.filter({ report_id: reportId }, '-created_date');
      // Filtra por activity_id ou activity_index (compatibilidade)
      return all.filter(a => 
        a.activity_id === activityId || a.activity_id === `activity_${activityIndex}`
      );
    },
    enabled: !!reportId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Attachment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(qKey);
      queryClient.invalidateQueries(['attachments', reportId]);
      queryClient.invalidateQueries(['gestor-attachments']);
      toast.success('Anexo removido');
    },
    onError: () => toast.error('Erro ao remover anexo'),
  });

  const handleFiles = async (files) => {
    const fileList = Array.from(files);
    for (const file of fileList) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast.error(`Tipo não permitido: .${ext}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Arquivo muito grande: ${formatBytes(file.size)}`);
        return;
      }
    }

    setUploading(true);
    try {
      for (const file of fileList) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        
        // Renomear arquivo com ID da atividade e número sequencial
        const fileExt = file.name.split('.').pop();
        const timestamp = new Date().getTime();
        const renamedFileName = `${activityId || `activity_${activityIndex}`}__${activityName.substring(0, 20).replace(/\s+/g, '_')}__${timestamp}.${fileExt}`;
        
        await base44.entities.Attachment.create({
          report_id: reportId,
          activity_id: activityId || `activity_${activityIndex}`,  // vínculo com a atividade
          file_name: renamedFileName,  // nome organizado e padronizado
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          file_url,
          description: file.name,  // guardar nome original como descrição
        });
      }
      queryClient.invalidateQueries(qKey);
      queryClient.invalidateQueries(['attachments', reportId]);
      queryClient.invalidateQueries(['gestor-attachments']);
      toast.success(`${fileList.length} arquivo(s) enviado(s)`);
    } catch (err) {
      console.error('Upload error (activity):', err);
      toast.error('Erro ao enviar: ' + (err?.message || 'tente novamente'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
          <Paperclip className="w-3 h-3" />
          Anexos desta atividade ({attachments.length})
        </span>
        {canEdit && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Upload className="w-3 h-3" />}
              {uploading ? 'Enviando...' : 'Adicionar'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_EXTENSIONS.map(e => `.${e}`).join(',')}
              className="hidden"
              onChange={e => e.target.files?.length && handleFiles(e.target.files)}
            />
          </>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400">Carregando...</p>
      ) : attachments.length === 0 ? (
        canEdit ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg py-3 hover:border-gray-300 transition-colors"
          >
            Clique para adicionar anexos a esta atividade
          </button>
        ) : (
          <p className="text-xs text-gray-400">Nenhum anexo</p>
        )
      ) : (
        <div className="space-y-1.5">
          {attachments.map(att => {
            const Icon = getFileIcon(att.file_type);
            return (
              <div key={att.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors">
                <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-black truncate" title={att.file_name}>{att.file_name}</div>
                  {att.description && (
                    <div className="text-xs text-gray-400 truncate">{att.description}</div>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{formatBytes(att.file_size)}</span>
                <a href={att.file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                  </Button>
                </a>
                {canEdit && (
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => deleteMutation.mutate(att.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}