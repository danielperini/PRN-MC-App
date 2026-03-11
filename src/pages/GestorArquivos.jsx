import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Cloud, Calendar, AlertTriangle, HardDrive, ChevronDown, Loader2, FileText, Info, Download, File, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import BackupMonthlyDialog from '../components/backup/BackupMonthlyDialog';
import BackupHistoryTable from '../components/backup/BackupHistoryTable';
import FileHierarchy from '../components/gallery/FileHierarchy';
import FilePreviewViewer from '../components/gallery/FilePreviewViewer';
import GoogleDriveImporter from '../components/drive/GoogleDriveImporter';
import { toast } from 'sonner';

function GestorArquivosInner() {
    const { user: currentUser } = useCurrentUser();
    const queryClient = useQueryClient();
    const [selectedDate, setSelectedDate] = useState('');
    const [searchFileName, setSearchFileName] = useState('');
    const [searchContent, setSearchContent] = useState('');
    const [sortBy, setSortBy] = useState('date-desc');
    const [duplicateWarnings, setDuplicateWarnings] = useState([]);
    const [previewFile, setPreviewFile] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showHistory, setShowHistory] = useState('contratos');
    const [showMonthlyBackup, setShowMonthlyBackup] = useState(false);
    const [backupDriveLoading, setBackupDriveLoading] = useState(false);
    const [backupFullLoading, setBackupFullLoading] = useState(false);
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [uploadFiles, setUploadFiles] = useState([]);
    const [uploadNotes, setUploadNotes] = useState('');
    const [uploading, setUploading] = useState(false);
    const [showDriveImporter, setShowDriveImporter] = useState(false);
    const isCoordinator = currentUser?.role === 'admin' || currentUser?.role === 'COORDENADOR';
    const isGeneralCoordinator = isCoordinator && (
      currentUser?.email === 'daniel@periniprojetos.com.br' || 
      currentUser?.email === 'danielperini.mc@vidadutodasartes.org.br'
    );
    const isOtherCoordinator = isCoordinator && !isGeneralCoordinator;

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['google-drive-backups', selectedDate, searchFileName, searchContent, currentUser?.email],
    queryFn: async () => {
      try {
        // Buscar apenas anexos de relatórios aprovados
        const approvedReports = await base44.entities.Report.filter({ status: 'APPROVED' });
        const approvedReportIds = new Set(approvedReports.map(r => r.id));
        
        const allAttachments = await base44.entities.Attachment.list();
        
        // Converter anexos em backups para exibição (sem limite de dias)
        const backupsData = allAttachments
          .filter(att => approvedReportIds.has(att.report_id))
          .map(att => {
            const report = approvedReports.find(r => r.id === att.report_id);
            const reportNumber = report?.numero_protocolo || '';
            
            const authorName = report?.author_name || 'Desconhecido';
            const mes = report?.mes_referencia || '';
            const ano = report?.ano || '';
            const reportLabel = `${authorName} — ${mes}${ano ? `/${ano}` : ''}`;

            return {
              id: att.id,
              date: att.created_date?.split('T')[0] || new Date().toISOString().split('T')[0],
              timestamp: att.created_date || new Date().toISOString(),
              fileName: att.file_name,
              fileType: att.file_type,
              size: att.file_size ? `${(att.file_size / 1024 / 1024).toFixed(2)} MB` : 'N/A',
              fileUrl: att.file_url,
              summary: att.description || 'Arquivo anexado a relatório',
              reportId: att.report_id,
              reportLabel,
              displayName: reportNumber ? `${reportNumber}` : att.file_name
            };
          });

        return backupsData.filter(b => {
          const dateMatch = !selectedDate || b.date === selectedDate;
          const fileNameMatch = !searchFileName || 
            b.fileName.toLowerCase().includes(searchFileName.toLowerCase());
          const contentMatch = !searchContent || 
            b.summary.toLowerCase().includes(searchContent) ||
            b.fileType.toLowerCase().includes(searchContent);
          
          return dateMatch && fileNameMatch && contentMatch;
        }).sort((a, b) => {
          if (sortBy === 'date-desc') return new Date(b.timestamp) - new Date(a.timestamp);
          if (sortBy === 'date-asc') return new Date(a.timestamp) - new Date(b.timestamp);
          if (sortBy === 'name-asc') return a.fileName.localeCompare(b.fileName);
          if (sortBy === 'name-desc') return b.fileName.localeCompare(a.fileName);
          return 0;
        });
      } catch (error) {
        toast.error('Erro ao carregar arquivos');
        return [];
      }
    },
    enabled: !!currentUser?.email
  });

  // Verificar duplicatas em atividades aprovadas
  const { data: duplicates = [] } = useQuery({
    queryKey: ['duplicate-activities', currentUser?.email],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('detectDuplicateActivities', {});
        return res.data.duplicates || [];
      } catch (error) {
        console.error('Erro ao detectar duplicatas:', error);
        return [];
      }
    },
    enabled: Boolean(isCoordinator && !!currentUser?.email)
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list(),
    enabled: !!currentUser?.email
  });

  const { data: invoiceSubmissions = [] } = useQuery({
    queryKey: ['invoice-submissions'],
    queryFn: () => base44.entities.InvoiceSubmission.list(),
    enabled: !!currentUser?.email
  });

  React.useEffect(() => {
    if (duplicates.length > 0 && isCoordinator) {
      setDuplicateWarnings(duplicates);
    }
  }, [duplicates, isCoordinator]);

  const handlePreviewFile = (backup) => {
    setPreviewFile(backup);
    setShowPreview(true);
  };

  const canManageFile = (backup) => {
    // Coordenador geral pode gerenciar tudo
    if (isGeneralCoordinator) return true;
    // Outros coordenadores podem gerenciar todos os arquivos
    if (isOtherCoordinator) return true;
    // Usuários regulares só podem gerenciar seus próprios arquivos
    return backup.created_by === currentUser?.email;
  };

  const handleBackupFull = async () => {
    setBackupFullLoading(true);
    try {
      await base44.functions.invoke('backupToGoogleDrive');
      toast.success('Backup completo realizado com sucesso!');
    } catch (error) {
      toast.error('Erro no backup completo: ' + (error.message || 'desconhecido'));
    } finally {
      setBackupFullLoading(false);
    }
  };

  const handleBackupDrive = async () => {
    setBackupDriveLoading(true);
    try {
      const response = await base44.functions.invoke('backupDriveFolders', {});
      const count = response.data?.totalFilesCopied || 0;
      toast.success(count > 0 ? `Backup Drive: ${count} arquivo(s) copiado(s)` : 'Backup Drive: nenhum arquivo novo.');
    } catch (error) {
      toast.error('Erro no backup Drive: ' + (error.message || 'desconhecido'));
    } finally {
      setBackupDriveLoading(false);
    }
  };

  const handleDownloadBackup = async (backup) => {
   if (backup.fileUrl) {
     window.open(backup.fileUrl, '_blank');
     toast.success(`Download iniciado: ${backup.fileName}`);
   } else {
     toast.error('URL do arquivo não disponível');
   }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

    let totalSize = uploadFiles.reduce((sum, f) => sum + f.size, 0);
    const validFiles = [];

    files.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} excede o limite de 100MB`);
        return;
      }
      totalSize += file.size;
      if (totalSize > MAX_FILE_SIZE) {
        toast.error('Total de arquivos excede 100MB');
        return;
      }
      validFiles.push(file);
    });

    setUploadFiles([...uploadFiles, ...validFiles]);
  };

  const handleUploadFiles = async () => {
    if (uploadFiles.length === 0) {
      toast.error('Selecione pelo menos um arquivo');
      return;
    }

    setUploading(true);
    try {
      for (const file of uploadFiles) {
        // Fazer upload do arquivo
        const uploadedFile = await base44.integrations.Core.UploadFile({
          file: file
        });

        // Se for PDF, adicionar na base de conhecimento
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          await base44.asServiceRole.entities.KnowledgeDocument.create({
            titulo: file.name.replace('.pdf', ''),
            categoria: 'Documento de Referência',
            versao: new Date().toLocaleDateString('pt-BR'),
            descricao: uploadNotes || `Documento adicionado em ${new Date().toLocaleDateString('pt-BR')}`,
            file_url: uploadedFile.file_url,
            conteudo_extraido: `Arquivo: ${file.name}`,
            ativo: true,
            created_by_email: currentUser.email,
          });
          toast.success(`PDF "${file.name}" adicionado à base de conhecimento`);
        }
      }

      toast.success(`${uploadFiles.length} arquivo(s) enviado(s) com sucesso`);
      setUploadFiles([]);
      setUploadNotes('');
      setShowUploadDialog(false);
    } catch (error) {
      toast.error('Erro ao fazer upload: ' + (error.message || 'desconhecido'));
    } finally {
      setUploading(false);
    }
  };

  const handleImportComplete = () => {
    // Recarregar lista de arquivos
    queryClient.invalidateQueries({ queryKey: ['google-drive-backups'] });
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <Cloud className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Carregando...</h2>
        </div>
      </div>
      );
      }

      return (
      <>
      {/* Dialog Upload */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Arquivos à Biblioteca</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Info Box */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex gap-2">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700 space-y-1">
                  <p><strong>Limite:</strong> 100MB por lote</p>
                  <p><strong>PDFs:</strong> Serão automaticamente adicionados à base de conhecimento</p>
                  <p><strong>Suporte:</strong> PDF, Word, Excel, imagens</p>
                </div>
              </div>
            </div>

            {/* Upload Area */}
            <div>
              <Label className="text-sm font-medium">Selecionar Arquivos</Label>
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                disabled={uploading}
                className="mt-2 w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 disabled:opacity-50"
              />
            </div>

            {/* Arquivos Selecionados */}
            {uploadFiles.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Arquivos Selecionados ({uploadFiles.length})</Label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {uploadFiles.map((file, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded">
                      <span className="text-gray-700">{file.name}</span>
                      <span className="text-gray-500">{(file.size / 1024 / 1024).toFixed(2)}MB</span>
                      <button
                        onClick={() => setUploadFiles(uploadFiles.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notas */}
            <div>
              <Label className="text-sm font-medium">Notas / Descrição (opcional)</Label>
              <Textarea
                placeholder="Adicione informações sobre estes arquivos (Ex: Relatório de janeiro, documentação técnica, etc)"
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                className="mt-2 text-sm resize-none h-20"
                disabled={uploading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)} disabled={uploading}>
              Cancelar
            </Button>
            <Button 
              onClick={handleUploadFiles} 
              disabled={uploading || uploadFiles.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enviar {uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BackupMonthlyDialog 
        isOpen={showMonthlyBackup} 
        onClose={() => setShowMonthlyBackup(false)} 
      />
      <FilePreviewViewer 
      file={previewFile} 
      isOpen={showPreview} 
      onClose={() => setShowPreview(false)} 
      />
      <GoogleDriveImporter
        isOpen={showDriveImporter}
        onClose={() => setShowDriveImporter(false)}
        onImportComplete={handleImportComplete}
      />
      <div className="min-h-screen bg-white">
      <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 md:mb-8">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-semibold text-black tracking-tight">Galeria de Arquivos</h1>

          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button 
              onClick={() => setShowUploadDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 flex-1 md:flex-none"
            >
              <FileText className="w-4 h-4" />
              Adicionar Arquivo
            </Button>
            <Button 
              onClick={() => setShowDriveImporter(true)}
              className="bg-green-600 hover:bg-green-700 text-white gap-2 flex-1 md:flex-none"
            >
              <Download className="w-4 h-4" />
              Google Drive
            </Button>
            {isGeneralCoordinator && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-black hover:bg-gray-800 text-white gap-2 flex-1 md:flex-none">
                    <HardDrive className="w-4 h-4" />
                    Backup
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={handleBackupDrive} disabled={backupDriveLoading}>
                    {backupDriveLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2 text-blue-500" />}
                    Backup Drive (Pastas)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowMonthlyBackup(true)}>
                    <Calendar className="w-4 h-4 mr-2 text-green-600" />
                    Backup Relatórios do Mês
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleBackupFull} disabled={backupFullLoading}>
                    {backupFullLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <HardDrive className="w-4 h-4 mr-2 text-gray-600" />}
                    Backup Completo (Drive)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Filtros Avançados */}
        <div className="bg-white border border-gray-200 rounded-lg md:rounded-xl p-3 md:p-4 mb-6 md:mb-8 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filtro por Data */}
            <div>
              <Label className="text-xs font-medium text-gray-600">Data</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            {/* Busca por Nome */}
            <div>
              <Label className="text-xs font-medium text-gray-600">Nome do Arquivo</Label>
              <Input
                placeholder="Buscar nome..."
                value={searchFileName}
                onChange={e => setSearchFileName(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            {/* Busca por Conteúdo */}
            <div>
              <Label className="text-xs font-medium text-gray-600">Conteúdo / Resumo</Label>
              <Input
                placeholder="Buscar conteúdo..."
                value={searchContent}
                onChange={e => setSearchContent(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            {/* Ordenação */}
            <div>
              <Label className="text-xs font-medium text-gray-600">Ordenar</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="mt-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Mais recentes</SelectItem>
                  <SelectItem value="date-asc">Mais antigos</SelectItem>
                  <SelectItem value="name-asc">Nome (A-Z)</SelectItem>
                  <SelectItem value="name-desc">Nome (Z-A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Botão Limpar Filtros */}
          {(selectedDate || searchFileName || searchContent) && (
            <Button
              variant="outline"
              onClick={() => {
                setSelectedDate('');
                setSearchFileName('');
                setSearchContent('');
              }}
              className="border-gray-300 w-full sm:w-auto text-sm"
            >
              Limpar Filtros
            </Button>
          )}
        </div>

        {/* Tabs: Contratos, Arquivos e Histórico */}
        <div className="space-y-4">
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setShowHistory('contratos')}
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                showHistory === 'contratos'
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600'
              }`}
            >
              Contratos
            </button>
            <button
              onClick={() => setShowHistory('invoices')}
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                showHistory === 'invoices'
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600'
              }`}
            >
              Notas Fiscais
            </button>
            <button
              onClick={() => setShowHistory('arquivos')}
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                showHistory === 'arquivos'
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600'
              }`}
            >
              Arquivos
            </button>
            <button
              onClick={() => setShowHistory('backups')}
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                showHistory === 'backups'
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600'
              }`}
            >
              Histórico de Backups
            </button>
          </div>

          {showHistory === 'contratos' ? (
             <div className="space-y-8">
               {/* Seção de Contratos Principais */}
               <div className="bg-white border border-gray-200 rounded-lg p-6">
                 <h3 className="text-lg font-semibold mb-4 text-black flex items-center gap-2">
                   <File className="w-5 h-5" /> Contrato Principal
                 </h3>
                 {teamMembers.some(m => m.contrato_url) ? (
                   <div className="space-y-3">
                     {teamMembers
                       .filter(m => m.contrato_url)
                       .map(member => (
                         <div key={member.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                           <div>
                             <p className="font-medium text-black">{member.user_name}</p>
                             <p className="text-sm text-gray-500">{member.funcao} • {member.valor_total ? `R$ ${member.valor_total.toLocaleString('pt-BR')}` : 'Valor não especificado'}</p>
                           </div>
                           <a 
                             href={member.contrato_url} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                           >
                             <Download className="w-4 h-4" />
                             Download
                           </a>
                         </div>
                       ))}
                   </div>
                 ) : (
                   <div className="text-center py-8">
                     <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                     <p className="text-gray-500">Nenhum contrato anexado ao cadastro</p>
                   </div>
                 )}
               </div>

               {/* Seção de Contratos por Período */}
               <div className="bg-white border border-gray-200 rounded-lg p-6">
                 <h3 className="text-lg font-semibold mb-4 text-black">Contratos por Período de Envio</h3>
                 {teamMembers.some(m => m.contrato_url && m.data_criacao) ? (
                   <div className="space-y-4">
                     {Array.from(new Map(
                       teamMembers
                         .filter(m => m.contrato_url && m.data_criacao)
                         .map(m => [m.data_criacao?.substring(0, 7), m])
                     ).entries())
                       .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                       .map(([period, members]) => {
                         const monthYear = new Date(period + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                         const periodMembers = teamMembers.filter(m => m.contrato_url && m.data_criacao?.substring(0, 7) === period);
                         return (
                           <div key={period} className="border border-gray-200 rounded-lg p-4">
                             <h4 className="font-semibold text-black mb-3">{monthYear}</h4>
                             <div className="space-y-2">
                               {periodMembers.map(member => (
                                 <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                   <span className="text-sm text-gray-700">{member.user_name}</span>
                                   <a 
                                     href={member.contrato_url} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                                   >
                                     <ExternalLink className="w-3 h-3" />
                                   </a>
                                 </div>
                               ))}
                             </div>
                           </div>
                         );
                       })}
                   </div>
                 ) : (
                   <p className="text-center text-gray-500 py-8">Nenhum contrato com período de envio</p>
                 )}
               </div>
             </div>
           ) : showHistory === 'invoices' ? (
             <div className="space-y-8">
               {/* Seção de Notas Fiscais Principais */}
               <div className="bg-white border border-gray-200 rounded-lg p-6">
                 <h3 className="text-lg font-semibold mb-4 text-black flex items-center gap-2">
                   <File className="w-5 h-5" /> Nota Fiscal Principal
                 </h3>
                 {invoiceSubmissions.some(inv => inv.notas_fiscais?.length > 0) ? (
                   <div className="space-y-3">
                     {invoiceSubmissions
                       .filter(inv => inv.notas_fiscais?.length > 0)
                       .flatMap(inv => inv.notas_fiscais.map(nf => ({ ...nf, submissionId: inv.id, userEmail: inv.user_email, userName: inv.user_name })))
                       .map((nf, idx) => (
                         <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                           <div>
                             <p className="font-medium text-black">{nf.userName}</p>
                             <p className="text-sm text-gray-500">NF {nf.numero} • {nf.fornecedor} • R$ {nf.valor?.toLocaleString('pt-BR')}</p>
                           </div>
                           {nf.file_url && (
                             <a 
                               href={nf.file_url} 
                               target="_blank" 
                               rel="noopener noreferrer"
                               className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                             >
                               <Download className="w-4 h-4" />
                               Download
                             </a>
                           )}
                         </div>
                       ))}
                   </div>
                 ) : (
                   <div className="text-center py-8">
                     <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                     <p className="text-gray-500">Nenhuma nota fiscal anexada</p>
                   </div>
                 )}
               </div>

               {/* Seção de Notas Fiscais por Período */}
               <div className="bg-white border border-gray-200 rounded-lg p-6">
                 <h3 className="text-lg font-semibold mb-4 text-black">Notas Fiscais por Período de Submissão</h3>
                 {invoiceSubmissions.some(inv => inv.notas_fiscais?.length > 0) ? (
                   <div className="space-y-4">
                     {Array.from(new Map(
                       invoiceSubmissions
                         .filter(inv => inv.notas_fiscais?.length > 0)
                         .map(inv => [inv.data_submissao?.substring(0, 7), inv])
                     ).entries())
                       .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                       .map(([period]) => {
                         const monthYear = new Date(period + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                         const periodSubmissions = invoiceSubmissions.filter(inv => inv.notas_fiscais?.length > 0 && inv.data_submissao?.substring(0, 7) === period);
                         return (
                           <div key={period} className="border border-gray-200 rounded-lg p-4">
                             <h4 className="font-semibold text-black mb-3">{monthYear}</h4>
                             <div className="space-y-2">
                               {periodSubmissions
                                 .flatMap(inv => inv.notas_fiscais.map(nf => ({ ...nf, userName: inv.user_name })))
                                 .map((nf, idx) => (
                                   <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                     <div>
                                       <p className="text-sm font-medium text-gray-800">{nf.userName}</p>
                                       <p className="text-xs text-gray-600">NF {nf.numero} • {nf.fornecedor}</p>
                                     </div>
                                     {nf.file_url && (
                                       <a 
                                         href={nf.file_url} 
                                         target="_blank" 
                                         rel="noopener noreferrer"
                                         className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                                       >
                                         <ExternalLink className="w-3 h-3" />
                                       </a>
                                     )}
                                   </div>
                                 ))}
                             </div>
                           </div>
                         );
                       })}
                   </div>
                 ) : (
                   <p className="text-center text-gray-500 py-8">Nenhuma nota fiscal com período de submissão</p>
                 )}
               </div>
             </div>
           ) : showHistory === 'arquivos' ? (
             <div>
               <h3 className="text-lg font-semibold mb-4 text-black">Arquivos</h3>
               {isLoading ? (
                 <div className="text-center py-12 text-gray-400">
                   Carregando arquivos...
                 </div>
               ) : (
                 <FileHierarchy 
                   backups={backups} 
                   onPreview={handlePreviewFile}
                   canManageFile={canManageFile}
                   isGeneralCoordinator={isGeneralCoordinator}
                 />
               )}
             </div>
           ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Histórico de Backups</h3>
              <BackupHistoryTable />
            </div>
          )}
        </div>

        {/* Status de Permissões */}
        <div className="mt-6 md:mt-8 p-3 md:p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs md:text-sm text-blue-800">
            {isGeneralCoordinator ? (
              <span><strong>👨‍💼 Coordenador Geral:</strong> Você tem acesso total à plataforma e pode conceder permissões</span>
            ) : isOtherCoordinator ? (
              <span><strong>🔐 Coordenador:</strong> Você pode gerenciar arquivos e recursos (exceto gerenciamento de usuários)</span>
            ) : (
              <span><strong>👤 Usuário Regular:</strong> Você pode gerenciar apenas seus próprios arquivos</span>
            )}
          </p>
        </div>

        {/* Alertas de Duplicação */}
        {isGeneralCoordinator && duplicateWarnings.length > 0 && (
         <div className="mt-6 md:mt-8 space-y-3">
           {duplicateWarnings.map((dup, idx) => (
             <div key={idx} className="p-3 md:p-4 bg-amber-50 border border-amber-200 rounded-lg md:rounded-xl">
               <div className="flex items-start gap-3">
                 <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                 <div className="flex-1">
                   <p className="text-xs md:text-sm font-semibold text-amber-900">
                     Risco de duplicação: {dup.risk_score}%
                   </p>
                   <p className="text-xs text-amber-800 mt-1">
                     <strong>"{dup.activity1_titulo}"</strong> e <strong>"{dup.activity2_titulo}"</strong> podem ser a mesma atividade.
                   </p>
                   {dup.public_match && (
                     <p className="text-xs text-amber-700 mt-1">⚠️ Públicos similares detectados</p>
                   )}
                   {dup.date_proximity && (
                     <p className="text-xs text-amber-700">⚠️ Datas muito próximas</p>
                   )}
                 </div>
               </div>
             </div>
           ))}
         </div>
        )}


        </div>
        </div>
        </>
        );
        }

        export default function GestorArquivos() {
        return <RequireAuth requireRole="COORDENADOR"><GestorArquivosInner /></RequireAuth>;
        }