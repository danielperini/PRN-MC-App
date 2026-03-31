import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toastMessages } from '@/lib/toastMessages';
import { isNFFile, processNFFile } from '@/lib/nfParser';
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
  X as XIcon,
  Receipt,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MediaUploader from '@/components/gallery/MediaUploader';
import MediaGalleryViewer from '@/components/gallery/MediaGalleryViewer';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB por arquivo

// ── Card de metadados NF ──────────────────────────────────
function NFMetaCard({ attachment, canEdit, onEdit }) {
  if (!attachment.nf_tipo_documento) return null;

  const statusColor = {
    lido_com_sucesso: 'text-green-700 bg-green-50 border-green-200',
    leitura_parcial: 'text-amber-700 bg-amber-50 border-amber-200',
    leitura_falhou: 'text-red-700 bg-red-50 border-red-200',
  }[attachment.nf_status_leitura] || 'text-gray-600 bg-gray-50 border-gray-200';

  const StatusIcon = attachment.nf_status_leitura === 'lido_com_sucesso' ? CheckCircle2 : AlertCircle;

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <div className={`rounded-lg border p-3 text-xs space-y-1.5 ${statusColor}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <Receipt className="w-3.5 h-3.5" />
            Nota Fiscal — {attachment.nf_tipo_documento === 'xml_nf' ? 'XML' : 'PDF'}
          </div>
          <div className="flex items-center gap-1">
            <StatusIcon className="w-3 h-3" />
            <span className="capitalize">{(attachment.nf_status_leitura || '').replace(/_/g, ' ')}</span>
            {attachment.nf_revisado && <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Revisado</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {attachment.nf_numero && <span><strong>Nº NF:</strong> {attachment.nf_numero}</span>}
          {attachment.nf_data_emissao && <span><strong>Emissão:</strong> {attachment.nf_data_emissao}</span>}
          {attachment.nf_valor_total != null && (
            <span><strong>Valor:</strong> R$ {attachment.nf_valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          )}
          {attachment.nf_emitente_cpf_cnpj && <span><strong>CPF/CNPJ:</strong> {attachment.nf_emitente_cpf_cnpj}</span>}
          {attachment.nf_emitente_nome && <span className="col-span-2"><strong>Emitente:</strong> {attachment.nf_emitente_nome}</span>}
          {attachment.nf_destinatario_nome && <span className="col-span-2"><strong>Tomador:</strong> {attachment.nf_destinatario_nome}</span>}
          {attachment.nf_nome_renomeado && (
            <span className="col-span-2 truncate"><strong>Nome padrão:</strong> {attachment.nf_nome_renomeado}</span>
          )}
        </div>
      </div>
    </div>
  );
}

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

function validateFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    return `Arquivo muito grande: ${formatBytes(file.size)}. Máximo: 500MB`;
  }
  return null;
}

export default function AttachmentsSection({ reportId, canEdit, reportData }) {
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
      toastMessages.deleteSuccess();
    },
    onError: (e) => toastMessages.deleteFailed(e?.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, description }) => base44.entities.Attachment.update(id, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries(['attachments', reportId]);
      setEditingId(null);
      toastMessages.updateSuccess();
    },
    onError: (e) => toastMessages.updateFailed(e?.message),
  });

  const handleDownloadAll = () => {
    attachments.forEach(att => {
      window.open(att.file_url, '_blank');
    });
    toastMessages.info(`${attachments.length} arquivo(s) abertos para download.`);
  };

  const handleFiles = async (files) => {
    const fileList = Array.from(files);
    
    for (const file of fileList) {
       const error = validateFile(file);
       if (error) {
         toastMessages.warning(error);
         return;
      }
    }

    setUploading(true);
    const nfUploadResults = [];
    try {
      const existingNFs = attachments.filter(a => a.nf_tipo_documento).length;

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        const attachmentBase = {
          report_id: reportId,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          file_url,
        };

        // Tenta extrair metadados se for NF
        let savedAttachment = null;
        if (isNFFile(file)) {
          try {
            const nfMeta = await processNFFile({
              file,
              fileUrl: file_url,
              sequencial: existingNFs + i + 1,
              userFuncao: reportData?.funcao || reportData?.author_role || '',
              userName: reportData?.author_name || '',
            });
            if (nfMeta) {
              savedAttachment = await base44.entities.Attachment.create({
                ...attachmentBase,
                file_name: nfMeta.nome_renomeado || file.name,
                nf_tipo_documento: nfMeta.tipo_documento,
                nf_numero: nfMeta.numero_nf || null,
                nf_valor_total: nfMeta.valor_total ?? null,
                nf_data_emissao: nfMeta.data_emissao || null,
                nf_emitente_nome: nfMeta.emitente_nome || null,
                nf_emitente_cpf_cnpj: nfMeta.emitente_cpf_cnpj || null,
                nf_destinatario_nome: nfMeta.destinatario_nome || null,
                nf_destinatario_cpf_cnpj: nfMeta.destinatario_cpf_cnpj || null,
                nf_chave_acesso: nfMeta.chave_acesso || null,
                nf_status_leitura: nfMeta.status_leitura,
                nf_nome_original: file.name,
                nf_nome_renomeado: nfMeta.nome_renomeado || null,
                nf_revisado: false,
              });

              nfUploadResults.push({ nfMeta, fileName: nfMeta.nome_renomeado || file.name, fileUrl: file_url });
              continue;
            }
          } catch {
            // fallback — salva sem metadados NF
          }
        }

        if (!savedAttachment) {
          await base44.entities.Attachment.create(attachmentBase);
        }
      }

      queryClient.invalidateQueries(['attachments', reportId]);

      if (nfUploadResults.length > 0) {
        // Notificações por email
        const emails = [
          'notasfiscais@viadutodasartes.org.br',
          'danielperini.mc@viadutodasartes.org.br'
        ];
        const nfInfo = nfUploadResults.map(r => {
          const m = r.nfMeta;
          return [
            `Arquivo: ${r.fileName}`,
            m.numero_nf ? `NF Nº: ${m.numero_nf}` : '',
            m.valor_total != null ? `Valor: R$ ${m.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '',
            m.data_emissao ? `Emissão: ${m.data_emissao}` : '',
            m.emitente_nome ? `Emitente: ${m.emitente_nome}` : '',
            m.emitente_cpf_cnpj ? `CPF/CNPJ: ${m.emitente_cpf_cnpj}` : '',
            `Status leitura: ${(m.status_leitura || '').replace(/_/g, ' ')}`,
            `URL: ${r.fileUrl}`,
          ].filter(Boolean).join('\n');
        }).join('\n\n---\n\n');

        const subject = `[Museus Centro] Nova(s) NF anexada(s) — ${reportData?.author_name || 'Profissional'} — ${reportData?.mes_referencia || ''} ${reportData?.ano || ''}`;
        const body = `Nova(s) nota(s) fiscal(is) foram anexadas na plataforma Museus Centro.\n\nProfissional: ${reportData?.author_name || ''}\nFunção: ${reportData?.funcao || ''}\nMuseu: ${reportData?.museu || ''}\nMês: ${reportData?.mes_referencia || ''} ${reportData?.ano || ''}\n\n${nfInfo}\n\n---\nAcesse a plataforma para revisar e aprovar os dados.`;

        await Promise.allSettled(
          emails.map(to => base44.integrations.Core.SendEmail({ to, subject, body }))
        );

        toastMessages.info(
          `✅ ${nfUploadResults.length} NF(s) anexada(s) com sucesso! Notificação enviada por email.`
        );
      } else {
        toastMessages.fileUploadSuccess();
      }
    } catch (err) {
      console.error('Upload error:', err);
      toastMessages.fileUploadFailed(err?.message);
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
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium text-black">Anexos e Evidências</h2>
              <span className="text-sm text-gray-400">
                {attachments.length} arquivo(s)
              </span>
            </div>
            <div className="flex gap-2">
              {attachments.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAll}
                  className="gap-1"
                >
                  <Download className="w-4 h-4" />
                  Baixar Tudo
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-1" />
                  )}
                  {uploading ? 'Enviando...' : 'Adicionar Arquivo'}
                </Button>
              )}
            </div>
          </div>

          {/* Media Uploader — Fotos e Vídeos */}
          {canEdit && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-xs font-semibold text-blue-900 mb-3">📸 FOTOS E VÍDEOS PARA EVIDÊNCIA</p>
              <MediaUploader 
                reportId={reportId}
                onUploadSuccess={() => queryClient.invalidateQueries(['attachments', reportId])}
              />
              <p className="text-xs text-blue-700 mt-2">
                ✓ Fotos e vídeos ilimitados | ✓ Arquivos até 500MB | ✓ Duplicatas detectadas automaticamente
              </p>
            </div>
          )}
        </div>

        <input
           ref={fileInputRef}
           type="file"
           multiple
           accept="*"
           className="hidden"
           onChange={handleInputChange}
         />

        {/* Galeria de Fotos e Vídeos */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-3">🎬 GALERIA DE EVIDÊNCIAS</p>
          <MediaGalleryViewer reportId={reportId} />
        </div>
        </div>

      {/* Drop zone — shown when no attachments or always if can edit */}
      {canEdit && attachments.length === 0 && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-xl cursor-pointer transition-all
            ${dragOver 
              ? 'border-blue-400 bg-blue-50 scale-[1.02]' 
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'}
          `}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${dragOver ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <Paperclip className={`w-6 h-6 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
          </div>
          <p className="text-sm font-medium text-gray-700">
            {dragOver ? 'Solte aqui para enviar' : 'Arraste arquivos ou clique'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            PDF, Word, Excel, imagens, vídeo, áudio — máx. 50MB
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
            mb-4 transition-all rounded-xl p-4
            ${dragOver ? 'ring-2 ring-blue-400 ring-offset-2 bg-blue-50' : ''}
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
                     className="flex flex-col gap-3 p-3.5 border border-gray-150 rounded-xl group hover:border-gray-250 hover:shadow-md transition-all bg-white"
                   >
                     <div className="flex items-start gap-3.5">
                       {/* Thumbnail */}
                       {isImage ? (
                         <img
                           src={attachment.file_url}
                           alt={attachment.file_name}
                           className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100 ring-1 ring-gray-200"
                         />
                       ) : (
                         <div className="w-14 h-14 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ring-gray-200">
                           <Icon className="w-6 h-6 text-gray-500" />
                         </div>
                       )}

                       <div className="flex-1 min-w-0">
                           <p className="text-sm font-semibold text-black truncate">
                             {attachment.file_name}
                           </p>
                           <p className="text-xs text-gray-500 mt-0.5">
                             {formatBytes(attachment.file_size)}
                             {attachment.nf_nome_original && attachment.nf_nome_original !== attachment.file_name && (
                               <span className="ml-2 text-gray-400">orig: {attachment.nf_nome_original}</span>
                             )}
                           </p>
                         </div>

                       <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <a
                           href={attachment.file_url}
                           target="_blank"
                           rel="noopener noreferrer"
                           onClick={(e) => e.stopPropagation()}
                         >
                           <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-blue-50">
                             <ExternalLink className="w-3.5 h-3.5 text-gray-600" />
                           </Button>
                         </a>
                         {canEdit && (
                           <>
                             <Button
                               variant="ghost"
                               size="icon"
                               className="h-8 w-8 hover:bg-amber-50"
                               onClick={() => {
                                 setEditingId(attachment.id);
                                 setEditDesc(attachment.description || '');
                               }}
                             >
                               <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                             </Button>
                             <Button
                               variant="ghost"
                               size="icon"
                               className="h-8 w-8 hover:bg-red-50"
                               onClick={() => deleteMutation.mutate(attachment.id)}
                               disabled={deleteMutation.isPending}
                             >
                               <Trash2 className="w-3.5 h-3.5 text-red-500" />
                             </Button>
                           </>
                         )}
                       </div>
                     </div>

                     {/* Description edit mode */}
                     {isEditing && (
                       <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                         <Input
                           value={editDesc}
                           onChange={(e) => setEditDesc(e.target.value)}
                           placeholder="Adicione uma descrição..."
                           className="text-sm h-8"
                         />
                         <Button
                           size="icon"
                           className="h-8 w-8 bg-green-600 hover:bg-green-700"
                           onClick={() => updateMutation.mutate({ id: attachment.id, description: editDesc })}
                           disabled={updateMutation.isPending}
                         >
                           <Check className="w-3.5 h-3.5" />
                         </Button>
                         <Button
                           size="icon"
                           variant="outline"
                           className="h-8 w-8"
                           onClick={() => setEditingId(null)}
                         >
                           <XIcon className="w-3.5 h-3.5" />
                         </Button>
                       </div>
                     )}

                     {/* Description display */}
                     {attachment.description && !isEditing && (
                       <div className="text-xs text-gray-600 mt-1 pt-2 border-t border-gray-100">
                         {attachment.description}
                       </div>
                     )}

                     {/* NF Metadata Card */}
                     <NFMetaCard attachment={attachment} canEdit={canEdit} />
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
              const isImage = attachment.file_type?.startsWith('image/');
              return (
                <div
                  key={attachment.id}
                  className="flex flex-col gap-3 p-3.5 border border-gray-150 rounded-xl bg-white hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3.5">
                    {isImage ? (
                      <img
                        src={attachment.file_url}
                        alt={attachment.file_name}
                        className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100 ring-1 ring-gray-200"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ring-gray-200">
                        <Icon className="w-6 h-6 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-black truncate">{attachment.file_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatBytes(attachment.file_size)}</p>
                    </div>
                    <a
                      href={attachment.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-blue-50">
                        <ExternalLink className="w-3.5 h-3.5 text-gray-600" />
                      </Button>
                    </a>
                  </div>
                  {attachment.description && (
                    <div className="text-xs text-gray-600 pt-3 border-t border-gray-100">
                      <span className="text-gray-500 font-medium">Descrição:</span> {attachment.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </section>
  );
}