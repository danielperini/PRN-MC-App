import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import PurchaseTimeline from './PurchaseTimeline';

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

export default function PurchaseCard({
  purchase,
  budgetLines,
  statusConfig,
  isCoordenador,
  isAdmin,
  onRefresh,
}) {

  const [actionLoading, setActionLoading] = useState(false);
  const [teamPayment, setTeamPayment] = useState(null);

  const statusInfo = statusConfig[purchase.status] || {
    label: purchase.status,
    color: 'bg-gray-100 text-gray-700'
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

  const canMarkAsPaidBase =
    (isCoordenador || isAdmin) &&
    (purchase.status === 'APROVADO_COORD' || purchase.status === 'APROVADO_ADMIN');

  const canMarkAsPaid = canMarkAsPaidBase && hasRubricaVinculada;

  /* ================= PAGAMENTO ================= */

  const handleMarkAsPaid = async () => {

    if (!hasRubricaVinculada) {
      toast.error('❌ Vincule uma rubrica antes de pagar');
      return;
    }

    if (isTeamPayment && teamPayment) {

      if (teamPayment.nf_valida === false) {
        toast.error('❌ NF inválida. Não é possível pagar.');
        return;
      }

      if (!teamPayment.nota_fiscal_url) {
        toast.error('❌ Nota fiscal não anexada.');
        return;
      }
    }

    setActionLoading(true);

    try {

      await base44.functions.invoke('purchaseActions', {
        action: 'marcar_pago',
        purchaseId: purchase.id,
      });

      toast.success(
        isTeamPayment
          ? 'Pagamento da equipe realizado e contabilizado'
          : 'Pagamento realizado'
      );

      onRefresh?.();

    } catch (e) {
      toast.error('Erro ao pagar: ' + e.message);
    }

    setActionLoading(false);
  };

  return (
    <div className="border-2 border-black rounded-xl p-4 space-y-3 bg-white">

      <div className="flex justify-between">

        <div>
          <div className="flex gap-2 items-center">

            <span className={`text-xs px-2 py-1 rounded border-2 border-black ${statusInfo.color === 'bg-gray-100 text-gray-700' ? 'bg-white text-black' : 'bg-black text-white'}`}>
              {statusInfo.label}
            </span>

            {isTeamPayment && (
              <span className="text-xs bg-white border-2 border-black text-black px-2 py-1 rounded font-medium">
                👤 Equipe
              </span>
            )}

          </div>

          <p className="font-semibold mt-1">{purchase.descricao_item}</p>

          {isTeamPayment && teamPayment && (
            <div className="text-xs text-black mt-2 bg-white border border-gray-300 p-2 rounded">
              Parcela {teamPayment.numero_parcela} • {teamPayment.mes_referencia}/{teamPayment.ano}
              <br />
              Previsto: {formatBRL(teamPayment.valor_parcela_previsto)}
            </div>
          )}

        </div>

        <div className="text-right">
          <p className="font-bold">{formatBRL(purchase.valor_solicitado)}</p>
        </div>

      </div>

      {!hasRubricaVinculada && (
        <div className="text-xs bg-white border-2 border-black text-black p-2 rounded flex items-center gap-2">
          <AlertCircle className="w-3 h-3"/>
          ⚠️ Sem rubrica vinculada — não é possível pagar
        </div>
      )}

      <div className="flex gap-2">

        {canMarkAsPaidBase && (
          <Button
            size="sm"
            className={`font-medium gap-1 ${actionLoading || !canMarkAsPaid ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}`}
            onClick={handleMarkAsPaid}
            disabled={actionLoading || !canMarkAsPaid}
          >
            {actionLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isTeamPayment ? 'Pagando...' : 'Salvando...'}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {isTeamPayment ? 'Pagar equipe' : 'Marcar pago'}
              </>
            )}
          </Button>
        )}

      </div>

      <PurchaseTimeline purchase={purchase} />

    </div>
  );
}