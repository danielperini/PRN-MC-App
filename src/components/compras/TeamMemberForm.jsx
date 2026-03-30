import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TeamMemberForm({
  isOpen,
  onClose,
  onSuccess,
}) {
  const [selectedUser, setSelectedUser] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedUser('');
      setSaving(false);
    }
  }, [isOpen]);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users-all'],
    queryFn: async () => {
      const res = await base44.entities.User.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen,
  });

  const { data: teamMembers = [], isLoading: loadingTeam } = useQuery({
    queryKey: ['team-members-all'],
    queryFn: async () => {
      const res = await base44.entities.TeamMember.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen,
  });

  const availableUsers = useMemo(() => {
    const existingEmails = new Set(
      teamMembers
        .map((m) => String(m?.user_email || '').trim().toLowerCase())
        .filter(Boolean)
    );

    return users.filter((u) => {
      const email = String(u?.email || '').trim().toLowerCase();
      return email && !existingEmails.has(email);
    });
  }, [users, teamMembers]);

  const handleAdd = async () => {
    if (saving) return;

    if (!selectedUser) {
      toast.error('Selecione um usuário para adicionar.');
      return;
    }

    const user = users.find(
      (u) =>
        String(u?.email || '').trim().toLowerCase() ===
        String(selectedUser).trim().toLowerCase()
    );

    if (!user) {
      toast.error('Usuário selecionado não encontrado.');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        user_email: user.email,
        user_name: user.name || user.full_name || user.email,
      };

      const created = await base44.entities.TeamMember.create(payload);

      // 🔴 GARANTIA REAL DE SUCESSO
      if (!created || !created.id) {
        throw new Error('Falha ao confirmar gravação do membro.');
      }

      toast.success(`✅ Membro adicionado: ${payload.user_name}`);

      // 🔥 garante atualização externa
      if (typeof onSuccess === 'function') {
        await onSuccess(created);
      }

      setSelectedUser('');
      onClose?.();

    } catch (e) {
      console.error('Erro ao adicionar membro:', e);

      toast.error(
        e?.message || 'Erro ao salvar o membro. Tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  };

  const isBusy = saving || loadingUsers || loadingTeam;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !saving) onClose?.();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar membro</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Selecionar usuário</Label>

            <Select
              value={selectedUser}
              onValueChange={setSelectedUser}
              disabled={isBusy}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingUsers || loadingTeam
                      ? 'Carregando usuários...'
                      : availableUsers.length === 0
                      ? 'Nenhum usuário disponível'
                      : 'Selecione um usuário'
                  }
                />
              </SelectTrigger>

              <SelectContent>
                {availableUsers.length > 0 ? (
                  availableUsers.map((user) => (
                    <SelectItem
                      key={user.id || user.email}
                      value={user.email}
                    >
                      {user.name || user.full_name || user.email}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__empty__" disabled>
                    Nenhum usuário disponível para inclusão
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onClose?.()}
              disabled={saving}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={handleAdd}
              disabled={
                isBusy ||
                !selectedUser ||
                selectedUser === '__empty__'
              }
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Adicionar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
