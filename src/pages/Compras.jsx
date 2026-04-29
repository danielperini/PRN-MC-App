// 🔥 COMPRAS.JSX COMPLETO — CORRIGIDO (SEM "..." E COM PAGAMENTO)

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
  CheckCircle2,
  RotateCcw
} from 'lucide-react';

import RequireAuth from '@/components/auth/RequireAuth';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import { useBudgetLines } from '@/components/compras/useBudgetLines';

const STATUS_CONFIG = {
  SOLICITADO: { label: 'Solicitado', color: 'bg-blue-100 text-blue-700' },
  APROVADO_COORD: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
  DEVOLVIDO: { label: 'Devolvido', color: 'bg-amber-100 text-amber-700' }
};

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(v || 0);
}

function normalizeStatus(v) {
  return String(v || '').toUpperCase();
}

function getValue(p) {
  return (
    p?.valor_solicitado ||
    p?.valor ||
    p?.valor_total ||
    0
  );
}

function TabelaSolicitacoes({
  purchases,
  onEdit,
  onApprove,
  onReturn,
  onPay,
  onDelete,
  isCoordenador
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th>Descrição</th>
          <th>Fornecedor</th>
          <th>Status</th>
          <th>Valor</th>
          <th>Ações</th>
        </tr>
      </thead>

      <tbody>
        {purchases.map((p) => {
          const status = normalizeStatus(p.status);
          const cfg = STATUS_CONFIG[status] || {};

          return (
            <tr key={p.id}>
              <td>{p.descricao_item}</td>
              <td>{p.fornecedor_nome}</td>
              <td>
                <span className={cfg.color}>
                  {cfg.label || p.status}
                </span>
              </td>
              <td>{fmtBRL(getValue(p))}</td>

              <td className="flex gap-2">

                <button onClick={() => onEdit(p)}>
                  <Pencil size={14} />
                </button>

                {status === 'SOLICITADO' && (
                  <>
                    <button onClick={() => onApprove(p)}>
                      <CheckCircle2 size={14} />
                    </button>

                    <button onClick={() => onReturn(p)}>
                      <RotateCcw size={14} />
                    </button>
                  </>
                )}

                {(status === 'APROVADO_COORD') && (
                  <button
                    onClick={() => onPay(p)}
                    className="bg-emerald-600 text-white px-2 rounded"
                  >
                    Pagar
                  </button>
                )}

                {isCoordenador && (
                  <button onClick={() => onDelete(p.id)}>
                    <Trash2 size={14} />
                  </button>
                )}

              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ComprasInner() {
  const smartToast = useSmartToast();
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser);
  }, []);

  const isCoordenador = currentUser?.role === 'ADMIN';

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.PurchaseRequest.list()
  });

  async function refresh() {
    await queryClient.invalidateQueries(['purchases']);
  }

  async function handleApprovePurchase(p) {
    await base44.functions.invoke('purchaseActions', {
      purchaseId: p.id,
      action: 'aprovar'
    });
    await refresh();
    smartToast.success('Aprovado');
  }

  async function handleReturnPurchase(p) {
    await base44.functions.invoke('purchaseActions', {
      purchaseId: p.id,
      action: 'rejeitar'
    });
    await refresh();
    smartToast.success('Devolvido');
  }

  // 🔥 NOVO HANDLER PAGAR
  async function handlePayPurchase(p) {
    await base44.functions.invoke('purchaseActions', {
      purchaseId: p.id,
      action: 'pagar'
    });
    await refresh();
    smartToast.success('Pago');
  }

  return (
    <div className="p-6">

      <Button onClick={() => setShowForm(true)}>
        <Plus /> Nova
      </Button>

      <TabelaSolicitacoes
        purchases={purchases}
        isCoordenador={isCoordenador}
        onEdit={(p) => {
          setEditingPurchase(p);
          setShowForm(true);
        }}
        onApprove={handleApprovePurchase}
        onReturn={handleReturnPurchase}
        onPay={handlePayPurchase}
        onDelete={async (id) => {
          await base44.entities.PurchaseRequest.delete(id);
          await refresh();
        }}
      />

      {showForm && (
        <PurchaseFormDialog
          prefill={editingPurchase}
          onClose={() => setShowForm(false)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}

export default function Compras() {
  return (
    <RequireAuth>
      <ComprasInner />
    </RequireAuth>
  );
}
