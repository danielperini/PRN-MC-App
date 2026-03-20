import React, { useCallback, useEffect, useState } from 'react';
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
  RECUSADO: { label: 'Recusado', color: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
  PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
};

function extractRubricas(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rubricas)) return result.rubricas;
  if (Array.isArray(result?.data?.rubricas)) return result.data.rubricas;
  if (Array.isArray(result?.response?.rubricas)) return result.response.rubricas;
  if (Array.isArray(result?.body?.rubricas)) return result.body.rubricas;
  return [];
}

async function carregarRubricas() {
  try {
    const result = await base44.functions.invoke('listAllRubricas', {});
    const viaFunction = extractRubricas(result);

    if (Array.isArray(viaFunction) && viaFunction.length > 0) {
      return viaFunction;
    }
  } catch (error) {
    console.error('Erro em listAllRubricas:', error);
  }

  try {
    const diretas = await base44.entities.Rubrica.list('ordem_exibicao', 200);
    if (Array.isArray(diretas)) {
      return diretas;
    }
  } catch (error) {
    console.error('Erro ao buscar Rubrica direto:', error);
  }

  return [];
}

function ComprasInner() {
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState('lista');
  const [showForm, setShowForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [showReportGen, setShowReportGen] = useState(false);
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    meta_id: 'all',
    search: '',
    rubrica_id: 'all',
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth
      .me()
      .then((u) => setCurrentUser(u))
      .catch(() => setCurrentUser(null));
  }, []);

  const isCoordenador = [
    'admin',
    'ADMIN',
    'COORDENADOR',
    'COORD_COMUNICACAO',
    'COORD_ADMINISTRATIVA',
    'COORD_PRODUCAO',
  ].includes(currentUser?.role);

  const invalidateComprasQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['purchase-documents-all'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
    ]);
  }, [queryClient]);

  const { data: userPermission } = useQuery({
    queryKey: ['user-permission', currentUser?.email],
    queryFn: async () => {
      try {
        const result = await base44.entities.UserPermission.filter({
          user_email: currentUser?.email,
        });
        return result?.[0] || null;
      } catch {
        return null;
      }
    },
    enabled: !!currentUser?.email,
  });

  const hasGestaoCompras =
    isCoordenador || userPermission?.gestao_compras === true;

  const podeAprovarSolicitacoes =
    isCoordenador || userPermission?.pode_aprovar_solicitacoes === true;

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases', isCoordenador, currentUser?.email],
    queryFn: () =>
      isCoordenador
        ? base44.entities.PurchaseRequest.list('-created_date', 100)
        : base44.entities.PurchaseRequest.filter(
            { created_by: currentUser?.email },
            '-created_date',
            50
          ),
    enabled: !!currentUser,
  });

  useQuery({
    queryKey: ['purchase-documents-all', isCoordenador, currentUser?.email],
    queryFn: async () => {
      const docs = await base44.entities.PurchaseDocument.list(
        '-created_date',
        300
      );
      if (isCoordenador) return docs;
      return docs.filter((doc) => doc.uploadado_por === currentUser?.email);
    },
    enabled: !!currentUser,
  });

  const { budgetLines } = useBudgetLines();

  const {
    data: rubricas = [],
    refetch: refetchRubricas,
    isLoading: loadingRubricas,
  } = useQuery({
    queryKey: ['rubricas'],
    queryFn: carregarRubricas,
    enabled: !!currentUser,
    staleTime: 0,
  });

  const filtered = (purchases || []).filter((p) => {
    const matchStatus = filters.status === 'all' || p.status === filters.status;

    let matchMeta = filters.meta_id === 'all';
    if (!matchMeta && filters.meta_id === 'produto') {
      matchMeta = p.tipo_item === 'produto';
    }
    if (!matchMeta && filters.meta_id === 'servico') {
      matchMeta = p.tipo_item === 'servico';
    }
    if (!matchMeta) {
      matchMeta = p.meta_id === filters.meta_id;
    }

    const matchRubrica =
      filters.rubrica_id === 'all' || p.rubrica_id === filters.rubrica_id;

    const busca = filters.search.trim().toLowerCase();
    const matchSearch =
      !busca ||
      p.descricao_item?.toLowerCase().includes(busca) ||
      p.fornecedor_nome?.toLowerCase().includes(busca);

    return matchStatus && matchMeta && matchRubrica && matchSearch;
  });

  const pendentesAprovacoes = (purchases || []).filter(
    (p) => p.status === 'SOLICITADO'
  ).length;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8">
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
                    <ShieldCheck className="w-3 h-3" />
                    Coordenador
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-2.5 py-0.5">
                    <User className="w-3 h-3" />
                    Profissional
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-500">
                {isCoordenador
                  ? 'Visão geral — todas as solicitações'
                  : 'Solicitações — 3º Termo Aditivo'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {isCoordenador && (
              <Button
                variant="outline"
                className="border-black gap-2"
                onClick={() => setShowReportGen(true)}
              >
                <FileText className="w-4 h-4" />
                Relatório PDF
              </Button>
            )}

            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={() => {
                setEditingPurchase(null);
                setShowForm(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Solicitação
            </Button>
          </div>
        </div>

        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto">
          {[
            { id: 'lista', label: 'Solicitações' },
            ...(isCoordenador ? [{ id: 'rubricas', label: 'Rubricas' }] : []),
            { id: 'documentos', label: 'Documentos' },
            ...(isCoordenador ? [{ id: 'equipe', label: 'Equipe' }] : []),
            ...((podeAprovarSolicitacoes || hasGestaoCompras)
              ? [
                  {
                    id: 'aprovacoes',
                    label: `Aprovações${
                      pendentesAprovacoes > 0 ? ` (${pendentesAprovacoes})` : ''
                    }`,
                  },
                ]
              : []),
            ...(!isCoordenador
              ? [{ id: 'pagamentos', label: 'Meus Pagamentos' }]
              : []),
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-white shadow text-black'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'lista' && (
          <div>
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar..."
                  className="pl-9"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                />
              </div>

              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.meta_id}
                onValueChange={(v) => setFilters((f) => ({ ...f, meta_id: v }))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Meta / Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as metas / tipos</SelectItem>
                  <SelectItem value="produto">— Apenas Produtos</SelectItem>
                  <SelectItem value="servico">— Apenas Serviços</SelectItem>
                  <SelectItem value="MC3A-20">
                    MC3A-20 — Ações Educativas
                  </SelectItem>
                  <SelectItem value="MC3A-21">
                    MC3A-21 — Exposição / Produção Cultural
                  </SelectItem>
                  <SelectItem value="MC3A-22">
                    MC3A-22 — Comunicação e Divulgação
                  </SelectItem>
                  <SelectItem value="MC3A-23">
                    MC3A-23 — Noturno nos Museus 2026
                  </SelectItem>
                  <SelectItem value="MC3A-24">
                    MC3A-24 — Emenda Parlamentar
                  </SelectItem>
                  <SelectItem value="MC3A-25">
                    MC3A-25 — Outras Ações
                  </SelectItem>
                  <SelectItem value="MC3A-EXTRA">
                    MC3A-EXTRA — Ações Extras
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.rubrica_id}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, rubrica_id: v }))
                }
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Rubrica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as rubricas</SelectItem>
                  {(rubricas || [])
                    .filter((r) => r?.ativo !== false)
                    .sort((a, b) =>
                      String(a?.rubrica || '').localeCompare(
                        String(b?.rubrica || ''),
                        'pt-BR'
                      )
                    )
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.rubrica}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center py-16 text-gray-400">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">
                  Nenhuma solicitação encontrada
                </p>
                <Button
                  className="mt-4 bg-black text-white"
                  onClick={() => {
                    setEditingPurchase(null);
                    setShowForm(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Criar primeira solicitação
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((p) => (
                  <PurchaseCard
                    key={p.id}
                    purchase={p}
                    budgetLines={budgetLines}
                    statusConfig={STATUS_CONFIG}
                    isCoordenador={isCoordenador}
                    isAdmin={
                      currentUser?.role === 'admin' ||
                      currentUser?.role === 'ADMIN'
                    }
                    currentUser={currentUser}
                    onEdit={(purchase) => {
                      setEditingPurchase(purchase);
                      setShowForm(true);
                    }}
                    onRefresh={invalidateComprasQueries}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'rubricas' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>📊 Integração:</strong> esta aba usa exclusivamente a
                entity <strong>Rubrica</strong> como fonte de verdade do
                orçamento.
              </p>
              <p className="text-xs text-blue-700 mt-2">
                Rubricas carregadas: {Array.isArray(rubricas) ? rubricas.length : 0}
              </p>
            </div>

            {selectedRubrica ? (
              <div>
                <button
                  onClick={() => setSelectedRubrica(null)}
                  className="text-sm text-black hover:text-gray-600 mb-4 font-medium"
                >
                  ← Voltar
                </button>

                <RubricaDetail
                  rubrica={selectedRubrica}
                  onClose={async () => {
                    setSelectedRubrica(null);
                    await invalidateComprasQueries();
                    await refetchRubricas();
                  }}
                />
              </div>
            ) : (
              <RubricasGrid
                rubricas={rubricas}
                onSelectRubrica={setSelectedRubrica}
                onRefresh={async () => {
                  await invalidateComprasQueries();
                  await refetchRubricas();
                }}
                isCoordenador={isCoordenador}
              />
            )}

            {loadingRubricas && (
              <div className="text-sm text-gray-400">Atualizando rubricas...</div>
            )}
          </div>
        )}

        {tab === 'documentos' && (
          <div className="max-w-7xl">
            <GestaoDocumental />
          </div>
        )}

        {tab === 'equipe' && isCoordenador && (
          <TeamManager budgetLines={budgetLines} />
        )}

        {tab === 'pagamentos' && !isCoordenador && (
          <TeamPaymentSubmit userEmail={currentUser?.email} />
        )}

        {tab === 'aprovacoes' &&
          (podeAprovarSolicitacoes || hasGestaoCompras) && (
            <AprovacoesFila
              purchases={purchases}
              budgetLines={budgetLines}
              statusConfig={STATUS_CONFIG}
              onRefresh={invalidateComprasQueries}
              currentUser={currentUser}
              hasGestaoCompras={hasGestaoCompras}
              podeAprovarSolicitacoes={podeAprovarSolicitacoes}
            />
          )}

        {tab === 'orcamento' && (
          <div className="space-y-8">
            {isCoordenador && (
              <ImportarOrcamento
                onSuccess={() =>
                  queryClient.invalidateQueries({ queryKey: ['budget-lines'] })
                }
              />
            )}
            <OrcamentoDashboard
              budgetLines={budgetLines}
              purchases={purchases}
              isCoordenador={isCoordenador}
            />
          </div>
        )}
      </div>

      {showForm && (
        <PurchaseFormDialog
          budgetLines={budgetLines}
          currentUser={currentUser}
          initialData={editingPurchase}
          onClose={() => {
            setShowForm(false);
            setEditingPurchase(null);
          }}
          onSuccess={async () => {
            setShowForm(false);
            setEditingPurchase(null);
            await invalidateComprasQueries();
            await refetchRubricas();
          }}
        />
      )}

      {showReportGen && (
        <ContractActivityReportGenerator
          isOpen={showReportGen}
          onClose={() => setShowReportGen(false)}
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