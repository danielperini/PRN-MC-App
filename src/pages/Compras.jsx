// 🔥 VERSÃO FINAL — COM RUBRICA CONSISTENTE + SEM DUPLICAÇÃO VISUAL

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
  Pencil
} from 'lucide-react';

import RequireAuth from '@/components/auth/RequireAuth';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import OrcamentoDashboard from '@/components/compras/OrcamentoDashboard';
import AprovacoesFila from '@/components/compras/AprovacoesFila';
import ImportarOrcamento from '@/components/compras/ImportarOrcamento';
import TeamManager from '@/components/compras/TeamManager';
import TeamPaymentSubmit from '@/components/compras/TeamPaymentSubmit';
import TeamPaymentReview from '@/components/compras/TeamPaymentReview';
import ContractActivityReportGenerator from '@/components/compras/ContractActivityReportGenerator';
import { useBudgetLines } from '@/components/compras/useBudgetLines';
import GestaoDocumental from '@/pages/GestaoDocumental';
import RubricasGrid from '@/components/compras/RubricasGrid';
import RubricaDetail from '@/components/rubricas/RubricaDetail';

const STATUS_CONFIG = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
  SOLICITADO: { label: 'Solicitado', color: 'bg-blue-100 text-blue-700' },
  APROVADO_COORD: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  APROVADO_ADMIN: { label: 'Aprovado Admin', color: 'bg-green-100 text-green-700' },
  RECUSADO: { label: 'Recusado', color: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
  PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' }
};

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(v);
}

function TabelaSolicitacoes({ purchases, rubricas, isCoordenador, currentUser, onEdit }) {
  const rubricaById = useMemo(() => {
    const m = {};
    (rubricas || []).forEach((r) => {
      if (r?.id) m[r.id] = r;
    });
    return m;
  }, [rubricas]);

  if (!purchases || purchases.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-3 py-3">Descrição</th>
            <th className="px-3 py-3">Fornecedor</th>
            <th className="px-3 py-3">Centro</th>
            <th className="px-3 py-3">Rubrica</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3 text-right">Valor</th>
            <th className="px-3 py-3 text-center">Ações</th>
          </tr>
        </thead>

        <tbody>
          {purchases.map((p) => {
            const status = STATUS_CONFIG[p.status] || { label: p.status, color: '' };

            const rubrica = p.rubrica_id ? rubricaById[p.rubrica_id] : null;

            // 🔥 CORREÇÃO PRINCIPAL
            const rubricaNome =
              p?.rubrica_nome ||
              rubrica?.rubrica ||
              rubrica?.nome ||
              '—';

            const valor =
              p?.valor_pago ||
              p?.valor_aprovado ||
              p?.valor_solicitado ||
              0;

            const podeEditar =
              isCoordenador || p.created_by === currentUser?.email;

            return (
              <tr key={p.id} className="border-b">
                <td className="px-3 py-2">{p.descricao_item}</td>
                <td className="px-3 py-2">{p.fornecedor_nome}</td>
                <td className="px-3 py-2">{p.centro_custo || '—'}</td>

                {/* 🔥 RUBRICA CORRIGIDA */}
                <td className="px-3 py-2 text-xs">
                  {rubricaNome}
                </td>

                <td className="px-3 py-2">
                  <span className={status.color}>{status.label}</span>
                </td>

                <td className="px-3 py-2 text-right">
                  {fmtBRL(valor)}
                </td>

                <td className="px-3 py-2 text-center">
                  {podeEditar && (
                    <button onClick={() => onEdit(p)}>
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComprasInner() {
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState('lista');
  const [showForm, setShowForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser);
  }, []);

  const isCoordenador = ['ADMIN', 'COORDENADOR'].includes(currentUser?.role);

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 200),
    enabled: !!currentUser
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('rubrica', 200),
    enabled: !!currentUser
  });

  return (
    <div className="p-6">
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-bold">Compras</h1>

        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova
        </Button>
      </div>

      <TabelaSolicitacoes
        purchases={purchases}
        rubricas={rubricas}
        isCoordenador={isCoordenador}
        currentUser={currentUser}
        onEdit={(p) => {
          setEditingPurchase(p);
          setShowForm(true);
        }}
      />

      {showForm && (
        <PurchaseFormDialog
          currentUser={currentUser}
          prefill={editingPurchase}
          onClose={() => setShowForm(false)}
          onSuccess={() => queryClient.invalidateQueries()}
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
