import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationCenter from './NotificationCenter';

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
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

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['unread-notifications-count', user?.email],
    queryFn: async () => {
      if (!user?.email) return 0;
      const notifs = await base44.entities.SystemNotification.filter(
        { user_email: user.email, status: 'unread' },
        '-created_at',
        1000
      );
      return (notifs || []).length;
    },
    enabled: !!user?.email,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.email) return;

    const unsubscribe = base44.entities.SystemNotification.subscribe((event) => {
      // Trigger refetch on new notifications
      if (event.type === 'create' && event.data?.user_email === user.email) {
        // Re-fetch the count
      }
    });

    return unsubscribe;
  }, [user?.email]);

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
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      <NotificationCenter isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}