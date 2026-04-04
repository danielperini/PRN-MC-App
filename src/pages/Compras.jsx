import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

function toBRL(v) {
  const n = Number(v) || 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function normalize(v) {
  return String(v || '').toUpperCase();
}

export default function TeamPaymentReview() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState({});

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments'],
    queryFn: () => base44.entities.TeamPayment.list()
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list()
  });

  const rubricaOptions = useMemo(() => {
    return rubricas.map(r => ({
      value: r.id,
      label: r.nome
    }));
  }, [rubricas]);

  const handleSaveRubrica = async (paymentId, rubricaId) => {
    try {
      setSaving(s => ({ ...s, [paymentId]: true }));

      await base44.entities.TeamPayment.update(paymentId, {
        rubrica_id: rubricaId
      });

      toast.success('Rubrica vinculada com sucesso');

      queryClient.invalidateQueries(['team-payments']);

    } catch (e) {
      toast.error('Erro ao salvar rubrica');
    } finally {
      setSaving(s => ({ ...s, [paymentId]: false }));
    }
  };

  const handleApprove = async (payment) => {
    if (!payment.rubrica_id) {
      toast.error('Selecione uma rubrica antes de aprovar');
      return;
    }

    await base44.functions.processTeamPayment({
      action: 'approve_coord',
      paymentId: payment.id
    });

    queryClient.invalidateQueries(['team-payments']);
  };

  const handlePay = async (payment) => {
    if (!payment.rubrica_id) {
      toast.error('Pagamento bloqueado: sem rubrica');
      return;
    }

    await base44.functions.processTeamPayment({
      action: 'mark_paid',
      paymentId: payment.id
    });

    queryClient.invalidateQueries(['team-payments']);
  };

  return (
    <div className="space-y-4">
      {payments.map(payment => {
        const status = normalize(payment.status);

        // 🔥 CORREÇÃO AQUI (ESSENCIAL)
        const showRubricaSelector =
          !payment.rubrica_id ||
          status === 'AGUARDANDO_APROVACAO' ||
          status === 'APROVADO_COORD';

        return (
          <div key={payment.id} className="border rounded-lg p-4 space-y-2">
            <div className="text-sm font-medium">
              {payment.email}
            </div>

            <div className="text-sm">
              {payment.mes_referencia}/{payment.ano}
            </div>

            <div className="text-sm">
              Status: {payment.status}
            </div>

            <div className="text-sm">
              Valor: {toBRL(payment.valor_nf || payment.valor_parcela_previsto)}
            </div>

            <div className="text-sm">
              Rubrica: {payment.rubrica_nome || '—'}
            </div>

            {showRubricaSelector && (
              <div className="flex gap-2">
                <Select
                  onValueChange={(v) => handleSaveRubrica(payment.id, v)}
                  defaultValue={payment.rubrica_id || ''}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Selecionar rubrica" />
                  </SelectTrigger>

                  <SelectContent>
                    {rubricaOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  disabled={saving[payment.id]}
                  onClick={() => handleSaveRubrica(payment.id, payment.rubrica_id)}
                >
                  Salvar
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              {status === 'AGUARDANDO_APROVACAO' && (
                <Button onClick={() => handleApprove(payment)}>
                  Aprovar
                </Button>
              )}

              {status === 'APROVADO_COORD' && (
                <Button onClick={() => handlePay(payment)}>
                  Pagar
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
