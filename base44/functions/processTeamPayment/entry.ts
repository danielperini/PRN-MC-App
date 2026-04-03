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
  if (typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}/Compras`;
  return 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras';
}

function getRubricaNome(payment) {
  return payment?.rubrica_nome || payment?.rubrica || '—';
}

function extractEffectiveErrorMessage(error) {
  const message =
    error?.message ||
    error?.data?.error ||
    error?.error ||
    'Erro ao processar.';

  if (String(message).includes('Pagamento duplicado removido automaticamente')) {
    return 'Havia um pagamento duplicado. O sistema limpou o registro e você pode tentar novamente.';
  }

  return message;
}

export default function TeamPaymentReview({ members = [] }) {
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState(null);
  const [action, setAction] = useState(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState({});

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments-review'],
    queryFn: () => base44.entities.TeamPayment.list('-created_date', 500),
  });

  const uniquePayments = useMemo(() => {
    const map = new Map();

    for (const p of payments) {
      const key = `${p.user_email}_${p.mes_referencia}_${p.ano}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, p);
        continue;
      }

      const currentValue = toNumber(p.valor_nf || p.valor_parcela_previsto);
      const existingValue = toNumber(existing.valor_nf || existing.valor_parcela_previsto);

      if (currentValue > existingValue) {
        map.set(key, p);
      } else if (new Date(p.created_date || 0) > new Date(existing.created_date || 0)) {
        map.set(key, p);
      }
    }

    return Array.from(map.values());
  }, [payments]);

  const orderedPayments = useMemo(() =>
    [...uniquePayments].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)),
    [uniquePayments]
  );

  function getMember(p) {
    return members.find(m => m.id === p?.team_member_id) || null;
  }

  async function sendStatusNotif(payment, status, obs) {
    try {
      await base44.functions.invoke('notifyTeamPaymentStatusChange', {
        payment_id: payment?.id,
        status,
        requester_email: payment?.user_email || '',
        team_member_name: payment?.user_name || '',
        mes: payment?.mes_referencia || '',
        ano: payment?.ano || '',
        valor: payment?.valor_nf || payment?.valor_parcela_previsto || 0,
        observacoes: obs || '',
        nota_fiscal_url: payment?.nota_fiscal_url || '',
        xml_url: payment?.xml_url || '',
        app_link: buildAppUrl(),
      });
    } catch (e) {
      console.warn('Falha na notificação de status do pagamento:', e);
    }
  }

  async function notifyRequesterSafely(payment, type, message, title) {
    try {
      await notifyUser(payment.user_email, {
        title,
        message,
        type,
        action_url: `${window.location.origin}/Compras`,
      });
    } catch (e) {
      console.warn('Falha na notificação ao usuário:', e);
    }
  }

  async function refreshPayments() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['team-payments-review'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas-total-utilizado'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
    ]);
  }

  async function handleConfirm() {
    if (!reviewing || !action || saving) return;

    setSaving(true);

    try {
      const response = await base44.functions.invoke('processTeamPayment', {
        payment_id: reviewing.id,
        action: action === 'approve' ? 'approve' : 'return'
      });

      const result = response?.data || response || {};

      if (result?.error) {
        throw new Error(result.error);
      }

      if (action === 'approve') {
        await sendStatusNotif(reviewing, 'APROVADO_COORD', comment);
        await notifyRequesterSafely(
          reviewing,
          'PAYMENT_APPROVED',
          'Sua nota fiscal foi aprovada.',
          '✅ Nota fiscal aprovada'
        );
        toast.success('Pagamento aprovado com sucesso.');
      }

      if (action === 'return') {
        await sendStatusNotif(reviewing, 'DEVOLVIDO_REVISAO', comment);
        await notifyRequesterSafely(
          reviewing,
          'PAYMENT_RETURNED',
          `Sua NF foi devolvida. Motivo: ${comment || 'Revisão necessária.'}`,
          '⚠️ Nota devolvida'
        );
        toast.success('Pagamento devolvido com sucesso.');
      }

      setReviewing(null);
      setAction(null);
      setComment('');

      await refreshPayments();
    } catch (e) {
      toast.error(extractEffectiveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function marcarComoPago(payment) {
    if (markingPaid[payment.id]) return;

    setMarkingPaid(m => ({ ...m, [payment.id]: true }));

    try {
      const response = await base44.functions.invoke('processTeamPayment', {
        payment_id: payment.id,
        action: 'pay'
      });

      const result = response?.data || response || {};

      if (result?.error) {
        throw new Error(result.error);
      }

      await sendStatusNotif(payment, 'PAGO', 'Pagamento realizado.');
      await notifyRequesterSafely(
        payment,
        'PAYMENT_DONE',
        'Pagamento confirmado.',
        '💰 Pagamento realizado'
      );

      toast.success('Pagamento realizado com sucesso.');

      await refreshPayments();
    } catch (e) {
      toast.error(extractEffectiveErrorMessage(e));
    } finally {
      setMarkingPaid(m => ({ ...m, [payment.id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {orderedPayments.length === 0 && (
        <div className="rounded-xl border p-4 text-sm text-gray-500">
          Nenhum envio encontrado.
        </div>
      )}

      {orderedPayments.map(payment => {
        const member = getMember(payment);
        const badge = getStatusBadge(payment?.status);
        const status = String(payment?.status || '').toUpperCase();

        return (
          <div key={payment.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">
                  {member?.user_name || payment?.user_name || payment?.user_email}
                </div>
                <div className="text-xs text-gray-500">
                  {payment?.mes_referencia}/{payment?.ano}
                </div>
              </div>
              <Badge className={badge.className}>{badge.label}</Badge>
            </div>

            <div className="text-sm">
              Valor: <b>{formatBRL(payment?.valor_nf || payment?.valor_parcela_previsto)}</b>
            </div>

            <div className="text-xs text-gray-600">
              Rubrica: <b>{getRubricaNome(payment)}</b>
            </div>

            <div className="flex gap-2">
              {status === 'AGUARDANDO_APROVACAO' && (
                <>
                  <Button
                    onClick={() => {
                      setReviewing(payment);
                      setAction('approve');
                    }}
                    disabled={saving}
                  >
                    Aprovar
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setReviewing(payment);
                      setAction('return');
                    }}
                    disabled={saving}
                  >
                    Devolver
                  </Button>
                </>
              )}

              {status === 'APROVADO_COORD' && (
                <Button onClick={() => marcarComoPago(payment)} disabled={!!markingPaid[payment.id]}>
                  {markingPaid[payment.id] ? 'Processando...' : 'Marcar como pago'}
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {reviewing && (
        <Dialog open onOpenChange={() => {
          if (!saving) {
            setReviewing(null);
            setAction(null);
            setComment('');
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action === 'approve' ? 'Aprovar pagamento' : 'Devolver pagamento'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                <div><b>{reviewing?.user_name || reviewing?.user_email}</b></div>
                <div>{reviewing?.mes_referencia}/{reviewing?.ano}</div>
                <div>Valor: <b>{formatBRL(reviewing?.valor_nf || reviewing?.valor_parcela_previsto)}</b></div>
                <div>Rubrica: <b>{getRubricaNome(reviewing)}</b></div>
              </div>

              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Comentário"
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReviewing(null);
                  setAction(null);
                  setComment('');
                }}
                disabled={saving}
              >
                Cancelar
              </Button>

              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? 'Salvando...' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
