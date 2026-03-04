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
  Grid3x3, List, X, ZoomIn, ZoomOut, ChevronDown, Calendar, FileType, Filter,
  Folder, FolderOpen, ChevronRight
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
  const [viewMode, setViewMode] = useState('auto');
  const [fullscreenFile, setFullscreenFile] = useState(null);
  const [fullscreenZoom, setFullscreenZoom] = useState(1);
  const [filterType, setFilterType] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterReport, setFilterReport] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [openFolders, setOpenFolders] = useState(new Set()); // track expanded activity folders

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

  // Build activity map from all reports (activityId -> activityName)
  const activityMap = {};
  reports.forEach(report => {
    if (Array.isArray(report.atividades)) {
      report.atividades.forEach(act => {
        if (act && act.id) {
          activityMap[act.id] = act.titulo || act.nome || 'Atividade';
        }
      });
    }
  });

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

        {/* Search Bar */}
        <div className="mb-6">
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar arquivo, profissional, relatório ou museu..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={showAdvancedFilters ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <Filter className="w-4 h-4" />
              Filtros Avançados
            </Button>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4 mb-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <FileType className="w-4 h-4 inline mr-1" />
                    Tipo de Arquivo
                  </label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="image">Imagens</SelectItem>
                      <SelectItem value="video">Vídeos</SelectItem>
                      <SelectItem value="pdf">PDFs</SelectItem>
                      <SelectItem value="archive">Compactados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Data Inicial
                  </label>
                  <Input
                    type="date"
                    value={filterStartDate}
                    onChange={e => setFilterStartDate(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Final
                  </label>
                  <Input
                    type="date"
                    value={filterEndDate}
                    onChange={e => setFilterEndDate(e.target.value)}
                    className="text-sm"
                  />
                </div>

                {/* Report Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Relatório
                  </label>
                  <Select value={filterReport} onValueChange={setFilterReport}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {reports.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.numero_protocolo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Museum Filter (Coordinators only) */}
                {isCoordenador && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Museu
                    </label>
                    <Select value={filterMuseu} onValueChange={setFilterMuseu}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Month Filter (Coordinators only) */}
                {isCoordenador && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mês
                    </label>
                    <Select value={filterMes} onValueChange={setFilterMes}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Clear Filters */}
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFilterType('all');
                    setFilterMuseu('all');
                    setFilterMes('all');
                    setFilterReport('all');
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }}
                >
                  Limpar Filtros
                </Button>
              </div>
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
          <ActivityFolderView
            attachments={visible}
            reportMap={reportMap}
            activityMap={activityMap}
            currentUser={currentUser}
            openFolders={openFolders}
            setOpenFolders={setOpenFolders}
            setDeleteTarget={setDeleteTarget}
            setRenameTarget={setRenameTarget}
            setNewName={setNewName}
            setFullscreenFile={setFullscreenFile}
            setFullscreenZoom={setFullscreenZoom}
          />
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