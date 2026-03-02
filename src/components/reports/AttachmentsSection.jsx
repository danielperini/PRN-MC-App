import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Paperclip, 
  Upload, 
  Trash2, 
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  ExternalLink,
  Loader2,
  Download,
  Edit2,
  Check,
  X as XIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES_PER_REPORT = 30;
const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png',
  'video/mp4',
  'audio/mpeg', 'audio/mp3', 'audio/wav',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];
const ALLOWED_EXTENSIONS = ['jpg','jpeg','png','mp4','mp3','wav','pdf','doc','docx','xls','xlsx'];

function getFileIcon(fileType) {
  if (!fileType) return File;
  if (fileType.startsWith('image/')) return FileImage;
  if (fileType.startsWith('video/')) return FileVideo;
  if (fileType.startsWith('audio/')) return FileAudio;
  if (fileType === 'application/pdf' || fileType.includes('word') || fileType.includes('excel') || fileType.includes('sheet')) return FileText;
  return File;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file, currentCount) {
  const ext = file.name.split('.').pop().toLowerCase();
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Tipo de arquivo não permitido: .${ext}. Use: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Arquivo muito grande: ${formatBytes(file.size)}. Máximo: 50MB`;
  }
  if (currentCount >= MAX_FILES_PER_REPORT) {
    return `Limite atingido: máximo de ${MAX_FILES_PER_REPORT} arquivos por relatório`;
  }
  return null;
}

export default function AttachmentsSection({ reportId, canEdit }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDesc, setEditDesc] = useState('');

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['attachments', reportId],
    queryFn: () => base44.entities.Attachment.filter({ report_id: reportId }, '-created_date'),
    enabled: !!reportId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Attachment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['attachments', reportId]);
      toast.success('Anexo removido');
    },
    onError: () => toast.error('Erro ao remover anexo'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, description }) => base44.entities.Attachment.update(id, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries(['attachments', reportId]);
      setEditingId(null);
      toast.success('Descrição atualizada');
    },
    onError: () => toast.error('Erro ao atualizar descrição'),
  });

  const downloadAllMutation = useMutation({
    mutationFn: async () => {
      const zip = await import('jszip').then(m => new m.default());
      attachments.forEach(att => {
        zip.file(att.file_name, fetch(att.file_url).then(r => r.blob()));
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio_anexos_${new Date().toISOString().slice(0,10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success('Arquivos baixados'),
    onError: () => toast.error('Erro ao baixar arquivos'),
  });

  const handleFiles = async (files) => {
    const fileList = Array.from(files);
    
    for (const file of fileList) {
      const error = validateFile(file, attachments.length);
      if (error) {
        toast.error(error);
        return;
      }
    }

    setUploading(true);
    try {
      for (const file of fileList) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.Attachment.create({
          report_id: reportId,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          file_url
        });
      }
      queryClient.invalidateQueries(['attachments', reportId]);
      toast.success(`${fileList.length} arquivo(s) enviado(s) com sucesso`);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Erro ao enviar arquivo: ' + (err?.message || 'tente novamente'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files?.length) handleFiles(e.target.files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  return (
    <section>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium text-black">Anexos</h2>
          <span className="text-sm text-gray-400">
            {attachments.length}/{MAX_FILES_PER_REPORT}
          </span>
        </div>
        <div className="flex gap-2">
          {attachments.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadAllMutation.mutate()}
              disabled={downloadAllMutation.isPending}
              className="gap-1"
            >
              {downloadAllMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Baixar Tudo
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachments.length >= MAX_FILES_PER_REPORT}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-1" />
              )}
              {uploading ? 'Enviando...' : 'Adicionar'}
            </Button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.map(e => `.${e}`).join(',')}
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {/* Drop zone — shown when no attachments or always if can edit */}
      {canEdit && attachments.length === 0 && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors
            ${dragOver ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300'}
          `}
        >
          <Paperclip className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">
            Arraste arquivos ou <span className="underline">clique para selecionar</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            PDF, Word, Excel, imagens, vídeo, áudio — máx. 50MB por arquivo
          </p>
        </div>
      )}

      {/* Drop overlay when has files */}
      {canEdit && attachments.length > 0 && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            mb-3 transition-all rounded-xl
            ${dragOver ? 'ring-2 ring-black ring-offset-2' : ''}
          `}
        >
          {/* File list */}
          {isLoading ? (
            <div className="text-center py-6 text-gray-400 text-sm">Carregando anexos...</div>
          ) : (
            <div className="space-y-2">
              {attachments.map(attachment => {
                 const Icon = getFileIcon(attachment.file_type);
                 const isImage = attachment.file_type?.startsWith('image/');
                 const isEditing = editingId === attachment.id;
                 return (
                   <div
                     key={attachment.id}
                     className="flex flex-col gap-2 p-3 border border-gray-100 rounded-xl group hover:border-gray-200 transition-all"
                   >
                     <div className="flex items-start gap-3">
                       {/* Thumbnail */}
                       {isImage ? (
                         <img
                           src={attachment.file_url}
                           alt={attachment.file_name}
                           className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                         />
                       ) : (
                         <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                           <Icon className="w-5 h-5 text-gray-500" />
                         </div>
                       )}

                       <div className="flex-1 min-w-0">
                         <p className="text-sm font-medium text-black truncate">
                           {attachment.file_name}
                         </p>
                         <p className="text-xs text-gray-400">
                           {formatBytes(attachment.file_size)}
                         </p>
                       </div>

                       <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <a
                           href={attachment.file_url}
                           target="_blank"
                           rel="noopener noreferrer"
                           onClick={(e) => e.stopPropagation()}
                         >
                           <Button variant="ghost" size="icon" className="h-8 w-8">
                             <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                           </Button>
                         </a>
                         {canEdit && (
                           <>
                             <Button
                               variant="ghost"
                               size="icon"
                               className="h-8 w-8"
                               onClick={() => {
                                 setEditingId(attachment.id);
                                 setEditDesc(attachment.description || '');
                               }}
                             >
                               <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                             </Button>
                             <Button
                               variant="ghost"
                               size="icon"
                               className="h-8 w-8"
                               onClick={() => deleteMutation.mutate(attachment.id)}
                               disabled={deleteMutation.isPending}
                             >
                               <Trash2 className="w-3.5 h-3.5 text-red-400" />
                             </Button>
                           </>
                         )}
                       </div>
                     </div>
                   </div>
                 );
               })}
            </div>
          )}
        </div>
      )}

      {/* Read-only list (no edit) */}
      {!canEdit && (
        isLoading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Carregando anexos...</div>
        ) : attachments.length === 0 ? (
          <p className="text-gray-400 text-center py-8 border border-dashed rounded-xl text-sm">
            Nenhum anexo
          </p>
        ) : (
          <div className="space-y-2">
            {attachments.map(attachment => {
              const Icon = getFileIcon(attachment.file_type);
              return (
                <div
                  key={attachment.id}
                  className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl"
                >
                  <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black truncate">{attachment.file_name}</p>
                    <p className="text-xs text-gray-400">{formatBytes(attachment.file_size)}</p>
                  </div>
                  <a
                    href={attachment.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                    </Button>
                  </a>
                </div>
              );
            })}
          </div>
        )
      )}
    </section>
  );
}