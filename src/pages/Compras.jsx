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
  CheckCircle2,
  RotateCcw,
  XCircle
} from 'lucide-react';

import RequireAuth from '@/components/auth/RequireAuth';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import OrcamentoDashboard from '@/components/compras/OrcamentoDashboard';
import ImportarOrcamento from '@/components/compras/ImportarOrcamento';
import TeamManager from '@/components/compras/TeamManager';
import ContractActivityReportGenerator from '@/components/compras/ContractActivityReportGenerator';
import { useBudgetLines } from '@/components/compras/useBudgetLines';
import GestaoDocumental from '@/pages/GestaoDocumental';
import RubricasGrid from '@/components/compras/RubricasGrid';
import RubricaDetail from '@/components/rubricas/RubricaDetail';
import AuditoriaFinanceiraCard from '@/components/compras/AuditoriaFinanceiraCard';

// ─── Constantes ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  RASCUNHO:       { label: 'Rascunho',  color: 'bg-gray-100 text-gray-700' },
  SOLICITADO:     { label: 'Solicitado', color: 'bg-blue-100 text-blue-700' },
  DEVOLVIDO:      { label: 'Devolvido', color: 'bg-amber-100 text-amber-700' },
  APROVADO_COORD: { label: 'Aprovado',  color: 'bg-green-100 text-green-700' },
  APROVADO_ADMIN: { label: 'Aprovado',  color: 'bg-green-100 text-green-700' },
  RECUSADO:       { label: 'Reprovado', color: 'bg-red-100 text-red-700' },
  CANCELADO:      { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
  PAGO:           { label: 'Aprovado',  color: 'bg-green-100 text-green-700' },
  APROVADO:       { label: 'Aprovado',  color: 'bg-green-100 text-green-700' }
};

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

const TOTAL_PREVISTO_FALLBACK = 1320000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeCentro(value) {
  const raw = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';
  if (raw === 'geral' || raw === 'atuação geral' || raw === 'atuacao geral') return 'Geral';
  if (raw === 'rateado') return 'Rateado';
  if (raw === 'publicacoes') return 'Publicações';
  if (raw === 'noturno nos museus 2026') return 'Noturno nos Museus 2026';
  if (raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function getPurchaseValue(p) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_aprovado_admin) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_final) ||
    toNumber(p?.valor_solicitado) ||
    toNumber(p?.valor_total) ||
    0
  );
}

// Chave de deduplicidade fiscal
function getChaveFiscal(p) {
  if (p?.nf_numero && (p?.fornecedor_cpf_cnpj || p?.nf_emitente_cpf_cnpj)) {
    return `nf:${String(p.nf_numero).trim()}:${String(p.fornecedor_cpf_cnpj || p.nf_emitente_cpf_cnpj).replace(/\D/g, '')}`;
  }
  if (p?.nota_fiscal_url) return `url:${p.nota_fiscal_url.trim()}`;
  if (p?.file_url) return `file:${p.file_url.trim()}`;
  if (p?.intake_id) return `intake:${p.intake_id.trim()}`;
  return null;
}

function getPurchaseBudgetlineId(purchase) {
  return purchase?.budgetline_id || purchase?.budget_line_id || purchase?.linha_orcamentaria_id || null;
}

function getPurchaseFileUrl(purchase, attachmentByPurchaseId = {}) {
  return (
    purchase?.file_url ||
    purchase?.arquivo_url ||
    purchase?.documento_url ||
    purchase?.nota_fiscal_url ||
    purchase?.nf_pdf_url ||
    purchase?.pdf_url ||
    purchase?.attachment_url ||
    attachmentByPurchaseId?.[purchase?.id]?.file_url ||
    ''
  );
}

function isCompraEquipe(purchase) {
  const raw = [
    purchase?.tipo_origem, purchase?.origem, purchase?.categoria,
    purchase?.tipo_solicitacao, purchase?.descricao_item, purchase?.observacoes
  ].map((v) => String(v || '').toLowerCase()).join(' ');
  return (
    !!purchase?.team_payment_id ||
    raw.includes('team') ||
    raw.includes('equipe') ||
    raw.includes('pagamento da equipe') ||
    raw.includes('pagamento equipe')
  );
}

function isEntradaUnicaAttachment(att) {
  const description = normalizeText(att?.description);
  const fileName    = normalizeText(att?.file_name);
  const nfCategoria = normalizeText(att?.nf_categoria);
  const nfTipo      = normalizeText(att?.nf_tipo_documento);
  return (
    nfCategoria === 'nota_fiscal' || nfTipo === 'pdf_nf' || nfTipo === 'xml_nf' ||
    description.includes('entrada unica') || description.includes('nota fiscal') ||
    fileName.includes('museus centro') ||
    !!att?.nf_numero || !!att?.nf_emitente_nome || !!att?.nf_valor_total
  );
}

function dedupById(items) {
  const map = new Map();
  (items || []).forEach((item) => { if (item?.id && !map.has(item.id)) map.set(item.id, item); });
  return Array.from(map.values());
}

function getPurchaseOwnerEmails(purchase) {
  return [
    purchase?.created_by, purchase?.user_email, purchase?.requester_email,
    purchase?.solicitante_email, purchase?.email_solicitante, purchase?.author_email, purchase?.owner_email
  ].map(normalizeEmail).filter(Boolean);
}

function purchaseBelongsToUser(purchase, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  return getPurchaseOwnerEmails(purchase).includes(normalizedEmail);
}

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

async function carregarSolicitacoes({ isCoordenador, currentUser }) {
  if (!currentUser) return [];

  if (isCoordenador) {
    return await base44.entities.PurchaseRequest.list('-created_date', 500);
  }

  const email = normalizeEmail(currentUser?.email);
  const resultados = [];

  try {
    const r = await base44.entities.PurchaseRequest.filter({ created_by: currentUser?.email }, '-created_date', 300);
    if (Array.isArray(r)) resultados.push(...r);
  } catch (error) {
    console.error('Erro ao buscar PurchaseRequest por created_by:', error);
  }

  try {
    const listaGeral = await base44.entities.PurchaseRequest.list('-created_date', 500);
    resultados.push(...listaGeral.filter((p) => purchaseBelongsToUser(p, email)));
  } catch (error) {
    console.error('Erro ao buscar lista geral de PurchaseRequest:', error);
  }

  const dedup = new Map();
  resultados.filter(Boolean).forEach((p) => {
    if (p?.id && purchaseBelongsToUser(p, email)) dedup.set(p.id, p);
  });

  return Array.from(dedup.values()).sort((a, b) =>
    new Date(b?.created_date || 0) - new Date(a?.created_date || 0)
  );
}

// ─── TabelaSolicitacoes ───────────────────────────────────────────────────────

function TabelaSolicitacoes({
  purchases, rubricas, attachmentByPurchaseId,
  isCoordenador, currentUser, podeAprovarSolicitacoes, hasGestaoCompras,
  onDelete, onApprove, onReturn, onUnapprove, onAccess
}) {
  const [menuOpenId, setMenuOpenId] = useState(null);

  const rubricaById = useMemo(() => {
    const m = {};
    (rubricas || []).forEach((r) => { if (r?.id) m[r.id] = r; });
    return m;
  }, [rubricas]);

  if (!purchases || purchases.length === 0) return null;

  const podeAprovar = isCoordenador || podeAprovarSolicitacoes === true || hasGestaoCompras === true;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[27%]" /><col className="w-[14%]" /><col className="w-[8%]" />
          <col className="w-[15%]" /><col className="w-[10%]" /><col className="w-[10%]" />
          <col className="w-[7%]"  /><col className="w-[9%]"  />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-3 py-3 font-medium text-gray-600">Descrição</th>
            <th className="px-3 py-3 font-medium text-gray-600">Fornecedor</th>
            <th className="px-3 py-3 font-medium text-gray-600">Centro</th>
            <th className="px-3 py-3 font-medium text-gray-600">Rubrica</th>
            <th className="px-3 py-3 font-medium text-gray-600">Status</th>
            <th className="px-3 py-3 text-right font-medium text-gray-600">Valor</th>
            <th className="px-3 py-3 text-center font-medium text-gray-600">Arquivo</th>
            <th className="px-3 py-3 text-center font-medium text-gray-600">Ações</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p, i) => {
            const statusKey = normalizeStatus(p.status);
            const status    = STATUS_CONFIG[statusKey] || { label: p.status || '—', color: 'bg-gray-100 text-gray-600' };
            const aprovado         = STATUS_APROVADOS.has(statusKey);
            const pendenteAprovacao = !aprovado && statusKey !== 'RECUSADO' && statusKey !== 'CANCELADO';
            const rubrica    = p.rubrica_id ? rubricaById[p.rubrica_id] : null;
            const rubricaNome = p?.rubrica_nome || p?.rubrica || rubrica?.rubrica || rubrica?.nome || '—';
            const valor      = getPurchaseValue(p);
            const fileUrl    = getPurchaseFileUrl(p, attachmentByPurchaseId);
            const compraEquipe = isCompraEquipe(p);
            const menuAberto = menuOpenId === p.id;

            return (
              <tr key={p.id} className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                <td className="px-3 py-2.5 align-top">
                  <p className="line-clamp-2 font-medium text-gray-900">{p.descricao_item || p.objeto || '—'}</p>
                  {p.meta_id && <p className="truncate text-xs text-gray-400">{p.meta_id}</p>}
                  {compraEquipe && (
                    <span className="mt-1 inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">Equipe</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top text-gray-600">
                  <p className="truncate">{p.fornecedor_nome || p.nf_emitente_nome || '—'}</p>
                </td>
                <td className="px-3 py-2.5 align-top">
                  {p._centro_custo_normalizado ? (
                    <span className="inline-block max-w-full truncate rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{p._centro_custo_normalizado}</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <p className="truncate text-xs text-gray-700">{rubricaNome}</p>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>{status.label}</span>
                </td>
                <td className="px-3 py-2.5 align-top text-right font-medium tabular-nums text-gray-900">
                  <span className="block truncate">{fmtBRL(valor)}</span>
                </td>
                <td className="px-3 py-2.5 align-top text-center">
                  {fileUrl ? (
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">Arquivo</a>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <div className="relative flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId((c) => (c === p.id ? null : p.id)); }}
                      className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-black"
                      title="Ações"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    {isCoordenador && (
                      <button
                        type="button"
                        onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (window.confirm('Tem certeza que deseja deletar esta solicitação?')) await onDelete(p.id); }}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Deletar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {menuAberto && (
                      <div className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-lg">
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(null); onAccess(p); }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          Acessar solicitação
                        </button>

                        {podeAprovar && pendenteAprovacao && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(null); onApprove(p); }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-green-700 hover:bg-green-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Aprovar
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(null); onReturn(p); }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Devolver
                            </button>
                          </>
                        )}

                        {podeAprovar && aprovado && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpenId(null); onUnapprove(p); }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Desaprovar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── ComprasInner ─────────────────────────────────────────────────────────────

function ComprasInner() {
  const smartToast = useSmartToast();
  const [currentUser, setCurrentUser]       = useState(null);
  const [tab, setTab]                       = useState('lista');
  const [showForm, setShowForm]             = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [showReportGen, setShowReportGen]   = useState(false);
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const [recalculando, setRecalculando]     = useState(false);
  const [filters, setFilters] = useState({
    status: 'all', meta_id: 'all', search: '', rubrica_id: 'all',
    inconsistencias: 'all', centro_custo: 'all'
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then((u) => setCurrentUser(u)).catch(() => setCurrentUser(null));
  }, []);

  const isCoordenador = ['admin', 'ADMIN', 'COORDENADOR', 'COORD_COMUNICACAO', 'COORD_ADMINISTRATIVA', 'COORD_PRODUCAO'].includes(currentUser?.role);

  const invalidateComprasQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['attachments-compras'] }),
      queryClient.invalidateQueries({ queryKey: ['purchase-documents-all'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['team-member-own'] }),
      queryClient.invalidateQueries({ queryKey: ['team-members-all-for-coordinator'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'] })
    ]);
  }, [queryClient]);

  const { data: userPermission } = useQuery({
    queryKey: ['user-permission', currentUser?.email],
    queryFn: async () => {
      try {
        const result = await base44.entities.UserPermission.filter({ user_email: currentUser?.email });
        return result?.[0] || null;
      } catch { return null; }
    },
    enabled: !!currentUser?.email
  });

  const hasGestaoCompras        = isCoordenador || userPermission?.gestao_compras === true;
  const podeAprovarSolicitacoes = isCoordenador || userPermission?.pode_aprovar_solicitacoes === true;

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases', isCoordenador, currentUser?.email],
    queryFn: () => carregarSolicitacoes({ isCoordenador, currentUser }),
    enabled: !!currentUser
  });

  const { data: anexosCompras = [] } = useQuery({
    queryKey: ['attachments-compras'],
    queryFn: async () => {
      const list = await base44.entities.Attachment.list('-created_date', 500);
      const docs = dedupById((list || []).filter(isEntradaUnicaAttachment));
      return docs.sort((a, b) => new Date(b?.created_date || 0) - new Date(a?.created_date || 0));
    },
    enabled: !!currentUser
  });

  const attachmentByPurchaseId = useMemo(() => {
    const map = {};
    (anexosCompras || []).forEach((doc) => {
      const purchaseId = doc?.purchase_id || doc?.purchase_request_id || doc?.purchaseRequestId || doc?.solicitacao_id;
      if (purchaseId && !map[purchaseId]) map[purchaseId] = doc;
    });
    return map;
  }, [anexosCompras]);

  useQuery({
    queryKey: ['purchase-documents-all', isCoordenador, currentUser?.email],
    queryFn: async () => {
      const docs = await base44.entities.PurchaseDocument.list('-created_date', 300);
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

  // ── Totais consolidados a partir das rubricas (fonte da verdade) ──────────
  const totaisConsolidados = useMemo(() => {
    const ativas = (rubricas || []).filter((r) => r?.ativo !== false);
    const totalPrevisto  = ativas.reduce((acc, r) => acc + toNumber(r.valor_rubrica || r.valor_total), 0);
    const totalUtilizado = ativas.reduce((acc, r) => acc + toNumber(r.valor_utilizado), 0);
    const saldo          = totalPrevisto - totalUtilizado;
    return { totalPrevisto, totalUtilizado, saldo };
  }, [rubricas]);

  const purchasesWithFlags = useMemo(() => {
    return (purchases || []).map((p) => {
      const hasBudgetline = !!getPurchaseBudgetlineId(p);
      const hasRubrica    = !!p.rubrica_id;
      const centroCusto   = normalizeCentro(p?.centro_custo);
      return {
        ...p,
        _has_budgetline:         hasBudgetline,
        _has_rubrica:            hasRubrica,
        _has_orcamento_vinculado: hasRubrica || hasBudgetline,
        _centro_custo_normalizado: centroCusto,
        _sem_centro_custo:       !centroCusto
      };
    });
  }, [purchases]);

  const centrosDisponiveis = useMemo(() => {
    const centros = new Set();
    purchasesWithFlags.forEach((p) => { if (p._centro_custo_normalizado) centros.add(p._centro_custo_normalizado); });
    return Array.from(centros).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [purchasesWithFlags]);

  const filtered = purchasesWithFlags.filter((p) => {
    const matchStatus = filters.status === 'all' || normalizeStatus(p.status) === filters.status;

    let matchMeta = filters.meta_id === 'all';
    if (!matchMeta && filters.meta_id === 'produto') matchMeta = p.tipo_item === 'produto' || p.tipo_gasto === 'Produto';
    if (!matchMeta && filters.meta_id === 'servico')  matchMeta = p.tipo_item === 'servico' || p.tipo_gasto === 'Serviço';
    if (!matchMeta) matchMeta = p.meta_id === filters.meta_id;

    const matchRubrica         = filters.rubrica_id === 'all' || p.rubrica_id === filters.rubrica_id;
    const matchInconsistencia  = filters.inconsistencias === 'all' ||
      (filters.inconsistencias === 'somente_inconsistentes' && (!p._has_orcamento_vinculado || p._sem_centro_custo)) ||
      (filters.inconsistencias === 'somente_ok' && p._has_orcamento_vinculado && !p._sem_centro_custo);
    const matchCentro          = filters.centro_custo === 'all' || p._centro_custo_normalizado === filters.centro_custo;
    const busca = filters.search.trim().toLowerCase();
    const matchSearch          = !busca ||
      String(p.descricao_item || '').toLowerCase().includes(busca) ||
      String(p.fornecedor_nome || '').toLowerCase().includes(busca) ||
      String(p.objeto || '').toLowerCase().includes(busca);

    return matchStatus && matchMeta && matchRubrica && matchInconsistencia && matchCentro && matchSearch;
  });

  const refreshFinanceiroCompleto = useCallback(async () => {
    await invalidateComprasQueries();
    await refetchRubricas();
  }, [invalidateComprasQueries, refetchRubricas]);

  // ── Aprovação com anti-duplicidade e fallback frontend ───────────────────
  async function handleApprovePurchase(purchase) {
    if (!purchase?.id) return;
    if (!purchase?.rubrica_id) {
      smartToast.error('Não é possível aprovar sem rubrica vinculada.');
      return;
    }

    const jaDebitado = !!purchase.rubrica_debitada_em || !!purchase.financeiro_lancado_em;
    const chaveFiscal = getChaveFiscal(purchase);

    // Anti-duplicidade: verifica se a mesma NF já foi aprovada em outra solicitação
    if (chaveFiscal && !jaDebitado) {
      try {
        const todasAprovadas = await base44.entities.PurchaseRequest.list('-created_date', 500);
        const duplicada = todasAprovadas.find(
          (p) => p.id !== purchase.id && STATUS_APROVADOS.has(normalizeStatus(p.status)) && getChaveFiscal(p) === chaveFiscal
        );
        if (duplicada) {
          smartToast.error('Esta nota fiscal já foi aprovada em outra solicitação. Débito bloqueado.');
          return;
        }
      } catch (_) { /* se não conseguir verificar, prossegue */ }
    }

    try {
      let backendOk = false;
      try {
        const response = await base44.functions.invoke('purchaseActions', { purchaseId: purchase.id, action: 'aprovar' });
        const result = response?.data || response;
        if (result?.success) backendOk = true;
      } catch (_) { /* backend indisponível — fallback abaixo */ }

      if (!backendOk) {
        const valor = getPurchaseValue(purchase);

        if (!jaDebitado && valor > 0) {
          const rubrica = await base44.entities.Rubrica.get(purchase.rubrica_id);
          if (rubrica) {
            const total          = toNumber(rubrica.valor_rubrica || rubrica.valor_total);
            const utilizadoAtual = toNumber(rubrica.valor_utilizado);
            const novoUtilizado  = utilizadoAtual + valor;
            const novoSaldo      = total - novoUtilizado;
            const percentual     = total > 0 ? (novoUtilizado / total) * 100 : 0;

            await base44.entities.Rubrica.update(rubrica.id, {
              valor_utilizado: novoUtilizado,
              saldo: novoSaldo,
              saldo_real: novoSaldo,
              percentual_utilizado: percentual
            });
          }
        }

        await base44.entities.PurchaseRequest.update(purchase.id, {
          status: 'APROVADO_COORD',
          rubrica_debitada_em:    purchase.rubrica_debitada_em    || new Date().toISOString(),
          rubrica_debitada_valor: purchase.rubrica_debitada_valor || getPurchaseValue(purchase),
          financeiro_lancado_em:  purchase.financeiro_lancado_em  || new Date().toISOString()
        });
      }

      await refreshFinanceiroCompleto();
      smartToast.success('Solicitação aprovada e rubrica debitada.');
    } catch (error) {
      console.error('Erro ao aprovar solicitação:', error);
      smartToast.error('Erro ao aprovar', error.message);
    }
  }

  async function handleReturnPurchase(purchase) {
    if (!purchase?.id) return;
    const comentario = window.prompt('Informe o comentário de devolução:', 'Devolvido pela coordenação para ajustes.');
    if (comentario === null) return;
    try {
      const response = await base44.functions.invoke('purchaseActions', { purchaseId: purchase.id, action: 'devolver', comentario: comentario || 'Devolvido pela coordenação.' });
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || 'Falha ao devolver.');
      await refreshFinanceiroCompleto();
      smartToast.success('Solicitação devolvida.');
    } catch (error) {
      // Fallback: atualiza status diretamente
      try {
        await base44.entities.PurchaseRequest.update(purchase.id, { status: 'DEVOLVIDO', comentario_devolucao: comentario || '' });
        await refreshFinanceiroCompleto();
        smartToast.success('Solicitação devolvida.');
      } catch (e2) {
        smartToast.error('Erro ao devolver', e2.message);
      }
    }
  }

  async function handleUnapprovePurchase(purchase) {
    if (!purchase?.id) return;
    const comentario = window.prompt('Informe o motivo da desaprovação:', 'Desaprovado pela coordenação.');
    if (comentario === null) return;
    try {
      const response = await base44.functions.invoke('purchaseActions', { purchaseId: purchase.id, action: 'desaprovar', comentario: comentario || 'Desaprovado pela coordenação.' });
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || 'Falha ao desaprovar.');
      await refreshFinanceiroCompleto();
      smartToast.success('Solicitação desaprovada e valor estornado da rubrica.');
    } catch (error) {
      // Fallback: estornar rubrica e atualizar status
      try {
        const valor = getPurchaseValue(purchase);
        if (purchase.rubrica_id && valor > 0 && purchase.rubrica_debitada_em) {
          const rubrica = await base44.entities.Rubrica.get(purchase.rubrica_id);
          if (rubrica) {
            const total          = toNumber(rubrica.valor_rubrica || rubrica.valor_total);
            const utilizadoAtual = toNumber(rubrica.valor_utilizado);
            const novoUtilizado  = Math.max(0, utilizadoAtual - valor);
            const novoSaldo      = total - novoUtilizado;
            const percentual     = total > 0 ? (novoUtilizado / total) * 100 : 0;
            await base44.entities.Rubrica.update(rubrica.id, { valor_utilizado: novoUtilizado, saldo: novoSaldo, saldo_real: novoSaldo, percentual_utilizado: percentual });
          }
        }
        await base44.entities.PurchaseRequest.update(purchase.id, { status: 'RECUSADO', rubrica_debitada_em: null, rubrica_debitada_valor: null, financeiro_lancado_em: null });
        await refreshFinanceiroCompleto();
        smartToast.success('Solicitação desaprovada e valor estornado da rubrica.');
      } catch (e2) {
        smartToast.error('Erro ao desaprovar', e2.message);
      }
    }
  }

  async function handleDeletePurchase(purchaseId) {
    try {
      try {
        const response = await base44.functions.invoke('purchaseActions', { purchaseId, action: 'deletar' });
        const result = response?.data || response;
        if (!result?.success) throw new Error(result?.error || 'Falha ao deletar.');
      } catch (_) {
        await base44.entities.PurchaseRequest.delete(purchaseId);
      }
      await refreshFinanceiroCompleto();
      smartToast.success('Solicitação deletada.');
    } catch (error) {
      console.error('Erro ao deletar solicitação:', error);
      smartToast.error('Erro ao deletar', error.message);
    }
  }

  // ── Recálculo geral idempotente ───────────────────────────────────────────
  async function recalcularTodasRubricas() {
    if (!window.confirm('Recalcular valor_utilizado de todas as rubricas com base nas solicitações aprovadas?\n\nEssa operação é idempotente e pode ser repetida com segurança.')) return;
    setRecalculando(true);

    try {
      const [todasRubricas, todasPurchases] = await Promise.all([
        base44.entities.Rubrica.list('rubrica', 300),
        base44.entities.PurchaseRequest.list('-created_date', 1000)
      ]);

      const aprovadas = todasPurchases.filter(
        (p) => STATUS_APROVADOS.has(normalizeStatus(p.status)) && p.rubrica_id
      );

      // Deduplicar por chave fiscal — prioriza mais antiga ou quem já tem rubrica_debitada_em
      const chavesVistas       = new Map();
      const purchasesValidas   = new Set();
      const purchasesDuplicadas = [];

      const aprovadosOrdenados = [...aprovadas].sort(
        (a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0)
      );

      for (const p of aprovadosOrdenados) {
        const chave = getChaveFiscal(p);
        if (!chave) { purchasesValidas.add(p.id); continue; }

        if (chavesVistas.has(chave)) {
          const validoId = chavesVistas.get(chave);
          const valido   = aprovadosOrdenados.find((x) => x.id === validoId);
          if (!valido?.rubrica_debitada_em && p.rubrica_debitada_em) {
            purchasesValidas.delete(validoId);
            purchasesDuplicadas.push(validoId);
            purchasesValidas.add(p.id);
            chavesVistas.set(chave, p.id);
          } else {
            purchasesDuplicadas.push(p.id);
          }
        } else {
          chavesVistas.set(chave, p.id);
          purchasesValidas.add(p.id);
        }
      }

      // Somar por rubrica apenas para válidas
      const somasPorRubrica = {};
      const validasDetalhes = aprovadosOrdenados.filter((p) => purchasesValidas.has(p.id));
      for (const p of validasDetalhes) {
        somasPorRubrica[p.rubrica_id] = (somasPorRubrica[p.rubrica_id] || 0) + getPurchaseValue(p);
      }

      // Atualizar rubricas
      const atualizacoes = todasRubricas.map((r) => {
        const total     = toNumber(r.valor_rubrica || r.valor_total);
        const utilizado = somasPorRubrica[r.id] || 0;
        const saldo     = total - utilizado;
        const percentual = total > 0 ? (utilizado / total) * 100 : 0;
        return base44.entities.Rubrica.update(r.id, { valor_utilizado: utilizado, saldo, saldo_real: saldo, percentual_utilizado: percentual });
      });

      // Marcar duplicadas
      const atualizacoesDup = purchasesDuplicadas.map((id) =>
        base44.entities.PurchaseRequest.update(id, { duplicada: true, observacao_duplicidade: 'Nota fiscal já considerada em outra solicitação.' }).catch(() => {})
      );

      // Marcar válidas com rubrica_debitada_em se vazio
      const now = new Date().toISOString();
      const atualizacoesValidas = validasDetalhes
        .filter((p) => !p.rubrica_debitada_em)
        .map((p) => base44.entities.PurchaseRequest.update(p.id, { rubrica_debitada_em: now, rubrica_debitada_valor: getPurchaseValue(p) }).catch(() => {}));

      await Promise.all([...atualizacoes, ...atualizacoesDup, ...atualizacoesValidas]);
      await refreshFinanceiroCompleto();

      smartToast.success(`Recálculo concluído: ${todasRubricas.length} rubricas atualizadas, ${purchasesDuplicadas.length} duplicatas marcadas.`);
    } catch (error) {
      console.error('Erro no recálculo:', error);
      smartToast.error('Erro no recálculo', error.message);
    } finally {
      setRecalculando(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-8">

        {/* Header */}
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
                    <ShieldCheck className="h-3 w-3" />Coordenador
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    <User className="h-3 w-3" />Profissional
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {isCoordenador ? 'Visão geral — todas as solicitações' : 'Solicitações — 3º Termo Aditivo'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {isCoordenador && (
              <Button variant="outline" className="gap-2 border-black" onClick={() => setShowReportGen(true)}>
                <FileText className="h-4 w-4" />Relatório PDF
              </Button>
            )}
            <Button className="bg-black text-white hover:bg-gray-800" onClick={() => { setEditingPurchase(null); setShowForm(true); }}>
              <Plus className="mr-2 h-4 w-4" />Nova Solicitação
            </Button>
          </div>
        </div>

        {/* Totais consolidados — calculados a partir das rubricas */}
        {isCoordenador && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">Total Previsto</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {fmtBRL(totaisConsolidados.totalPrevisto || TOTAL_PREVISTO_FALLBACK)}
              </p>
              <p className="text-xs text-gray-400">Soma das rubricas ativas</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">Total Utilizado</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{fmtBRL(totaisConsolidados.totalUtilizado)}</p>
              <p className="text-xs text-gray-400">Aprovado coord. + admin + pago</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">Saldo Disponível</p>
              <p className={`mt-1 text-xl font-bold ${totaisConsolidados.saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {fmtBRL(totaisConsolidados.saldo)}
              </p>
            </div>
          </div>
        )}

        {/* Card de Auditoria Financeira — apenas coordenadores */}
        {isCoordenador && (
          <AuditoriaFinanceiraCard purchases={purchases} rubricas={rubricas} />
        )}

        {isCoordenador && (
          <div className="mb-6">
            <OrcamentoDashboard budgetLines={budgetLines || []} purchases={purchases || []} rubricas={rubricas || []} />
          </div>
        )}

        {isCoordenador && (
          <div className="mb-6">
            <ImportarOrcamento onImportSuccess={refreshFinanceiroCompleto} />
          </div>
        )}

        {/* Abas */}
        <div className="-mx-4 mb-6 flex w-fit gap-1 overflow-x-auto rounded-none bg-gray-100 p-1 px-4 md:-mx-6 md:px-6">
          {[
            { id: 'lista', label: 'Solicitações' },
            ...(isCoordenador ? [{ id: 'rubricas', label: 'Rubricas' }] : []),
            { id: 'documentos', label: 'Documentos' },
            { id: 'equipe', label: 'Equipe' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'bg-white text-black shadow' : 'text-gray-500 hover:text-black'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Lista */}
        {tab === 'lista' && (
          <div>
            <div className="mb-4 flex flex-wrap gap-3">
              <div className="relative min-w-48 flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input placeholder="Buscar..." className="pl-9" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
              </div>

              <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.rubrica_id} onValueChange={(v) => setFilters((f) => ({ ...f, rubrica_id: v }))}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Rubrica" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as rubricas</SelectItem>
                  {(rubricas || []).filter((r) => r?.ativo !== false).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.rubrica || r.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.centro_custo} onValueChange={(v) => setFilters((f) => ({ ...f, centro_custo: v }))}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Centro de custo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os centros</SelectItem>
                  {centrosDisponiveis.map((centro) => (
                    <SelectItem key={centro} value={centro}>{centro}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {filtered.length} solicitaç{filtered.length !== 1 ? 'ões' : 'ão'}
              </p>
              {isCoordenador && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={recalcularTodasRubricas}
                  disabled={recalculando}
                  className="gap-2 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {recalculando ? 'Recalculando...' : 'Recalcular Rubricas'}
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-gray-400">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
                <ShoppingCart className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="font-medium text-gray-400">Nenhuma solicitação encontrada</p>
              </div>
            ) : (
              <TabelaSolicitacoes
                purchases={filtered}
                rubricas={rubricas}
                attachmentByPurchaseId={attachmentByPurchaseId}
                isCoordenador={isCoordenador}
                currentUser={currentUser}
                podeAprovarSolicitacoes={podeAprovarSolicitacoes}
                hasGestaoCompras={hasGestaoCompras}
                onApprove={handleApprovePurchase}
                onReturn={handleReturnPurchase}
                onUnapprove={handleUnapprovePurchase}
                onAccess={(purchase) => { setEditingPurchase({ ...purchase }); setShowForm(true); }}
                onDelete={handleDeletePurchase}
              />
            )}
          </div>
        )}

        {/* Tab: Rubricas */}
        {tab === 'rubricas' && isCoordenador && (
          <div className="space-y-6">
            {selectedRubrica ? (
              <RubricaDetail rubrica={selectedRubrica} onClose={async () => { setSelectedRubrica(null); await refreshFinanceiroCompleto(); }} />
            ) : (
              <RubricasGrid
                rubricas={rubricas}
                onSelectRubrica={setSelectedRubrica}
                onRefresh={refreshFinanceiroCompleto}
                isCoordenador={isCoordenador}
                totalPrevisto={totaisConsolidados.totalPrevisto || TOTAL_PREVISTO_FALLBACK}
              />
            )}
            {loadingRubricas && <div className="text-sm text-gray-400">Atualizando dados financeiros...</div>}
          </div>
        )}

        {/* Tab: Documentos */}
        {tab === 'documentos' && (
          <div className="max-w-7xl space-y-6">
            <GestaoDocumental />
          </div>
        )}

        {/* Tab: Equipe */}
        {tab === 'equipe' && <TeamManager budgetLines={budgetLines} />}
      </div>

      {showForm && (
        <PurchaseFormDialog
          currentUser={currentUser}
          prefill={editingPurchase}
          onClose={() => { setShowForm(false); setEditingPurchase(null); }}
          onSuccess={async () => { setShowForm(false); setEditingPurchase(null); await refreshFinanceiroCompleto(); }}
        />
      )}

      {showReportGen && (
        <ContractActivityReportGenerator isOpen={showReportGen} onClose={() => setShowReportGen(false)} />
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