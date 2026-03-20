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
import TeamManager from '@/components/compras/TeamManager';
import TeamPaymentSubmit from '@/components/compras/TeamPaymentSubmit';
import ContractActivityReportGenerator from '@/components/compras/ContractActivityReportGenerator';
import { useBudgetLines } from '@/components/compras/useBudgetLines';
import GestaoDocumental from '@/pages/GestaoDocumental';

import RubricasGrid from '@/components/compras/RubricasGrid';
import AuditoriaRubricasPanel from '@/components/compras/AuditoriaRubricasPanel';
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

function extractAuditoria(result) {
  if (!result) return null;
  if (result?.success && result?.sumario) return result;
  if (result?.data?.success && result?.data?.sumario) return result.data;
  if (result?.response?.success && result?.response?.sumario) return result.response;
  return null;
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

async function carregarAuditoriaRubricas() {
  try {
    const result = await base44.functions.invoke('recalculateAllRubricas', {
      trigger: 'auditoria_visual_compras',
    });

    const auditoria = extractAuditoria(result);
    if (auditoria) return auditoria;
  } catch (error) {
    console.error('Erro ao carregar auditoria de rubricas:', error);
  }

  return null;
}

function getPurchaseBudgetlineId(purchase) {
  return (
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    null
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
    inconsistencias: 'all',
    centro_custo: 'all',
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
      queryClient.invalidateQueries({ queryKey: ['auditoria-rubricas'] }),
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

  const {
    data: auditoriaRubricas = null,
    refetch: refetchAuditoriaRubricas,
    isLoading: loadingAuditoriaRubricas,
  } = useQuery({
    queryKey: ['auditoria-rubricas'],
    queryFn: carregarAuditoriaRubricas,
    enabled: !!currentUser && isCoordenador,
    staleTime: 0,
  });

  const purchasesWithFlags = useMemo(() => {
    return (purchases || []).map((p) => {
      const hasBudgetline = !!getPurchaseBudgetlineId(p);
      const hasRubrica = !!p.rubrica_id;
      const hasOrcamentoVinculado = hasRubrica || hasBudgetline;
      const centroCusto = normalizeCentro(p?.centro_custo);
      const semCentroCusto = !centroCusto;

      return {
        ...p,
        _has_budgetline: hasBudgetline,
        _has_rubrica: hasRubrica,
        _has_orcamento_vinculado: hasOrcamentoVinculado,
        _centro_custo_normalizado: centroCusto,
        _sem_centro_custo: semCentroCusto,
      };
    });
  }, [purchases]);

  const comprasInconsistentes = purchasesWithFlags.filter(
    (p) =>
      (p.status === 'APROVADO_COORD' ||
        p.status === 'APROVADO_ADMIN' ||
        p.status === 'PAGO') &&
      (!p._has_orcamento_vinculado || p._sem_centro_custo)
  );

  const centrosDisponiveis = useMemo(() => {
    const centros = new Set();
    purchasesWithFlags.forEach((p) => {
      if (p._centro_custo_normalizado) {
        centros.add(p._centro_custo_normalizado);
      }
    });
    return Array.from(centros).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [purchasesWithFlags]);

  const filtered = purchasesWithFlags.filter((p) => {
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

    const matchInconsistencia =
      filters.inconsistencias === 'all' ||
      (filters.inconsistencias === 'somente_inconsistentes' &&
        (!p._has_orcamento_vinculado || p._sem_centro_custo)) ||
      (filters.inconsistencias === 'somente_ok' &&
        p._has_orcamento_vinculado &&
        !p._sem_centro_custo);

    const matchCentro =
      filters.centro_custo === 'all' ||
      p._centro_custo_normalizado === filters.centro_custo;

    const busca = filters.search.trim().toLowerCase();
    const matchSearch =
      !busca ||
      p.descricao_item?.toLowerCase().includes(busca) ||
      p.fornecedor_nome?.toLowerCase().includes(busca);

    return (
      matchStatus &&
      matchMeta &&
      matchRubrica &&
      matchInconsistencia &&
      matchCentro &&
      matchSearch
    );
  });

  const pendentesAprovacoes = (purchases || []).filter(
    (p) => p.status === 'SOLICITADO'
  ).length;

  const refreshFinanceiroCompleto = useCallback(async () => {
    await invalidateComprasQueries();
    await Promise.all([
      refetchRubricas(),
      isCoordenador ? refetchAuditoriaRubricas() : Promise.resolve(),
    ]);
  }, [
    invalidateComprasQueries,
    refetchRubricas,
    refetchAuditoriaRubricas,
    isCoordenador,
  ]);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black">
              <ShoppingCart className="h-5 w-5 text-white" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-black">Suprimentos</h1>

                {isCoordenador ? (
                  <span className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    <ShieldCheck className="h-3 w-3" />
                    Coordenador
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    <User className="h-3 w-3" />
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
                className="gap-2 border-black"
                onClick={() => setShowReportGen(true)}
              >
                <FileText className="h-4 w-4" />
                Relatório PDF
              </Button>
            )}

            <Button
              className="bg-black text-white hover:bg-gray-800"
              onClick={() => {
                setEditingPurchase(null);
                setShowForm(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova Solicitação
            </Button>
          </div>
        </div>

        {isCoordenador && comprasInconsistentes.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Há {comprasInconsistentes.length} compra(s) aprovada(s) ou paga(s)
                  com inconsistência de rubrica, linha orçamentária ou centro de custo.
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Essas compras podem não debitar corretamente nas rubricas por
                  museu. Edite cada item e vincule a rubrica correta antes de
                  seguir.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 flex w-fit gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
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
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-white text-black shadow'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'lista' && (
          <div>
            <div className="mb-6 flex flex-wrap gap-3">
              <div className="relative min-w-48 flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
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

              <Select
                value={filters.centro_custo}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, centro_custo: v }))
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Centro de custo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os centros</SelectItem>
                  {centrosDisponiveis.map((centro) => (
                    <SelectItem key={centro} value={centro}>
                      {centro}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.inconsistencias}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, inconsistencias: v }))
                }
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Vínculo orçamentário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="somente_inconsistentes">
                    Apenas inconsistentes
                  </SelectItem>
                  <SelectItem value="somente_ok">
                    Apenas consistentes
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-gray-400">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
                <ShoppingCart className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="font-medium text-gray-400">
                  Nenhuma solicitação encontrada
                </p>
                <Button
                  className="mt-4 bg-black text-white"
                  onClick={() => {
                    setEditingPurchase(null);
                    setShowForm(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
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
                    onRefresh={refreshFinanceiroCompleto}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'rubricas' && (
          <div className="space-y-6">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-blue-900">
                <strong>📊 Integração:</strong> esta aba usa a entity{' '}
                <strong>Rubrica</strong> como fonte de verdade do orçamento e o
                recálculo financeiro por <strong>rubrica + museu</strong>.
              </p>
              <p className="mt-2 text-xs text-blue-700">
                Rubricas carregadas: {Array.isArray(rubricas) ? rubricas.length : 0}
              </p>
            </div>

            {isCoordenador && (
              <AuditoriaRubricasPanel
                auditoria={auditoriaRubricas}
                onRefresh={refreshFinanceiroCompleto}
                isCoordenador={isCoordenador}
              />
            )}

            {selectedRubrica ? (
              <div>
                <button
                  onClick={() => setSelectedRubrica(null)}
                  className="mb-4 text-sm font-medium text-black hover:text-gray-600"
                >
                  ← Voltar
                </button>

                <RubricaDetail
                  rubrica={selectedRubrica}
                  onClose={async () => {
                    setSelectedRubrica(null);
                    await refreshFinanceiroCompleto();
                  }}
                />
              </div>
            ) : (
              <RubricasGrid
                rubricas={rubricas}
                onSelectRubrica={setSelectedRubrica}
                onRefresh={refreshFinanceiroCompleto}
                isCoordenador={isCoordenador}
              />
            )}

            {(loadingRubricas || loadingAuditoriaRubricas) && (
              <div className="text-sm text-gray-400">
                Atualizando dados financeiros...
              </div>
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
              onRefresh={refreshFinanceiroCompleto}
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
          currentUser={currentUser}
          prefill={editingPurchase}
          onClose={() => {
            setShowForm(false);
            setEditingPurchase(null);
          }}
          onSuccess={async () => {
            setShowForm(false);
            setEditingPurchase(null);
            await refreshFinanceiroCompleto();
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
