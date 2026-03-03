import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import NotificationPanel from './NotificationPanel';

export default function NotificationBell({ userEmail }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    if (!userEmail) return;

    // Carregar notificações iniciais
    const loadNotifications = async () => {
      const notifs = await base44.entities.Notification.filter(
        { user_email: userEmail },
        '-created_date',
        50
      );
      setNotifications(notifs || []);
      const unread = (notifs || []).filter(n => !n.read).length;
      setUnreadCount(unread);
    };

    loadNotifications();

    // Inscrever-se a atualizações em tempo real
    const unsubscribe = base44.entities.Notification.subscribe(event => {
      if (event.type === 'create' && event.data.user_email === userEmail) {
        setNotifications(prev => [event.data, ...prev]);
        setUnreadCount(prev => prev + 1);
      } else if (event.type === 'update' && event.data.user_email === userEmail) {
        setNotifications(prev => prev.map(n => n.id === event.data.id ? event.data : n));
        if (event.data.read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
    });

    return unsubscribe;
  }, [userEmail]);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowPanel(!showPanel)}
        className="relative text-gray-600 hover:text-black"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
        )}
      </Button>

      {showPanel && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setShowPanel(false)}
          userEmail={userEmail}
        />
      )}
    </div>
  );
}