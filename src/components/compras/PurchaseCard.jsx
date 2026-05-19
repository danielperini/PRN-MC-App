import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import PurchaseTimeline from './PurchaseTimeline';
import PagarSolicitacaoDialog from './PagarSolicitacaoDialog';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(value) {
  return `R$ ${toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
  })}`;
}

function getPaymentProofUrl(purchase = {}) {
  return (
    purchase.comprovante_pagamento_url ||
    purchase.comprovante_url ||
    purchase.payment_receipt_url ||
    purchase.recibo_url ||
    ''
  );
}

export default function PurchaseCard({
  purchase,
  budgetLines,
  statusConfig,
  isCoordenador,
  isAdmin,
  currentUser,
  onRefresh,
}) {

  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState(false);
  const [teamPayment, setTeamPayment] = useState(null);
  const [showPagarDialog, setShowPagarDialog] = useState(false);
  const normalizedStatus = String(purchase.status || '').trim().toUpperCase();

  const statusInfo = statusConfig[normalizedStatus] || statusConfig[purchase.status] || {
    label: purchase.status,
    color: 'bg-secondary text-foreground'
  };

  const budgetLine = budgetLines.find(
    line =>
      line.id === purchase.budgetline_id ||
      line.id === purchase.budget_line_id ||
      line.id === purchase.linha_orcamentaria_id
  );

  const isTeamPayment =
    purchase.origem === 'TEAM_PAYMENT' ||
    !!purchase.team_payment_id;

  useEffect(() => {
    if (purchase.team_payment_id) {
      base44.entities.TeamPayment.get(purchase.team_payment_id)
        .then(setTeamPayment)
        .catch(() => {});
    }
  }, [purchase.team_payment_id]);

  const hasRubricaVinculada =
    !!purchase.rubrica_id ||
    !!purchase.budgetline_id ||
    !!purchase.budget_line_id ||
    !!purchase.linha_orcamentaria_id ||
    !!budgetLine;

  const isPaid = normalizedStatus === 'PAGO';
  const canMarkAsPaidBase =
    (isCoordenador || isAdmin) &&
    (['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN'].includes(normalizedStatus) ||
      (!isTeamPayment && isPaid));

  const canMarkAsPaid = canMarkAsPaidBase && (!isTeamPayment || hasRubricaVinculada);
  const paymentProofUrl = getPaymentProofUrl(purchase);
  const paymentProofPending =
    isPaid && (purchase.comprovante_pendente === true || !paymentProofUrl);

  /* ================= PAGAMENTO ================= */

  // Para pagamentos de equipe (TeamPayment), mantém fluxo legado sem comprovante obrigatório
  const handleMarkAsPaidTeam = async () => {
    if (!hasRubricaVinculada) { toast.error('❌ Vincule uma rubrica antes de pagar'); return; }
    if (isTeamPayment && teamPayment) {
      if (teamPayment.nf_valida === false) { toast.error('❌ NF inválida.'); return; }
      if (!teamPayment.nota_fiscal_url) { toast.error('❌ Nota fiscal não anexada.'); return; }
    }
    setActionLoading(true);
    const previousData = queryClient.getQueryData(['purchases']);
    queryClient.setQueryData(['purchases'], (old) =>
      Array.isArray(old) ? old.map((p) => (p.id === purchase.id ? { ...p, status: 'PAGO' } : p)) : old
    );
    try {
      await base44.functions.invoke('purchaseActions', { action: 'marcar_pago', purchaseId: purchase.id });
      toast.success('Pagamento da equipe realizado e contabilizado');
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['team-payments'] });
      onRefresh?.();
    } catch (e) {
      toast.error('Erro ao pagar: ' + e.message);
      queryClient.setQueryData(['purchases'], previousData);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="border-2 border-border rounded-xl p-4 space-y-3 bg-card">

      <div className="flex justify-between">

        <div>
          <div className="flex gap-2 items-center">

            <span className={`text-xs px-2 py-1 rounded border-2 border-border ${statusInfo.color === 'bg-secondary text-foreground' ? 'bg-card text-foreground' : 'bg-primary text-primary-foreground'}`}>
              {statusInfo.label}
            </span>

            {isTeamPayment && (
              <span className="text-xs bg-secondary border-2 border-border text-secondary-foreground px-2 py-1 rounded font-medium">
                👤 Equipe
              </span>
            )}

          </div>

          <p className="font-semibold mt-1 text-foreground">{purchase.descricao_item}</p>

          {isTeamPayment && teamPayment && (
            <div className="text-xs text-foreground mt-2 bg-secondary border border-border p-2 rounded">
              Parcela {teamPayment.numero_parcela} • {teamPayment.mes_referencia}/{teamPayment.ano}
              <br />
              Previsto: {formatBRL(teamPayment.valor_parcela_previsto)}
            </div>
          )}

        </div>

        <div className="text-right">
          <p className="font-bold text-foreground">{formatBRL(purchase.valor_solicitado)}</p>
        </div>

      </div>

      {!hasRubricaVinculada && isTeamPayment && (
        <div className="text-xs bg-secondary border-2 border-border text-foreground p-2 rounded flex items-center gap-2">
          <AlertCircle className="w-3 h-3"/>
          ⚠️ Sem rubrica vinculada — não é possível pagar
        </div>
      )}

      <div className="flex gap-2 flex-wrap">

        {/* Pagamentos de equipe: fluxo antigo sem comprovante */}
        {canMarkAsPaidBase && isTeamPayment && (
          <Button
            size="sm"
            className={`font-medium gap-1 ${actionLoading || !canMarkAsPaid ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
            onClick={handleMarkAsPaidTeam}
            disabled={actionLoading || !canMarkAsPaid}
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {actionLoading ? 'Pagando...' : 'Pagar equipe'}
          </Button>
        )}

        {/* Solicitações normais: abre dialog com upload de comprovante */}
        {canMarkAsPaidBase && !isTeamPayment && (
          <Button
            size="sm"
            className={`font-medium gap-1 ${!canMarkAsPaid ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
            onClick={() => setShowPagarDialog(true)}
            disabled={!canMarkAsPaid}
          >
            <CheckCircle className="w-4 h-4" />
            {isPaid ? 'Adicionar comprovante' : 'Pago'}
          </Button>
        )}

        {/* Badge de comprovante anexado */}
        {paymentProofUrl && (
          <a
            href={paymentProofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary underline"
            onClick={e => e.stopPropagation()}
          >
            <FileText className="w-3 h-3" />
            Comprovante
          </a>
        )}

        {paymentProofPending && (
          <span className="self-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
            Comprovante pendente
          </span>
        )}

        {purchase.numero_processamento && (
          <span className="text-xs font-mono text-muted-foreground self-center">#{purchase.numero_processamento}</span>
        )}

      </div>

      <PurchaseTimeline purchase={purchase} />

      {showPagarDialog && (
        <PagarSolicitacaoDialog
          purchase={purchase}
          currentUser={currentUser}
          onClose={() => setShowPagarDialog(false)}
          onSuccess={() => {
            setShowPagarDialog(false);
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            onRefresh?.();
          }}
        />
      )}

    </div>
  );
}
