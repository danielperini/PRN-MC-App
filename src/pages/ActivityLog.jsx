import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Check, AlertCircle, FileText, Users, Archive, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toastMessages } from '@/lib/toastMessages';

const notificationTypeIcons = {
  REPORT_SUBMITTED: FileText,
  REPORT_APPROVED: Check,
  REPORT_RETURNED: AlertCircle,
  REPORT_NEEDS_ATTENTION: Eye,
  USER_APPROVED: Users,
};

const notificationTypeLabels = {
  REPORT_SUBMITTED: 'Relatório Enviado',
  REPORT_APPROVED: 'Relatório Aprovado',
  REPORT_RETURNED: 'Relatório Devolvido',
  REPORT_NEEDS_ATTENTION: 'Atenção Necessária',
  USER_APPROVED: 'Usuário Aprovado',
};

const auditActionIcons = {
  CREATE: '➕',
  UPDATE: '✏️',
  DELETE: '🗑️',
  SUBMIT: '📤',
  START_REVIEW: '👁️',
  APPROVE: '✅',
  RETURN: '↩️',
  ARCHIVE: '📦',
  REOPEN: '🔄',
};

function ActivityLogInner() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState('all');
  const [searchText, setSearchText] = useState('');

  // Buscar notificações do usuário
  const { data: notifications = [], isLoading: notifLoading } = useQuery({
    queryKey: ['user-notifications', user?.email],
    queryFn: () => base44.entities.Notification.filter(
      { user_email: user.email },
      '-created_date',
      100
    ),
    enabled: !!user?.email,
  });

  // Buscar audit logs do usuário
  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ['user-audit-logs', user?.email],
    queryFn: () => base44.entities.AuditLog.filter(
      { actor_email: user.email },
      '-created_date',
      100
    ),
    enabled: !!user?.email,
  });

  // Marcar notificação como lida
  const markAsReadMutation = useMutation({
    mutationFn: (notifId) => base44.entities.Notification.update(notifId, { read: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-notifications', user?.email]);
    },
  });

  // Deletar notificação
  const deleteNotificationMutation = useMutation({
    mutationFn: (notifId) => base44.entities.Notification.delete(notifId),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-notifications', user?.email]);
      toastMessages.deleteSuccess();
    },
  });

  // Filtrar notificações
  const filteredNotifications = notifications.filter(notif => {
    const matchType = filterType === 'all' || notif.type === filterType;
    const matchSearch = notif.message.toLowerCase().includes(searchText.toLowerCase()) ||
                        notif.title.toLowerCase().includes(searchText.toLowerCase());
    return matchType && matchSearch;
  });

  // Filtrar audit logs
  const filteredAuditLogs = auditLogs.filter(log => {
    const matchType = filterType === 'all' || filterType === 'audit' ? true : false;
    const matchSearch = log.details?.toLowerCase().includes(searchText.toLowerCase()) ||
                        log.entity_id?.toLowerCase().includes(searchText.toLowerCase()) ||
                        log.action?.toLowerCase().includes(searchText.toLowerCase());
    return matchType && matchSearch;
  });

  const isLoading = notifLoading || auditLoading;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-black">Atividades Recentes</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Histórico de suas ações e notificações
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 mb-8 flex-wrap">
          <Input
            placeholder="Buscar por mensagem ou ID..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="max-w-xs"
          />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="notifications">Notificações</SelectItem>
              <SelectItem value="audit">Atividades do Sistema</SelectItem>
              <SelectItem value="REPORT_SUBMITTED">Relatórios Enviados</SelectItem>
              <SelectItem value="REPORT_APPROVED">Relatórios Aprovados</SelectItem>
              <SelectItem value="REPORT_RETURNED">Relatórios Devolvidos</SelectItem>
              <SelectItem value="USER_APPROVED">Usuários Aprovados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notificações */}
        {filterType === 'all' || filterType === 'notifications' ? (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-black mb-4">Notificações</h2>
            {isLoading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : filteredNotifications.length === 0 ? (
              <div className="text-center py-12 text-gray-400">Nenhuma notificação encontrada</div>
            ) : (
              <div className="space-y-3">
                {filteredNotifications.map(notif => (
                  <div
                    key={notif.id}
                    className={`p-4 border rounded-xl transition-colors ${
                      notif.read
                        ? 'bg-gray-50 border-gray-100'
                        : 'bg-blue-50 border-blue-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-700 mb-1">
                          {notificationTypeLabels[notif.type] || notif.type}
                        </p>
                        <p className="text-sm text-gray-600">{notif.message}</p>
                        {notif.action_url && (
                          <a
                            href={notif.action_url}
                            className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                          >
                            Ver detalhes →
                          </a>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(notif.created_date).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {!notif.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => markAsReadMutation.mutate(notif.id)}
                          >
                            Marcar como lida
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400"
                          onClick={() => deleteNotificationMutation.mutate(notif.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* Atividades do Sistema */}
        {filterType === 'all' || filterType === 'audit' ? (
          <section>
            <h2 className="text-lg font-semibold text-black mb-4">Atividades do Sistema</h2>
            {isLoading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : filteredAuditLogs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">Nenhuma atividade encontrada</div>
            ) : (
              <div className="space-y-3">
                {filteredAuditLogs.map(log => {
                  const Icon = notificationTypeIcons[log.action] || FileText;
                  return (
                    <div key={log.id} className="p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="text-lg flex-shrink-0">
                          {auditActionIcons[log.action] || '📋'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-700 mb-1">
                            {log.action.charAt(0).toUpperCase() + log.action.slice(1).toLowerCase()}
                          </p>
                          <p className="text-sm text-gray-600">
                            <strong>{log.entity_type}</strong> {log.entity_id}
                          </p>
                          {log.details && (
                            <p className="text-xs text-gray-500 mt-1">{log.details}</p>
                          )}
                          {log.previous_status && log.new_status && (
                            <p className="text-xs text-gray-500 mt-1">
                              Status: <span className="line-through">{log.previous_status}</span> → <strong>{log.new_status}</strong>
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            {new Date(log.created_date).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default function ActivityLog() {
  return <RequireAuth><ActivityLogInner /></RequireAuth>;
}