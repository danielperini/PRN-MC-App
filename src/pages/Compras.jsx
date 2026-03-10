import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, Plus, Search, ShieldCheck, User } from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import PurchaseCard from '@/components/compras/PurchaseCard';
import OrcamentoDashboard from '@/components/compras/OrcamentoDashboard';
import AprovacoesFila from '@/components/compras/AprovacoesFila';
import ImportarOrcamento from '@/components/compras/ImportarOrcamento';
import RubricaManager from '@/components/compras/RubricaManager';

const STATUS_CONFIG = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
  SOLICITADO: { label: 'Solicitado', color: 'bg-blue-100 text-blue-700' },
  APROVADO_COORD: { label: 'Aprv. Coord', color: 'bg-yellow-100 text-yellow-700' },
  APROVADO_ADMIN: { label: 'Aprv. Admin', color: 'bg-green-100 text-green-700' },
  RECUSADO: { label: 'Recusado', color: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
  PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
};

function ComprasInner() {
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState('lista');
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ status: 'all', meta_id: 'all', search: '' });
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u));
  }, []);

  const isCoordenador = ['admin', 'COORDENADOR', 'ADMIN'].includes(currentUser?.role);

  const { data: userPermission } = useQuery({
    queryKey: ['user-permission', currentUser?.email],
    queryFn: () => base44.entities.UserPermission.filter({ user_email: currentUser?.email }),
    enabled: !!currentUser?.email,
    select: (data) => data?.[0],
  });

  const hasGestaoCompras = isCoordenador || userPermission?.gestao_compras === true;

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases', isCoordenador, currentUser?.email],
    queryFn: () => isCoordenador
      ? base44.entities.PurchaseRequest.list('-created_date', 100)
      : base44.entities.PurchaseRequest.filter({ created_by: currentUser?.email }, '-created_date', 50),
    enabled: !!currentUser,
  });

  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budget-lines'],
    queryFn: () => base44.entities.BudgetLine.list('codigo', 200),
  });

  const filtered = purchases.filter(p => {
    const matchStatus = filters.status === 'all' || p.status === filters.status;
    const matchMeta = filters.meta_id === 'all' || p.meta_id === filters.meta_id;
    const matchSearch = !filters.search
      || p.descricao_item?.toLowerCase().includes(filters.search.toLowerCase())
      || p.fornecedor_nome?.toLowerCase().includes(filters.search.toLowerCase());
    return matchStatus && matchMeta && matchSearch;
  });

  const pendentes_coord = purchases.filter(p => p.status === 'SOLICITADO').length;
  const pendentes_admin = purchases.filter(p => p.status === 'APROVADO_COORD').length;
  const totalPendentes = pendentes_coord + pendentes_admin;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-black">Suprimentos</h1>
                {isCoordenador ? (
                  <span className="flex items-center gap-1 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5">
                    <ShieldCheck className="w-3 h-3" />Coordenador
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-2.5 py-0.5">
                    <User className="w-3 h-3" />Profissional
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {isCoordenador ? 'Visão geral — todas as solicitações' : 'Solicitações — 3º Termo Aditivo'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {isCoordenador && totalPendentes > 0 && (
              <Button variant="outline" className="relative" onClick={() => setTab('aprovacoes')}>
                Aprovações
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {totalPendentes}
                </span>
              </Button>
            )}
            <Button className="bg-black hover:bg-gray-800 text-white" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />Nova Solicitação
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          {[
            { id: 'lista', label: 'Solicitações' },
            { id: 'orcamento', label: 'Orçamento' },
            ...(hasGestaoCompras ? [{ id: 'rubricas', label: 'Rubricas' }] : []),
            ...(isCoordenador ? [{ id: 'aprovacoes', label: `Aprovações${totalPendentes > 0 ? ` (${totalPendentes})` : ''}` }] : []),
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-black'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {tab === 'lista' && (
          <div>
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar..."
                  className="pl-9"
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                />
              </div>
              <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v }))}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.meta_id} onValueChange={v => setFilters(f => ({ ...f, meta_id: v }))}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Meta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as metas</SelectItem>
                  <SelectItem value="MC3A-20">MC3A-20 — Ações Educativas</SelectItem>
                  <SelectItem value="MC3A-21">MC3A-21 — Exposição / Produção Cultural</SelectItem>
                  <SelectItem value="MC3A-22">MC3A-22 — Comunicação e Divulgação</SelectItem>
                  <SelectItem value="MC3A-23">MC3A-23 — Noturno nos Museus 2026</SelectItem>
                  <SelectItem value="MC3A-24">MC3A-24 — Emenda Parlamentar</SelectItem>
                  <SelectItem value="MC3A-25">MC3A-25 — Outras Ações</SelectItem>
                  <SelectItem value="MC3A-EXTRA">MC3A-EXTRA — Ações Extras</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center py-16 text-gray-400">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhuma solicitação encontrada</p>
                <Button className="mt-4 bg-black text-white" onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />Criar primeira solicitação
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(p => (
                  <PurchaseCard
                    key={p.id}
                    purchase={p}
                    budgetLines={budgetLines}
                    statusConfig={STATUS_CONFIG}
                    isCoordenador={isCoordenador}
                    onRefresh={() => queryClient.invalidateQueries(['purchases'])}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Orçamento */}
        {tab === 'orcamento' && (
          <div className="space-y-8">
            {isCoordenador && (
              <ImportarOrcamento onSuccess={() => queryClient.invalidateQueries(['budget-lines'])} />
            )}
            <OrcamentoDashboard budgetLines={budgetLines} purchases={purchases} isCoordenador={isCoordenador} />
          </div>
        )}

        {/* Rubricas — apenas para gestao_compras */}
        {tab === 'rubricas' && hasGestaoCompras && (
          <RubricaManager budgetLines={budgetLines} purchases={purchases} />
        )}

        {/* Aprovações */}
        {tab === 'aprovacoes' && isCoordenador && (
          <AprovacoesFila
            purchases={purchases}
            budgetLines={budgetLines}
            statusConfig={STATUS_CONFIG}
            onRefresh={() => queryClient.invalidateQueries(['purchases'])}
            currentUser={currentUser}
          />
        )}
      </div>

      {showForm && (
        <PurchaseFormDialog
          budgetLines={budgetLines}
          currentUser={currentUser}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            queryClient.invalidateQueries(['purchases']);
          }}
        />
      )}
    </div>
  );
}

export default function Compras() {
  return <RequireAuth><ComprasInner /></RequireAuth>;
}