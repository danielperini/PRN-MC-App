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
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_FORM = {
  user_email: '',
  user_name: '',
  budgetline_id: '',
  rubrica_id: '',
};

function normalizeForm(data) {
  return {
    ...EMPTY_FORM,
    ...(data || {}),
    budgetline_id:
      data?.budgetline_id ||
      data?.budget_line_id ||
      data?.rubrica_id ||
      '',
    rubrica_id:
      data?.rubrica_id ||
      data?.budgetline_id ||
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

  /* 🔥 FALLBACK: BUSCA DIRETO NO BANCO */
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

  const set = (field, value) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
      budgetline_id: value,
      rubrica_id: value,
    }));
  };

  /* 🔥 CORREÇÃO PRINCIPAL */
  const finalBudgetLines = useMemo(() => {
    if (budgetLines && budgetLines.length > 0) return budgetLines;
    return budgetLinesFromDB;
  }, [budgetLines, budgetLinesFromDB]);

  const budgetOptions = useMemo(() => {
    return (finalBudgetLines || [])
      .filter(b => !!b?.id)
      .map(b => ({
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

    if (!form.budgetline_id) {
      toast.error('Selecione a rubrica/linha');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...form,
        budgetline_id: form.budgetline_id,
        rubrica_id: form.budgetline_id,
      };

      if (editingMember?.id) {
        await base44.entities.TeamMember.update(editingMember.id, payload);
      } else {
        await base44.entities.TeamMember.create(payload);
      }

      toast.success('Salvo');
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
          <DialogTitle>Editar equipe</DialogTitle>
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
            <Label>Rubrica / Linha Orçamentária</Label>

            <Select
              value={form.budgetline_id || ''}
              onValueChange={(v) => set('budgetline_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>

              <SelectContent>

                {budgetOptions.length === 0 && (
                  <div className="px-2 py-2 text-xs text-gray-500">
                    Nenhuma linha encontrada
                  </div>
                )}

                {budgetOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}

              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin w-4 h-4"/> : 'Salvar'}
          </Button>

        </form>

      </DialogContent>
    </Dialog>
  );
}
