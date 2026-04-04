import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyCoordinators } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

function getRubricaDisplayName(rubrica) {
  return (
    rubrica?.rubrica ||
    rubrica?.nome ||
    rubrica?.descricao ||
    rubrica?.titulo ||
    'Rubrica sem nome'
  );
}

function normalizeString(value) {
  return String(value || '').trim();
}

export default function TeamPaymentSubmit({ userEmail }) {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    valor: '',
    descricao: '',
    rubrica_id: '',
    file: null
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 500)
  });

  const { data: member = null } = useQuery({
    queryKey: ['team-member-own', userEmail],
    queryFn: async () => {
      const rows = await base44.entities.TeamMember.filter({ user_email: userEmail });
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    enabled: !!userEmail
  });

  const allRubricas = useMemo(() => {
    return [...(rubricas || [])].sort((a, b) =>
      getRubricaDisplayName(a).localeCompare(getRubricaDisplayName(b), 'pt-BR')
    );
  }, [rubricas]);

  const suggestedRubricaId = useMemo(() => {
    return normalizeString(
      member?.rubrica_id ||
      member?.rubricaId ||
      member?.budget_rubrica_id ||
      member?.linha_rubrica_id ||
      ''
    );
  }, [member]);

  const suggestedRubrica = useMemo(() => {
    if (!suggestedRubricaId) return null;
    return allRubricas.find((r) => r.id === suggestedRubricaId) || null;
  }, [allRubricas, suggestedRubricaId]);

  const selectedRubrica = useMemo(() => {
    if (!form.rubrica_id) return null;
    return allRubricas.find((r) => r.id === form.rubrica_id) || null;
  }, [allRubricas, form.rubrica_id]);

  useEffect(() => {
    if (!open) return;
    if (form.rubrica_id) return;
    if (!suggestedRubricaId) return;

    setForm((prev) => ({
      ...prev,
      rubrica_id: suggestedRubricaId
    }));
  }, [open, form.rubrica_id, suggestedRubricaId]);

  async function handleSubmit() {
    if (!form.rubrica_id) {
      toast.error('Selecione uma rubrica antes de enviar.');
      return;
    }

    if (!form.valor || Number(form.valor) <= 0) {
      toast.error('Informe um valor válido.');
      return;
    }

    try {
      setSubmitting(true);

      const rubricaNome =
        getRubricaDisplayName(selectedRubrica) ||
        normalizeString(member?.rubrica_nome) ||
        '';

      const payload = {
        user_email: userEmail,
        user_name: member?.user_name || member?.nome || '',
        valor_nf: Number(form.valor),
        valor_parcela_previsto: Number(form.valor),
        descricao: form.descricao,
        rubrica_id: form.rubrica_id,
        rubrica_nome: rubricaNome,
        status: 'AGUARDANDO_APROVACAO'
      };

      await base44.entities.TeamPayment.create(payload);

      await notifyCoordinators({
        message: `Novo pagamento enviado por ${userEmail}`
      });

      toast.success('Pagamento enviado com sucesso');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['team-payments-review'] }),
        queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
        queryClient.invalidateQueries({ queryKey: ['rubricas-total-utilizado'] }),
      ]);

      setOpen(false);

      setForm({
        valor: '',
        descricao: '',
        rubrica_id: '',
        file: null
      });

    } catch (e) {
      toast.error(e?.message || 'Erro ao enviar pagamento');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
      >
        Novo envio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo pagamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Rubrica</Label>

              {suggestedRubrica && (
                <div className="text-xs text-blue-700 font-medium">
                  Sugestão automática: <b>{getRubricaDisplayName(suggestedRubrica)}</b>
                </div>
              )}

              <Select
                value={form.rubrica_id}
                onValueChange={(value) =>
                  setForm({ ...form, rubrica_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a rubrica" />
                </SelectTrigger>
                <SelectContent>
                  {allRubricas.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {getRubricaDisplayName(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!!form.rubrica_id && (
                <div className="text-xs text-emerald-700 font-medium">
                  Rubrica que será gravada: <b>{getRubricaDisplayName(selectedRubrica)}</b>
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : 'Enviar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
