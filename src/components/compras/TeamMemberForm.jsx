import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const CARGOS_FUNCOES = [
  'Educador(a)',
  'Produtor(a)',
  'Assistente de Produção',
  'Coordenador(a)',
  'Coordenador(a) de Produção',
  'Coordenador(a) Administrativo(a)',
  'Coordenador(a) de Comunicação',
  'Comunicador(a)',
  'Designer',
  'Fotógrafo(a)',
  'Videomaker',
  'Arte-educador(a)',
  'Mediador(a)',
  'Oficineiro(a)',
  'Curador(a)',
  'Pesquisador(a)',
  'Assistente',
  'Auxiliar',
  'Prestador(a) de Serviço',
  'Outro',
];

function normalizeBudgetLineId(value) {
  return String(value || '').trim();
}

function getBudgetLineLabel(budgetLine) {
  const codigo = String(budgetLine?.codigo || '').trim();
  const descricao = String(
    budgetLine?.descricao || budgetLine?.nome || budgetLine?.name || ''
  ).trim();

  if (codigo && descricao) return `${codigo} — ${descricao}`;
  return codigo || descricao || 'Rubrica';
}

export default function TeamMemberForm({
  isOpen,
  onClose,
  onSuccess,
  editingMember = null,
  budgetLines = [],
}) {
  const queryClient = useQueryClient();

  const [mode, setMode] = useState('select');
  const [selectedUser, setSelectedUser] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    user_email: '',
    user_name: '',
    funcao: '',
    role: '',
    budgetline_id: '',
    parcelas: '',
    valor_parcela: '',
    valor_total: '',
    telefone: '',
  });

  // 🔹 LOAD USERS
  const { data: users = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: async () => {
      const res = await base44.entities.User.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen,
  });

  // 🔹 TEAM MEMBERS
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await base44.entities.TeamMember.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen,
  });

  // 🔹 RUBRICAS (fallback)
  const { data: budgetLinesFromDB = [] } = useQuery({
    queryKey: ['budget-lines-form'],
    queryFn: async () => {
      const res = await base44.entities.BudgetLine.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen && (!budgetLines || budgetLines.length === 0),
  });

  // 🔥 FILTRO 3º ADITIVO (MC3A)
  const finalBudgetLines = useMemo(() => {
    const source =
      budgetLines && budgetLines.length > 0
        ? budgetLines
        : budgetLinesFromDB;

    const filtradas = (source || []).filter((b) =>
      String(b?.codigo || '').startsWith('MC3A')
    );

    // fallback (se não encontrar nada)
    return filtradas.length > 0 ? filtradas : source;
  }, [budgetLines, budgetLinesFromDB]);

  // 🔹 USERS DISPONÍVEIS
  const availableUsers = useMemo(() => {
    const existing = new Set(
      teamMembers.map((m) =>
        String(m?.user_email || '').toLowerCase()
      )
    );

    return users.filter((u) => {
      const email = String(u?.email || '').toLowerCase();
      return email && !existing.has(email);
    });
  }, [users, teamMembers]);

  // 🔹 INIT FORM
  useEffect(() => {
    if (!isOpen) return;

    if (editingMember) {
      setMode('form');
      setForm({
        user_email: editingMember?.user_email || '',
        user_name: editingMember?.user_name || '',
        funcao: editingMember?.funcao || '',
        role: editingMember?.role || '',
        budgetline_id:
          editingMember?.budgetline_id ||
          editingMember?.budget_line_id ||
          '',
        parcelas: editingMember?.parcelas || '',
        valor_parcela: editingMember?.valor_parcela || '',
        valor_total: editingMember?.valor_total || '',
        telefone: editingMember?.telefone || '',
      });
    }
  }, [isOpen, editingMember]);

  const handleSelectUser = () => {
    const user = availableUsers.find((u) => u.email === selectedUser);
    if (!user) return;

    setForm({
      user_email: user.email,
      user_name: user.name || user.email,
      funcao: '',
      role: '',
      budgetline_id: '',
      parcelas: '',
      valor_parcela: '',
      valor_total: '',
      telefone: '',
    });

    setMode('form');
  };

  const handleSave = async () => {
    if (!form.user_email) {
      toast.error('Usuário inválido');
      return;
    }

    if (!form.funcao) {
      toast.error('Selecione o cargo');
      return;
    }

    if (!form.budgetline_id) {
      toast.error('Selecione a rubrica');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...form,
        budget_line_id: form.budgetline_id,
      };

      let result;

      if (editingMember?.id) {
        result = await base44.entities.TeamMember.update(
          editingMember.id,
          payload
        );
      } else {
        result = await base44.entities.TeamMember.create(payload);
      }

      await queryClient.invalidateQueries({ queryKey: ['team-members'] });

      await onSuccess?.(result);
      onClose?.();
    } catch (err) {
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

        {mode === 'select' && !editingMember && (
          <div className="space-y-4">
            <Label>Selecionar usuário</Label>

            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>

              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.email} value={u.email}>
                    {u.name || u.email} — transformar em membro
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleSelectUser}>Continuar</Button>
          </div>
        )}

        {mode === 'form' && (
          <div className="space-y-4">
            <Input
              value={form.user_name}
              onChange={(e) =>
                setForm({ ...form, user_name: e.target.value })
              }
            />

            <Select
              value={form.funcao}
              onValueChange={(v) =>
                setForm({ ...form, funcao: v, role: v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Cargo / função" />
              </SelectTrigger>

              <SelectContent>
                {CARGOS_FUNCOES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 🔥 RUBRICAS FILTRADAS */}
            <Select
              value={form.budgetline_id}
              onValueChange={(v) =>
                setForm({ ...form, budgetline_id: v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a rubrica (3º aditivo)" />
              </SelectTrigger>

              <SelectContent>
                {finalBudgetLines.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {getBudgetLineLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
