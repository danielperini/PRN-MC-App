import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function BackupHistoryTable() {
  const [showMore, setShowMore] = useState(false);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['backup-logs'],
    queryFn: async () => {
      try {
        const allLogs = await base44.entities.BackupLog.list('-created_date', 100);
        return allLogs;
      } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        return [];
      }
    }
  });

  const displayedLogs = showMore ? logs : logs.slice(0, 5);

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Carregando histórico...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Nenhum backup registrado ainda
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Data/Hora</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Tipo</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Status</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Arquivos</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Tempo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayedLogs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-xs text-gray-600">
                  {format(new Date(log.created_date), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </td>
                <td className="px-4 py-2 text-xs font-medium">
                  {log.backup_type === 'drive_folders' ? 'Drive' : 'Relatórios'}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    {log.status === 'success' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-xs text-green-700">Sucesso</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <span className="text-xs text-red-700">Erro</span>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">
                  {log.files_copied}/{log.total_files}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">
                  {log.execution_time_ms ? `${(log.execution_time_ms / 1000).toFixed(1)}s` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length > 5 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMore(!showMore)}
          className="w-full"
        >
          {showMore ? 'Mostrar menos' : `Mostrar mais (${logs.length - 5} registros)`}
        </Button>
      )}
    </div>
  );
}