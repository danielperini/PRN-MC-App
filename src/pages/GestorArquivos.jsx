import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Download, Cloud, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BackupButton from '../components/backup/BackupButton';
import BackupDriveFoldersButton from '../components/backup/BackupDriveFoldersButton';
import BackupMonthlyDialog from '../components/backup/BackupMonthlyDialog';
import BackupHistoryTable from '../components/backup/BackupHistoryTable';
import FileHierarchy from '../components/gallery/FileHierarchy';
import FilePreviewModal from '../components/gallery/FilePreviewModal';
import { toast } from 'sonner';

function GestorArquivosInner() {
   const { user: currentUser } = useCurrentUser();
   const [selectedDate, setSelectedDate] = useState('');
   const [searchFileName, setSearchFileName] = useState('');
   const [searchContent, setSearchContent] = useState('');
   const [sortBy, setSortBy] = useState('date-desc');
   const [duplicateWarnings, setDuplicateWarnings] = useState([]);
   const [previewFile, setPreviewFile] = useState(null);
   const [showPreview, setShowPreview] = useState(false);
   const [showHistory, setShowHistory] = useState(false);
   const [showMonthlyBackup, setShowMonthlyBackup] = useState(false);
   const isCoordinator = currentUser?.role === 'admin';

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
    enabled: isCoordinator && !!currentUser?.email
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

  const handleDownloadBackup = async (backup) => {
   if (backup.fileUrl) {
     window.open(backup.fileUrl, '_blank');
     toast.success(`Download iniciado: ${backup.fileName}`);
   } else {
     toast.error('URL do arquivo não disponível');
   }
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
      <FilePreviewModal 
      file={previewFile} 
      isOpen={showPreview} 
      onClose={() => setShowPreview(false)} 
      />
      <div className="min-h-screen bg-white">
      <div className="w-full py-6 md:py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 md:mb-8">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-semibold text-black tracking-tight">Galeria de Arquivos</h1>
            <p className="text-gray-500 mt-1 text-xs md:text-sm">
              Todos os arquivos são mantidos permanentemente
            </p>
          </div>
          <div className="w-full md:w-auto flex gap-2 flex-wrap">
            <BackupDriveFoldersButton />
            <button
              onClick={() => setShowMonthlyBackup(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              📅 Backup Relatórios
            </button>
            <BackupButton userRole={currentUser?.role} />
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

        {/* Tabs: Arquivos e Histórico */}
        <div className="space-y-4">
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setShowHistory(false)}
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                !showHistory 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600'
              }`}
            >
              Arquivos
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                showHistory 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-600'
              }`}
            >
              Histórico de Backups
            </button>
          </div>

          {!showHistory ? (
            isLoading ? (
              <div className="text-center py-12 text-gray-400">
                Carregando arquivos...
              </div>
            ) : (
              <FileHierarchy 
                backups={backups} 
                onPreview={handlePreviewFile}
              />
            )
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Histórico de Backups</h3>
              <BackupHistoryTable />
            </div>
          )}
        </div>

        {/* Alertas de Duplicação */}
        {isCoordinator && duplicateWarnings.length > 0 && (
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

        {/* Info */}
        <div className="mt-6 md:mt-8 p-3 md:p-4 bg-blue-50 border border-blue-200 rounded-lg md:rounded-xl">
          <p className="text-xs md:text-sm text-blue-900">
            <strong>Visibilidade:</strong> Apenas relatórios aprovados são exibidos nesta galeria. Todos os arquivos são mantidos permanentemente.
          </p>
          <p className="text-xs text-blue-700 mt-2">
            Aviso: Sistema detecta automaticamente atividades duplicadas com risco superior a 80%.
          </p>
        </div>
        </div>
        </div>
        </>
        );
        }

        export default function GestorArquivos() {
        return <RequireAuth><GestorArquivosInner /></RequireAuth>;
        }