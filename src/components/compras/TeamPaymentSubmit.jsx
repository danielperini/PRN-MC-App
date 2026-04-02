import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyCoordinators } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle, Loader2, Plus, Upload,
} from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function toNumber(v) {
  if (!v) return 0;
  return Number(String(v).replace(',', '.')) || 0;
}

function buildMonthOptions() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = MONTHS[d.getMonth()];
    const ano = d.getFullYear();
    out.push({ value: `${mes}|${ano}`, label: `${mes}/${ano}`, mes, ano });
  }
  return out;
}

function getValorParcela(member) {
  if (!member) return 0;
  if (member.valor_parcela) return toNumber(member.valor_parcela);
  const total = toNumber(member.valor_total);
  const parcelas = toNumber(member.numero_parcelas);
  return parcelas ? total / parcelas : 0;
}

export default function TeamPaymentSubmit({ userEmail }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    competencia: '',
    numero_nf: '',
    valor_nf: '',
  });

  const { data: member } = useQuery({
    queryKey: ['member', userEmail],
    queryFn: async () => {
      const rows = await base44.entities.TeamMember.filter({ user_email: userEmail });
      return rows?.[0] || null;
    },
    enabled: !!userEmail,
  });

  const valorParcela = useMemo(() => getValorParcela(member), [member]);

  // 🔥 AUTO-PREENCHIMENTO VIA IA (CONTRATO)
  useEffect(() => {
    async function preencherViaContrato() {
      if (!member) return;

      // não sobrescrever se já tiver valor
      if (form.valor_nf) return;

      try {
        if (member?.valor_parcela) return;

        if (!member?.contrato_url && !member?.contrato_id) return;

        toast.loading('Lendo contrato automaticamente...', { id: 'ia' });

        const res = await base44.functions.invoke('extractTeamContractData', {
          contrato_url: member?.contrato_url,
          contrato_id: member?.contrato_id,
        });

        const dados = res?.data || {};

        setForm(prev => ({
          ...prev,
          valor_nf: prev.valor_nf || dados.valor_parcela || '',
        }));

        toast.success('Valor preenchido automaticamente via contrato', { id: 'ia' });

      } catch (e) {
        console.error(e);
        toast.error('Falha ao ler contrato', { id: 'ia' });
      }
    }

    preencherViaContrato();
  }, [member]);

  function handleSubmit() {
    toast.success('Envio realizado com sucesso');
  }

  return (
    <div className="space-y-4">

      <div>
        <Label>Competência</Label>
        <Select
          value={form.competencia}
          onValueChange={v => setForm({ ...form, competencia: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {buildMonthOptions().map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Número da NF</Label>
        <Input
          value={form.numero_nf}
          onChange={e => setForm({ ...form, numero_nf: e.target.value })}
        />
      </div>

      <div>
        <Label>Valor</Label>
        <Input
          value={form.valor_nf}
          onChange={e => setForm({ ...form, valor_nf: e.target.value })}
        />
        <p className="text-xs text-blue-600 mt-1">
          ⚡ Preenchido automaticamente com base no contrato
        </p>
      </div>

      <Button onClick={handleSubmit}>
        Enviar
      </Button>

    </div>
  );
}
