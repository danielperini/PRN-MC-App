import React, { useMemo, useState } from 'react';
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
  const [loading, setLoading] = useState(false);

  // 🔹 Buscar todos usuários
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => base44.entities.User.list(),
    enabled: isOpen,
  });

  // 🔹 Buscar membros já existentes
  const { data: teamMembers = [], isLoading: loadingTeam } = useQuery({
    queryKey: ['team-members-all'],
    queryFn: () => base44.entities.TeamMember.list(),
    enabled: isOpen,
  });

  // 🔹 Filtrar usuários que NÃO são equipe
  const availableUsers = useMemo(() => {
    const existingEmails = new Set(
      teamMembers.map(m => (m.user_email || '').toLowerCase())
    );

    return users.filter(u =>
      u.email && !existingEmails.has(u.email.toLowerCase())
    );
  }, [users, teamMembers]);

  const handleAdd = async () => {
    if (!selectedUser) {
      toast.error('Selecione um usuário');
      return;
    }

    const user = users.find(u => u.email === selectedUser);

    if (!user) {
      toast.error('Usuário inválido');
      return;
    }

    setLoading(true);

    try {
      await base44.entities.TeamMember.create({
        user_email: user.email,
        user_name: user.name || user.email,
      });

      toast.success('Membro adicionado');

      onSuccess?.();
      onClose?.();
      setSelectedUser('');

    } catch (e) {
      toast.error(e.message);
    }

    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar membro</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          <div>
            <Label>Selecionar usuário</Label>

            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>

              <SelectContent>
                {availableUsers.map(user => (
                  <SelectItem key={user.id} value={user.email}>
                    {user.name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleAdd} disabled={loading || loadingUsers || loadingTeam}>
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Adicionar'}
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  );
}
