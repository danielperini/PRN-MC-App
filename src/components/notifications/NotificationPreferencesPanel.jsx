import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_LABELS = {
  minhas_compras: 'Minhas compras',
  meus_pagamentos: 'Meus pagamentos',
  meus_relatorios: 'Meus relatórios',
  mensagens: 'Mensagens',
  aprovacoes: 'Aprovações',
  financeiro: 'Financeiro',
  sistema: 'Sistema'
};

const FREQUENCY_OPTIONS = [
  { value: 'immediate', label: 'Imediato' },
  { value: 'daily', label: 'Resumo diário' },
  { value: 'weekly', label: 'Resumo semanal' },
  { value: 'important_only', label: 'Apenas importantes' },
  { value: 'disabled', label: 'Desativado' }
];

export default function NotificationPreferencesPanel() {
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localPrefs, setLocalPrefs] = useState(null);

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

  const { data: preferences, refetch: refetchPreferences } = useQuery({
    queryKey: ['notification-preferences', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const prefs = await base44.entities.NotificationPreference.filter(
        { user_email: user.email }
      );
      const pref = prefs?.[0];
      if (!pref) {
        // Create default preferences
        const newPref = await base44.entities.NotificationPreference.create({
          user_email: user.email,
          user_role: user.role || 'profissional',
          email_address: user.email,
          receive_email_notifications: true,
          email_frequency: 'immediate',
          receive_in_app: true,
          receive_push: false,
          notification_categories: {
            minhas_compras: true,
            meus_pagamentos: true,
            meus_relatorios: true,
            mensagens: true,
            aprovacoes: true,
            financeiro: true,
            sistema: false
          }
        });
        return newPref;
      }
      return pref;
    },
    enabled: !!user?.email,
  });

  useEffect(() => {
    if (preferences) {
      setLocalPrefs({ ...preferences });
    }
  }, [preferences]);

  const handleToggleCategory = (category) => {
    if (!localPrefs) return;
    setLocalPrefs({
      ...localPrefs,
      notification_categories: {
        ...localPrefs.notification_categories,
        [category]: !localPrefs.notification_categories[category]
      }
    });
  };

  const handleSave = async () => {
    if (!localPrefs) return;
    setIsSaving(true);
    try {
      await base44.entities.NotificationPreference.update(localPrefs.id, {
        email_address: localPrefs.email_address,
        receive_email_notifications: localPrefs.receive_email_notifications,
        email_frequency: localPrefs.email_frequency,
        receive_in_app: localPrefs.receive_in_app,
        receive_push: localPrefs.receive_push,
        notification_categories: localPrefs.notification_categories,
        priority_alerts_only: localPrefs.priority_alerts_only
      });
      await refetchPreferences();
      toast.success('Preferências salvas com sucesso');
    } catch (error) {
      console.error('Erro ao salvar preferências:', error);
      toast.error('Erro ao salvar preferências');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!localPrefs) return;
    if (!confirm('Tem certeza que deseja desinscrever-se de todas as notificações por email?')) return;

    try {
      await base44.entities.NotificationPreference.update(localPrefs.id, {
        receive_email_notifications: false,
        unsubscribed_at: new Date().toISOString()
      });
      setLocalPrefs({ ...localPrefs, receive_email_notifications: false });
      toast.success('Desinscrição realizada. Você pode reativar a qualquer momento.');
    } catch (error) {
      console.error('Erro ao desinscrever:', error);
      toast.error('Erro ao processar desinscrição');
    }
  };

  if (!localPrefs) {
    return <div className="p-6 text-center text-muted-foreground">Carregando preferências...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Preferências de Notificações</CardTitle>
          <CardDescription>Controle como você recebe notificações do Museus Centro</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Configuration */}
          <div className="space-y-4 pb-6 border-b border-border">
            <h3 className="font-semibold text-foreground">Email de Notificações</h3>
            
            <div className="space-y-2">
              <Label htmlFor="email-address" className="text-muted-foreground">
                Endereço de email principal
              </Label>
              <input
                id="email-address"
                type="email"
                value={localPrefs.email_address || ''}
                onChange={(e) => setLocalPrefs({ ...localPrefs, email_address: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground"
                placeholder="seu.email@exemplo.com"
              />
              <p className="text-xs text-muted-foreground">
                Usando: <span className="font-mono text-foreground">{user?.email}</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="email-notifications"
                checked={localPrefs.receive_email_notifications}
                onCheckedChange={(checked) =>
                  setLocalPrefs({ ...localPrefs, receive_email_notifications: checked })
                }
              />
              <Label htmlFor="email-notifications" className="font-normal cursor-pointer">
                Receber notificações por email
              </Label>
            </div>

            {localPrefs.receive_email_notifications && (
              <div className="space-y-2 ml-6">
                <Label className="text-muted-foreground text-sm">Frequência de envio</Label>
                <div className="space-y-2">
                  {FREQUENCY_OPTIONS.map(option => (
                    <div key={option.value} className="flex items-center gap-2">
                      <input
                        type="radio"
                        id={`freq-${option.value}`}
                        name="email_frequency"
                        value={option.value}
                        checked={localPrefs.email_frequency === option.value}
                        onChange={(e) =>
                          setLocalPrefs({ ...localPrefs, email_frequency: e.target.value })
                        }
                        className="cursor-pointer"
                      />
                      <Label htmlFor={`freq-${option.value}`} className="font-normal cursor-pointer text-sm">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* In-app Notifications */}
          <div className="space-y-4 pb-6 border-b border-border">
            <h3 className="font-semibold text-foreground">Notificações no Sistema</h3>
            
            <div className="flex items-center gap-3">
              <Checkbox
                id="in-app"
                checked={localPrefs.receive_in_app}
                onCheckedChange={(checked) =>
                  setLocalPrefs({ ...localPrefs, receive_in_app: checked })
                }
              />
              <Label htmlFor="in-app" className="font-normal cursor-pointer">
                Receber notificações no sistema
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="push"
                checked={localPrefs.receive_push}
                onCheckedChange={(checked) =>
                  setLocalPrefs({ ...localPrefs, receive_push: checked })
                }
              />
              <Label htmlFor="push" className="font-normal cursor-pointer">
                Receber notificações push (quando disponível)
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="priority-only"
                checked={localPrefs.priority_alerts_only}
                onCheckedChange={(checked) =>
                  setLocalPrefs({ ...localPrefs, priority_alerts_only: checked })
                }
              />
              <Label htmlFor="priority-only" className="font-normal cursor-pointer">
                Receber apenas alertas importantes
              </Label>
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Categorias de Notificação</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Selecione quais categorias você deseja receber notificações:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                <div key={category} className="flex items-center gap-3">
                  <Checkbox
                    id={`cat-${category}`}
                    checked={localPrefs.notification_categories?.[category] ?? category !== 'sistema'}
                    onCheckedChange={() => handleToggleCategory(category)}
                  />
                  <Label htmlFor={`cat-${category}`} className="font-normal cursor-pointer">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-between">
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? 'Salvando...' : <>
              <Check className="w-4 h-4" />
              Salvar Preferências
            </>}
          </Button>
        </div>

        {localPrefs.receive_email_notifications && (
          <Button
            variant="outline"
            onClick={handleUnsubscribe}
            className="text-destructive border-destructive/50 hover:bg-destructive/5"
          >
            Desinscrever-se
          </Button>
        )}
      </div>

      {/* Info */}
      <div className="bg-secondary/30 border border-border rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Sobre suas notificações</p>
          <p>As configurações acima controlam como você recebe notificações do sistema Museus Centro. Você pode alterar estas preferências a qualquer momento.</p>
        </div>
      </div>
    </div>
  );
}
