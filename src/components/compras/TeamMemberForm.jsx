import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  editingMember = null,
  budgetLines = [],
}) {
  const [mode, setMode] = useState('select'); // select | form
  const [selectedUser, setSelectedUser] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    user_email: '',
    user_name: '',
    role: '',
    budgetline_id: '',
    parcelas: '',
    valor_parcela: '',
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOpen) {
      setMode('select');
      setSelectedUser('');
      setForm({
        user_email: '',
        user_name: '',
        role: '',
        budgetline_id: '',
        parcelas: '',
        valor_parcela: '',
      });
      setSaving(false);
    }

    if (editingMember && isOpen) {
      setMode('form');
      setForm({
        ...editingMember,
      });
    }
  }, [isOpen, editingMember]);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users-all'],
    queryFn: async () => {
      const res = await base44.entities.User.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen,
  });

  const { data: teamMembers = [], isLoading: loadingTeam } = useQuery({
    queryKey: ['team-members'],
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
  }, [users, teamMembers, editingMember]);

  const handleSelectUser = () => {
    const user = users.find((u) => u.email === selectedUser);
    if (!user) return;

    setForm({
      user_email: user.email,
      user_name: user.name || user.full_name || user.email,
      role: '',
      budgetline_id: '',
      parcelas: '',
      valor_parcela: '',
    });

    setMode('form');
  };

  const handleSave = async () => {
    if (saving) return;

    if (!form.user_email) {
      toast.error('Usuário inválido');
      return;
    }

    setSaving(true);

    try {
      let result;

      if (editingMember) {
        result = await base44.entities.TeamMember.update(
          editingMember.id,
          form
        );
      } else {
        result = await base44.entities.TeamMember.create(form);
      }

      if (!result || !result.id) {
        throw new Error('Erro ao salvar membro');
      }

      await queryClient.invalidateQueries({ queryKey: ['team-members'] });
      await queryClient.refetchQueries({ queryKey: ['team-members'] });

      if (onSuccess) await onSuccess(result);

      onClose?.();

    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingMember ? 'Editar equipe' : 'Adicionar membro'}
          </DialogTitle>
        </DialogHeader>

        {/* MODO SELECT */}
        {mode === 'select' && !editingMember && (
          <div className="space-y-4">
            <Label>Selecionar usuário</Label>

            <Select
              value={selectedUser}
              onValueChange={setSelectedUser}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>

              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.email} value={user.email}>
                    {user.name || user.full_name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleSelectUser} disabled={!selectedUser}>
              Continuar
            </Button>
          </div>
        )}

        {/* MODO FORM */}
        {mode === 'form' && (
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.user_name}
                onChange={(e) =>
                  setForm({ ...form, user_name: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Cargo / Função</Label>
              <Input
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Rubrica</Label>
              <Select
                value={form.budgetline_id}
                onValueChange={(v) =>
                  setForm({ ...form, budgetline_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar rubrica" />
                </SelectTrigger>

                <SelectContent>
                  {budgetLines.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nome || b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Número de parcelas</Label>
              <Input
                type="number"
                value={form.parcelas}
                onChange={(e) =>
                  setForm({ ...form, parcelas: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Valor da parcela</Label>
              <Input
                type="number"
                value={form.valor_parcela}
                onChange={(e) =>
                  setForm({ ...form, valor_parcela: e.target.value })
                }
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}