import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { FileJson, Download, Cloud, Calendar, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BackupButton from '../components/backup/BackupButton';
import { toast } from 'sonner';

function GestorArquivosInner() {
  const { user: currentUser } = useCurrentUser();
  const [selectedDate, setSelectedDate] = useState('');
  const isCoordinator = currentUser?.role === 'admin';

  const { data: backups = [], isLoading, refetch } = useQuery({
    queryKey: ['google-drive-backups', selectedDate],
    queryFn: async () => {
      if (!isCoordinator) return [];
      try {
        // Simular listagem de backups do Google Drive
        // Em produção, seria uma função que lista backups reais
        const allBackups = [
          {
            id: '1',
            date: '2026-03-04',
            timestamp: '2026-03-04T14:30:00Z',
            reportsCount: 45,
            activitiesCount: 320,
            attachmentsCount: 25,
            size: '2.4 MB'
          },
          {
            id: '2',
            date: '2026-03-03',
            timestamp: '2026-03-03T14:30:00Z',
            reportsCount: 45,
            activitiesCount: 318,
            attachmentsCount: 25,
            size: '2.3 MB'
          }
        ];

        return selectedDate
          ? allBackups.filter(b => b.date === selectedDate)
          : allBackups;
      } catch (error) {
        toast.error('Erro ao carregar backups');
        return [];
      }
    },
    enabled: isCoordinator
  });

  const handleDownloadBackup = async (backup) => {
    toast.success(`Download iniciado: ${backup.date}`);
    // Em produção, implementar download real
  };

  if (!isCoordinator) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <Cloud className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Acesso Restrito</h2>
          <p className="text-gray-500 mt-2">Apenas coordenadores podem acessar o gerenciador de arquivos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">Gerenciador de Arquivos</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Backups automáticos salvos no Google Drive
            </p>
          </div>
          <BackupButton userRole={currentUser?.role} />
        </div>

        {/* Filtro */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-8">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs font-medium text-gray-600">Filtrar por Data</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="mt-1"
              />
            </div>
            {selectedDate && (
              <Button
                variant="outline"
                onClick={() => setSelectedDate('')}
                className="border-gray-300"
              >
                Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Lista de Backups */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">
              Carregando backups...
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
              <Cloud className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum backup encontrado</p>
              <p className="text-sm text-gray-400 mt-1">Clique no botão "Fazer Backup" para criar um novo</p>
            </div>
          ) : (
            backups.map(backup => (
              <div key={backup.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <FileJson className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-black">
                        Backup - {new Date(backup.timestamp).toLocaleDateString('pt-BR')}
                      </h3>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(backup.timestamp).toLocaleString('pt-BR')}
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-4">
                        <div className="p-2 bg-gray-50 rounded">
                          <p className="text-xs text-gray-600">Relatórios</p>
                          <p className="font-semibold text-black text-sm">{backup.reportsCount}</p>
                        </div>
                        <div className="p-2 bg-gray-50 rounded">
                          <p className="text-xs text-gray-600">Atividades</p>
                          <p className="font-semibold text-black text-sm">{backup.activitiesCount}</p>
                        </div>
                        <div className="p-2 bg-gray-50 rounded">
                          <p className="text-xs text-gray-600">Tamanho</p>
                          <p className="font-semibold text-black text-sm">{backup.size}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleDownloadBackup(backup)}
                    className="gap-2 bg-black hover:bg-gray-800 text-white whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Info */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-sm text-blue-900">
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