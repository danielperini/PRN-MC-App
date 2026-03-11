import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, X, Check, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

const NOTIFICATION_ICONS = {
  REPORT_SUBMITTED: AlertCircle,
  REPORT_RETURNED: AlertCircle,
  REPORT_APPROVED: CheckCircle2,
  COMMENT_ADDED: AlertCircle,
  PERMISSION_GRANTED: CheckCircle2,
  USER_APPROVED: CheckCircle2,
};

const NOTIFICATION_COLORS = {
  REPORT_SUBMITTED: 'bg-blue-50 border-blue-200',
  REPORT_RETURNED: 'bg-red-50 border-red-200',
  REPORT_APPROVED: 'bg-green-50 border-green-200',
  COMMENT_ADDED: 'bg-blue-50 border-blue-200',
  PERMISSION_GRANTED: 'bg-purple-50 border-purple-200',
  USER_APPROVED: 'bg-green-50 border-green-200',
};

const NOTIFICATION_EMOJIS = {
  REPORT_SUBMITTED: '📤',
  REPORT_RETURNED: '⚠️',
  REPORT_APPROVED: '✅',
  COMMENT_ADDED: '💬',
  PERMISSION_GRANTED: '🔓',
  USER_APPROVED: '👤',
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const { data: userNotifications, refetch } = useQuery({
    queryKey: ['user-notifications'],
    queryFn: async () => {
      const user = await base44.auth.me();
      if (!user) return [];
      return base44.entities.Notification.filter(
        { user_email: user.email, read: false },
        '-created_date',
        20
      );
    },
    enabled: !!open,
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });

  useEffect(() => {
    if (userNotifications) {
      setNotifications(userNotifications);
    }
  }, [userNotifications]);

  const handleMarkAsRead = async (notificationId) => {
    await base44.entities.Notification.update(notificationId, { read: true });
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    refetch();
  };

  const handleMarkAllAsRead = async () => {
    for (const notif of notifications) {
      await base44.entities.Notification.update(notif.id, { read: true });
    }
    setNotifications([]);
    refetch();
  };

  const unreadCount = notifications.length;

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        title="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-gray-50 border-b border-gray-200 p-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Notificações</h3>
            <button
              onClick={() => setOpen(false)}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                {notifications.map(notif => {
                   const Icon = NOTIFICATION_ICONS[notif.type] || AlertCircle;
                   const colorClass = NOTIFICATION_COLORS[notif.type] || 'bg-gray-50 border-gray-200';
                   const emoji = NOTIFICATION_EMOJIS[notif.type] || '📢';

                   return (
                     <div
                       key={notif.id}
                       className={`p-4 border-l-4 ${colorClass} flex gap-3 hover:bg-opacity-75 transition-colors`}
                     >
                       <span className="text-lg flex-shrink-0">{emoji}</span>
                       <div className="flex-1 min-w-0">
                         <h4 className="font-medium text-sm text-gray-900">{notif.title}</h4>
                         <p className="text-xs text-gray-600 mt-1 line-clamp-2">{notif.message}</p>
                         <p className="text-xs text-gray-400 mt-1">
                           {new Date(notif.created_date).toLocaleString('pt-BR')}
                         </p>
                         {notif.action_url && (
                           <a
                             href={notif.action_url}
                             className="text-xs text-blue-600 hover:text-blue-700 mt-2 inline-block font-medium"
                             onClick={() => setOpen(false)}
                           >
                             Ver →
                           </a>
                         )}
                       </div>
                       <button
                         onClick={() => handleMarkAsRead(notif.id)}
                         className="p-1 hover:bg-gray-300 rounded transition-colors flex-shrink-0"
                         title="Marcar como lida"
                       >
                         <Check className="w-4 h-4 text-gray-500" />
                       </button>
                     </div>
                   );
                 })}
              </div>

              {unreadCount > 0 && (
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkAllAsRead}
                    className="w-full text-xs text-gray-600 hover:text-gray-900"
                  >
                    Marcar tudo como lido
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}