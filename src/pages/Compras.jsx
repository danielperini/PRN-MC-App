// 🔥 VERSÃO CORRIGIDA — ADIÇÃO DE PAGAMENTO (SEM QUEBRAR NADA)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSmartToast } from '@/lib/useSmartToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  ShoppingCart,
  Plus,
  Search,
  ShieldCheck,
  User,
  FileText,
  AlertTriangle,
  Pencil,
  Trash2,
  LinkIcon,
  FileCheck2,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';

import RequireAuth from '@/components/auth/RequireAuth';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import OrcamentoDashboard from '@/components/compras/OrcamentoDashboard';
import ImportarOrcamento from '@/components/compras/ImportarOrcamento';
import TeamManager from '@/components/compras/TeamManager';
import TeamPaymentSubmit from '@/components/compras/TeamPaymentSubmit';
import TeamPaymentReview from '@/components/compras/TeamPaymentReview';
import ContractActivityReportGenerator from '@/components/compras/ContractActivityReportGenerator';
import { useBudgetLines } from '@/components/compras/useBudgetLines';
import GestaoDocumental from '@/pages/GestaoDocumental';
import RubricasGrid from '@/components/compras/RubricasGrid';
import RubricaDetail from '@/components/rubricas/RubricaDetail';

// 🔥 (todo o restante do arquivo permanece IGUAL até funções)

...

// 🔥 NOVO HANDLER (ADIÇÃO SEGURA)
async function handlePayPurchase(purchase) {
  if (!purchase?.id) return;

  try {
    const response = await base44.functions.invoke('purchaseActions', {
      purchaseId: purchase.id,
      action: 'pagar'
    });

    const result = response?.data || response;

    if (!result?.success) {
      throw new Error(result?.error || 'Falha ao marcar como pago.');
    }

    await refreshFinanceiroCompleto();

    smartToast.success('Pagamento registrado com sucesso.');
  } catch (error) {
    console.error('Erro ao pagar:', error);
    smartToast.error('Erro ao pagar', error.message);
  }
}

...

// 🔥 ALTERAÇÃO NA TABELA (ADICIONAR BOTÃO)

{podeAprovar && (statusKey === 'APROVADO_COORD' || statusKey === 'APROVADO_ADMIN') && (
  <button
    onClick={() => onPay(p)}
    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
    title="Marcar como pago"
  >
    💰 Pagar
  </button>
)}

...

// 🔥 PASSAR PROP

<TabelaSolicitacoes
  purchases={filtered}
  rubricas={rubricas}
  isCoordenador={isCoordenador}
  currentUser={currentUser}
  podeAprovarSolicitacoes={podeAprovarSolicitacoes}
  hasGestaoCompras={hasGestaoCompras}
  onEdit={(purchase) => {
    setEditingPurchase(purchase);
    setShowForm(true);
  }}
  onApprove={handleApprovePurchase}
  onReturn={handleReturnPurchase}
  onPay={handlePayPurchase} // 🔥 AQUI
  onGoTeamPayments={() => setTab('pagamentos')}
  onDelete={async (purchaseId) => {
    try {
      await base44.entities.PurchaseRequest.delete(purchaseId);
      await invalidateComprasQueries();
      smartToast.success('Solicitação deletada.');
    } catch (error) {
      console.error('Erro ao deletar solicitação:', error);
      smartToast.error('Erro ao deletar', error.message);
    }
  }}
/>
