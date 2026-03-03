import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const notificationIcons = {
  REPORT_SUBMITTED: '📤',
  REPORT_APPROVED: '✅',
  REPORT_RETURNED: '⚠️',
  REPORT_NEEDS_ATTENTION: '⏰',
  USER_APPROVED: '👤',
};

const notificationLabels = {
  REPORT_SUBMITTED: 'Relatório Enviado',
  REPORT_APPROVED: 'Relatório Aprovado',
  REPORT_RETURNED: 'Relatório Devolvido',
  REPORT_NEEDS_ATTENTION: 'Atenção Necessária',
  USER_APPROVED: 'Usuário Aprovado',
};

export default function NotificationPanel({ userEmail }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', userEmail],
    queryFn: () => base44.entities.Notification.filter(
      { user_email: userEmail, read: false },
      '-created_date',
      20
    ),
    enabled: !!userEmail,
    refetchInterval: 30000, // atualiza a cada 30 segundos
  });

  const markAsReadMutation = useMutation({
    mutationFn: (notifId) => base44.entities.Notification.update(notifId, { read: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications', userEmail]);
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unread = await base44.entities.Notification.filter({ user_email: userEmail, read: false });
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { read: true })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications', userEmail]);
      toast.success('Todas as notificações marcadas como lidas');
    },
  });

  const unreadCount = notifications.length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="text-gray-500 relative"
        onClick={() => setOpen(!open)}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </Button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-semibold text-black">Notificações</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
              >
                Marcar tudo como lido
              </Button>
            )}
          </div>

          {/* Notificações */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-gray-400">Carregando...</div>
            ) : unreadCount === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400">Nenhuma notificação</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map(notif => (
                  <div
                    key={notif.id}
                    className="p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex gap-3">
                      <span className="text-lg flex-shrink-0">
                        {notificationIcons[notif.type] || '📢'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-600 mb-0.5">
                          {notificationLabels[notif.type] || notif.type}
                        </p>
                        <p className="text-sm text-gray-800">{notif.message}</p>
                        {notif.action_url && (
                          <a
                            href={notif.action_url}
                            className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                            onClick={() => setOpen(false)}
                          >
                            Ver detalhes →
                          </a>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 text-gray-400 hover:text-gray-600"
                        onClick={() => markAsReadMutation.mutate(notif.id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 p-3">
            <a
              href={`/pages/ActivityLog`}
              className="text-xs text-blue-600 hover:underline font-medium"
              onClick={() => setOpen(false)}
            >
              Ver todas as atividades →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}