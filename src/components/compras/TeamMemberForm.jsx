import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const EMPTY_FORM = {
  user_email: '',
  user_name: '',
  funcao: '',
  telefone: '',
  tipo_pessoa: 'PF',
  cpf: '',
  cnpj: '',
  banco: '',
  agencia: '',
  conta: '',
  pix_key: '',
  budgetline_id: '',
};

function normalizeForm(data) {
  return {
    ...EMPTY_FORM,
    ...(data || {}),
    tipo_pessoa: data?.tipo_pessoa || 'PF',
    budgetline_id:
      data?.budgetline_id ||
      data?.budget_line_id ||
      '',
  };
}

export default function TeamMemberForm({
  isOpen,
  onClose,
  onSuccess,
  editingMember,
  budgetLines = [],
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(normalizeForm(editingMember));

  const { data: currentUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => base44.auth.me(),
  });

  const isSelfEdit =
    editingMember?.user_email &&
    currentUser?.email &&
    String(editingMember.user_email).toLowerCase() ===
      String(currentUser.email).toLowerCase();

  const { data: budgetLinesFromDB = [] } = useQuery({
    queryKey: ['team-form-budgetlines'],
    queryFn: () => base44.entities.BudgetLine.list('codigo', 200),
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen) {
      setForm(normalizeForm(editingMember));
    }
  }, [isOpen, editingMember]);

  const finalBudgetLines = useMemo(() => {
    if (budgetLines && budgetLines.length > 0) return budgetLines;
    return budgetLinesFromDB;
  }, [budgetLines, budgetLinesFromDB]);

  const budgetOptions = useMemo(() => {
    return (finalBudgetLines || [])
      .filter((b) => !!b?.id)
      .map((b) => ({
        id: b.id,
        label: `${b.codigo || ''} - ${b.descricao || ''}`,
      }));
  }, [finalBudgetLines]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.user_name) {
      toast.error('Nome obrigatório');
      return;
    }

    if (!form.budgetline_id && !isSelfEdit) {
      toast.error('Selecione a linha orçamentária');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...form,
        cpf: form.tipo_pessoa === 'PF' ? form.cpf : '',
        cnpj: form.tipo_pessoa === 'PJ' ? form.cnpj : '',
      };

      if (editingMember?.id) {
        await base44.entities.TeamMember.update(editingMember.id, payload);
      } else {
        await base44.entities.TeamMember.create(payload);
      }

      toast.success('Dados atualizados');
      onSuccess?.();
      onClose?.();
    } catch (e) {
      toast.error(e.message);
    }

    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSelfEdit ? 'Editar meu perfil' : editingMember?.id ? 'Editar equipe' : 'Adicionar membro'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <Label>Nome</Label>
            <Input
              value={form.user_name}
              onChange={(e) => setForm({ ...form, user_name: e.target.value })}
            />
          </div>

          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.user_email}
              disabled={isSelfEdit} // 🔥 bloqueado no perfil próprio
              onChange={(e) => setForm({ ...form, user_email: e.target.value })}
            />
          </div>

          <div>
            <Label>Função</Label>
            <Input
              value={form.funcao}
              onChange={(e) => setForm({ ...form, funcao: e.target.value })}
            />
          </div>

          <div>
            <Label>Telefone</Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </div>

          {!isSelfEdit && (
            <div>
              <Label>Linha Orçamentária</Label>
              <Select
                value={form.budgetline_id || ''}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, budgetline_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>

                <SelectContent>
                  {budgetOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Tipo de pessoa</Label>
            <Select
              value={form.tipo_pessoa}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  tipo_pessoa: v,
                  cpf: v === 'PF' ? form.cpf : '',
                  cnpj: v === 'PJ' ? form.cnpj : '',
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PF">PF</SelectItem>
                <SelectItem value="PJ">PJ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.tipo_pessoa === 'PF' && (
            <Input
              placeholder="CPF"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
            />
          )}

          {form.tipo_pessoa === 'PJ' && (
            <Input
              placeholder="CNPJ"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
            />
          )}

          <Input
            placeholder="Banco"
            value={form.banco}
            onChange={(e) => setForm({ ...form, banco: e.target.value })}
          />

          <Input
            placeholder="Agência"
            value={form.agencia}
            onChange={(e) => setForm({ ...form, agencia: e.target.value })}
          />

          <Input
            placeholder="Conta"
            value={form.conta}
            onChange={(e) => setForm({ ...form, conta: e.target.value })}
          />

          <Input
            placeholder="PIX"
            value={form.pix_key}
            onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
          />

          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : 'Salvar'}
          </Button>

        </form>
      </DialogContent>
    </Dialog>
  );
}
