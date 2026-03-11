import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Bell, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function PurchaseNotificationBell({ currentUser }) {
  const [open, setOpen] = useState(false);

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ['notifications', currentUser?.email],
    queryFn: () => {
      if (!currentUser?.email) return [];
      return base44.entities.Notification.filter({ user_email: currentUser.email }, '-created_date', 20);
    },
    enabled: !!currentUser?.email,
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAsRead = async (notifId) => {
    try {
      await base44.entities.Notification.update(notifId, { read: true });
      refetch();
    } catch (error) {
      console.error('Erro ao marcar como lido:', error);
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'PURCHASE_APPROVED':
        return 'bg-green-50 border-green-200';
      case 'PURCHASE_REJECTED':
        return 'bg-red-50 border-red-200';
      case 'PURCHASE_PENDING':
        return 'bg-amber-50 border-amber-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'PURCHASE_APPROVED':
        return '✅';
      case 'PURCHASE_REJECTED':
        return '❌';
      case 'PURCHASE_PENDING':
        return '⏳';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>

      {/* Notification Panel */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <Card className="absolute right-0 mt-2 w-96 max-h-96 overflow-y-auto z-50 shadow-2xl">
            <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
              <h3 className="font-bold text-gray-900">Notificações</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-6 w-6"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map(notif => (
                  <div
                    key={notif.id}
                    className={`p-4 border-l-4 ${getNotificationColor(notif.type)} ${notif.read ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{getNotificationIcon(notif.type)}</span>
                          <p className="font-semibold text-sm text-gray-900">{notif.title}</p>
                        </div>
                        <p className="text-xs text-gray-600 whitespace-pre-wrap">{notif.message}</p>
                        <p className="text-[10px] text-gray-400 mt-2">
                          {new Date(notif.created_date).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      {!notif.read && (
                        <button
                          onClick={() => handleMarkAsRead(notif.id)}
                          className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700 flex-shrink-0"
                          title="Marcar como lido"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}