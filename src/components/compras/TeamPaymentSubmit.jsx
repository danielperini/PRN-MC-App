import React, { useMemo, useState } from 'react';
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
  Loader2, Upload, Brain, FileCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

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
    queryFn: () => base44.entities.Rubrica.list()
  });

  const handleSubmit = async () => {
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

      const payload = {
        user_email: userEmail,
        valor: Number(form.valor),
        descricao: form.descricao,
        rubrica_id: form.rubrica_id,
        status: 'ENVIADO'
      };

      await base44.entities.TeamPayment.create(payload);

      await notifyCoordinators({
        message: `Novo pagamento enviado por ${userEmail}`
      });

      toast.success('Pagamento enviado com sucesso');

      queryClient.invalidateQueries(['team-payments']);
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
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
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

            <div>
              <Label>Rubrica</Label>
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
                  {rubricas.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
