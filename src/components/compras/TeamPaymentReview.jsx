import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyUser } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

function toNumber(v) { return Number(v) || 0; }

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStatusBadge(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PAGO') return { label: 'Pago', className: 'bg-emerald-100 text-emerald-700' };
  if (s === 'APROVADO_COORD') return { label: 'Aprovado', className: 'bg-blue-100 text-blue-700' };
  if (s === 'AGUARDANDO_APROVACAO') return { label: 'Aguardando aprovação', className: 'bg-amber-100 text-amber-800' };
  return { label: status || '—', className: 'bg-gray-100 text-gray-700' };
}

export default function TeamPaymentReview() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [loadingPay, setLoadingPay] = useState({});

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments-review'],
    queryFn: () => base44.entities.TeamPayment.list('-created_date', 500),
  });

  const ordered = useMemo(() =>
    [...payments].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
    [payments]
  );

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries(['team-payments-review']),
      queryClient.invalidateQueries(['team-payments']),
      queryClient.invalidateQueries(['rubricas']),
    ]);
  }

  async function approve(payment) {
    if (saving) return;
    setSaving(true);

    try {
      const res = await base44.functions.invoke('processTeamPayment', {
        payment_id: payment.id,
        action: 'approve'
      });

      if (res?.data?.error) throw new Error(res.data.error);

      toast.success('Pagamento aprovado com sucesso');

      await notifyUser(payment.user_email, {
        title: 'Pagamento aprovado',
        message: 'Sua nota fiscal foi aprovada',
        type: 'success',
        action_url: `${window.location.origin}/Compras`
      });

      await refresh();

    } catch (e) {
      toast.error(e.message || 'Erro ao aprovar');
    } finally {
      setSaving(false);
    }
  }

  async function pay(payment) {
    if (loadingPay[payment.id]) return;

    setLoadingPay(p => ({ ...p, [payment.id]: true }));

    try {
      const res = await base44.functions.invoke('processTeamPayment', {
        payment_id: payment.id,
        action: 'pay'
      });

      if (res?.data?.error) throw new Error(res.data.error);

      toast.success('Pagamento realizado');

      await refresh();

    } catch (e) {
      toast.error(e.message || 'Erro ao pagar');
    } finally {
      setLoadingPay(p => ({ ...p, [payment.id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {ordered.map(payment => {
        const status = String(payment.status || '').toUpperCase();
        const badge = getStatusBadge(status);

        return (
          <div key={payment.id} className="border rounded-xl p-4 space-y-3">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{payment.user_name}</div>
                <div className="text-xs">{payment.mes_referencia}/{payment.ano}</div>
              </div>
              <Badge className={badge.className}>{badge.label}</Badge>
            </div>

            <div>Valor: <b>{formatBRL(payment.valor_nf)}</b></div>
            <div>Rubrica: <b>{payment.rubrica_nome || '-'}</b></div>

            <div className="flex gap-2">
              {status === 'AGUARDANDO_APROVACAO' && (
                <Button onClick={() => approve(payment)} disabled={saving}>
                  {saving ? 'Processando...' : 'Aprovar'}
                </Button>
              )}

              {status === 'APROVADO_COORD' && (
                <Button onClick={() => pay(payment)} disabled={loadingPay[payment.id]}>
                  {loadingPay[payment.id] ? 'Processando...' : 'Marcar como pago'}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
