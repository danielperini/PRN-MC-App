import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyUser } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
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
  if (s === 'DEVOLVIDO_REVISAO') return { label: 'Devolvido', className: 'bg-orange-100 text-orange-800' };
  return { label: status || '—', className: 'bg-gray-100 text-gray-700' };
}

function buildAppUrl() {
  return `${window.location.origin}/Compras`;
}

function getRubricaNome(payment) {
  return payment?.rubrica_nome || payment?.rubrica || '—';
}

function extractError(e) {
  return e?.message || e?.data?.error || 'Erro ao processar.';
}

export default function TeamPaymentReview({ members = [] }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState({});

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments-review'],
    queryFn: () => base44.entities.TeamPayment.list('-created_date', 500),
  });

  const orderedPayments = useMemo(() =>
    [...payments].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)),
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
        action_url: buildAppUrl()
      });

      await refresh();

    } catch (e) {
      toast.error(extractError(e));
    } finally {
      setSaving(false);
    }
  }

  async function pay(payment) {
    if (markingPaid[payment.id]) return;

    setMarkingPaid(m => ({ ...m, [payment.id]: true }));

    try {
      const res = await base44.functions.invoke('processTeamPayment', {
        payment_id: payment.id,
        action: 'pay'
      });

      if (res?.data?.error) throw new Error(res.data.error);

      toast.success('Pagamento realizado');

      await refresh();

    } catch (e) {
      toast.error(extractError(e));
    } finally {
      setMarkingPaid(m => ({ ...m, [payment.id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {orderedPayments.map(payment => {
        const badge = getStatusBadge(payment.status);
        const status = String(payment.status || '').toUpperCase();

        return (
          <div key={payment.id} className="border p-4 rounded-xl space-y-3">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{payment.user_name}</div>
                <div className="text-xs">{payment.mes_referencia}/{payment.ano}</div>
              </div>
              <Badge className={badge.className}>{badge.label}</Badge>
            </div>

            <div>Valor: <b>{formatBRL(payment.valor_nf)}</b></div>
            <div>Rubrica: <b>{getRubricaNome(payment)}</b></div>

            <div className="flex gap-2">
              {status === 'AGUARDANDO_APROVACAO' && (
                <Button onClick={() => approve(payment)} disabled={saving}>
                  {saving ? 'Processando...' : 'Aprovar'}
                </Button>
              )}

              {status === 'APROVADO_COORD' && (
                <Button onClick={() => pay(payment)} disabled={markingPaid[payment.id]}>
                  {markingPaid[payment.id] ? 'Processando...' : 'Marcar como pago'}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
