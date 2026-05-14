import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Bell, X, Archive, Pin, Trash2, Filter, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CATEGORY_LABELS = {
  system: 'Sistema',
  financial: 'Financeiro',
  reports: 'Relatórios',
  programming: 'Programação',
  communication: 'Comunicação',
  web_clipping: 'Web & Clipping',
  approvals: 'Aprovações',
  documents: 'Documentos',
  agenda: 'Agenda',
  ai_suggestions: 'IA',
  backup: 'Backup',
  team: 'Equipe'
};

const PRIORITY_COLORS = {
  low: 'bg-secondary',
  normal: 'bg-accent',
  high: 'bg-destructive/20',
  critical: 'bg-destructive'
};

export default function NotificationCenter({ isOpen, onClose }) {
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedNotifications, setSelectedNotifications] = useState(new Set());
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        console.error('Erro ao carregar usuário:', error);
      }
    };
    loadUser();
  }, []);

  const { data: notifications = [], refetch: refetchNotifications, isLoading } = useQuery({
    queryKey: ['system-notifications', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const notifs = await base44.entities.SystemNotification.filter(
        { user_email: user.email },
        '-created_at',
        100
      );
      return notifs || [];
    },
    enabled: !!user?.email,
    staleTime: 60000,
  });

  const filteredNotifications = useMemo(() => {
    if (filterCategory === 'all') return notifications;
    return notifications.filter(n => n.category === filterCategory);
  }, [notifications, filterCategory]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => n.status === 'unread').length;
  }, [notifications]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      await base44.entities.SystemNotification.update(notificationId, { status: 'read' });
      await logNotificationEvent(notificationId, 'read');
      refetchNotifications();
    } catch (error) {
      console.error('Erro ao marcar como lido:', error);
    }
  };

  const handleToggleImportant = async (notificationId, isImportant) => {
    try {
      const newStatus = isImportant ? 'important' : 'read';
      await base44.entities.SystemNotification.update(notificationId, { status: newStatus });
      refetchNotifications();
    } catch (error) {
      console.error('Erro ao marcar como importante:', error);
    }
  };

  const handleArchive = async (notificationId) => {
    try {
      await base44.entities.SystemNotification.update(notificationId, { status: 'archived' });
      await logNotificationEvent(notificationId, 'archived');
      refetchNotifications();
    } catch (error) {
      console.error('Erro ao arquivar:', error);
    }
  };

  const logNotificationEvent = async (notificationId, eventType) => {
    try {
      await base44.entities.NotificationLog.create({
        notification_id: notificationId,
        user_email: user?.email,
        event_type: eventType,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Erro ao registrar evento:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-end">
      <div className="w-full max-w-md h-screen bg-card border-l border-border flex flex-col overflow-hidden rounded-l-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="w-5 h-5 text-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-foreground">Notificações</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Filter */}
        <div className="p-4 border-b border-border flex gap-2 overflow-x-auto">
          <Button
            variant={filterCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterCategory('all')}
            className="whitespace-nowrap"
          >
            Todas
          </Button>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <Button
              key={key}
              variant={filterCategory === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterCategory(key)}
              className="whitespace-nowrap text-xs"
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">Carregando...</div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">Nenhuma notificação</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredNotifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  onToggleImportant={handleToggleImportant}
                  onArchive={handleArchive}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NotificationItem({ notification, onMarkAsRead, onToggleImportant, onArchive }) {
  const isUnread = notification.status === 'unread';
  const isImportant = notification.status === 'important';

  const handleClick = () => {
    if (isUnread) {
      onMarkAsRead(notification.id);
    }
    if (notification.action_url) {
      window.location.href = notification.action_url;
    }
  };

  return (
    <div
      className={cn(
        'p-4 cursor-pointer transition-colors border-b border-border hover:bg-secondary/50',
        isUnread && 'bg-primary/5'
      )}
      onClick={handleClick}
    >
      <div className="flex gap-3">
        {/* Indicator */}
        <div className="flex-shrink-0 w-1.5 rounded-full mt-1" style={{
          backgroundColor: isUnread ? 'hsl(var(--primary))' : 'transparent'
        }} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className={cn(
                'text-sm',
                isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
              )}>
                {notification.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{notification.message}</p>
            </div>
            <Badge className="text-[10px] whitespace-nowrap flex-shrink-0">
              {CATEGORY_LABELS[notification.category] || notification.category}
            </Badge>
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between mt-2 gap-2">
            <span className="text-[10px] text-muted-foreground">
              {notification.created_at && format(new Date(notification.created_at), 'dd MMM HH:mm', { locale: ptBR })}
            </span>
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 text-muted-foreground hover:text-foreground"
                onClick={() => onToggleImportant(notification.id, isImportant)}
                title={isImportant ? 'Remover marcação' : 'Marcar como importante'}
              >
                <Pin className={cn('w-3 h-3', isImportant && 'fill-current text-destructive')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 text-muted-foreground hover:text-foreground"
                onClick={() => onArchive(notification.id)}
                title="Arquivar"
              >
                <Archive className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}