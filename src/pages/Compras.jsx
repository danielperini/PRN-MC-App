import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

import RequireAuth from '@/components/auth/RequireAuth';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import PurchaseCard from '@/components/compras/PurchaseCard';
import AuditoriaRubricasPanel from '@/components/compras/AuditoriaRubricasPanel';
import { useAuditoriaRubricas } from '@/components/compras/useAuditoriaRubricas';
import { useBudgetLines } from '@/components/compras/useBudgetLines';

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
  const [showForm, setShowForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editMode, setEditMode] = useState({});

  const { budgetLines } = useBudgetLines();

  // 🔥 NOVO: AUDITORIA
  const {
    inconsistencias,
    loading: loadingAuditoria,
    refresh: refreshAuditoria
  } = useAuditoriaRubricas();

  useEffect(() => {
    base44.auth
      .me()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null));
  }, []);

  const { data: purchases = [], refetch } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 100),
    enabled: !!currentUser,
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* 🔥 PAINEL DE AUDITORIA */}
        <AuditoriaRubricasPanel inconsistencias={inconsistencias} />

        {/* 🔥 ALERTA RESUMIDO */}
        {inconsistencias.length > 0 && (
          <div className="p-4 border border-red-200 bg-red-50 rounded-xl">
            <p className="text-sm font-semibold text-red-800">
              ⚠ Existem problemas financeiros que precisam ser corrigidos antes de continuar.
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
          editMode={editMode}
          onClose={() => {
            setShowForm(false);
            setEditingPurchase(null);
            setEditMode({});
            refetch();
            refreshAuditoria(); // 🔥 atualiza auditoria
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