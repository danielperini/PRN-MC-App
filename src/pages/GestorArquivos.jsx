import React, { useState } from 'react';
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
import FileHierarchy from '../components/gallery/FileHierarchy';
import { toast } from 'sonner';

function GestorArquivosInner() {
  const { user: currentUser } = useCurrentUser();
  const [selectedDate, setSelectedDate] = useState('');
  const [searchFileName, setSearchFileName] = useState('');
  const [searchContent, setSearchContent] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [duplicateWarnings, setDuplicateWarnings] = useState([]);
  const isCoordinator = currentUser?.role === 'admin';

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['google-drive-backups', selectedDate, searchFileName, searchContent, currentUser?.email],
    queryFn: async () => {
      try {
        // Buscar apenas anexos de relatórios aprovados
        const approvedReports = await base44.entities.Report.filter({ status: 'APPROVED' });
        const approvedReportIds = new Set(approvedReports.map(r => r.id));
        
        const allAttachments = await base44.entities.Attachment.list();
        
        // Filtro padrão: últimos 90 dias
        const today = new Date();
        const ninetyDaysAgo = new Date(today.setDate(today.getDate() - 90));
        
        // Converter anexos em backups para exibição
        const backupsData = allAttachments
          .filter(att => {
            const attDate = new Date(att.created_date);
            return attDate >= ninetyDaysAgo && approvedReportIds.has(att.report_id);
          })
          .map(att => ({
            id: att.id,
            date: att.created_date?.split('T')[0] || new Date().toISOString().split('T')[0],
            timestamp: att.created_date || new Date().toISOString(),
            fileName: att.file_name,
            fileType: att.file_type,
            size: att.file_size ? `${(att.file_size / 1024 / 1024).toFixed(2)} MB` : 'N/A',
            fileUrl: att.file_url,
            summary: att.description || 'Arquivo anexado a relatório',
            reportId: att.report_id
          }));

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
    <div className="min-h-screen bg-white">
      <div className="w-full py-6 md:py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 md:mb-8">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-semibold text-black tracking-tight">Galeria de Arquivos</h1>
            <p className="text-gray-500 mt-1 text-xs md:text-sm">
              Todos os arquivos dos últimos 90 dias
            </p>
          </div>
          <div className="w-full md:w-auto">
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

        {/* Lista Hierárquica de Arquivos */}
         {isLoading ? (
           <div className="text-center py-12 text-gray-400">
             Carregando arquivos...
           </div>
         ) : (
           <FileHierarchy backups={backups} />
         )}

        {/* Info */}
        <div className="mt-6 md:mt-8 p-3 md:p-4 bg-blue-50 border border-blue-200 rounded-lg md:rounded-xl">
          <p className="text-xs md:text-sm text-blue-900">
            <strong>Localização dos Backups:</strong> Google Drive → Relatórios Backup → [Data do Backup]
          </p>
          <p className="text-xs text-blue-700 mt-2">
            Os backups incluem todos os relatórios, atividades e anexos da plataforma salvos em arquivos JSON estruturados.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GestorArquivos() {
  return <RequireAuth><GestorArquivosInner /></RequireAuth>;
}