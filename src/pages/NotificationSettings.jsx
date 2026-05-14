import React from 'react';
import NotificationPreferencesPanel from '@/components/notifications/NotificationPreferencesPanel';

export default function NotificationSettings() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Notificações e Preferências</h1>
          <p className="text-muted-foreground">
            Gerencie como você recebe notificações do sistema Museus Centro
          </p>
        </div>

        <NotificationPreferencesPanel />
      </div>
    </div>
  );
}