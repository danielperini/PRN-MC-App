import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Bell, Save } from 'lucide-react';

export default function NotificationPreferences({ userEmail }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    notify_pending_reports: true,
    notify_approved: true,
    notify_returned: true,
    notify_deadline_days: 3,
    reminder_frequency: 'once',
    digest_frequency: 'weekly'
  });
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch user preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['notification-preferences', userEmail],
    queryFn: async () => {
      const prefs = await base44.entities.NotificationPreference.filter(
        { user_email: userEmail },
        '-created_date',
        1
      );
      return prefs?.[0] || null;
    },
    enabled: !!userEmail
  });

  // Update form when preferences load
  useEffect(() => {
    if (preferences) {
      setFormData({
        notify_pending_reports: preferences.notify_pending_reports ?? true,
        notify_approved: preferences.notify_approved ?? true,
        notify_returned: preferences.notify_returned ?? true,
        notify_deadline_days: preferences.notify_deadline_days ?? 3,
        reminder_frequency: preferences.reminder_frequency ?? 'once',
        digest_frequency: preferences.digest_frequency ?? 'weekly'
      });
      setHasChanges(false);
    }
  }, [preferences]);

  // Save preferences mutation
  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (preferences?.id) {
        return await base44.entities.NotificationPreference.update(preferences.id, data);
      } else {
        return await base44.entities.NotificationPreference.create({
          user_email: userEmail,
          ...data
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notification-preferences']);
      setHasChanges(false);
      toast.success('Preferências de notificação atualizadas');
    },
    onError: () => toast.error('Erro ao salvar preferências')
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  if (isLoading) {
    return <div className="text-center text-gray-400">Carregando preferências...</div>;
  }

  return (
    <Card className="border-gray-100">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-600" />
          <div>
            <CardTitle>Preferências de Notificação</CardTitle>
            <CardDescription>Personalize como você recebe notificações sobre relatórios</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Notification Types */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm text-black">Tipos de Notificação</h3>
          
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
            <div>
              <p className="text-sm font-medium text-black">Relatórios Pendentes</p>
              <p className="text-xs text-gray-500">Lembretes sobre relatórios que você precisa entregar</p>
            </div>
            <Switch
              checked={formData.notify_pending_reports}
              onCheckedChange={(checked) => handleChange('notify_pending_reports', checked)}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
            <div>
              <p className="text-sm font-medium text-black">Relatórios Aprovados</p>
              <p className="text-xs text-gray-500">Confirmação quando seus relatórios são aprovados</p>
            </div>
            <Switch
              checked={formData.notify_approved}
              onCheckedChange={(checked) => handleChange('notify_approved', checked)}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
            <div>
              <p className="text-sm font-medium text-black">Relatórios Devolvidos</p>
              <p className="text-xs text-gray-500">Alertas quando seus relatórios precisam de revisão</p>
            </div>
            <Switch
              checked={formData.notify_returned}
              onCheckedChange={(checked) => handleChange('notify_returned', checked)}
            />
          </div>
        </div>

        {/* Frequency Settings */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm text-black">Frequência</h3>

          {formData.notify_pending_reports && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-2">
                Frequência de Lembretes sobre Pendentes
              </label>
              <Select value={formData.reminder_frequency} onValueChange={(v) => handleChange('reminder_frequency', v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Nunca</SelectItem>
                  <SelectItem value="once">Uma vez</SelectItem>
                  <SelectItem value="weekly">Semanalmente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">
              Frequência de Digest de Notificações
            </label>
            <Select value={formData.digest_frequency} onValueChange={(v) => handleChange('digest_frequency', v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diariamente</SelectItem>
                <SelectItem value="weekly">Semanalmente</SelectItem>
                <SelectItem value="never">Nunca</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.notify_pending_reports && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-2">
                Enviar lembrete com antecedência (dias)
              </label>
              <Select value={String(formData.notify_deadline_days)} onValueChange={(v) => handleChange('notify_deadline_days', Number(v))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 dia</SelectItem>
                  <SelectItem value="3">3 dias</SelectItem>
                  <SelectItem value="7">1 semana</SelectItem>
                  <SelectItem value="14">2 semanas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Save Button */}
        <Button
          onClick={() => saveMutation.mutate(formData)}
          disabled={!hasChanges || saveMutation.isPending}
          className="w-full gap-2 bg-black hover:bg-gray-800 text-white"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? 'Salvando...' : 'Salvar Preferências'}
        </Button>
      </CardContent>
    </Card>
  );
}