import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Paperclip, FileText, Search, Download, Eye,
  Image, File, FileVideo, Music, Archive, Trash2, Edit2, FolderPlus, CheckSquare, Square,
  Grid3x3, List, X, ZoomIn, ZoomOut, ChevronDown, Calendar, FileType, Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fileIcon(type = '') {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return FileVideo;
  if (type.startsWith('audio/')) return Music;
  if (type.includes('pdf')) return FileText;
  if (type.includes('zip') || type.includes('rar')) return Archive;
  return File;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function GestorArquivosInner() {
  const { user: currentUser, isCoordenador } = useCurrentUser();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterMuseu, setFilterMuseu] = useState('all');
  const [filterMes, setFilterMes] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [renameTarget, setRenameTarget] = useState(null);
  const [newName, setNewName] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [folders, setFolders] = useState(['Fotos', 'Vídeos', 'Documentos', 'Outros']);
  const [viewMode, setViewMode] = useState('auto'); // auto, gallery, list
  const [fullscreenFile, setFullscreenFile] = useState(null);
  const [fullscreenZoom, setFullscreenZoom] = useState(1);
  const [filterType, setFilterType] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterReport, setFilterReport] = useState('all');

  const deleteMutation = useMutation({
    mutationFn: (att) => base44.entities.Attachment.delete(att.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['gestor-attachments']);
      toast.success('Arquivo excluído.');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao excluir arquivo.'),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, newFileName }) => base44.entities.Attachment.update(id, { file_name: newFileName }),
    onSuccess: () => {
      queryClient.invalidateQueries(['gestor-attachments']);
      toast.success('Arquivo renomeado.');
      setRenameTarget(null);
      setNewName('');
    },
    onError: () => toast.error('Erro ao renomear arquivo.'),
  });

  const deleteBulkMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedFiles);
      await Promise.all(ids.map(id => base44.entities.Attachment.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['gestor-attachments']);
      toast.success(`${selectedFiles.size} arquivo(s) excluído(s).`);
      setSelectedFiles(new Set());
    },
    onError: () => toast.error('Erro ao excluir arquivos.'),
  });

  // Fetch reports (for context / linking)
  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['gestor-reports'],
    queryFn: () => isCoordenador
      ? base44.entities.Report.list('-created_date', 500)
      : base44.entities.Report.filter({ created_by: currentUser?.email }, '-created_date'),
    enabled: !!currentUser,
    staleTime: 30_000,
  });

  // Fetch all attachments
  const { data: attachments = [], isLoading: loadingAttachments } = useQuery({
    queryKey: ['gestor-attachments'],
    queryFn: () => base44.entities.Attachment.list('-created_date', 500),
    enabled: !!currentUser,
    staleTime: 30_000,
  });

  // Build a report map for quick lookup
  const reportMap = Object.fromEntries(reports.map(r => [r.id, r]));

  const isComunicacao = currentUser?.role === 'COORD_COMUNICACAO';

  // Filter attachments based on user role and filters
    const visible = attachments.filter(att => {
      const report = reportMap[att.report_id];
      // skip orphan attachments for non-coordinators
      if (!report) return isCoordenador;
      // professionals only see their own
      if (!isCoordenador && report?.created_by !== currentUser?.email) return false;
      // museu filter
      if (filterMuseu !== 'all' && report?.museu !== filterMuseu) return false;
      // mes filter
      if (filterMes !== 'all' && report?.mes_referencia !== filterMes) return false;
      // type filter
      if (filterType !== 'all') {
        const isImage = att.file_type?.startsWith('image/');
        const isVideo = att.file_type?.startsWith('video/');
        const isPDF = att.file_type?.includes('pdf');
        const isZip = att.file_type?.includes('zip') || att.file_type?.includes('rar');
        if (filterType === 'image' && !isImage) return false;
        if (filterType === 'video' && !isVideo) return false;
        if (filterType === 'pdf' && !isPDF) return false;
        if (filterType === 'archive' && !isZip) return false;
      }
      // date range filter
      if (filterStartDate || filterEndDate) {
        const attDate = new Date(att.created_date);
        if (filterStartDate && attDate < new Date(filterStartDate)) return false;
        if (filterEndDate && attDate > new Date(filterEndDate)) return false;
      }
      // report filter
      if (filterReport !== 'all' && att.report_id !== filterReport) return false;
      // search
      if (search) {
        const q = search.toLowerCase();
        if (
          !att.file_name?.toLowerCase().includes(q) &&
          !report?.author_name?.toLowerCase().includes(q) &&
          !report?.museu?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });

  const isLoading = loadingReports || loadingAttachments;

  // Separate media from documents
  const mediaFiles = visible.filter(att => 
    att.file_type?.startsWith('image/') || att.file_type?.startsWith('video/')
  );
  const documentFiles = visible.filter(att => 
    !att.file_type?.startsWith('image/') && !att.file_type?.startsWith('video/')
  );

  const shouldShowGallery = viewMode === 'auto' ? mediaFiles.length > 0 : viewMode === 'gallery';

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-5xl font-semibold text-black tracking-tight flex items-center gap-3">
            <Paperclip className="w-9 h-9" />
            Gestor de Arquivos
          </h1>
          <p className="text-gray-500 mt-1 text-lg">
            {isCoordenador
              ? `${visible.length} arquivo(s) encontrado(s) em todos os relatórios`
              : `${visible.length} arquivo(s) dos seus relatórios`}
          </p>
        </div>

        {/* Action Bar */}
        {selectedFiles.size > 0 && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
            <span className="text-lg font-medium text-blue-900">{selectedFiles.size} arquivo(s) selecionado(s)</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedFiles(new Set())}
              >
                Desmarcar
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  if (window.confirm(`Deseja excluir ${selectedFiles.size} arquivo(s)?`)) {
                    deleteBulkMutation.mutate();
                  }
                }}
                disabled={deleteBulkMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Excluir em Massa
              </Button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar arquivo, profissional ou museu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="Tipo de arquivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">— Todos —</SelectItem>
              <SelectItem value="image">Imagens</SelectItem>
              <SelectItem value="video">Vídeos</SelectItem>
              <SelectItem value="pdf">PDFs</SelectItem>
              <SelectItem value="archive">Compactados</SelectItem>
            </SelectContent>
          </Select>
          {isCoordenador && (
            <>
              <Select value={filterMuseu} onValueChange={setFilterMuseu}>
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue placeholder="Museu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">— Museu —</SelectItem>
                  {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterMes} onValueChange={setFilterMes}>
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">— Mês —</SelectItem>
                  {MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
          <Input
            type="date"
            value={filterStartDate}
            onChange={e => setFilterStartDate(e.target.value)}
            className="w-32 h-9 text-sm"
            placeholder="De"
          />
          <Input
            type="date"
            value={filterEndDate}
            onChange={e => setFilterEndDate(e.target.value)}
            className="w-32 h-9 text-sm"
            placeholder="Até"
          />
          <Select value={filterReport} onValueChange={setFilterReport}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="Filtrar por relatório" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">— Todos os relatórios —</SelectItem>
              {reports.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {r.numero_protocolo} - {r.author_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowFolderDialog(true)}
          >
            <FolderPlus className="w-4 h-4" />
            Nova Pasta
          </Button>
          {visible.length > 0 && (
            <div className="flex gap-1 ml-auto border border-gray-200 rounded-lg p-1">
              <Button
                variant={shouldShowGallery ? 'default' : 'ghost'}
                size="sm"
                className="h-8 px-2"
                onClick={() => setViewMode(shouldShowGallery ? 'auto' : 'gallery')}
              >
                <Grid3x3 className="w-4 h-4" />
              </Button>
              <Button
                variant={!shouldShowGallery ? 'default' : 'ghost'}
                size="sm"
                className="h-8 px-2"
                onClick={() => setViewMode(shouldShowGallery ? 'list' : 'auto')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Files grid */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando arquivos...</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
            <Paperclip className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum arquivo encontrado</p>
            <p className="text-xs text-gray-400 mt-1">Os arquivos são adicionados nos relatórios mensais</p>
          </div>
        ) : (
          <>
            {/* Gallery View for Media */}
            {shouldShowGallery && mediaFiles.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Imagens e Vídeos</h3>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {mediaFiles.map(att => {
                    const isImage = att.file_type?.startsWith('image/');
                    const isVideo = att.file_type?.startsWith('video/');
                    const isSelected = selectedFiles.has(att.id);
                    return (
                      <div
                        key={att.id}
                        className={`group relative aspect-square rounded-lg overflow-hidden border transition-all cursor-pointer ${
                          isSelected ? 'border-blue-400 shadow-lg' : 'border-gray-200 hover:border-gray-400'
                        }`}
                        onClick={() => {
                          if (selectedFiles.has(att.id)) {
                            const newSet = new Set(selectedFiles);
                            newSet.delete(att.id);
                            setSelectedFiles(newSet);
                          } else {
                            setSelectedFiles(new Set([...selectedFiles, att.id]));
                          }
                        }}
                      >
                        {/* Thumbnail */}
                        {isImage || isVideo ? (
                          <img
                            src={isImage ? att.file_url : att.file_url}
                            alt={att.file_name}
                            className="w-full h-full object-cover bg-gray-100"
                          />
                        ) : null}

                        {/* Video Badge */}
                        {isVideo && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/50 transition-all">
                            <FileVideo className="w-8 h-8 text-white" />
                          </div>
                        )}

                        {/* Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                          <div className="text-white text-base truncate max-w-[70%]" title={att.file_name}>
                            {att.file_name}
                          </div>
                          <Button
                            size="sm"
                            className="h-7 w-7 p-0 bg-white hover:bg-gray-100 text-black"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFullscreenFile(att);
                              setFullscreenZoom(1);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Checkbox */}
                        <div className="absolute top-2 right-2">
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-blue-500 drop-shadow-lg" />
                          ) : (
                            <Square className="w-5 h-5 text-white drop-shadow-lg" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* List View for Documents */}
            {(shouldShowGallery && documentFiles.length > 0) && (
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Documentos</h3>
              </div>
            )}

            {documentFiles.length > 0 && (
              <div className="space-y-2">
                {documentFiles.map(att => {
                  const report = reportMap[att.report_id];
                  const IconComp = fileIcon(att.file_type);
                  const isSelected = selectedFiles.has(att.id);
                  return (
                    <div
                      key={att.id}
                      className={`flex items-center gap-4 p-4 border rounded-lg transition-all cursor-pointer ${
                        isSelected ? 'bg-blue-50 border-blue-300' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        if (selectedFiles.has(att.id)) {
                          const newSet = new Set(selectedFiles);
                          newSet.delete(att.id);
                          setSelectedFiles(newSet);
                        } else {
                          setSelectedFiles(new Set([...selectedFiles, att.id]));
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <div className="flex-shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-300" />
                        )}
                      </div>

                      {/* Icon */}
                      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-gray-100">
                        <IconComp className="w-6 h-6 text-gray-600" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-lg text-black truncate">{att.file_name}</p>
                        <p className="text-base text-gray-500 mt-0.5">
                          {formatSize(att.file_size)} {report && `• ${report.author_name}`}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <a href={att.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-blue-100">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </a>
                        <a href={att.file_url} download={att.file_name}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-green-100">
                            <Download className="w-4 h-4" />
                          </Button>
                        </a>
                        {att.created_by === currentUser?.email && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-amber-100"
                              onClick={() => {
                                setRenameTarget(att);
                                setNewName(att.file_name);
                              }}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-600 hover:bg-red-100"
                              onClick={() => setDeleteTarget(att)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arquivo?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-gray-500 px-1">
            Tem certeza que deseja excluir <strong>{deleteTarget?.file_name}</strong>? Esta ação não pode ser desfeita.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={o => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear arquivo</DialogTitle>
            <DialogDescription>Digite o novo nome para o arquivo</DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Novo nome do arquivo"
            className="mt-2"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                if (newName.trim() && renameTarget) {
                  renameMutation.mutate({ id: renameTarget.id, newFileName: newName.trim() });
                }
              }}
              disabled={renameMutation.isPending || !newName.trim()}
            >
              Renomear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar nova pasta</DialogTitle>
            <DialogDescription>Adicione uma nova pasta para organizar seus arquivos</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="Nome da pasta"
            className="mt-2"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFolderDialog(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                if (newFolder.trim() && !folders.includes(newFolder.trim())) {
                  setFolders([...folders, newFolder.trim()]);
                  toast.success(`Pasta "${newFolder}" criada.`);
                  setNewFolder('');
                  setShowFolderDialog(false);
                } else if (folders.includes(newFolder.trim())) {
                  toast.error('Pasta já existe.');
                }
              }}
              disabled={!newFolder.trim()}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen View */}
      {fullscreenFile && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Header */}
          <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
            <div className="text-white">
              <p className="font-semibold text-2xl">{fullscreenFile.file_name}</p>
              <p className="text-base text-gray-400">{formatSize(fullscreenFile.file_size)}</p>
            </div>
            <div className="flex gap-2">
              {fullscreenFile.file_type?.startsWith('image/') && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white hover:bg-gray-800"
                    onClick={() => setFullscreenZoom(Math.max(0.5, fullscreenZoom - 0.2))}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-white text-lg px-2 py-1">{Math.round(fullscreenZoom * 100)}%</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white hover:bg-gray-800"
                    onClick={() => setFullscreenZoom(Math.min(3, fullscreenZoom + 0.2))}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-gray-800"
                onClick={() => setFullscreenFile(null)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex items-center justify-center overflow-auto">
            {fullscreenFile.file_type?.startsWith('image/') ? (
              <img
                src={fullscreenFile.file_url}
                alt={fullscreenFile.file_name}
                className="max-h-full max-w-full"
                style={{ transform: `scale(${fullscreenZoom})` }}
              />
            ) : (
              <video
                src={fullscreenFile.file_url}
                controls
                className="max-h-full max-w-full"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GestorArquivos() {
  return <RequireAuth><GestorArquivosInner /></RequireAuth>;
}