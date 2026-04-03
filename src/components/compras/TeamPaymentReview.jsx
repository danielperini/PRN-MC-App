import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyUser } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

function toNumber(v) {
  return Number(v) || 0;
}

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function getStatusBadge(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PAGO') return { label: 'Pago', className: 'bg-emerald-100 text-emerald-700' };
  if (s === 'APROVADO_COORD') return { label: 'Aprovado', className: 'bg-blue-100 text-blue-700' };
  if (s === 'AGUARDANDO_APROVACAO') return { label: 'Aguardando aprovação', className: 'bg-amber-100 text-amber-800' };
  if (s === 'DEVOLVIDO_REVISAO') return { label: 'Devolvido', className: 'bg-orange-100 text-orange-800' };
  return { label: status || '—', className: 'bg-gray-100 text-gray-700' };
}

function extractErrorMessage(err) {
  return (
    err?.data?.error ||
    err?.error ||
    err?.message ||
    'Erro ao processar'
  );
}

function getRubricaNome(payment) {
  return payment?.rubrica_nome || payment?.rubrica || '—';
}

function pickBestPayments(payments = []) {
  const map = new Map();

  for (const p of payments) {
    const key = `${p?.user_email || ''}_${p?.mes_referencia || ''}_${p?.ano || ''}`;
    const current = map.get(key);

    if (!current) {
      map.set(key, p);
      continue;
    }

    const currentValue = toNumber(current?.valor_nf || current?.valor_parcela_previsto);
    const nextValue = toNumber(p?.valor_nf || p?.valor_parcela_previsto);

    if (nextValue > currentValue) {
      map.set(key, p);
      continue;
    }

    const currentDate = new Date(current?.created_date || current?.created_at || 0).getTime();
    const nextDate = new Date(p?.created_date || p?.created_at || 0).getTime();

    if (nextDate > currentDate) {
      map.set(key, p);
    }
  }

  return Array.from(map.values());
}

export default function TeamPaymentReview() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [loadingPay, setLoadingPay] = useState({});

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments-review'],
    queryFn: () => base44.entities.TeamPayment.list('-created_date', 500),
  });

  const ordered = useMemo(() => {
    const unique = pickBestPayments(payments || []);
    return [...unique].sort(
      (a, b) =>
        new Date(b?.created_date || b?.created_at || 0).getTime() -
        new Date(a?.created_date || a?.created_at || 0).getTime()
    );
  }, [payments]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['team-payments-review'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas-total-utilizado'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
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

      const result = res?.data || res || {};

      if (result?.error) {
        throw new Error(result.error);
      }

      toast.success('Pagamento aprovado com sucesso');

      try {
        await notifyUser(payment.user_email, {
          title: 'Pagamento aprovado',
          message: 'Sua nota fiscal foi aprovada. O pagamento será efetuado em até 5 dias úteis.',
          type: 'success',
          action_url: `${window.location.origin}/Compras`
        });
      } catch (notifyErr) {
        console.warn('Falha ao notificar usuário', notifyErr);
      }

      await refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function pay(payment) {
    if (loadingPay[payment.id]) return;

    setLoadingPay((prev) => ({ ...prev, [payment.id]: true }));

    try {
      const res = await base44.functions.invoke('processTeamPayment', {
        payment_id: payment.id,
        action: 'pay'
      });

      const result = res?.data || res || {};

      if (result?.error) {
        throw new Error(result.error);
      }

      toast.success('Pagamento realizado');

      await refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoadingPay((prev) => ({ ...prev, [payment.id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {ordered.length === 0 && (
        <div className="border rounded-xl p-4 text-sm text-gray-500">
          Nenhum pagamento encontrado.
        </div>
      )}

      {ordered.map((payment) => {
        const status = String(payment?.status || '').toUpperCase();
        const badge = getStatusBadge(status);
        const valor = payment?.valor_nf || payment?.valor_parcela_previsto || 0;

        return (
          <div key={payment.id} className="border rounded-xl p-4 space-y-3">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{payment?.user_name || payment?.user_email}</div>
                <div className="text-xs">{payment?.mes_referencia}/{payment?.ano}</div>
              </div>
              <Badge className={badge.className}>{badge.label}</Badge>
            </div>

            <div>Valor: <b>{formatBRL(valor)}</b></div>
            <div>Rubrica: <b>{getRubricaNome(payment)}</b></div>

            <div className="flex gap-2">
              {status === 'AGUARDANDO_APROVACAO' && (
                <Button onClick={() => approve(payment)} disabled={saving}>
                  {saving ? 'Processando...' : 'Aprovar'}
                </Button>
              )}

              {status === 'APROVADO_COORD' && (
                <Button onClick={() => pay(payment)} disabled={!!loadingPay[payment.id]}>
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
