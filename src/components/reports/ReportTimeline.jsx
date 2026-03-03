import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { History, CheckCircle2, AlertCircle, FileText, ArrowRight } from 'lucide-react';

const ACTION_ICONS = {
  CREATE: FileText,
  UPDATE: ArrowRight,
  SUBMIT: FileText,
  START_REVIEW: AlertCircle,
  APPROVE: CheckCircle2,
  RETURN: AlertCircle,
  ARCHIVE: FileText,
  REOPEN: ArrowRight,
};

const ACTION_LABELS = {
  CREATE: 'Criado',
  UPDATE: 'Atualizado',
  SUBMIT: 'Enviado',
  START_REVIEW: 'Revisão Iniciada',
  APPROVE: 'Aprovado',
  RETURN: 'Devolvido',
  ARCHIVE: 'Arquivado',
  REOPEN: 'Reaberto',
};

const ACTION_COLORS = {
  CREATE: 'bg-blue-100 text-blue-800',
  UPDATE: 'bg-gray-100 text-gray-800',
  SUBMIT: 'bg-blue-100 text-blue-800',
  START_REVIEW: 'bg-yellow-100 text-yellow-800',
  APPROVE: 'bg-green-100 text-green-800',
  RETURN: 'bg-red-100 text-red-800',
  ARCHIVE: 'bg-purple-100 text-purple-800',
  REOPEN: 'bg-orange-100 text-orange-800',
};

export default function ReportTimeline({ reportId }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['report-timeline', reportId],
    queryFn: () => base44.entities.AuditLog.filter({ entity_id: reportId }, '-created_date'),
  });

  if (isLoading) {
    return <div className="text-center py-8 text-gray-400 text-sm">Carregando histórico...</div>;
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-black">Histórico de Alterações</h3>
      </div>

      {logs.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">Nenhuma alteração registrada</p>
      ) : (
        <div className="space-y-3">
          {logs.map((log, idx) => {
            const Icon = ACTION_ICONS[log.action] || FileText;
            const colorClass = ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800';
            return (
              <div key={log.id} className="flex gap-4">
                {/* Linha temporal */}
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full ${colorClass} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {idx < logs.length - 1 && <div className="w-0.5 h-8 bg-gray-200 mt-2" />}
                </div>

                {/* Conteúdo */}
                <div className="pb-4 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${colorClass} text-xs font-medium`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </Badge>
                    <span className="text-xs text-gray-500">{log.actor_name || log.actor_email}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {log.details && <span>{log.details}</span>}
                    {log.previous_status && log.new_status && (
                      <span>{log.previous_status} → {log.new_status}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(log.created_date).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}