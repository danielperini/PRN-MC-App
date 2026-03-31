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
  'Consultoria de Programação',
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
  if (!budgetLine) return 'Rubrica';

  const codigo = String(budgetLine.codigo || '').trim();
  const descricao = String(
    budgetLine.descricao || budgetLine.nome || budgetLine.name || ''
  ).trim();

  if (codigo && descricao) return `${codigo} — ${descricao}`;
  return codigo || descricao || 'Rubrica';
}

function toNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
    numero_parcelas: '',
    valor_parcela: '',
    valor_total: '',
    telefone: '',
    status: 'ATIVO',
  });

  useEffect(() => {
    if (!isOpen) {
      setMode('select');
      setSelectedUser('');
      setSaving(false);
      setForm({
        user_email: '',
        user_name: '',
        funcao: '',
        role: '',
        budgetline_id: '',
        parcelas: '',
        numero_parcelas: '',
        valor_parcela: '',
        valor_total: '',
        telefone: '',
        status: 'ATIVO',
      });
      return;
    }

    if (editingMember) {
      setMode('form');
      setForm({
        user_email: editingMember?.user_email || '',
        user_name: editingMember?.user_name || editingMember?.nome || '',
        funcao: editingMember?.funcao || editingMember?.role || '',
        role: editingMember?.role || editingMember?.funcao || '',
        budgetline_id:
          editingMember?.budgetline_id ||
          editingMember?.budget_line_id ||
          '',
        parcelas:
          editingMember?.parcelas ||
          editingMember?.numero_parcelas ||
          '',
        numero_parcelas:
          editingMember?.numero_parcelas ||
          editingMember?.parcelas ||
          '',
        valor_parcela: editingMember?.valor_parcela || '',
        valor_total: editingMember?.valor_total || '',
        telefone: editingMember?.telefone || '',
        status: editingMember?.status || 'ATIVO',
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

  const { data: teamMembers = [], isLoading: loadingTeamMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await base44.entities.TeamMember.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen,
  });

  const { data: budgetLinesFromDB = [], isLoading: loadingBudgetLines } = useQuery({
    queryKey: ['team-member-form-budget-lines'],
    queryFn: async () => {
      const res = await base44.entities.BudgetLine.list();
      return Array.isArray(res) ? res : [];
    },
    enabled: isOpen && (!Array.isArray(budgetLines) || budgetLines.length === 0),
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

  const finalBudgetLines = useMemo(() => {
    const source =
      Array.isArray(budgetLines) && budgetLines.length > 0
        ? budgetLines
        : Array.isArray(budgetLinesFromDB)
          ? budgetLinesFromDB
          : [];

    const filtradas3Aditivo = source.filter((b) =>
      String(b?.codigo || '').startsWith('MC3A')
    );

    return filtradas3Aditivo.length > 0 ? filtradas3Aditivo : source;
  }, [budgetLines, budgetLinesFromDB]);

  const loadingSelectData = loadingUsers || loadingTeamMembers;

  const handleSelectUser = () => {
    const user = availableUsers.find(
      (u) =>
        String(u?.email || '').trim().toLowerCase() ===
        String(selectedUser || '').trim().toLowerCase()
    );

    if (!user) {
      toast.error('Selecione um usuário válido.');
      return;
    }

    setForm({
      user_email: user.email || '',
      user_name: user.name || user.full_name || user.email || '',
      funcao: '',
      role: '',
      budgetline_id: '',
      parcelas: '',
      numero_parcelas: '',
      valor_parcela: '',
      valor_total: '',
      telefone: user.phone || user.telefone || '',
      status: 'ATIVO',
    });

    setMode('form');
  };

  const handleSave = async () => {
    if (saving) return;

    if (!String(form.user_email || '').trim()) {
      toast.error('Usuário inválido.');
      return;
    }

    if (!String(form.user_name || '').trim()) {
      toast.error('Preencha o nome.');
      return;
    }

    if (!String(form.funcao || form.role || '').trim()) {
      toast.error('Selecione o cargo / função.');
      return;
    }

    if (!normalizeBudgetLineId(form.budgetline_id)) {
      toast.error('Selecione a rubrica.');
      return;
    }

    setSaving(true);

    try {
      const numeroParcelas = toNumberOrZero(
        form.numero_parcelas || form.parcelas
      );
      const valorParcela = toNumberOrZero(form.valor_parcela);
      const valorTotal = toNumberOrZero(form.valor_total);

      const payload = {
        user_email: String(form.user_email || '').trim(),
        user_name: String(form.user_name || '').trim(),
        funcao: String(form.funcao || form.role || '').trim(),
        role: String(form.funcao || form.role || '').trim(),
        budgetline_id: normalizeBudgetLineId(form.budgetline_id),
        budget_line_id: normalizeBudgetLineId(form.budgetline_id),
        telefone: String(form.telefone || '').trim(),
        numero_parcelas: numeroParcelas,
        parcelas: numeroParcelas,
        valor_parcela: valorParcela,
        valor_total: valorTotal,
        status: String(form.status || 'ATIVO').trim() || 'ATIVO',
      };

      let result;
      if (editingMember?.id) {
        result = await base44.entities.TeamMember.update(editingMember.id, payload);
      } else {
        result = await base44.entities.TeamMember.create(payload);
      }

      if (!result || !result.id) {
        throw new Error('Erro ao salvar membro.');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-members'] }),
        queryClient.invalidateQueries({ queryKey: ['team-members-all'] }),
        queryClient.invalidateQueries({ queryKey: ['users-all'] }),
      ]);

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['team-members'] }),
        queryClient.refetchQueries({ queryKey: ['users-all'] }),
      ]);

      if (editingMember?.id) {
        toast.success('Dados da equipe atualizados com sucesso');
      } else {
        toast.success('Novo membro adicionado com sucesso');
      }

      if (typeof onSuccess === 'function') {
        await onSuccess(result);
      }

      onClose?.();
    } catch (error) {
      console.error('Erro ao salvar TeamMember:', error);
      toast.error(error?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !saving) onClose?.();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingMember ? 'Editar equipe' : 'Adicionar membro'}
          </DialogTitle>
        </DialogHeader>

        {mode === 'select' && !editingMember && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Selecionar usuário</Label>
              <Select
                value={selectedUser}
                onValueChange={setSelectedUser}
                disabled={loadingSelectData || saving}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingSelectData
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
                        {(user.name || user.full_name || user.email)} — Transformar em membro
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
                onClick={handleSelectUser}
                disabled={!selectedUser || selectedUser === '__empty__' || saving}
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {mode === 'form' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.user_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, user_name: e.target.value }))
                }
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Cargo / Função</Label>
              <Select
                value={String(form.funcao || form.role || '')}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    funcao: value,
                    role: value,
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cargo / função" />
                </SelectTrigger>

                <SelectContent>
                  {CARGOS_FUNCOES.map((cargo) => (
                    <SelectItem key={cargo} value={cargo}>
                      {cargo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Rubrica</Label>
              <Select
                value={normalizeBudgetLineId(form.budgetline_id)}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    budgetline_id: value,
                  }))
                }
                disabled={saving || loadingBudgetLines}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingBudgetLines
                        ? 'Carregando rubricas...'
                        : 'Selecione a rubrica'
                    }
                  />
                </SelectTrigger>

                <SelectContent>
                  {finalBudgetLines.length > 0 ? (
                    finalBudgetLines.map((budgetLine) => (
                      <SelectItem
                        key={budgetLine.id}
                        value={String(budgetLine.id)}
                      >
                        {getBudgetLineLabel(budgetLine)}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__sem_rubrica__" disabled>
                      Nenhuma rubrica disponível
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.telefone || ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, telefone: e.target.value }))
                }
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Número de parcelas</Label>
              <Input
                type="number"
                value={form.numero_parcelas || form.parcelas || ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    numero_parcelas: e.target.value,
                    parcelas: e.target.value,
                  }))
                }
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor da parcela</Label>
              <Input
                type="number"
                value={form.valor_parcela || ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, valor_parcela: e.target.value }))
                }
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor total</Label>
              <Input
                type="number"
                value={form.valor_total || ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, valor_total: e.target.value }))
                }
                disabled={saving}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!editingMember) {
                    setMode('select');
                  } else {
                    onClose?.();
                  }
                }}
                disabled={saving}
              >
                {editingMember ? 'Cancelar' : 'Voltar'}
              </Button>

              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
              >
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
