import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ChevronDown, FileIcon, FolderIcon, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function FileHierarchy({ backups = [], onPreview, canManageFile, isGeneralCoordinator, renderBackupStatus }) {
  const [expandedReports, setExpandedReports] = useState(new Set());
  const [expandedActivities, setExpandedActivities] = useState(new Set());
  const [deleting, setDeleting] = useState(null);
  const queryClient = useQueryClient();

  // Agrupar por relatório > tipo de arquivo
  const hierarchy = backups.reduce((acc, file) => {
    const reportId = file.reportId || 'sem-relatorio';
    if (!acc[reportId]) {
      acc[reportId] = { label: file.reportLabel || reportId, files: {} };
    }
    const activityId = `atividade-${file.fileType?.split('/')[0] || 'outro'}`;
    if (!acc[reportId].files[activityId]) {
      acc[reportId].files[activityId] = [];
    }
    acc[reportId].files[activityId].push(file);
    return acc;
  }, {});

  const toggleReport = (reportId) => {
    const newExpanded = new Set(expandedReports);
    if (newExpanded.has(reportId)) {
      newExpanded.delete(reportId);
    } else {
      newExpanded.add(reportId);
    }
    setExpandedReports(newExpanded);
  };

  const toggleActivity = (key) => {
    const newExpanded = new Set(expandedActivities);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedActivities(newExpanded);
  };

  const handleDownload = (file) => {
    if (file.fileUrl) {
      window.open(file.fileUrl, '_blank');
      toast.success(`Download iniciado: ${file.fileName}`);
    } else {
      toast.error('URL do arquivo não disponível');
    }
  };

  const handlePreview = (file) => {
    const isPdf = file.fileType === 'application/pdf';
    const isImage = file.fileType?.startsWith('image/');

    if ((isPdf || isImage) && onPreview) {
      onPreview(file);
    } else {
      handleDownload(file);
    }
  };

  const handleDelete = async (file) => {
    // Validar permissão antes de deletar
    if (!canManageFile || !canManageFile(file)) {
      toast.error('Você não tem permissão para deletar este arquivo');
      return;
    }

    if (!confirm(`Tem certeza que deseja deletar "${file.fileName}"?`)) {
      return;
    }

    setDeleting(file.id);
    try {
      await base44.entities.Attachment.delete(file.id);
      toast.success('Arquivo deletado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['google-drive-backups'] });
    } catch (error) {
      toast.error('Erro ao deletar arquivo: ' + (error.message || 'desconhecido'));
    } finally {
      setDeleting(null);
    }
  };

  if (backups.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
        <FolderIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">Nenhum arquivo encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(hierarchy).map(([reportId, { label, files: activities }]) => (
        <div key={reportId} className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Relatório */}
          <button
            onClick={() => toggleReport(reportId)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
          >
            {expandedReports.has(reportId) ? (
              <ChevronDown className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-600" />
            )}
            <FolderIcon className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-sm text-gray-900">
              {label}
            </span>
            <span className="ml-auto text-xs text-gray-500">
              {Object.values(activities).flat().length} arquivos
            </span>
          </button>

          {/* Atividades */}
          {expandedReports.has(reportId) && (
            <div className="bg-gray-50 divide-y">
              {Object.entries(activities).map(([activityKey, files]) => (
                <div key={activityKey}>
                  <button
                    onClick={() => toggleActivity(activityKey)}
                    className="w-full flex items-center gap-2 px-6 py-2 hover:bg-gray-100 transition-colors text-left"
                  >
                    {expandedActivities.has(activityKey) ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                    <FolderIcon className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-gray-700">
                     {({'atividade-image': 'Imagens', 'atividade-video': 'Vídeos', 'atividade-audio': 'Áudios', 'atividade-application': 'Documentos', 'atividade-outro': 'Outros'})[activityKey] || activityKey.replace('atividade-', '')}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">{files.length}</span>
                  </button>

                  {/* Arquivos */}
                  {expandedActivities.has(activityKey) && (
                    <div className="bg-white divide-y">
                      {files.map((file) => {
                        const isImage = file.fileType?.startsWith('image/');
                        const isPdf = file.fileType === 'application/pdf';
                        const canPreview = isPdf || isImage;
                        return (
                        <div key={file.id} className="px-8 py-3 flex items-center gap-3 hover:bg-gray-50">
                          {isImage ? (
                            <img
                              src={file.fileUrl}
                              alt={file.fileName}
                              className="w-12 h-12 object-cover rounded-md flex-shrink-0 border border-gray-200 cursor-pointer"
                              onClick={() => handlePreview(file)}
                            />
                          ) : (
                            <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600" onClick={() => handlePreview(file)}>
                              {file.fileName}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <p className="text-xs text-gray-500">
                                {new Date(file.timestamp).toLocaleString('pt-BR')} · {file.size}
                              </p>
                              {renderBackupStatus && renderBackupStatus(file)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDownload(file)}
                              className="text-blue-600 hover:bg-blue-50"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            {canManageFile && canManageFile(file) && (
                               <Button
                                 size="sm"
                                 variant="ghost"
                                 className="text-red-600 hover:bg-red-50"
                                 title="Deletar arquivo"
                                 disabled={deleting === file.id}
                                 onClick={() => handleDelete(file)}
                               >
                                 <Trash2 className="w-4 h-4" />
                               </Button>
                             )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}