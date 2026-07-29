import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, AlertCircle, CheckCircle, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const DEVOLUCAO_TYPES = new Set(['REPORT_RETURNED', 'NF_DEVOLVIDA']);

function getNotifStyle(type) {
  if (DEVOLUCAO_TYPES.has(type)) {
    return {
      border: 'border-l-red-500',
      icon: <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />,
      bg: 'bg-red-50',
    };
  }
  return {
    border: 'border-l-blue-400',
    icon: <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />,
    bg: '',
  };
}

function NotifItem({ notif, onRead, onNavigate }) {
  const style = getNotifStyle(notif.type);
  const isUnread = !notif.read;
  const timeAgo = notif.created_date
    ? formatDistanceToNow(new Date(notif.created_date), { locale: ptBR, addSuffix: true })
    : '';

  // Extrair motivo da mensagem (após "Motivo:")
  const parts = (notif.message || '').split('\n\nMotivo:');
  const subtitle = parts[0]?.trim() || '';
  const motivo = parts[1]?.trim() || '';

  function handleClick() {
    onRead(notif.id);
    if (notif.action_url) onNavigate(notif.action_url);
  }

  return (
    <div
      className={`border-l-4 ${style.border} ${isUnread ? style.bg || 'bg-blue-50' : 'bg-white'} px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors`}
      onClick={handleClick}
    >
      <div className="flex gap-2">
        {style.icon}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold text-gray-900 ${isUnread ? '' : 'font-medium'}`}>
            {notif.title}
          </p>
          {subtitle && <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>}
          {motivo && (
            <p className="text-xs text-gray-500 italic mt-1 line-clamp-2">{motivo}</p>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-gray-400">{timeAgo}</span>
            <span className="text-[10px] text-blue-600 font-medium flex items-center gap-0.5">
              Ver documento <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ['notifications-bell', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const notifs = await base44.entities.Notification.filter(
        { user_email: user.email, read: false },
        '-created_date',
        50
      );
      return (notifs || []).filter(n => !n.resolved);
    },
    enabled: !!user?.email,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Subscribe em tempo real
  useEffect(() => {
    if (!user?.email) return;
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.data?.user_email === user.email) refetch();
    });
    return unsub;
  }, [user?.email, refetch]);

  const unreadCount = notifications.length;

  // Devoluções com destaque
  const devolucoesNaoLidas = notifications.filter(n => DEVOLUCAO_TYPES.has(n.type));
  const outrasNaoLidas = notifications.filter(n => !DEVOLUCAO_TYPES.has(n.type));

  async function handleRead(id) {
    try {
      await base44.entities.Notification.update(id, { read: true });
      queryClient.invalidateQueries({ queryKey: ['notifications-bell', user?.email] });
    } catch (e) {
      console.warn('Erro ao marcar notificação como lida:', e);
    }
  }

  async function handleReadAll() {
    try {
      await Promise.all(notifications.map(n => base44.entities.Notification.update(n.id, { read: true })));
      queryClient.invalidateQueries({ queryKey: ['notifications-bell', user?.email] });
    } catch (e) {
      console.warn('Erro ao marcar todas como lidas:', e);
    }
  }

  function handleNavigate(url) {
    setIsOpen(false);
    if (url.startsWith('http')) {
      window.location.href = url;
    } else {
      navigate(url);
    }
  }

  const hasDevolucoes = devolucoesNaoLidas.length > 0;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="relative text-foreground hover:text-foreground hover:bg-secondary/50"
        title="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className={`absolute -top-1 -right-1 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center text-white ${hasDevolucoes ? 'bg-red-500' : 'bg-blue-500'}`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-end" onClick={() => setIsOpen(false)}>
          <div
            className="w-full max-w-sm h-screen bg-white border-l border-gray-200 flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-700" />
                <span className="font-semibold text-gray-900 text-sm">Notificações</span>
                {unreadCount > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full text-white ${hasDevolucoes ? 'bg-red-500' : 'bg-blue-500'}`}>
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button onClick={handleReadAll} className="text-xs text-blue-600 hover:underline px-2 py-1">
                    Marcar todas como lidas
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {unreadCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Bell className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma notificação não lida</p>
                </div>
              ) : (
                <>
                  {devolucoesNaoLidas.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-red-50 border-b border-red-100">
                        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Ação necessária</p>
                      </div>
                      {devolucoesNaoLidas.map(n => (
                        <NotifItem key={n.id} notif={n} onRead={handleRead} onNavigate={handleNavigate} />
                      ))}
                    </>
                  )}
                  {outrasNaoLidas.length > 0 && (
                    <>
                      {devolucoesNaoLidas.length > 0 && (
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Outras</p>
                        </div>
                      )}
                      {outrasNaoLidas.map(n => (
                        <NotifItem key={n.id} notif={n} onRead={handleRead} onNavigate={handleNavigate} />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}