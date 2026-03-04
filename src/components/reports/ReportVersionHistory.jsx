import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Clock, User, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function ReportVersionHistory({ reportId }) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['report-versions', reportId],
    queryFn: () =>
      base44.asServiceRole.entities.ReportVersion.filter(
        { report_id: reportId },
        '-version_number'
      ),
    enabled: !!reportId,
  });

  const handleRestoreVersion = async (version) => {
    const confirm = window.confirm(
      `Restaurar versão ${version.version_number} (${new Date(version.created_date).toLocaleString('pt-BR')})?`
    );
    if (!confirm) return;

    try {
      const { id, created_date, updated_date, created_by, version_number, ...payload } =
        version.data_snapshot;
      await base44.asServiceRole.entities.Report.update(reportId, payload);

      // Criar nova versão indicando que foi um restore
      await base44.asServiceRole.entities.ReportVersion.create({
        report_id: reportId,
        version_number: (versions[0]?.version_number || 0) + 1,
        data_snapshot: payload,
        changed_by_email: (await base44.auth.me()).email,
        changed_by_name: (await base44.auth.me()).full_name,
        change_description: `Restaurado de versão ${version.version_number}`,
        last_update_timestamp: new Date().toISOString(),
      });

      toast.success('Versão restaurada com sucesso!');
    } catch (err) {
      toast.error('Erro ao restaurar versão: ' + err.message);
    }
  };

  if (isLoading) return <p className="text-sm text-gray-400">Carregando histórico...</p>;
  if (!versions.length) return <p className="text-sm text-gray-400">Nenhuma versão disponível</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        Histórico de Versões
      </p>
      {versions.map((version) => (
        <div key={version.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3 h-3 text-gray-400" />
                <p className="text-sm font-medium text-black">Versão {version.version_number}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                <User className="w-3 h-3" />
                <span>{version.changed_by_name || version.changed_by_email}</span>
              </div>
              <p className="text-xs text-gray-400">
                {new Date(version.created_date).toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-gray-600 mt-1 italic">{version.change_description}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs whitespace-nowrap"
              onClick={() => handleRestoreVersion(version)}
            >
              Restaurar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}