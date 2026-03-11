import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export default function ReportNotificationBell({ currentUser }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  // Monitora notificações em tempo real
  useEffect(() => {
    if (!currentUser?.email) return;

    // Busca notificações iniciais
    const loadNotifications = async () => {
      const notifs = await base44.entities.Notification.filter(
        { user_email: currentUser.email, read: false },
        '-created_date',
        50
      );
      setNotifications(notifs);
      setUnreadCount(notifs.length);
    };

    loadNotifications();

    // Monitora mudanças em tempo real
    const unsubscribe = base44.entities.Notification.subscribe((event) => {
      if (event.type === 'create' && event.data.user_email === currentUser.email) {
        setNotifications(prev => [event.data, ...prev]);
        setUnreadCount(prev => prev + 1);
      } else if (event.type === 'update' && event.data.user_email === currentUser.email) {
        setNotifications(prev =>
          prev.map(n => n.id === event.id ? event.data : n)
        );
        if (event.data.read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
    });

    return unsubscribe;
  }, [currentUser?.email]);

  const markAsRead = async (notificationId) => {
    await base44.entities.Notification.update(notificationId, { read: true });
  };

  const deleteNotification = async (notificationId) => {
    await base44.entities.Notification.delete(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'REPORT_APPROVED':
        return '✅';
      case 'REPORT_RETURNED':
        return '⚠️';
      case 'COMMENT_ADDED':
        return '💬';
      case 'PERMISSION_GRANTED':
        return '🔓';
      default:
        return '📢';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'REPORT_APPROVED':
        return 'bg-green-50 border-green-200';
      case 'REPORT_RETURNED':
        return 'bg-yellow-50 border-yellow-200';
      case 'COMMENT_ADDED':
        return 'bg-blue-50 border-blue-200';
      case 'PERMISSION_GRANTED':
        return 'bg-purple-50 border-purple-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-black hover:bg-black hover:text-white h-11 w-11"
          title="Notificações"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 max-h-96 overflow-y-auto">
        <div className="p-4 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-sm">Notificações</h3>
          {unreadCount > 0 && (
            <p className="text-xs text-gray-500 mt-1">{unreadCount} nova{unreadCount !== 1 ? 's' : ''}</p>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Nenhuma notificação</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-4 border-l-4 ${notif.read ? 'bg-white opacity-75' : 'bg-blue-50 border-l-blue-500'}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">{getNotificationIcon(notif.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900">
                      {notif.title}
                    </p>
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                      {notif.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(notif.created_date).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!notif.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markAsRead(notif.id)}
                        className="text-green-600 hover:bg-green-50"
                        title="Marcar como lido"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteNotification(notif.id)}
                      className="text-red-600 hover:bg-red-50"
                      title="Remover"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}