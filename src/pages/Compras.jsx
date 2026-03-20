import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingCart,
  Plus,
  Search,
  ShieldCheck,
  User,
  FileText,
  AlertTriangle,
} from 'lucide-react';

import RequireAuth from '@/components/auth/RequireAuth';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import PurchaseCard from '@/components/compras/PurchaseCard';
import OrcamentoDashboard from '@/components/compras/OrcamentoDashboard';
import AprovacoesFila from '@/components/compras/AprovacoesFila';
import ImportarOrcamento from '@/components/compras/ImportarOrcamento';
import RubricasGrid from '@/components/rubricas/RubricasGrid';
import TeamManager from '@/components/compras/TeamManager';
import TeamPaymentSubmit from '@/components/compras/TeamPaymentSubmit';
import ContractActivityReportGenerator from '@/components/compras/ContractActivityReportGenerator';
import { useBudgetLines } from '@/components/compras/useBudgetLines';
import GestaoDocumental from '@/pages/GestaoDocumental';
import RubricaDetail from '@/components/rubricas/RubricaDetail';

const STATUS_CONFIG = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
  SOLICITADO: { label: 'Solicitado', color: 'bg-blue-100 text-blue-700' },
  APROVADO_COORD: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  APROVADO_ADMIN: { label: 'Aprovado Admin', color: 'bg-green-100 text-green-700' },
  RECUSADO: { label: 'Recusado', color: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
  PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
};

function ComprasInner() {
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState('lista');
  const [showForm, setShowForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);

  // ✅ NOVO
  const [editMode, setEditMode] = useState({});

  const [filters, setFilters] = useState({
    status: 'all',
    meta_id: 'all',
    search: '',
    rubrica_id: 'all',
    inconsistencias: 'all',
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth
      .me()
      .then((u) => setCurrentUser(u))
      .catch(() => setCurrentUser(null));
  }, []);

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 100),
    enabled: !!currentUser,
  });

  const { budgetLines } = useBudgetLines();

  const comprasInconsistentes = purchases.filter(
    (p) =>
      (p.status === 'APROVADO_COORD' ||
        p.status === 'APROVADO_ADMIN' ||
        p.status === 'PAGO') &&
      !(
        p.rubrica_id ||
        p.budgetline_id ||
        p.budget_line_id ||
        p.linha_orcamentaria_id
      )
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* ALERTA */}
        {comprasInconsistentes.length > 0 && (
          <div className="mb-6 p-4 border border-amber-200 bg-amber-50 rounded-xl">
            <p className="text-sm font-semibold text-amber-900">
              Há {comprasInconsistentes.length} compra(s) sem rubrica vinculada.
            </p>
          </div>
        )}

        {/* LISTA */}
        <div className="space-y-3">
          {purchases.map((p) => (
            <PurchaseCard
              key={p.id}
              purchase={p}
              budgetLines={budgetLines}
              statusConfig={STATUS_CONFIG}
              currentUser={currentUser}

              // 🔥 ALTERADO AQUI
              onEdit={(purchase, options = {}) => {
                setEditingPurchase(purchase);
                setEditMode(options);
                setShowForm(true);
              }}
            />
          ))}
        </div>
      </div>

      {/* MODAL */}
      {showForm && (
        <PurchaseFormDialog
          budgetLines={budgetLines}
          currentUser={currentUser}
          initialData={editingPurchase}

          // 🔥 NOVO
          editMode={editMode}

          onClose={() => {
            setShowForm(false);
            setEditingPurchase(null);
            setEditMode({});
          }}
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