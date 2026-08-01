import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyPurchaseApproved, notifyPurchaseRejected, notifyPurchaseReturned } from '@/services/notifications/purchaseNotifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSmartToast } from '@/lib/useSmartToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
'@/components/ui/select';
import NativeSelect from '@/components/ui/NativeSelect';
import SearchableSelect from '@/components/ui/searchable-select';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ShoppingCart,
  Plus,
  Search,
  ShieldCheck,
  User,
  FileText,
  AlertTriangle,
  Loader2,
  X } from
'lucide-react';

import RequireAuth from '@/components/auth/RequireAuth';
import LoadingPage from '@/components/common/LoadingPage';
import { deletePurchaseRequest } from '@/lib/deleteIntegrado';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import OrcamentoDashboard from '@/components/compras/OrcamentoDashboard';
import ImportarOrcamento from '@/components/compras/ImportarOrcamento';
import TeamManager from '@/components/compras/TeamManager';
import ContractActivityReportGenerator from '@/components/compras/ContractActivityReportGenerator';
import RelatorioMensalConsolidadoDialog from '@/components/compras/RelatorioMensalConsolidadoDialog';
import { useBudgetLines } from '@/components/compras/useBudgetLines';
import GestaoDocumental from '@/pages/GestaoDocumental';
import RubricasGrid from '@/components/compras/RubricasGrid';
import RubricaDetail from '@/components/rubricas/RubricaDetail';
import RubricasByMuseuDashboard from '@/components/compras/RubricasByMuseuDashboard';
import MuseuPerformanceDashboard from '@/components/compras/MuseuPerformanceDashboard';
import AuditoriaFinanceiraCard from '@/components/compras/AuditoriaFinanceiraCard';
import NotificacoesCompraLog from '@/components/compras/NotificacoesCompraLog';
import NotificationHistoryPanel from '@/components/notifications/NotificationHistoryPanel';
import ResendNotificationBatch from '@/components/notifications/ResendNotificationBatch';
import DashboardRelatorioExecucao from '@/components/relatorio/DashboardRelatorioExecucao.jsx';
import { Link } from 'react-router-dom';
import TabelaSolicitacoes from '@/components/compras/TabelaSolicitacoes';
import EntradaUnicaComprovante from '@/components/compras/EntradaUnicaComprovante';
import PainelConferenciaVarredura from '@/components/compras/PainelConferenciaVarredura';
import MeusPagamentosTab from '@/components/compras/MeusPagamentosTab';
import PagarSolicitacaoDialog from '@/components/compras/PagarSolicitacaoDialog';
import NovaRubricaDialog from '@/components/rubricas/NovaRubricaDialog';
import TotaisAditivoCards from '@/components/compras/TotaisAditivoCards';
import RecalcularTotaisButton from '@/components/compras/RecalcularTotaisButton';
import PainelVerificacaoFinanceira from '@/components/compras/PainelVerificacaoFinanceira';
import PainelAuditoriaMetas from '@/components/compras/PainelAuditoriaMetas';
import ConferenciaExtratosVsPagamentos from '@/components/compras/ConferenciaExtratosVsPagamentos';
import { canManageRubricas } from '@/components/auth/permissions';
import { normalizeStatus, isStatusPendente, isStatusAprovado, getStatusLabel, getStatusColor } from '@/lib/normalizeStatus';
import DevolverNFDialog from '@/components/compras/DevolverNFDialog';

const STATUS_CONFIG = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
  SOLICITADO: { label: 'Solicitado', color: 'bg-blue-100 text-blue-700' },
  DEVOLVIDO: { label: 'Devolvido', color: 'bg-amber-100 text-amber-700' },
  APROVADO_COORD: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  APROVADO_ADMIN: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  RECUSADO: { label: 'Reprovado', color: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
  PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
  APROVADO: { label: 'Aprovado', color: 'bg-green-100 text-green-700' }
};

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_ELEGIVEIS_PAGAMENTO = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function normalizeCentro(value) {
  const raw = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'mis' || raw === 'mis bh' || raw.includes('imagem e som')) return 'MIS';
  if (raw === 'mhab' || raw === 'mab' || raw.includes('abilio')) return 'MHAB';
  if (raw === 'mumo' || raw.includes('moda')) return 'MUMO';
  if (raw === 'geral' || raw === 'geral/transversal' || raw === 'atuacao geral') return 'Geral';
  if (raw === 'rateado') return 'Rateado';
  if (raw === 'publicacoes' || raw === 'publicações') return 'Publicações';
  if (raw.includes('pampulha')) return 'Noturno Pampulha';
  // "Noturno 2026" (legado) e "Noturno nos Museus 2026" (canônico atual) → mesmo bucket
  if (raw.includes('noturno')) return 'Noturno nos Museus 2026';
  return String(value || '').trim();
}

function normalizeEmail(value) {return String(value || '').trim().toLowerCase();}
function normalizeText(value) {return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();}

function getPurchaseValue(p) {
  return toNumber(p?.valor_pago) || toNumber(p?.valor_aprovado_admin) || toNumber(p?.valor_aprovado) || toNumber(p?.valor_final) || toNumber(p?.valor_solicitado) || toNumber(p?.valor_total) || toNumber(p?.valor) || toNumber(p?.rubrica_debitada_valor) || 0;
}

function getChaveFiscal(p) {
  if (p?.nf_numero && (p?.fornecedor_cpf_cnpj || p?.fornecedor_cnpj || p?.nf_emitente_cpf_cnpj)) {
    return `nf:${String(p.nf_numero).trim()}:${String(p.fornecedor_cpf_cnpj || p.fornecedor_cnpj || p.nf_emitente_cpf_cnpj).replace(/\D/g, '')}:${getPurchaseValue(p)}`;
  }
  if (p?.nota_fiscal_url) return `url:${p.nota_fiscal_url.trim()}`;
  if (p?.file_url) return `file:${p.file_url.trim()}`;
  if (p?.intake_id) return `intake:${p.intake_id.trim()}`;
  return null;
}

function getPurchaseBudgetlineId(purchase) {return purchase?.budgetline_id || purchase?.budget_line_id || purchase?.linha_orcamentaria_id || null;}

function getPurchaseFileUrl(purchase, attachmentByPurchaseId = {}) {
  return purchase?.file_url || purchase?.arquivo_url || purchase?.documento_url || purchase?.nota_fiscal_url || purchase?.nf_pdf_url || purchase?.pdf_url || purchase?.attachment_url || attachmentByPurchaseId?.[purchase?.id]?.file_url || '';
}

function getComprovantePagamentoUrl(purchase = {}) {
  return purchase.comprovante_pagamento_url || purchase.comprovante_url || purchase.payment_receipt_url || purchase.recibo_url || '';
}

function formatDateTimeBR(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isCompraEquipe(purchase) {
  const raw = [purchase?.tipo_origem, purchase?.origem, purchase?.categoria, purchase?.tipo_solicitacao, purchase?.descricao_item, purchase?.observacoes].map((v) => String(v || '').toLowerCase()).join(' ');
  return !!purchase?.team_payment_id || raw.includes('team') || raw.includes('equipe') || raw.includes('pagamento da equipe') || raw.includes('pagamento equipe');
}

// Detecção mais ampla — inclui monitores, educadores, coordenadoria
function isCompraEquipeSalario(purchase) {
  if (!purchase) return false;
  if (!!purchase.team_payment_id) return true;
  const raw = [purchase?.tipo_origem, purchase?.origem, purchase?.categoria, purchase?.tipo_solicitacao, purchase?.descricao_item, purchase?.observacoes].map((v) => String(v || '').toLowerCase()).join(' ');
  return (
    raw.includes('team') ||
    raw.includes('equipe') ||
    raw.includes('monitores') ||
    raw.includes('educadores') ||
    raw.includes('coordenadoria') ||
    raw.includes('pagamento da equipe') ||
    raw.includes('pagamento equipe')
  );
}

function isEntradaUnicaAttachment(att) {
  const description = normalizeText(att?.description);
  const fileName = normalizeText(att?.file_name);
  const nfCategoria = normalizeText(att?.nf_categoria);
  const nfTipo = normalizeText(att?.nf_tipo_documento);
  return nfCategoria === 'nota_fiscal' || nfTipo === 'pdf_nf' || nfTipo === 'xml_nf' || description.includes('entrada unica') || description.includes('nota fiscal') || fileName.includes('museus centro') || !!att?.nf_numero || !!att?.nf_emitente_nome || !!att?.nf_valor_total;
}

function dedupById(items) {
  const map = new Map();
  (items || []).forEach((item) => {if (item?.id && !map.has(item.id)) map.set(item.id, item);});
  return Array.from(map.values());
}

function getPurchaseOwnerEmails(purchase) {
  return [purchase?.created_by, purchase?.user_email, purchase?.requester_email, purchase?.solicitante_email, purchase?.email_solicitante, purchase?.author_email, purchase?.owner_email].map(normalizeEmail).filter(Boolean);
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
  } catch (error) {console.error('Erro em listAllRubricas:', error);}
  try {
    const diretas = await base44.entities.Rubrica.list('ordem_exibicao', 500);
    if (Array.isArray(diretas)) return diretas;
  } catch (error) {console.error('Erro ao buscar Rubrica direto:', error);}
  return [];
}

async function carregarSolicitacoes({ isCoordenador, currentUser, userMuseu }) {
  if (!currentUser) return [];
  if (isCoordenador) return await base44.entities.PurchaseRequest.list('-created_date', 500);
  const dedup = new Map();
  // Museus válidos para filtro direto por museu
  const MUSEUS_FISICOS = ['MHAB', 'MIS', 'MUMO'];
  // Determinar quais centros mostrar com base no museu vinculado do usuário
  const museuFisico = MUSEUS_FISICOS.includes(userMuseu) ? userMuseu : null;
  try {
    const listaGeral = await base44.entities.PurchaseRequest.list('-created_date', 500);
    listaGeral.filter(Boolean).forEach((p) => {
      if (!p?.id) return;
      // Nunca exibir compras de equipe/salário para não-coordenadores
      if (isCompraEquipeSalario(p)) return;
      const centroCusto = normalizeCentro(p?.centro_custo);
      if (museuFisico) {
        // Mostrar apenas o museu do usuário + Geral
        if (centroCusto === museuFisico || centroCusto === 'Geral') {
          dedup.set(p.id, p);
        }
      } else {
        // Sem museu definido (Geral/Transversal): mostrar apenas Geral
        if (centroCusto === 'Geral') {
          dedup.set(p.id, p);
        }
      }
    });
  } catch (error) {console.error('Erro ao buscar lista geral de PurchaseRequest:', error);}
  return Array.from(dedup.values()).sort((a, b) => new Date(b?.created_date || 0) - new Date(a?.created_date || 0));
}

function categorizeSolicitacoes(purchases) {
  const categories = { geral: [], mhab: [], mis: [], mumo: [], noturno2026: [], noturnoPampulha: [], pessoas: [] };
  purchases.forEach((p) => {
    if (isCompraEquipe(p)) {categories.pessoas.push(p);} else
    {
      const centro = normalizeCentro(p?.centro_custo);
      if (centro === 'MHAB') categories.mhab.push(p);else
      if (centro === 'MIS') categories.mis.push(p);else
      if (centro === 'MUMO') categories.mumo.push(p);else
      if (centro === 'Noturno nos Museus 2026') categories.noturno2026.push(p);else
      if (centro === 'Noturno Pampulha') categories.noturnoPampulha.push(p);else
      categories.geral.push(p);
    }
  });
  return categories;
}



function ComprasInner() {
  const smartToast = useSmartToast();
  const isMobile = useIsMobile();
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userLoadError, setUserLoadError] = useState(false);
  const [tab, setTab] = useState('lista');
  const [showForm, setShowForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [showReportGen, setShowReportGen] = useState(false);
  const [showRelatorioMensal, setShowRelatorioMensal] = useState(false);
  const [showNovaRubrica, setShowNovaRubrica] = useState(false);
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const [paymentPurchase, setPaymentPurchase] = useState(null);
  const [recalculando, setRecalculando] = useState(false);
  const [devolverNFDialog, setDevolverNFDialog] = useState({ open: false, purchase: null });
  const [limpandoDuplicatas, setLimpandoDuplicatas] = useState(false);
  const [vinculandoNatureza, setVinculandoNatureza] = useState(false);
  const [filters, setFilters] = useState({ status: 'all', meta_id: 'all', search: '', rubrica_id: 'all', inconsistencias: 'all', centro_custo: 'all', data_inicio: '', data_fim: '' });
  const queryClient = useQueryClient();
  const autoRecalcRan = React.useRef(false);
  // Trava de campo centro_custo: Map<purchaseId, { value: string, expiresAt: number }>
  // Impede que qualquer refetch do servidor sobrescreva o valor local por 60s após o save.
  const centroCustoLock = React.useRef(new Map());
  // Versão que sobe a cada lock para forçar re-render e re-aplicação dos locks
  const [lockVersion, setLockVersion] = useState(0);

  function lockCentroCusto(purchaseId, value) {
    console.warn('[COMPRAS DEBUG] lockCentroCusto ativado:', purchaseId, value, 'às', new Date().toISOString());
    centroCustoLock.current.set(purchaseId, { value, expiresAt: Date.now() + 60000 });
    setLockVersion((v) => v + 1);
  }

  function applyLock(record) {
    if (!record?.id) return record;
    const lock = centroCustoLock.current.get(record.id);
    if (lock && Date.now() < lock.expiresAt) {
      return { ...record, centro_custo: lock.value };
    }
    centroCustoLock.current.delete(record.id);
    return record;
  }

  function applyLocksToList(list) {
    if (!Array.isArray(list) || centroCustoLock.current.size === 0) return list;
    return list.map(applyLock);
  }

  useEffect(() => {
    let mounted = true;
    setUserLoading(true);
    setUserLoadError(false);
    base44.auth.me().then((u) => {if (!mounted) return;setCurrentUser(u || null);}).catch(() => {if (!mounted) return;setCurrentUser(null);setUserLoadError(true);}).finally(() => {if (!mounted) return;setUserLoading(false);});
    return () => {mounted = false;};
  }, []);

  const isCoordenador = ['admin', 'ADMIN', 'COORDENADOR', 'COORD_COMUNICACAO', 'COORD_ADMINISTRATIVA', 'COORD_PRODUCAO'].includes(currentUser?.role);

  // Buscar museu vinculado do usuário (TeamMember) — usado para filtrar solicitações de não-coordenadores
  const { data: userTeamMember } = useQuery({
    queryKey: ['team-member-museu', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const results = await base44.entities.TeamMember.filter({ user_email: currentUser.email });
      return results?.[0] || null;
    },
    enabled: !!currentUser?.email && !isCoordenador,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  // Mapear museu_vinculado → centro_custo (MUMO|MIS|MHAB → direto; Geral/Transversal → null)
  const userMuseu = isCoordenador ? null : (() => {
    const mv = userTeamMember?.museu_vinculado;
    if (mv === 'MUMO' || mv === 'MIS' || mv === 'MHAB') return mv;
    return null; // Geral/Transversal ou não cadastrado → mostrar apenas Geral
  })();

  const invalidateComprasQueries = useCallback(async () => {
    // Apenas marca as queries como stale — o React Query as rebuscará
    // quando o usuário navegar ou interagir, sem forçar refetch imediato.
    // Isso preserva o cache otimista após saves.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchases'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['attachments-compras'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['purchase-documents-all'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['team-member-own'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['team-members-all-for-coordinator'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'], refetchType: 'none' }),
    ]);
  }, [queryClient]);

  const { data: userPermission, isLoading: loadingUserPermission } = useQuery({
    queryKey: ['user-permission', currentUser?.email],
    queryFn: async () => {try {const result = await base44.entities.UserPermission.filter({ user_email: currentUser?.email });return result?.[0] || null;} catch {return null;}},
    enabled: !!currentUser?.email,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false
  });

  const hasGestaoCompras = isCoordenador || userPermission?.gestao_compras === true;
  const podeAprovarSolicitacoes = isCoordenador || userPermission?.pode_aprovar_solicitacoes === true;
  const podeGerenciarRubricas = canManageRubricas(currentUser, userPermission);

  const { data: rawPurchases = [], isLoading, isFetching: fetchingPurchases } = useQuery({
    queryKey: ['purchases', isCoordenador, currentUser?.email, userMuseu],
    queryFn: () => {
      console.warn('[COMPRAS DEBUG] queryFn disparada — stack:', new Error().stack?.split('\n').slice(1, 6).join(' | '));
      return carregarSolicitacoes({ isCoordenador, currentUser, userMuseu });
    },
    enabled: !!currentUser && (isCoordenador || userTeamMember !== undefined),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Aplica locks de centro_custo a cada atualização vinda do servidor ou quando um lock é ativado
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const purchases = useMemo(() => {
    if (centroCustoLock.current.size > 0) {
      console.warn('[COMPRAS DEBUG] useMemo re-executando com', centroCustoLock.current.size, 'locks ativos. rawPurchases.length=', rawPurchases.length, 'lockVersion=', lockVersion);
    }
    return applyLocksToList(rawPurchases);
  }, [rawPurchases, lockVersion]);

  // Auto-abrir solicitação quando vier via ?id= (link de email de notificação)
  // Limpa o parâmetro ANTES de abrir o modal para evitar re-abertura após fechamento
  useEffect(() => {
    if (!purchases || purchases.length === 0) return;
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    if (!targetId) return;
    // Remove o parâmetro da URL imediatamente para não re-acionar em refetches
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url.toString());
    } catch { /* noop */ }
    const found = purchases.find((p) => p._id === targetId || p.id === targetId);
    if (found) {
      setEditingPurchase({ ...found });
      setShowForm(true);
      setTab('lista');
    }
  }, [purchases]);

  const { data: anexosCompras = [], isLoading: loadingAnexos, isFetching: fetchingAnexos } = useQuery({
    queryKey: ['attachments-compras'],
    queryFn: async () => {const list = await base44.entities.Attachment.list('-created_date', 500);const docs = dedupById((list || []).filter(isEntradaUnicaAttachment));return docs.sort((a, b) => new Date(b?.created_date || 0) - new Date(a?.created_date || 0));},
    enabled: !!currentUser,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false
  });

  const attachmentByPurchaseId = useMemo(() => {
    const map = {};
    (anexosCompras || []).forEach((doc) => {const purchaseId = doc?.purchase_id || doc?.purchase_request_id || doc?.purchaseRequestId || doc?.solicitacao_id;if (purchaseId && !map[purchaseId]) map[purchaseId] = doc;});
    return map;
  }, [anexosCompras]);

  useQuery({
    queryKey: ['purchase-documents-all', isCoordenador, currentUser?.email],
    queryFn: async () => {const docs = await base44.entities.PurchaseDocument.list('-created_date', 300);if (isCoordenador) return docs;return docs.filter((doc) => doc.uploadado_por === currentUser?.email);},
    enabled: !!currentUser,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false
  });

  const { budgetLines } = useBudgetLines();

  const { data: rubricas = [], refetch: refetchRubricas, isLoading: loadingRubricas, isFetching: fetchingRubricas } = useQuery({
    queryKey: ['rubricas'],
    queryFn: carregarRubricas,
    enabled: !!currentUser,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });

  // Recálculo automático: sincroniza valor_utilizado de todas as rubricas
  // com a soma real das NFs aprovadas/pagas ao carregar a página.
  useEffect(() => {
    if (autoRecalcRan.current) return;
    if (!currentUser || !purchases.length || !rubricas.length) return;
    autoRecalcRan.current = true;

    async function runAutoRecalc() {
      const STATUS_CONTABILIZADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
      const valorPorRubrica = {};
      for (const p of purchases) {
        if (!p.rubrica_id) continue;
        if (!STATUS_CONTABILIZADOS.has(normalizeStatus(p.status))) continue;
        if (p.duplicada_financeira === true || p.incluir_no_somatorio === false) continue;
        valorPorRubrica[p.rubrica_id] = (valorPorRubrica[p.rubrica_id] || 0) + getPurchaseValue(p);
      }
      const updates = rubricas
        .filter(r => r.id && r.ativo !== false)
        .filter(r => Math.abs((valorPorRubrica[r.id] || 0) - toNumber(r.valor_utilizado)) > 0.01)
        .map(r => {
          const calculado = valorPorRubrica[r.id] || 0;
          const total = toNumber(r.valor_rubrica || r.valor_total);
          return { id: r.id, valor_utilizado: calculado, saldo: total - calculado, percentual_utilizado: total > 0 ? (calculado / total) * 100 : 0 };
        });
      if (!updates.length) return;
      try {
        await base44.functions.invoke('recalcularSaldosRubricas', {});
      } catch {
        await Promise.all(updates.map(({ id, ...data }) => base44.entities.Rubrica.update(id, data).catch(() => {})));
      }
      await invalidateComprasQueries();
      await refetchRubricas();
    }

    runAutoRecalc();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]); // Só roda uma vez ao carregar o usuário, não em cada mudança de purchases/rubricas

  const { data: metas = [] } = useQuery({
    queryKey: ['project-metas'],
    queryFn: async () => {
      const list = await base44.entities.ProjectMeta.list('ordem', 500);
      return (list || []).filter((m) => m.ativo !== false);
    },
    enabled: !!currentUser,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });

  const purchasesWithFlags = useMemo(() => {
    return (purchases || []).map((p) => {
      const hasBudgetline = !!getPurchaseBudgetlineId(p);
      const hasRubrica = !!p.rubrica_id;
      const centroCusto = normalizeCentro(p?.centro_custo);

      return {
        ...p,
        _has_budgetline: hasBudgetline,
        _has_rubrica: hasRubrica,
        _has_orcamento_vinculado: hasRubrica || hasBudgetline,
        _centro_custo_normalizado: centroCusto,
        _sem_centro_custo: !centroCusto
      };
    });
  }, [purchases]);

  const centrosDisponiveis = useMemo(() => {
    const centros = new Set();

    purchasesWithFlags.forEach((p) => {
      if (p._centro_custo_normalizado) {
        centros.add(p._centro_custo_normalizado);
      }
    });

    return Array.from(centros).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [purchasesWithFlags]);

  const STATUS_PENDENTES = new Set(['RASCUNHO', 'SOLICITADO', 'DEVOLVIDO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADO']);

  const filtered = purchasesWithFlags.filter((p) => {
    // Filtro rápido "pendentes desde fev": exclui pagos, cancelados e recusados
    if (filters._pendentes_fev) {
      const st = normalizeStatus(p.status);
      if (!STATUS_PENDENTES.has(st)) return false;
    }

    const matchStatus =
    filters.status === 'all' || normalizeStatus(p.status) === filters.status;

    let matchMeta = filters.meta_id === 'all';

    if (!matchMeta && filters.meta_id === 'produto') {
      matchMeta = p.tipo_item === 'produto' || p.tipo_gasto === 'Produto';
    }

    if (!matchMeta && filters.meta_id === 'servico') {
      matchMeta = p.tipo_item === 'servico' || p.tipo_gasto === 'Serviço';
    }

    if (!matchMeta) {
      // Busca por nome da meta no meta_id, meta_extra_descricao ou nome da meta
      const metaNome = filters.meta_id;
      const metaNum = metaNome.match(/^(\d+)\s*[-–—]/)?.[1] || '';
      matchMeta =
      p.meta_id === metaNome ||
      p.meta_extra_descricao && normalizeText(p.meta_extra_descricao).includes(normalizeText(metaNome)) ||
      metaNum && p.meta_id === `MC3A-${metaNum}`;
    }

    const matchRubrica =
    filters.rubrica_id === 'all' || p.rubrica_id === filters.rubrica_id;

    const matchInconsistencia =
    filters.inconsistencias === 'all' ||
    filters.inconsistencias === 'somente_inconsistentes' && (
    !p._has_orcamento_vinculado || p._sem_centro_custo) ||
    filters.inconsistencias === 'somente_ok' &&
    p._has_orcamento_vinculado &&
    !p._sem_centro_custo;

    const matchCentro =
    filters.centro_custo === 'all' ||
    p._centro_custo_normalizado === filters.centro_custo;

    const busca = filters.search.trim().toLowerCase();

    const matchSearch =
    !busca ||
    String(p.descricao_item || '').toLowerCase().includes(busca) ||
    String(p.fornecedor_nome || '').toLowerCase().includes(busca) ||
    String(p.nf_emitente_nome || '').toLowerCase().includes(busca) ||
    String(p.objeto || '').toLowerCase().includes(busca) ||
    fmtBRL(getPurchaseValue(p)).toLowerCase().includes(busca) ||
    String(p.nf_numero || '').toLowerCase().includes(busca);

    // Filtro por período (data de criação)
    let matchPeriodo = true;
    if (filters.data_inicio || filters.data_fim) {
      const dataCriacao = p.created_date ? new Date(p.created_date) : null;
      if (!dataCriacao || isNaN(dataCriacao.getTime())) {
        matchPeriodo = false;
      } else {
        if (filters.data_inicio && dataCriacao < new Date(filters.data_inicio + 'T00:00:00')) matchPeriodo = false;
        if (filters.data_fim && dataCriacao > new Date(filters.data_fim + 'T23:59:59')) matchPeriodo = false;
      }
    }

    return (
      matchStatus &&
      matchMeta &&
      matchRubrica &&
      matchInconsistencia &&
      matchCentro &&
      matchSearch &&
      matchPeriodo);

  });

  // Rebusca dados financeiros explicitamente (para ações de aprovação, deleção, etc.)
  const refreshFinanceiroCompleto = useCallback(async () => {
    await invalidateComprasQueries();
    // Força rebusca ativa das queries principais após ação financeira real
    await queryClient.refetchQueries({ queryKey: ['purchases'], type: 'active' });
    await queryClient.refetchQueries({ queryKey: ['rubricas'], type: 'active' });
  }, [invalidateComprasQueries, queryClient]);

  async function handleApprovePurchase(purchase) {
    if (!purchase?.id) return;

    if (!purchase?.rubrica_id) {
      smartToast.error('Não é possível aprovar sem rubrica vinculada.');
      return;
    }

    if (!purchase?.meta_id?.trim()) {
      smartToast.error('Não é possível aprovar sem meta orçamentária definida.');
      return;
    }

    const jaDebitado = !!purchase.rubrica_debitada_em || !!purchase.financeiro_lancado_em;
    const chaveFiscal = getChaveFiscal(purchase);

    if (chaveFiscal && !jaDebitado) {
      try {
        const todasAprovadas = await base44.entities.PurchaseRequest.list(
          '-created_date',
          500
        );

        const duplicada = todasAprovadas.find(
          (p) =>
          p.id !== purchase.id &&
          STATUS_APROVADOS.has(normalizeStatus(p.status)) &&
          getChaveFiscal(p) === chaveFiscal
        );

        if (duplicada) {
          smartToast.error(
            'Esta nota fiscal já foi aprovada em outra solicitação. Débito bloqueado.'
          );
          return;
        }
      } catch (_) {}
    }

    try {
      let backendOk = false;

      try {
        const response = await base44.functions.invoke('purchaseActions', {
          purchaseId: purchase.id,
          action: 'aprovar'
        });

        const result = response?.data || response;

        if (result?.success) {
          backendOk = true;
        }
      } catch (_) {}

      if (!backendOk) {
        const valor = getPurchaseValue(purchase);

        if (!jaDebitado && valor > 0) {
          const rubrica = await base44.entities.Rubrica.get(purchase.rubrica_id);

          if (rubrica) {
            const total = toNumber(rubrica.valor_rubrica || rubrica.valor_total);
            const utilizadoAtual = toNumber(rubrica.valor_utilizado);
            const novoUtilizado = utilizadoAtual + valor;
            const novoSaldo = total - novoUtilizado;
            const percentual = total > 0 ? novoUtilizado / total * 100 : 0;

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
          rubrica_debitada_em:
          purchase.rubrica_debitada_em || new Date().toISOString(),
          rubrica_debitada_valor:
          purchase.rubrica_debitada_valor || getPurchaseValue(purchase),
          financeiro_lancado_em:
          purchase.financeiro_lancado_em || new Date().toISOString()
        });
      }

      // Atualização otimista do cache para mudança imediata na tabela
      queryClient.setQueryData(['purchases', isCoordenador, currentUser?.email, userMuseu], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((item) =>
        item.id === purchase.id ?
        { ...item, status: 'APROVADO_COORD', aprov_coord_data: new Date().toISOString(), aprov_coord_nome: currentUser?.email } :
        item
        );
      });

      await refreshFinanceiroCompleto();

      // Suprimir notificação se for aprovação direta (nunca passou por SOLICITADO)
      const isAprovacaoDireta = !purchase.submitted_at;
      if (!isAprovacaoDireta) {
        await notifyPurchaseApproved(
          { ...purchase, status: 'APROVADO_COORD' },
          currentUser
        ).catch((error) => {
          console.warn('Falha ao notificar aprovação de compra:', error);
        });
      }

      const rubricaInfo = purchase.rubrica_nome || purchase.rubrica_id || '';
      smartToast.success(`✅ Solicitação aprovada!${rubricaInfo ? ` Valor debitado da rubrica "${rubricaInfo}".` : ''} Status atualizado para Aprovado.`);
    } catch (error) {
      console.error('Erro ao aprovar solicitação:', error);
      smartToast.error('Erro ao aprovar', error.message);
    }
  }

  function handleReturnPurchase(purchase) {
    if (!purchase?.id) return;
    setDevolverNFDialog({ open: true, purchase });
  }

  async function executarDevolucaoNF(purchase, motivo) {
    try {
      const response = await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: 'devolver',
        comentario: motivo,
      });

      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || 'Falha ao devolver.');

      queryClient.setQueryData(['purchases', isCoordenador, currentUser?.email, userMuseu], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((item) =>
          item.id === purchase.id ? { ...item, status: 'DEVOLVIDO', comentario_devolucao: motivo } : item
        );
      });
    } catch {
      // Fallback direto
      await base44.entities.PurchaseRequest.update(purchase.id, {
        status: 'DEVOLVIDO',
        comentario_devolucao: motivo,
      });
      queryClient.setQueryData(['purchases', isCoordenador, currentUser?.email, userMuseu], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((item) =>
          item.id === purchase.id ? { ...item, status: 'DEVOLVIDO', comentario_devolucao: motivo } : item
        );
      });
    }

    await refreshFinanceiroCompleto();

    // Notificar via e-mail + sino
    await base44.functions.invoke('notifyNFDevolvida', {
      purchase_id: purchase.id,
      motivo,
      actor_email: currentUser?.email,
    }).catch((e) => console.warn('Falha ao notificar devolução NF:', e));

    setDevolverNFDialog({ open: false, purchase: null });
    smartToast.success('Solicitação devolvida.');
  }

  async function handleUnapprovePurchase(purchase) {
    if (!purchase?.id) return;

    const comentario = window.prompt(
      'Informe o motivo da desaprovação:',
      'Desaprovado pela coordenação.'
    );

    if (comentario === null) return;

    try {
      const response = await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: 'desaprovar',
        comentario: comentario || 'Desaprovado pela coordenação.'
      });

      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao desaprovar.');
      }

      // Atualização otimista do cache
      queryClient.setQueryData(['purchases', isCoordenador, currentUser?.email, userMuseu], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((item) =>
        item.id === purchase.id ?
        { ...item, status: 'RECUSADO', comentario_devolucao: comentario || '' } :
        item
        );
      });

      await refreshFinanceiroCompleto();

      await notifyPurchaseRejected(
        {
          ...purchase,
          status: 'RECUSADO',
          comentario_devolucao: comentario || ''
        },
        currentUser
      ).catch((error) => {
        console.warn('Falha ao notificar recusa de compra:', error);
      });

      smartToast.success('Solicitação desaprovada e valor estornado da rubrica.');
    } catch (error) {
      try {
        const valor = getPurchaseValue(purchase);

        if (purchase.rubrica_id && valor > 0 && purchase.rubrica_debitada_em) {
          const rubrica = await base44.entities.Rubrica.get(purchase.rubrica_id);

          if (rubrica) {
            const total = toNumber(rubrica.valor_rubrica || rubrica.valor_total);
            const utilizadoAtual = toNumber(rubrica.valor_utilizado);
            const novoUtilizado = Math.max(0, utilizadoAtual - valor);
            const novoSaldo = total - novoUtilizado;
            const percentual = total > 0 ? novoUtilizado / total * 100 : 0;

            await base44.entities.Rubrica.update(rubrica.id, {
              valor_utilizado: novoUtilizado,
              saldo: novoSaldo,
              saldo_real: novoSaldo,
              percentual_utilizado: percentual
            });
          }
        }

        await base44.entities.PurchaseRequest.update(purchase.id, {
          status: 'RECUSADO',
          rubrica_debitada_em: null,
          rubrica_debitada_valor: null,
          financeiro_lancado_em: null
        });

        // Atualização otimista do cache (fallback)
        queryClient.setQueryData(['purchases', isCoordenador, currentUser?.email, userMuseu], (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((item) =>
          item.id === purchase.id ?
          { ...item, status: 'RECUSADO', rubrica_debitada_em: null, rubrica_debitada_valor: null, financeiro_lancado_em: null } :
          item
          );
        });

        await refreshFinanceiroCompleto();

        await notifyPurchaseRejected(
          {
            ...purchase,
            status: 'RECUSADO',
            comentario_devolucao: comentario || ''
          },
          currentUser
        ).catch((error) => {
          console.warn('Falha ao notificar recusa de compra:', error);
        });

        smartToast.success('Solicitação desaprovada e valor estornado da rubrica.');
      } catch (e2) {
        smartToast.error('Erro ao desaprovar', e2.message);
      }
    }
  }

  async function handleDeletePurchase(purchaseId) {
    try {
      const pr = await base44.entities.PurchaseRequest.get(purchaseId).catch(
        () => null
      );

      if (pr) {
        await deletePurchaseRequest(pr);
      } else {
        await base44.entities.PurchaseRequest.delete(purchaseId).catch(() => {});
      }

      // Atualização otimista: remove imediatamente da lista
      queryClient.setQueryData(['purchases', isCoordenador, currentUser?.email, userMuseu], (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((item) => item.id !== purchaseId);
      });

      await refreshFinanceiroCompleto();

      smartToast.success('Registro deletado e rubrica estornada com sucesso.');
    } catch (error) {
      console.error('Erro ao deletar solicitação:', error);
      smartToast.error('Erro ao deletar', error.message);
    }
  }

  async function recalcularTodasRubricas() {
    toast.info('Executando recálculo das rubricas oficiais do 3º Aditivo...');
    setRecalculando(true);

    try {
      let result = null;

      try {
        const response = await base44.functions.invoke('recalculateAllRubricas', {});
        result = response?.data || response;
      } catch (errorInvoke) {
        console.error('Falha em base44.functions.invoke:', errorInvoke);

        if (typeof base44.functions.recalculateAllRubricas === 'function') {
          const response = await base44.functions.recalculateAllRubricas();
          result = response?.data || response;
        } else {
          throw errorInvoke;
        }
      }

      console.log('Resultado recalculateAllRubricas:', result);

      if (!result?.success) {
        throw new Error(
          result?.error || 'A function executou, mas não retornou success=true.'
        );
      }

      await invalidateComprasQueries();
      await refetchRubricas();

      setTimeout(async () => {
        await invalidateComprasQueries();
        await refetchRubricas();
      }, 1200);

      smartToast.success(
        `Rubricas recalculadas. Total oficial: ${fmtBRL(
          result.totalOficial || result.totalBase || 1320000
        )}`
      );
    } catch (error) {
      console.error('Erro no recálculo:', error);
      smartToast.error('Erro ao executar function', error.message);
    } finally {
      setRecalculando(false);
    }
  }

  async function limparSolicitacoesDuplicadas() {
    if (!window.confirm(
      'ATENÇÃO: Esta ação irá:\n\n' +
      '1. Identificar solicitações duplicadas (mesmo CNPJ + NF + valor + data)\n' +
      '2. Manter apenas 1 solicitação por nota fiscal (preferindo aprovadas/pagas)\n' +
      '3. Remover as demais solicitações duplicadas\n' +
      '4. Remover anexos duplicados (manter 1 arquivo por solicitação)\n\n' +
      'Esta ação é irreversível. Deseja continuar?'
    )) return;

    setLimpandoDuplicatas(true);
    try {
      const res = await base44.functions.invoke('removerSolicitacoesDuplicadas', {});
      const result = res?.data || res;
      if (result?.success) {
        toast.success(result.message || 'Limpeza concluída.');
      } else {
        toast.error(result?.error || 'Erro ao executar limpeza.');
      }
      await refreshFinanceiroCompleto();
    } catch (err) {
      toast.error('Erro ao executar limpeza: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setLimpandoDuplicatas(false);
    }
  }

  const isInitialPageLoading =
  userLoading ||
  !!currentUser && (
  loadingUserPermission ||
  isLoading ||
  loadingRubricas ||
  loadingAnexos);

  if (isInitialPageLoading) {
    return (
      <LoadingPage
        message="Carregando página..."
        description="Estamos carregando solicitações, rubricas, documentos e permissões. Aguarde alguns instantes." />);


  }

  if (userLoadError && !currentUser) {
    return (
      <LoadingPage
        error
        errorTitle="Não foi possível carregar a página"
        errorDescription="Não conseguimos carregar os dados do usuário. Atualize a página ou tente novamente em alguns instantes." />);


  }

  const isSyncingPage = fetchingPurchases || fetchingRubricas || fetchingAnexos;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-full px-4 py-4 md:px-6 md:py-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black">
              <ShoppingCart className="h-5 w-5 text-white" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-black">Suprimentos</h1>

                {isCoordenador && (
                  <span className="hidden sm:flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500" title="Backup diário de NFs para o Google Drive às 02h00 (Brasília)">
                    🗄️ Backup NFs: hoje 02h00
                  </span>
                )}

                {isCoordenador ?
                <span className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    <ShieldCheck className="h-3 w-3" />
                    Coordenador
                  </span> :

                <span className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    <User className="h-3 w-3" />
                    Profissional
                  </span>
                }
              </div>

              <p className="text-sm text-gray-500">
                {isCoordenador ?
                'Visão geral — todas as solicitações' :
                'Solicitações — 3º Termo Aditivo'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="bg-black text-white hover:bg-gray-800"
              onClick={() => {
                setEditingPurchase(null);
                setShowForm(true);
              }}>
              
              <Plus className="mr-2 h-4 w-4" />
              Nova Solicitação
            </Button>
          </div>
        </div>

        {isSyncingPage &&
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            Atualizando informações financeiras e documentais...
          </div>
        }

        {isCoordenador && <TotaisAditivoCards rubricas={rubricas} compras={purchases} />}

        {isCoordenador &&
        <div className="mb-6">
            <OrcamentoDashboard
            budgetLines={budgetLines || []}
            purchases={purchases || []}
            rubricas={rubricas || []} />
          
          </div>
        }

        {isCoordenador &&
        <div className="mb-6">
            <ImportarOrcamento onImportSuccess={refreshFinanceiroCompleto} />
          </div>
        }

        <div className="-mx-4 mb-6 flex w-fit gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 px-4 md:-mx-0 md:px-1">
          {[
          { id: 'lista', label: 'Solicitações' },
          ...(podeGerenciarRubricas ? [{ id: 'rubricas', label: 'Rubricas' }] : []),
          { id: 'documentos', label: 'Documentos' },
          { id: 'meus_pagamentos', label: 'Meus Pagamentos' },
          ...(isCoordenador ? [{ id: 'verificacao', label: '🔍 Verificação' }] : [])].
          map((t) =>
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === t.id ?
            'bg-white text-black shadow' :
            'text-gray-500 hover:text-black'}`
            }>
            
              {t.label}
            </button>
          )}
        </div>

        {tab === 'lista' &&
        <div>
            {/* Atalho rápido: pendentes desde fevereiro */}
            <div className="mb-3 flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => setFilters(f => ({
                  ...f,
                  status: 'all',
                  data_inicio: '2026-02-01',
                  data_fim: '',
                  _pendentes_fev: true,
                }))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  filters._pendentes_fev
                    ? 'border-amber-500 bg-amber-500 text-white shadow'
                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Pendentes
              </button>
              <button
                type="button"
                onClick={() => setFilters(f => ({
                  ...f,
                  status: 'SOLICITADO',
                  data_inicio: '2026-02-01',
                  data_fim: '',
                  _pendentes_fev: false,
                }))}
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 transition-all"
              >
                🕐 Aguardando aprovação
              </button>
              <button
                type="button"
                onClick={() => setFilters(f => ({
                  ...f,
                  status: 'APROVADO_COORD',
                  data_inicio: '2026-02-01',
                  data_fim: '',
                  _pendentes_fev: false,
                }))}
                className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100 transition-all"
              >
                💳 Aprovados sem pagamento
              </button>
              {(filters.data_inicio || filters._pendentes_fev) && (
                <button
                  type="button"
                  onClick={() => setFilters(f => ({ ...f, status: 'all', data_inicio: '', data_fim: '', _pendentes_fev: false }))}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Limpar filtros rápidos
                </button>
              )}
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <div className="relative min-w-48 flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                placeholder="Buscar fornecedor, NF, valor..."
                className="pl-9"
                value={filters.search}
                onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
                } />
              
              </div>

              {!isMobile &&
            <>
                  <Input
                type="date"
                className="w-36"
                value={filters.data_inicio}
                onChange={(e) => setFilters((f) => ({ ...f, data_inicio: e.target.value }))}
                placeholder="Data início" />
              
                  <Input
                type="date"
                className="w-36"
                value={filters.data_fim}
                onChange={(e) => setFilters((f) => ({ ...f, data_fim: e.target.value }))}
                placeholder="Data fim" />
              
                  <SearchableSelect
                value={filters.meta_id}
                onValueChange={(v) => setFilters((f) => ({ ...f, meta_id: v }))}
                placeholder="Meta orçamentária"
                className="w-56"
                items={[
                { id: 'all', label: 'Todas as metas' },
                ...metas.map((m) => ({ id: m.nome, label: m.nome }))]
                } />
              
                </>
            }

              {isMobile ?
            <>
                  <NativeSelect
                value={filters.status}
                onValueChange={(v) =>
                setFilters((f) => ({ ...f, status: v }))
                }
                placeholder="Status"
                items={[
                { value: 'all', label: 'Todos os status' },
                ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({
                  value: k,
                  label: v.label
                }))]
                } />
              

                  <NativeSelect
                value={filters.rubrica_id}
                onValueChange={(v) =>
                setFilters((f) => ({ ...f, rubrica_id: v }))
                }
                placeholder="Rubrica"
                items={[
                { value: 'all', label: 'Todas as rubricas' },
                ...(rubricas || []).
                filter((r) => r?.ativo !== false).
                map((r) => ({
                  value: r.id,
                  label: r.rubrica || r.nome
                }))]
                } />
              

                  <NativeSelect
                value={filters.meta_id}
                onValueChange={(v) =>
                setFilters((f) => ({ ...f, meta_id: v }))
                }
                placeholder="Meta"
                items={[
                { value: 'all', label: 'Todas as metas' },
                ...metas.map((m) => ({
                  value: m.nome,
                  label: m.nome
                }))]
                } />
              

                  <NativeSelect
                value={filters.centro_custo}
                onValueChange={(v) =>
                setFilters((f) => ({ ...f, centro_custo: v }))
                }
                placeholder="Centro de custo"
                items={[
                { value: 'all', label: 'Todos os centros' },
                ...centrosDisponiveis.map((centro) => ({
                  value: centro,
                  label: centro
                }))]
                } />
              
                </> :

            <>
                  <Select
                value={filters.status}
                onValueChange={(v) =>
                setFilters((f) => ({ ...f, status: v }))
                }>
                
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) =>
                  <SelectItem key={k} value={k}>
                          {v.label}
                        </SelectItem>
                  )}
                    </SelectContent>
                  </Select>

                  <SearchableSelect
                value={filters.rubrica_id}
                onValueChange={(v) => setFilters((f) => ({ ...f, rubrica_id: v }))}
                placeholder="Rubrica"
                className="w-64"
                items={[
                { id: 'all', label: 'Todas as rubricas' },
                ...(rubricas || []).filter((r) => r?.ativo !== false).map((r) => ({ id: r.id, label: r.rubrica || r.nome }))]
                } />
              

                  <Select
                value={filters.centro_custo}
                onValueChange={(v) =>
                setFilters((f) => ({ ...f, centro_custo: v }))
                }>
                
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Centro de custo" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="all">Todos os centros</SelectItem>
                      {centrosDisponiveis.map((centro) =>
                  <SelectItem key={centro} value={centro}>
                          {centro}
                        </SelectItem>
                  )}
                    </SelectContent>
                  </Select>
                </>
            }
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                {filtered.length} solicitaç{filtered.length !== 1 ? 'ões' : 'ão'}
              </p>
            </div>

            {filtered.length === 0 ?
          <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
                <ShoppingCart className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="font-medium text-gray-400">
                  Nenhuma solicitação encontrada
                </p>
              </div> :

          <TabelaSolicitacoes
            purchases={filtered}
            rubricas={rubricas}
            attachmentByPurchaseId={attachmentByPurchaseId}
            isCoordenador={isCoordenador}
            currentUser={currentUser}
            podeAprovarSolicitacoes={podeAprovarSolicitacoes}
            hasGestaoCompras={hasGestaoCompras}
            userPermission={userPermission}
            canSeeEquipeSalarios={isCoordenador}
            onApprove={handleApprovePurchase}
            onReturn={handleReturnPurchase}
            onUnapprove={handleUnapprovePurchase}
            onMarkPaid={(purchase) => setPaymentPurchase(purchase)}
            onAccess={(purchase) => {
              setEditingPurchase({ ...purchase });
              setShowForm(true);
            }}
            onCentroCustoSaved={(purchaseId, novoValor) => {
              lockCentroCusto(purchaseId, novoValor);
            }}
            onCentroUpdated={(updatedPurchase) => {
              const queryKey = ['purchases', isCoordenador, currentUser?.email, userMuseu];
              queryClient.setQueryData(queryKey, (old) => {
                if (!Array.isArray(old)) return old;
                return old.map((item) => item.id === updatedPurchase.id
                  ? applyLock({ ...item, ...updatedPurchase })
                  : item);
              });
            }}
            onDelete={handleDeletePurchase} />

          }
          </div>
        }

        {tab === 'rubricas' && podeGerenciarRubricas &&
        <div className="space-y-6">
            {selectedRubrica ?
          <RubricaDetail
            rubrica={selectedRubrica}
            onClose={async () => {
              setSelectedRubrica(null);
              await refreshFinanceiroCompleto();
            }} /> :


          <>
                <div className="flex gap-2 border-b border-gray-200">
                  <button
                onClick={() => setTab('rubricas-resumo')}
                className="border-b-2 border-black px-4 py-2 text-sm font-medium text-gray-900">
                
                    Visão Consolidada
                  </button>

                  <button
                onClick={() => setTab('rubricas-museus')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
                
                    Por Museu
                  </button>

                  <button
                onClick={() => setTab('rubricas-performance')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
                
                    Performance
                  </button>

                  <button
                onClick={() => setTab('rubricas-detalhe')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
                
                    Detalhe
                  </button>
                </div>

                {podeGerenciarRubricas &&
            <div className="flex justify-end gap-2">
                    <Button
                type="button"
                variant="outline"
                disabled={vinculandoNatureza}
                className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={async () => {
                  if (!window.confirm('Vincular automaticamente a Natureza de Despesa (339030/339035/339036/339039/449052) a todas as rubricas sem natureza definida?')) return;
                  setVinculandoNatureza(true);
                  try {
                    const res = await base44.functions.invoke('vincularNaturezaDespesaRubricas', {});
                    const result = res?.data || res;
                    if (result?.success) {
                      toast.success(result.message || 'Naturezas vinculadas com sucesso.');
                      await refreshFinanceiroCompleto();
                    } else {
                      toast.error(result?.error || 'Erro ao vincular naturezas.');
                    }
                  } catch (e) {
                    toast.error('Erro: ' + (e?.message || 'desconhecido'));
                  } finally {
                    setVinculandoNatureza(false);
                  }
                }}>
                
                      <FileText className="h-4 w-4" />
                      {vinculandoNatureza ? 'Vinculando...' : 'Vincular Natureza'}
                    </Button>
                    <Button
                type="button"
                onClick={() => setShowNovaRubrica(true)}
                className="gap-2 bg-black text-white hover:bg-gray-800">
                
                      <Plus className="h-4 w-4" />
                      Nova Rubrica
                    </Button>
                  </div>
            }

                <RubricasGrid
              rubricas={rubricas}
              onSelectRubrica={setSelectedRubrica}
              onRefresh={refreshFinanceiroCompleto}
              isCoordenador={isCoordenador}
              totalPrevisto={1417519.85} />
            
              </>
          }

            {fetchingRubricas &&
          <div className="text-sm text-gray-400">
                Atualizando dados financeiros...
              </div>
          }
          </div>
        }

        {tab === 'rubricas-museus' && podeGerenciarRubricas &&
        <div className="space-y-6">
            <div className="mb-4 flex gap-2 border-b border-gray-200">
              <button
              onClick={() => setTab('rubricas')}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              
                Visão Consolidada
              </button>

              <button
              onClick={() => setTab('rubricas-museus')}
              className="border-b-2 border-black px-4 py-2 text-sm font-medium text-gray-900">
              
                Por Museu
              </button>

              <button
              onClick={() => setTab('rubricas-performance')}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              
                Performance
              </button>

              <button
              onClick={() => setTab('rubricas-detalhe')}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              
                Detalhe
              </button>
            </div>

            <RubricasByMuseuDashboard
            rubricas={rubricas}
            purchases={purchases}
            onRefresh={refreshFinanceiroCompleto} />
          
          </div>
        }

        {tab === 'rubricas-performance' && podeGerenciarRubricas &&
        <div className="space-y-6">
            <div className="mb-4 flex gap-2 border-b border-gray-200">
              <button
              onClick={() => setTab('rubricas')}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              
                Visão Consolidada
              </button>

              <button
              onClick={() => setTab('rubricas-museus')}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              
                Por Museu
              </button>

              <button
              onClick={() => setTab('rubricas-performance')}
              className="border-b-2 border-black px-4 py-2 text-sm font-medium text-gray-900">
              
                Performance
              </button>

              <button
              onClick={() => setTab('rubricas-detalhe')}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              
                Detalhe
              </button>
            </div>

            <MuseuPerformanceDashboard purchases={purchases} rubricas={rubricas} />
          </div>
        }

        {tab === 'rubricas-detalhe' && podeGerenciarRubricas &&
        <div className="space-y-6">
            <div className="mb-4 flex gap-2 border-b border-gray-200">
              <button
              onClick={() => setTab('rubricas')}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              
                Visão Consolidada
              </button>

              <button
              onClick={() => setTab('rubricas-museus')}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              
                Por Museu
              </button>

              <button
              onClick={() => setTab('rubricas-performance')}
              className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
              
                Performance
              </button>

              <button
              onClick={() => setTab('rubricas-detalhe')}
              className="border-b-2 border-black px-4 py-2 text-sm font-medium text-gray-900">
              
                Detalhe
              </button>
            </div>

            {!selectedRubrica && podeGerenciarRubricas &&
          <div className="flex justify-end">
                <Button
              type="button"
              onClick={() => setShowNovaRubrica(true)}
              className="gap-2 bg-black text-white hover:bg-gray-800">
              
                  <Plus className="h-4 w-4" />
                  Nova Rubrica
                </Button>
              </div>
          }

            {selectedRubrica ?
          <RubricaDetail
            rubrica={selectedRubrica}
            onClose={async () => {
              setSelectedRubrica(null);
              await refreshFinanceiroCompleto();
            }} /> :


          <RubricasGrid
            rubricas={rubricas}
            onSelectRubrica={setSelectedRubrica}
            onRefresh={refreshFinanceiroCompleto}
            isCoordenador={isCoordenador}
            totalPrevisto={1417519.85} />

          }
          </div>
        }

        {tab === 'documentos' &&
        <div className="max-w-7xl space-y-6">
            {isCoordenador &&
          <PainelConferenciaVarredura onSuccess={refreshFinanceiroCompleto} />
          }

            {isCoordenador &&
          <EntradaUnicaComprovante onSuccess={refreshFinanceiroCompleto} />
          }

            <GestaoDocumental />
          </div>
        }

        {tab === 'verificacao' && isCoordenador &&
        <div className="space-y-6">
            <div className="flex justify-end">
              <RecalcularTotaisButton onDone={refreshFinanceiroCompleto} />
            </div>
            <PainelVerificacaoFinanceira onSuccess={refreshFinanceiroCompleto} />
            <PainelAuditoriaMetas onSuccess={refreshFinanceiroCompleto} />
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <ConferenciaExtratosVsPagamentos />
            </div>
          </div>
        }

        {tab === 'meus_pagamentos' &&
        <MeusPagamentosTab
          purchases={purchasesWithFlags}
          attachments={anexosCompras}
          currentUser={currentUser}
          isCoordenador={isCoordenador}
          hasGestaoCompras={hasGestaoCompras} />

        }

        {isCoordenador &&
        <div className="mt-8 space-y-6">
            {/* Dashboard de Relatórios */}
            <div className="border-b pb-4">
              <div className="flex items-center justify-between mb-4">
                
                <Link to="/RelatorioExecucaoDashboard">
                  <Button variant="outline" size="sm">
                    Abrir Dashboard Completo
                  </Button>
                </Link>
              </div>
              <DashboardRelatorioExecucao />
            </div>

            {/* Gerenciamento de Lotes */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Gerenciar Lotes de Notificações</h3>
                <div className="flex gap-2">
                  <ResendNotificationBatch batchSlot="manha" onSuccess={refreshFinanceiroCompleto} />
                  <ResendNotificationBatch batchSlot="tarde" onSuccess={refreshFinanceiroCompleto} />
                </div>
              </div>
              <NotificationHistoryPanel />
              <NotificacoesCompraLog />
            </div>
          </div>
        }

        {isCoordenador &&
        <div className="mt-6">
            <AuditoriaFinanceiraCard
            purchases={purchases}
            rubricas={rubricas}
            onEditPurchase={(purchase) => {
              setEditingPurchase({ ...purchase });
              setShowForm(true);
              setTab('lista');
            }} />
          
          </div>
        }
      </div>

      {showForm &&
      <PurchaseFormDialog
        currentUser={currentUser}
        prefill={editingPurchase}
        onClose={() => {
          setShowForm(false);
          setEditingPurchase(null);
        }}
        onSuccess={async (savedPayload) => {
          setShowForm(false);
          setEditingPurchase(null);

          const queryKey = ['purchases', isCoordenador, currentUser?.email, userMuseu];

          // Cancela refetch em andamento
          queryClient.cancelQueries({ queryKey });

          // Aplica imediatamente no cache — única fonte de verdade visual
          if (savedPayload?.id) {
            // Se o payload contém centro_custo, trava o valor antes de aplicar ao cache
            if (savedPayload.centro_custo) {
              lockCentroCusto(savedPayload.id, savedPayload.centro_custo);
            }
            queryClient.setQueryData(queryKey, (old) => {
              if (!Array.isArray(old)) return old;
              return old.map((item) =>
                item.id === savedPayload.id ? applyLock({ ...item, ...savedPayload }) : item
              );
            });
          }

          // Marca como stale sem rebuscar — próxima navegação/ação buscará do banco
          await invalidateComprasQueries();
        }} />

      }

      {showReportGen &&
      <ContractActivityReportGenerator
        isOpen={showReportGen}
        onClose={() => setShowReportGen(false)} />

      }

      <RelatorioMensalConsolidadoDialog
        isOpen={showRelatorioMensal}
        onClose={() => setShowRelatorioMensal(false)} />
      

      {paymentPurchase &&
      <PagarSolicitacaoDialog
        purchase={paymentPurchase}
        currentUser={currentUser}
        onClose={() => setPaymentPurchase(null)}
        onSuccess={async () => {
          setPaymentPurchase(null);
          await refreshFinanceiroCompleto();
        }} />

      }

      <NovaRubricaDialog
        open={showNovaRubrica}
        currentUser={currentUser}
        onClose={async () => {
          setShowNovaRubrica(false);
          await refreshFinanceiroCompleto();
        }} />

      <DevolverNFDialog
        open={devolverNFDialog.open}
        purchase={devolverNFDialog.purchase}
        onClose={() => setDevolverNFDialog({ open: false, purchase: null })}
        onConfirm={(motivo) => executarDevolucaoNF(devolverNFDialog.purchase, motivo)}
      />
      
    </div>);

}

export default function Compras() {
  return (
    <RequireAuth>
      <ComprasInner />
    </RequireAuth>);

}