// 🔥 VERSÃO LIMPA E ESTÁVEL — SEM DUPLICAÇÃO E SEM REGRESSÃO

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
  Pencil,
  Trash2
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
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(v);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getPurchaseOwnerEmails(purchase) {
  return [
    purchase?.created_by,
    purchase?.user_email,
    purchase?.requester_email,
    purchase?.solicitante_email,
    purchase?.email_solicitante,
    purchase?.author_email,
    purchase?.owner_email
  ]
    .map(normalizeEmail)
    .filter(Boolean);
}

function purchaseBelongsToUser(purchase, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  return getPurchaseOwnerEmails(purchase).includes(normalizedEmail);
}

async function carregarSolicitacoes({ isCoordenador, currentUser }) {
  if (!currentUser) return [];

  if (isCoordenador) {
    return await base44.entities.PurchaseRequest.list('-created_date', 500);
  }

  const email = normalizeEmail(currentUser?.email);
  const resultados = [];

  const pushArray = (items) => {
    if (Array.isArray(items)) resultados.push(...items);
  };

  try {
    pushArray(
      await base44.entities.PurchaseRequest.filter(
        { created_by: currentUser?.email },
        '-created_date',
        300
      )
    );
  } catch (error) {
    console.error('Erro ao buscar PurchaseRequest por created_by:', error);
  }

  try {
    pushArray(
      await base44.entities.PurchaseRequest.filter(
        { user_email: currentUser?.email },
        '-created_date',
        300
      )
    );
  } catch (error) {
    console.error('Erro ao buscar PurchaseRequest por user_email:', error);
  }

  try {
    pushArray(
      await base44.entities.PurchaseRequest.filter(
        { requester_email: currentUser?.email },
        '-created_date',
        300
      )
    );
  } catch (error) {
    console.error('Erro ao buscar PurchaseRequest por requester_email:', error);
  }

  try {
    const listaGeral = await base44.entities.PurchaseRequest.list('-created_date', 500);
    pushArray(listaGeral.filter((purchase) => purchaseBelongsToUser(purchase, email)));
  } catch (error) {
    console.error('Erro ao buscar lista geral de PurchaseRequest:', error);
  }

  const dedup = new Map();
  resultados
    .filter(Boolean)
    .forEach((purchase) => {
      if (purchase?.id && purchaseBelongsToUser(purchase, email)) {
        dedup.set(purchase.id, purchase);
      }
    });

  return Array.from(dedup.values()).sort((a, b) => {
    const da = new Date(a?.created_date || 0).getTime();
    const db = new Date(b?.created_date || 0).getTime();
    return db - da;
  });
}

function TabelaSolicitacoes({
  purchases,
  rubricas,
  isCoordenador,
  currentUser,
  onEdit,
  onDelete
}) {
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
            <th className="px-3 py-3 font-medium text-gray-600">Descrição</th>
            <th className="px-3 py-3 font-medium text-gray-600">Fornecedor</th>
            <th className="px-3 py-3 font-medium text-gray-600">Centro</th>
            <th className="px-3 py-3 font-medium text-gray-600">Rubrica</th>
            <th className="px-3 py-3 font-medium text-gray-600">Status</th>
            <th className="px-3 py-3 text-right font-medium text-gray-600">Valor</th>
            <th className="px-3 py-3 text-center font-medium text-gray-600">Ações</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p, i) => {
            const status = STATUS_CONFIG[p.status] || {
              label: p.status,
              color: 'bg-gray-100 text-gray-600'
            };

            const rubrica = p.rubrica_id ? rubricaById[p.rubrica_id] : null;
            const rubricaNome =
              p?.rubrica_nome ||
              p?.rubrica ||
              rubrica?.rubrica ||
              rubrica?.nome ||
              '—';

            const valor = getPurchaseValue(p);

            const inconsistente =
              (p.status === 'APROVADO_COORD' ||
                p.status === 'APROVADO_ADMIN' ||
                p.status === 'PAGO') &&
              (!p._has_orcamento_vinculado || p._sem_centro_custo);

            const podeEditar =
              isCoordenador || purchaseBelongsToUser(p, currentUser?.email);

            return (
              <tr
                key={p.id}
                className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                } ${inconsistente ? 'bg-amber-50/60' : ''}`}
              >
                <td className="max-w-xs px-3 py-2.5">
                  <p className="truncate font-medium text-gray-900">
                    {p.descricao_item || p.objeto || '—'}
                  </p>

                  {p.meta_id && (
                    <p className="text-xs text-gray-400">{p.meta_id}</p>
                  )}

                  {inconsistente && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      Sem vínculo
                    </span>
                  )}
                </td>

                <td className="px-3 py-2.5 text-gray-600">
                  {p.fornecedor_nome || '—'}
                </td>

                <td className="px-3 py-2.5">
                  {p._centro_custo_normalizado ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {p._centro_custo_normalizado}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>

                <td className="max-w-[160px] px-3 py-2.5">
                  <span className="truncate text-left text-xs text-gray-700">
                    {rubricaNome}
                  </span>
                </td>

                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
                  >
                    {status.label}
                  </span>
                </td>

                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-gray-900">
                  {fmtBRL(valor)}
                </td>

                <td className="px-3 py-2.5 text-center flex items-center justify-center gap-2">
                  {podeEditar && (
                    <button
                      onClick={() => onEdit(p)}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-black"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isCoordenador && (
                    <button
                      onClick={() => {
                        if (window.confirm('Tem certeza que deseja deletar esta solicitação?')) {
                          onDelete(p.id);
                        }
                      }}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Deletar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
  const [showReportGen, setShowReportGen] = useState(false);
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    meta_id: 'all',
    search: '',
    rubrica_id: 'all',
    inconsistencias: 'all',
    centro_custo: 'all'
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
    'COORD_PRODUCAO'
  ].includes(currentUser?.role);

  const invalidateComprasQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['purchase-documents-all'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['team-member-own'] }),
      queryClient.invalidateQueries({
        queryKey: ['team-members-all-for-coordinator']
      }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'] })
    ]);
  }, [queryClient]);

  const { data: userPermission } = useQuery({
    queryKey: ['user-permission', currentUser?.email],
    queryFn: async () => {
      try {
        const result = await base44.entities.UserPermission.filter({
          user_email: currentUser?.email
        });
        return result?.[0] || null;
      } catch {
        return null;
      }
    },
    enabled: !!currentUser?.email
  });

  const hasGestaoCompras =
    isCoordenador || userPermission?.gestao_compras === true;

  const podeAprovarSolicitacoes =
    isCoordenador || userPermission?.pode_aprovar_solicitacoes === true;

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases', isCoordenador, currentUser?.email],
    queryFn: () =>
      carregarSolicitacoes({
        isCoordenador,
        currentUser
      }),
    enabled: !!currentUser
  });

  const { data: anexosCompras = [] } = useQuery({
    queryKey: ['attachments-compras'],
    queryFn: async () => {
      const list = await base44.entities.Attachment.list('-created_date', 300);
      return list.filter(att =>
        att.nf_categoria === 'nota_fiscal' ||
        att.description?.toLowerCase().includes('entrada única') ||
        att.description?.toLowerCase().includes('entrada unica')
      );
    },
    enabled: !!currentUser
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
    enabled: !!currentUser
  });

  const { budgetLines } = useBudgetLines();

  const {
    data: rubricas = [],
    refetch: refetchRubricas,
    isLoading: loadingRubricas
  } = useQuery({
    queryKey: ['rubricas'],
    queryFn: carregarRubricas,
    enabled: !!currentUser,
    staleTime: 0
  });

  const { data: rubricasForTotalUtilizado = [] } = useQuery({
    queryKey: ['rubricas-total-utilizado'],
    queryFn: async () => {
      try {
        return await base44.entities.Rubrica.list('rubrica', 200);
      } catch {
        return [];
      }
    },
    enabled: !!currentUser
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
        _sem_centro_custo: semCentroCusto
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
    const matchStatus =
      filters.status === 'all' || p.status === filters.status;

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
      String(p.descricao_item || '').toLowerCase().includes(busca) ||
      String(p.fornecedor_nome || '').toLowerCase().includes(busca) ||
      String(p.objeto || '').toLowerCase().includes(busca);

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

  const totalUtilizado = useMemo(() => {
    return (rubricasForTotalUtilizado || []).reduce(
      (s, r) => s + (r.valor_utilizado || 0),
      0
    );
  }, [rubricasForTotalUtilizado]);

  const TOTAL_PREVISTO = 1320000;

  const refreshFinanceiroCompleto = useCallback(async () => {
    await invalidateComprasQueries();
    await refetchRubricas();
  }, [invalidateComprasQueries, refetchRubricas]);

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
                  Essas compras podem não debitar corretamente nas rubricas. Edite
                  cada item e vincule a rubrica correta.
                </p>
              </div>
            </div>
          </div>
        )}

        {isCoordenador && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">Total Previsto</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {fmtBRL(TOTAL_PREVISTO)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">Total Utilizado</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {fmtBRL(totalUtilizado)}
              </p>
              <p className="text-xs text-gray-400">
                Aprovado coord. + admin + pago
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">Saldo Disponível</p>
              <p
                className={`mt-1 text-xl font-bold ${
                  TOTAL_PREVISTO - totalUtilizado < 0
                    ? 'text-red-600'
                    : 'text-green-700'
                }`}
              >
                {fmtBRL(TOTAL_PREVISTO - totalUtilizado)}
              </p>
              <p className="text-xs text-gray-400">
                {TOTAL_PREVISTO > 0
                  ? Math.round((totalUtilizado / TOTAL_PREVISTO) * 100)
                  : 0}
                % utilizado
              </p>
            </div>
          </div>
        )}

        {isCoordenador && (
          <div className="mb-6">
            <OrcamentoDashboard
              budgetLines={budgetLines || []}
              purchases={purchases || []}
              rubricas={rubricas || []}
            />
          </div>
        )}

        {isCoordenador && (
          <div className="mb-6">
            <ImportarOrcamento onImportSuccess={refreshFinanceiroCompleto} />
          </div>
        )}

        <div className="-mx-4 mb-6 flex w-fit gap-1 overflow-x-auto rounded-none bg-gray-100 p-1 px-4 md:-mx-6 md:px-6">
          {[
            { id: 'lista', label: 'Solicitações' },
            ...(isCoordenador ? [{ id: 'rubricas', label: 'Rubricas' }] : []),
            { id: 'documentos', label: 'Documentos' },
            { id: 'equipe', label: 'Equipe' },
            ...(podeAprovarSolicitacoes || hasGestaoCompras
              ? [
                  {
                    id: 'aprovacoes',
                    label: `Aprovações${
                      pendentesAprovacoes > 0 ? ` (${pendentesAprovacoes})` : ''
                    }`
                  }
                ]
              : []),
            {
              id: 'pagamentos',
              label: isCoordenador ? 'Pagamentos da Equipe' : 'Meus Pagamentos'
            }
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
            <div className="mb-4 flex flex-wrap gap-3">
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
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Rubrica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as rubricas</SelectItem>
                  {(rubricas || [])
                    .filter((r) => r?.ativo !== false)
                    .sort((a, b) =>
                      String(a?.rubrica || a?.nome || '').localeCompare(
                        String(b?.rubrica || b?.nome || ''),
                        'pt-BR'
                      )
                    )
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.rubrica || r.nome}
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
                <SelectTrigger className="w-44">
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
                <SelectTrigger className="w-52">
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

            <p className="mb-3 text-sm text-gray-500">
              {filtered.length} solicitaç{filtered.length !== 1 ? 'ões' : 'ão'}
              {filters.status !== 'all' || filters.search ? ' (filtradas)' : ''}
            </p>

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
              <TabelaSolicitacoes
                purchases={filtered}
                rubricas={rubricas}
                isCoordenador={isCoordenador}
                currentUser={currentUser}
                onEdit={(purchase) => {
                  setEditingPurchase(purchase);
                  setShowForm(true);
                }}
                onDelete={async (purchaseId) => {
                  try {
                    await base44.entities.PurchaseRequest.delete(purchaseId);
                    await invalidateComprasQueries();
                  } catch (error) {
                    console.error('Erro ao deletar solicitação:', error);
                    alert('Erro ao deletar solicitação');
                  }
                }}
              />
            )}
          </div>
        )}

        {tab === 'rubricas' && isCoordenador && (
          <div className="space-y-6">
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
                totalPrevisto={TOTAL_PREVISTO}
              />
            )}

            {loadingRubricas && (
              <div className="text-sm text-gray-400">
                Atualizando dados financeiros...
              </div>
            )}
          </div>
        )}

        {tab === 'documentos' && (
          <div className="max-w-7xl space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-black mb-3">Documentos (Entrada Única)</h3>
              {anexosCompras.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum documento vinculado</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {anexosCompras.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between border p-3 rounded hover:bg-gray-50 transition">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                        <p className="text-xs text-gray-500">
                          {doc.nf_emitente_nome || 'Documento'} • 
                          {doc.nf_valor_total ? ` R$ ${Number(doc.nf_valor_total).toLocaleString('pt-BR')}` : ''}
                          {doc.nf_numero ? ` • NF ${doc.nf_numero}` : ''}
                        </p>
                      </div>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 px-3 py-1 bg-black text-white text-xs rounded hover:bg-gray-800 flex-shrink-0"
                      >
                        Ver
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <GestaoDocumental />
          </div>
        )}

        {tab === 'equipe' && <TeamManager budgetLines={budgetLines} />}

        {tab === 'pagamentos' && (
          isCoordenador ? (
            <TeamPaymentReview members={[]} budgetLines={budgetLines} />
          ) : (
            <TeamPaymentSubmit userEmail={currentUser?.email} />
          )
        )}

        {tab === 'aprovacoes' && (podeAprovarSolicitacoes || hasGestaoCompras) && (
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