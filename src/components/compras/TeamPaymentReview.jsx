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
  return (
    payment?.rubrica_nome ||
    payment?.rubrica ||
    '—'
  );
}

export default function TeamPaymentReview({ members = [], budgetLines = [] }) {
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

  // 🔥 ANTI-DUPLICAÇÃO VISUAL (garante lista limpa)
  const uniquePayments = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      if (!map.has(p.id)) {
        map.set(p.id, p);
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
  }

  async function handleConfirm() {
    if (!reviewing || !action) return;

    setSaving(true);

    try {
      await base44.functions.invoke('processTeamPayment', {
        payment_id: reviewing.id,
        action: action === 'approve' ? 'approve' : 'return'
      });

      if (action === 'approve') {
        await sendStatusNotif(reviewing, 'APROVADO_COORD', comment);

        await notifyUser(reviewing.user_email, {
          title: '✅ Nota fiscal aprovada',
          message: `Sua nota fiscal foi aprovada.`,
          type: 'PAYMENT_APPROVED',
          action_url: `${window.location.origin}/Compras`,
        });

        toast.success('Aprovado com segurança.');
      }

      if (action === 'return') {
        await sendStatusNotif(reviewing, 'DEVOLVIDO_REVISAO', comment);

        await notifyUser(reviewing.user_email, {
          title: '⚠️ Nota devolvida',
          message: `Sua NF foi devolvida. Motivo: ${comment}`,
          type: 'PAYMENT_RETURNED',
          action_url: `${window.location.origin}/Compras`,
        });

        toast.success('Devolvido.');
      }

      setReviewing(null);
      setAction(null);
      setComment('');

      await queryClient.invalidateQueries();

    } catch (e) {
      toast.error(e?.message || 'Erro ao processar.');
    } finally {
      setSaving(false);
    }
  }

  async function marcarComoPago(payment) {
    setMarkingPaid(m => ({ ...m, [payment.id]: true }));

    try {
      await base44.functions.invoke('processTeamPayment', {
        payment_id: payment.id,
        action: 'pay'
      });

      await sendStatusNotif(payment, 'PAGO', 'Pagamento realizado.');

      await notifyUser(payment.user_email, {
        title: '💰 Pagamento realizado',
        message: 'Pagamento confirmado.',
        type: 'PAYMENT_DONE',
        action_url: `${window.location.origin}/Compras`,
      });

      toast.success('Pagamento realizado com segurança.');

      await queryClient.invalidateQueries();

    } catch (e) {
      toast.error(e?.message || 'Erro ao pagar.');
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
              Valor: <b>{formatBRL(payment?.valor_nf)}</b>
            </div>

            {/* 🔥 NOVO — RUBRICA VISÍVEL */}
            <div className="text-xs text-gray-600">
              Rubrica: <b>{getRubricaNome(payment)}</b>
            </div>

            <div className="flex gap-2">
              {status === 'AGUARDANDO_APROVACAO' && (
                <>
                  <Button onClick={() => { setReviewing(payment); setAction('approve'); }}>
                    Aprovar
                  </Button>
                  <Button variant="outline" onClick={() => { setReviewing(payment); setAction('return'); }}>
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
        <Dialog open onOpenChange={() => setReviewing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action === 'approve' ? 'Aprovar' : 'Devolver'}
              </DialogTitle>
            </DialogHeader>

            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Comentário"
            />

            <DialogFooter>
              <Button onClick={() => setReviewing(null)}>Cancelar</Button>
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
