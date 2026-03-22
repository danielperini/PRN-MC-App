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
  Pencil,
} from 'lucide-react';

import RequireAuth from '@/components/auth/RequireAuth';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import OrcamentoDashboard from '@/components/compras/OrcamentoDashboard';
import AprovacoesFila from '@/components/compras/AprovacoesFila';
import ImportarOrcamento from '@/components/compras/ImportarOrcamento';
import TeamManager from '@/components/compras/TeamManager';
import TeamPaymentSubmit from '@/components/compras/TeamPaymentSubmit';
import ContractActivityReportGenerator from '@/components/compras/ContractActivityReportGenerator';
import { useBudgetLines } from '@/components/compras/useBudgetLines';
import GestaoDocumental from '@/pages/GestaoDocumental';
import RubricasGrid from '@/components/compras/RubricasGrid';
import RubricaDetail from '@/components/rubricas/RubricaDetail';

const STATUS_CONFIG = {
  RASCUNHO:       { label: 'Rascunho',      color: 'bg-gray-100 text-gray-700' },
  SOLICITADO:     { label: 'Solicitado',     color: 'bg-blue-100 text-blue-700' },
  APROVADO_COORD: { label: 'Aprovado',       color: 'bg-green-100 text-green-700' },
  APROVADO_ADMIN: { label: 'Aprovado Admin', color: 'bg-green-100 text-green-700' },
  RECUSADO:       { label: 'Recusado',       color: 'bg-red-100 text-red-700' },
  CANCELADO:      { label: 'Cancelado',      color: 'bg-gray-100 text-gray-500' },
  PAGO:           { label: 'Pago',           color: 'bg-emerald-100 text-emerald-700' },
};

function extractRubricas(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rubricas)) return result.rubricas;
  if (Array.isArray(result?.data?.rubricas)) return result.data.rubricas;
  if (Array.isArray(result?.response?.rubricas)) return result.response.rubricas;
  if (Array.isArray(result?.body?.rubricas)) return result.body.rubricas;
  if (Array.isArray(result?.results)) return result.results;
  if (Array.isArray(result?.data?.results)) return result.data.results;
  return [];
}

async function carregarRubricas() {
  try {
    const result = await base44.functions.invoke('listAllRubricas', {});
    const viaFunction = extractRubricas(result);
    if (Array.isArray(viaFunction) && viaFunction.length > 0) return viaFunction;
  } catch (error) {
    console.error('Erro em listAllRubricas:', error);
  }
  try {
    const diretas = await base44.entities.Rubrica.list('ordem_exibicao', 200);
    if (Array.isArray(diretas)) return diretas;
  } catch (error) {
    console.error('Erro ao buscar Rubrica direto:', error);
  }
  return [];
}

function getPurchaseBudgetlineId(purchase) {
  return (
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    null
  );
}

function getPurchaseValue(p) {
  return (
    p?.valor_pago ||
    p?.valor_aprovado_admin ||
    p?.valor_aprovado ||
    p?.valor_final ||
    p?.valor_solicitado ||
    0
  );
}

function normalizeCentro(value) {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (!raw) return '';
  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';
  if (raw === 'geral') return 'Geral';
  if (raw === 'publicacoes') return 'Publicações';
  if (raw === 'noturno nos museus 2026') return 'Noturno nos Museus 2026';
  if (raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';
  return String(value || '').trim();
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function TabelaSolicitacoes({ purchases, rubricas, isCoordenador, currentUser, onEdit }) {
  const rubricaById = useMemo(() => {
    const m = {};
    (rubricas || []).forEach((r) => { if (r?.id) m[r.id] = r; });
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

            const inconsistente =
              (p.status === 'APROVADO_COORD' || p.status === 'APROVADO_ADMIN' || p.status === 'PAGO') &&
              (!p._has_orcamento_vinculado || p._sem_centro_custo);

            const podeEditar =
              isCoordenador ||
              p.created_by === currentUser?.email;

            return (
              <tr key={p.id} className={inconsistente ? 'bg-amber-50' : ''}>
                <td className="px-3 py-2">{p.descricao_item || '—'}</td>
                <td className="px-3 py-2">{p.fornecedor_nome || '—'}</td>
                <td className="px-3 py-2">{p._centro_custo_normalizado || '—'}</td>
                <td className="px-3 py-2">{rubrica?.rubrica || '—'}</td>
                <td className="px-3 py-2">{status.label}</td>
                <td className="px-3 py-2 text-right">{fmtBRL(getPurchaseValue(p))}</td>
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
    base44.auth.me().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const isCoordenador = ['ADMIN','admin','COORDENADOR'].includes(currentUser?.role);

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 500),
    enabled: !!currentUser,
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: carregarRubricas,
    enabled: !!currentUser,
  });

  const purchasesWithFlags = useMemo(() => {
    return (purchases || []).map((p) => {
      const hasBudgetline = !!getPurchaseBudgetlineId(p);
      const hasRubrica = !!p.rubrica_id;
      const centro = normalizeCentro(p?.centro_custo);

      return {
        ...p,
        _has_orcamento_vinculado: hasRubrica || hasBudgetline,
        _centro_custo_normalizado: centro,
        _sem_centro_custo: !centro,
      };
    });
  }, [purchases]);

  return (
    <div className="p-6">

      {tab === 'lista' && (
        <TabelaSolicitacoes
          purchases={purchasesWithFlags}
          rubricas={rubricas}
          isCoordenador={isCoordenador}
          currentUser={currentUser}
          onEdit={(p) => {
            setEditingPurchase(p);
            setShowForm(true);
          }}
        />
      )}

      {tab === 'equipe' && (
        isCoordenador
          ? <TeamManager />
          : <TeamPaymentSubmit userEmail={currentUser?.email} />
      )}

      {showForm && (
        <PurchaseFormDialog
          currentUser={currentUser}
          prefill={editingPurchase}
          onClose={() => setShowForm(false)}
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
