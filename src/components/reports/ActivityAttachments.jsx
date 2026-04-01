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
const ALLOWED_EXTENSIONS = ['jpg','jpeg','png','gif','webp','pdf'];
const ACCEPT_STRING = '.jpg,.jpeg,.png,.gif,.webp,.pdf';

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

  const triggerBackup = async (attachmentId) => {
    try {
      await base44.functions.invoke('backupSingleFile', { attachment_id: attachmentId });
    } catch (err) {
      console.warn('Backup agendado falhou (não crítico):', err?.message);
    }
  };

  const handleFiles = async (files) => {
    const fileList = Array.from(files);
    for (const file of fileList) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast.error(`Somente imagens e PDFs são permitidos. Tipo rejeitado: .${ext}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Arquivo muito grande (máx 50MB): ${formatBytes(file.size)}`);
        return;
      }
    }

    setUploading(true);
    try {
      for (const file of fileList) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        // Renomear com nome da atividade para organização
        const fileExt = file.name.split('.').pop().toLowerCase();
        const safeName = activityName.substring(0, 40).replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').replace(/\s+/g, '_');
        const timestamp = Date.now();
        const renamedFileName = `${safeName}__${timestamp}.${fileExt}`;

        const created = await base44.entities.Attachment.create({
          report_id: reportId,
          activity_id: activityId || `activity_${activityIndex}`,
          file_name: renamedFileName,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          file_url,
          description: file.name, // nome original preservado
          backup_done: false,
        });

        // Backup automático no Drive
        if (created?.id) triggerBackup(created.id);
      }
      queryClient.invalidateQueries(qKey);
      queryClient.invalidateQueries(['attachments', reportId]);
      queryClient.invalidateQueries(['gestor-attachments']);
      toast.success(`${fileList.length} arquivo(s) enviado(s) e backup iniciado`);
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
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
          📸 Evidências ({attachments.length})
        </span>
        {canEdit && (
          <Button
            size="sm"
            className="h-8 text-xs gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Enviando...' : '+ Enviar Evidências'}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          className="hidden"
          onChange={e => e.target.files?.length && handleFiles(e.target.files)}
        />
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400">Carregando...</p>
      ) : attachments.length === 0 ? (
        canEdit ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-xs text-gray-600 border-2 border-dashed border-gray-300 rounded-lg py-5 hover:border-blue-400 hover:bg-blue-50 transition-all font-medium"
          >
            📁 Clique para adicionar fotos ou PDFs
          </button>
        ) : (
          <p className="text-xs text-gray-400">Sem evidências anexadas</p>
        )
      ) : (
        <div className="space-y-2">
          {attachments.map(att => {
            const Icon = getFileIcon(att.file_type);
            const isImage = att.file_type?.startsWith('image/');
            return (
              <div key={att.id} className="flex items-center gap-2.5 p-2.5 bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-lg hover:border-gray-200 hover:shadow-sm transition-all group">
                {isImage ? (
                  <img
                    src={att.file_url}
                    alt={att.file_name}
                    className="w-8 h-8 rounded object-cover flex-shrink-0 bg-gray-100"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-700 truncate">{att.file_name}</div>
                  {att.description && (
                    <div className="text-xs text-gray-400 truncate">{att.description}</div>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatBytes(att.file_size)}</span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <ExternalLink className="w-3 h-3 text-gray-500" />
                    </Button>
                  </a>
                  {canEdit && (
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6"
                      onClick={() => deleteMutation.mutate(att.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}