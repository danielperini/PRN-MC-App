import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyUser, notifyCoordinators } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function toNumber(v) { return Number(v) || 0; }

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('pt-BR'); } catch { return String(v); }
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

  const orderedPayments = useMemo(() =>
    [...payments].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)),
    [payments]
  );

  function getMember(p) { return members.find(m => m.id === p?.team_member_id) || null; }
  function getBudgetLine(m) {
    const id = m?.budgetline_id || m?.budget_line_id || '';
    return budgetLines.find(b => b.id === id) || null;
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
    const member = getMember(reviewing);
    const budgetLine = getBudgetLine(member);
    setSaving(true);
    try {
      const user = await base44.auth.me();
      if (action === 'approve') {
        await base44.entities.TeamPayment.update(reviewing.id, {
          status: 'APROVADO_COORD',
          aprov_coord_nome: user?.full_name || '',
          aprov_coord_email: user?.email || '',
          aprov_coord_data: new Date().toISOString(),
          observacoes: comment || '',
        });
        if (budgetLine?.id) {
          await base44.entities.BudgetLine.update(budgetLine.id, {
            saldo_comprometido: toNumber(budgetLine?.saldo_comprometido) + toNumber(reviewing?.valor_nf),
          });
        }
        await sendStatusNotif(reviewing, 'APROVADO_COORD', comment);
        await notifyUser(reviewing.user_email, {
          title: '✅ Nota fiscal aprovada',
          message: `Sua nota fiscal de ${reviewing.mes_referencia}/${reviewing.ano} foi aprovada pela coordenação.`,
          type: 'PAYMENT_APPROVED',
          action_url: `${window.location.origin}/Compras`,
        });
        toast.success('Envio aprovado.');
      }
      if (action === 'return') {
        await base44.entities.TeamPayment.update(reviewing.id, { status: 'DEVOLVIDO_REVISAO', observacoes: comment || '' });
        await sendStatusNotif(reviewing, 'DEVOLVIDO_REVISAO', comment);
        await notifyUser(reviewing.user_email, {
          title: '⚠️ Nota fiscal devolvida para revisão',
          message: `Sua nota fiscal de ${reviewing.mes_referencia}/${reviewing.ano} foi devolvida. Motivo: ${comment}`,
          type: 'PAYMENT_RETURNED',
          action_url: `${window.location.origin}/Compras`,
        });
        toast.success('Envio devolvido para revisão.');
      }
      setReviewing(null); setAction(null); setComment('');
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
      const member = getMember(payment);
      await base44.entities.TeamPayment.update(payment.id, {
        status: 'PAGO',
        valor_pago: payment?.valor_nf || payment?.valor_parcela_previsto || 0,
        data_pagamento: new Date().toISOString(),
      });
      if (member?.id) {
        await base44.entities.TeamMember.update(member.id, {
          parcelas_pagas: toNumber(member?.parcelas_pagas) + 1,
        });
      }
      await sendStatusNotif(payment, 'PAGO', 'Pagamento realizado.');
      await notifyUser(payment.user_email, {
        title: '💰 Pagamento realizado',
        message: `Seu pagamento de ${payment.mes_referencia}/${payment.ano} foi marcado como realizado.`,
        type: 'PAYMENT_DONE',
        action_url: `${window.location.origin}/Compras`,
      });
      toast.success('Pagamento marcado como realizado e notificação enviada ao solicitante.');
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e?.message || 'Erro ao marcar pagamento.');
    } finally {
      setMarkingPaid(m => ({ ...m, [payment.id]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {orderedPayments.length === 0 && (
        <div className="rounded-xl border p-4 text-sm text-gray-500">Nenhum envio encontrado.</div>
      )}

      {orderedPayments.map(payment => {
        const member = getMember(payment);
        const badge = getStatusBadge(payment?.status);
        const warnings = Array.isArray(payment?.analysis_warnings) ? payment.analysis_warnings : [];
        const critical = Array.isArray(payment?.analysis_critical_issues) ? payment.analysis_critical_issues : [];
        const status = String(payment?.status || '').toUpperCase();

        return (
          <div key={payment.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">
                  {member?.user_name || payment?.user_name || payment?.user_email || 'Membro'}
                </div>
                <div className="text-xs text-gray-500">
                  {payment?.mes_referencia}/{payment?.ano} • Parcela {payment?.numero_parcela || '—'} • {payment?.funcao || '—'}
                </div>
              </div>
              <Badge className={badge.className}>{badge.label}</Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-gray-500">Valor</div><div className="font-medium">{formatBRL(payment?.valor_nf)}</div></div>
              <div><div className="text-gray-500">NF nº</div><div className="font-medium">{payment?.numero_nf || '—'}</div></div>
              <div><div className="text-gray-500">Criado em</div><div className="font-medium">{formatDate(payment?.created_date)}</div></div>
              <div><div className="text-gray-500">Pago em</div><div className="font-medium">{formatDate(payment?.data_pagamento)}</div></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {/* Arquivos */}
              <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
                <div className="font-medium text-gray-900">Arquivos</div>
                {payment?.nota_fiscal_url
                  ? <a href={payment.nota_fiscal_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline"><ExternalLink className="w-4 h-4" />Abrir PDF renomeado</a>
                  : <span className="text-gray-400">Sem PDF</span>}
                {payment?.xml_url
                  ? <a href={payment.xml_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline block"><ExternalLink className="w-4 h-4" />Abrir XML renomeado</a>
                  : <span className="text-gray-400 block">Sem XML</span>}
              </div>

              {/* Análise IA */}
              <div className="rounded-lg border bg-gray-50 p-3">
                <div className="font-medium text-gray-900 mb-2">Análise automática</div>
                {payment?.analysis_summary
                  ? <div className="text-gray-700 text-sm mb-2">{payment.analysis_summary}</div>
                  : <div className="text-gray-400 text-sm">Sem análise registrada.</div>}
                {critical.length > 0 && (
                  <div className="text-red-700 text-xs mb-1">
                    <div className="font-medium flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Pontos críticos</div>
                    <ul className="list-disc pl-4">{critical.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                  </div>
                )}
                {warnings.length > 0 && (
                  <div className="text-amber-700 text-xs">
                    <div className="font-medium flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Alertas</div>
                    <ul className="list-disc pl-4">{warnings.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                  </div>
                )}
              </div>
            </div>

            {payment?.observacoes && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                <div className="font-medium">Observações</div>
                <div>{payment.observacoes}</div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {status === 'AGUARDANDO_APROVACAO' && (
                <>
                  <Button onClick={() => { setReviewing(payment); setAction('approve'); setComment(''); }}>Aprovar</Button>
                  <Button variant="outline" onClick={() => { setReviewing(payment); setAction('return'); setComment(''); }}>Devolver</Button>
                </>
              )}
              {status === 'APROVADO_COORD' && (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => marcarComoPago(payment)}
                  disabled={markingPaid[payment.id]}
                >
                  {markingPaid[payment.id]
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
                    : '✓ Pagamento realizado'}
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
              <DialogTitle>{action === 'approve' ? 'Aprovar envio' : 'Devolver envio'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                {reviewing?.user_name || reviewing?.user_email} • {reviewing?.mes_referencia}/{reviewing?.ano}
              </div>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={action === 'approve' ? 'Comentário opcional' : 'Motivo da devolução (obrigatório)'}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewing(null)}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={saving || (action === 'return' && !comment.trim())}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}