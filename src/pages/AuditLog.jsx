import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  History, 
  FileText,
  User,
  Paperclip
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ENTITY_ICONS = {
  USER: User,
  REPORT: FileText,
  ATTACHMENT: Paperclip,
};

const ACTION_COLORS = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  SUBMIT: 'bg-purple-100 text-purple-700',
  APPROVE: 'bg-emerald-100 text-emerald-700',
  RETURN: 'bg-orange-100 text-orange-700',
  ARCHIVE: 'bg-gray-100 text-gray-700',
};

function AuditLogInner() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => base44.entities.AuditLog.list('-created_date', 100),
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold text-black tracking-tight">
            Log de Auditoria
          </h1>
          <p className="text-gray-500 mt-1">
            Histórico de todas as ações do sistema
          </p>
        </div>

        {/* Logs List */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-20 text-gray-400">
              Carregando logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum registro encontrado</p>
            </div>
          ) : (
            logs.map(log => {
              const Icon = ENTITY_ICONS[log.entity_type] || History;
              const actionColor = ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700';
              
              return (
                <div 
                  key={log.id} 
                  className="p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${actionColor} font-normal`}>
                          {log.action}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {log.entity_type} #{log.entity_id}
                        </span>
                      </div>
                      {log.details && (
                        <p className="text-sm text-gray-600 mt-1">
                          {log.details}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        <span>{log.actor_name || log.actor_email}</span>
                        <span>•</span>
                        <span>
                          {format(new Date(log.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuditLog() {
  return <RequireAuth requireRole="ADMIN"><AuditLogInner /></RequireAuth>;
}