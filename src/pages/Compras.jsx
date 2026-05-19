import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyPurchaseApproved, notifyPurchaseRejected, notifyPurchaseReturned } from '@/services/notifications/purchaseNotifications';
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
import NativeSelect from '@/components/ui/NativeSelect';
import { useIsMobile } from '@/hooks/use-mobile';
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
import LoadingPage from '@/components/common/LoadingPage';
import { deletePurchaseRequest } from '@/lib/deleteIntegrado';
import PurchaseFormDialog from '@/components/compras/PurchaseFormDialog';
import OrcamentoDashboard from '@/components/compras/OrcamentoDashboard';
import ImportarOrcamento from '@/components/compras/ImportarOrcamento';
import TeamManager from '@/components/compras/TeamManager';
import ContractActivityReportGenerator from '@/components/compras/ContractActivityReportGenerator';
import { useBudgetLines } from '@/components/compras/useBudgetLines';
import GestaoDocumental from '@/pages/GestaoDocumental';
import RubricasGrid from '@/components/compras/RubricasGrid';
import RubricaDetail from '@/components/rubricas/RubricaDetail';
import RubricasByMuseuDashboard from '@/components/compras/RubricasByMuseuDashboard';
import MuseuPerformanceDashboard from '@/components/compras/MuseuPerformanceDashboard';
import AuditoriaFinanceiraCard from '@/components/compras/AuditoriaFinanceiraCard';
import EntradaUnicaComprovante from '@/components/compras/EntradaUnicaComprovante';
import MeusPagamentosTab from '@/components/compras/MeusPagamentosTab';
import PagarSolicitacaoDialog from '@/components/compras/PagarSolicitacaoDialog';
import NovaRubricaDialog from '@/components/rubricas/NovaRubricaDialog';
import { canManageRubricas } from '@/components/auth/permissions';

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

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v);
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
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
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getPurchaseValue(p) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_aprovado_admin) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_final) ||
    toNumber(p?.valor_solicitado) ||
    toNumber(p?.valor_total) ||
    toNumber(p?.valor) ||
    toNumber(p?.rubrica_debitada_valor) ||
    0
  );
}

function getChaveFiscal(p) {
  if (p?.nf_numero && (p?.fornecedor_cpf_cnpj || p?.fornecedor_cnpj || p?.nf_emitente_cpf_cnpj)) {
    return `nf:${String(p.nf_numero).trim()}:${String(
      p.fornecedor_cpf_cnpj || p.fornecedor_cnpj || p.nf_emitente_cpf_cnpj
    ).replace(/\D/g, '')}:${getPurchaseValue(p)}`;
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

function getComprovantePagamentoUrl(purchase = {}) {
  return (
    purchase.comprovante_pagamento_url ||
    purchase.comprovante_url ||
    purchase.payment_receipt_url ||
    purchase.recibo_url ||
    ''
  );
}

function formatDateTimeBR(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isCompraEquipe(purchase) {
  const raw = [
    purchase?.tipo_origem,
    purchase?.origem,
    purchase?.categoria,
    purchase?.tipo_solicitacao,
    purchase?.descricao_item,
    purchase?.observacoes
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');

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
  const fileName = normalizeText(att?.file_name);
  const nfCategoria = normalizeText(att?.nf_categoria);
  const nfTipo = normalizeText(att?.nf_tipo_documento);

  return (
    nfCategoria === 'nota_fiscal' ||
    nfTipo === 'pdf_nf' ||
    nfTipo === 'xml_nf' ||
    description.includes('entrada unica') ||
    description.includes('nota fiscal') ||
    fileName.includes('museus centro') ||
    !!att?.nf_numero ||
    !!att?.nf_emitente_nome ||
    !!att?.nf_valor_total
  );
}

function dedupById(items) {
  const map = new Map();

  (items || []).forEach((item) => {
    if (item?.id && !map.has(item.id)) {
      map.set(item.id, item);
    }
  });

  return Array.from(map.values());
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

    if (Array.isArray(viaFunction) && viaFunction.length > 0) {
      return viaFunction;
    }
  } catch (error) {
    console.error('Erro em listAllRubricas:', error);
  }

  try {
    const diretas = await base44.entities.Rubrica.list('ordem_exibicao', 500);

    if (Array.isArray(diretas)) {
      return diretas;
    }
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

  const dedup = new Map();

  try {
    const listaGeral = await base44.entities.PurchaseRequest.list('-created_date', 500);

    listaGeral.filter(Boolean).forEach((p) => {
      if (p?.id) {
        if (isCompraEquipe(p)) return;

        const centroCusto = normalizeCentro(p?.centro_custo);

        if (centroCusto === 'Geral') return;

        const museusCentro = ['MHAB', 'MIS', 'MUMO'];
        const temMuseu = museusCentro.includes(centroCusto);

        if (temMuseu) {
          dedup.set(p.id, p);
        }
      }
    });
  } catch (error) {
    console.error('Erro ao buscar lista geral de PurchaseRequest:', error);
  }

  return Array.from(dedup.values()).sort(
    (a, b) => new Date(b?.created_date || 0) - new Date(a?.created_date || 0)
  );
}

function categorizeSolicitacoes(purchases) {
  const categories = {
    geral: [],
    mhab: [],
    mis: [],
    mumo: [],
    pessoas: []
  };

  purchases.forEach((p) => {
    if (isCompraEquipe(p)) {
      categories.pessoas.push(p);
    } else {
      const centro = normalizeCentro(p?.centro_custo);

      if (centro === 'MHAB') categories.mhab.push(p);
      else if (centro === 'MIS') categories.mis.push(p);
      else if (centro === 'MUMO') categories.mumo.push(p);
      else categories.geral.push(p);
    }
  });

  return categories;
}

function TabelaSolicitacoes({
  purchases,
  rubricas,
  attachmentByPurchaseId,
  isCoordenador,
  currentUser,
  podeAprovarSolicitacoes,
  hasGestaoCompras,
  onDelete,
  onApprove,
  onReturn,
  onUnapprove,
  onMarkPaid,
  onAccess,
  userPermission
}) {
  const [menuOpenId, setMenuOpenId] = useState(null);

  const rubricaById = useMemo(() => {
    const m = {};

    (rubricas || []).forEach((r) => {
      if (r?.id) {
        m[r.id] = r;
      }
    });

    return m;
  }, [rubricas]);

  if (!purchases || purchases.length === 0) return null;

  const podeAprovar =
    isCoordenador ||
    podeAprovarSolicitacoes === true ||
    hasGestaoCompras === true;

  const categories = categorizeSolicitacoes(purchases);

  const isObservador = !isCoordenador && userPermission?.base_role === 'OBSERVADOR';

  const visibleCategories = [
    { key: 'geral', label: 'Geral', visible: isCoordenador },
    { key: 'mhab', label: 'MHAB', visible: !isObservador },
    { key: 'mis', label: 'MIS', visible: !isObservador },
    { key: 'mumo', label: 'MUMO', visible: !isObservador },
    { key: 'pessoas', label: 'Pessoas', visible: isCoordenador }
  ].filter((cat) => cat.visible && categories[cat.key].length > 0);

  const renderTabela = (items) => (
    <table className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col className="w-[27%]" />
        <col className="w-[14%]" />
        <col className="w-[8%]" />
        <col className="w-[15%]" />
        <col className="w-[10%]" />
        <col className="w-[10%]" />
        <col className="w-[7%]" />
        <col className="w-[9%]" />
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
        {items.map((p, i) => {
          const statusKey = normalizeStatus(p.status);
          const status =
            STATUS_CONFIG[statusKey] || {
              label: p.status || '—',
              color: 'bg-gray-100 text-gray-600'
            };

          const aprovado = STATUS_APROVADOS.has(statusKey);
          const pendenteAprovacao =
            !aprovado && statusKey !== 'RECUSADO' && statusKey !== 'CANCELADO';

          const rubrica = p.rubrica_id ? rubricaById[p.rubrica_id] : null;
          const rubricaNome =
            p?.rubrica_nome ||
            p?.rubrica ||
            rubrica?.rubrica ||
            rubrica?.nome ||
            '—';

          const valor = getPurchaseValue(p);
          const fileUrl = getPurchaseFileUrl(p, attachmentByPurchaseId);
          const comprovantePagamentoUrl = getComprovantePagamentoUrl(p);
          const pago = statusKey === 'PAGO';
          const comprovantePendente =
            pago && (p.comprovante_pendente === true || !comprovantePagamentoUrl);
          const pagoEmFormatado = formatDateTimeBR(p.pago_em || p.data_pagamento);
          const compraEquipe = isCompraEquipe(p);
          const menuAberto = menuOpenId === p.id;
          const podeEditarAprovada = isCoordenador && aprovado;
          const podeAcessar = !aprovado || podeEditarAprovada;
          const podeMarcarPago =
            podeAprovar && STATUS_ELEGIVEIS_PAGAMENTO.has(statusKey);

          return (
            <tr
              key={p.id}
              className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
              }`}
            >
              <td className="px-3 py-2.5 align-top">
                <p className="line-clamp-2 font-medium text-gray-900">
                  {p.descricao_item || p.objeto || '—'}
                </p>

                {p.meta_id && (
                  <p className="truncate text-xs text-gray-400">
                    {p.meta_id === 'MC3A-EXTRA' && p.meta_extra_descricao
                      ? p.meta_extra_descricao
                      : p.meta_id}
                  </p>
                )}

                {compraEquipe && (
                  <span className="mt-1 inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                    Equipe
                  </span>
                )}
              </td>

              <td className="px-3 py-2.5 align-top text-gray-600">
                <p className="truncate">
                  {p.fornecedor_nome || p.nf_emitente_nome || '—'}
                </p>
              </td>

              <td className="px-3 py-2.5 align-top">
                {p._centro_custo_normalizado ? (
                  <span className="inline-block max-w-full truncate rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {p._centro_custo_normalizado}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </td>

              <td className="px-3 py-2.5 align-top">
                <p className="truncate text-xs text-gray-700">
                  {rubricaNome}
                </p>
              </td>

              <td className="px-3 py-2.5 align-top">
                <span
                  className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
                >
                  {status.label}
                </span>

                {pagoEmFormatado && (
                  <p className="mt-1 text-[11px] leading-tight text-gray-400">
                    {pagoEmFormatado}
                  </p>
                )}

                {pago && p.pago_por && (
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-gray-400">
                    por {p.pago_por}
                  </p>
                )}

                {comprovantePendente && (
                  <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Comprovante pendente
                  </span>
                )}

                {comprovantePagamentoUrl && (
                  <a
                    href={comprovantePagamentoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate text-[11px] font-medium text-blue-700 underline underline-offset-2"
                  >
                    Abrir comprovante
                  </a>
                )}
              </td>

              <td className="px-3 py-2.5 align-top text-right font-medium tabular-nums text-gray-900">
                <span className="block truncate">{fmtBRL(valor)}</span>
              </td>

              <td className="px-3 py-2.5 align-top text-center">
                {fileUrl ? (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                  >
                    Arquivo
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </td>

              <td className="px-3 py-2.5 align-top">
                <div className="relative flex items-center justify-center gap-2">
                  {podeAcessar && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onAccess(p);
                      }}
                      className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-black"
                      title={aprovado ? 'Apenas coordenadores podem editar aprovadas' : 'Ações'}
                      disabled={!podeAcessar}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {isCoordenador && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        if (window.confirm('Tem certeza que deseja deletar esta solicitação?')) {
                          await onDelete(p.id);
                        }
                      }}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Deletar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {podeMarcarPago && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onMarkPaid?.(p);
                      }}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                        pago
                          ? 'text-emerald-600 hover:bg-emerald-50'
                          : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-700'
                      }`}
                      title={pago ? 'Adicionar ou editar comprovante' : 'Marcar como pago'}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="hidden xl:inline">
                        {pago ? 'Comprovante' : 'Pago'}
                      </span>
                    </button>
                  )}

                  {menuAberto && (
                    <div className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-lg">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpenId(null);
                          onAccess(p);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Acessar solicitação
                      </button>

                      {podeAprovar && pendenteAprovacao && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenuOpenId(null);
                              onApprove(p);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-green-700 hover:bg-green-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Aprovar
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenuOpenId(null);
                              onReturn(p);
                            }}
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
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpenId(null);
                            onUnapprove(p);
                          }}
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
  );

  return (
    <div className="space-y-8">
      {visibleCategories.map((cat) => (
        <div key={cat.key}>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {cat.label}
            </h3>

            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {categories[cat.key].length}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            {renderTabela(categories[cat.key])}
          </div>
        </div>
      ))}
    </div>
  );
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
  const [showNovaRubrica, setShowNovaRubrica] = useState(false);
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const [paymentPurchase, setPaymentPurchase] = useState(null);
  const [recalculando, setRecalculando] = useState(false);

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
    let mounted = true;

    setUserLoading(true);
    setUserLoadError(false);

    base44.auth
      .me()
      .then((u) => {
        if (!mounted) return;
        setCurrentUser(u || null);
      })
      .catch(() => {
        if (!mounted) return;
        setCurrentUser(null);
        setUserLoadError(true);
      })
      .finally(() => {
        if (!mounted) return;
        setUserLoading(false);
      });

    return () => {
      mounted = false;
    };
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
      queryClient.invalidateQueries({ queryKey: ['attachments-compras'] }),
      queryClient.invalidateQueries({ queryKey: ['purchase-documents-all'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['team-member-own'] }),
      queryClient.invalidateQueries({ queryKey: ['team-members-all-for-coordinator'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'] })
    ]);
  }, [queryClient]);

  const {
    data: userPermission,
    isLoading: loadingUserPermission
  } = useQuery({
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
    enabled: !!currentUser?.email,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false
  });

  const hasGestaoCompras = isCoordenador || userPermission?.gestao_compras === true;
  const podeAprovarSolicitacoes =
    isCoordenador || userPermission?.pode_aprovar_solicitacoes === true;
  const podeGerenciarRubricas = canManageRubricas(currentUser, userPermission);

  const {
    data: purchases = [],
    isLoading,
    isFetching: fetchingPurchases
  } = useQuery({
    queryKey: ['purchases', isCoordenador, currentUser?.email],
    queryFn: () => carregarSolicitacoes({ isCoordenador, currentUser }),
    enabled: !!currentUser,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false
  });

  const {
    data: anexosCompras = [],
    isLoading: loadingAnexos,
    isFetching: fetchingAnexos
  } = useQuery({
    queryKey: ['attachments-compras'],
    queryFn: async () => {
      const list = await base44.entities.Attachment.list('-created_date', 500);
      const docs = dedupById((list || []).filter(isEntradaUnicaAttachment));

      return docs.sort(
        (a, b) => new Date(b?.created_date || 0) - new Date(a?.created_date || 0)
      );
    },
    enabled: !!currentUser,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false
  });

  const attachmentByPurchaseId = useMemo(() => {
    const map = {};

    (anexosCompras || []).forEach((doc) => {
      const purchaseId =
        doc?.purchase_id ||
        doc?.purchase_request_id ||
        doc?.purchaseRequestId ||
        doc?.solicitacao_id;

      if (purchaseId && !map[purchaseId]) {
        map[purchaseId] = doc;
      }
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
    enabled: !!currentUser,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false
  });

  const { budgetLines } = useBudgetLines();

  const {
    data: rubricas = [],
    refetch: refetchRubricas,
    isLoading: loadingRubricas,
    isFetching: fetchingRubricas
  } = useQuery({
    queryKey: ['rubricas'],
    queryFn: carregarRubricas,
    enabled: !!currentUser,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false
  });

  const TOTAL_PREVISTO_3_ADITIVO = 1320000;

  const totaisConsolidados = useMemo(() => {
    const totalUtilizado = (rubricas || []).reduce(
      (acc, r) => acc + toNumber(r.valor_utilizado),
      0
    );

    const saldo = TOTAL_PREVISTO_3_ADITIVO - totalUtilizado;

    return {
      totalPrevisto: TOTAL_PREVISTO_3_ADITIVO,
      totalUtilizado,
      saldo
    };
  }, [rubricas]);

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

  const filtered = purchasesWithFlags.filter((p) => {
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

  const refreshFinanceiroCompleto = useCallback(async () => {
    await invalidateComprasQueries();
    await refetchRubricas();
  }, [invalidateComprasQueries, refetchRubricas]);

  async function handleApprovePurchase(purchase) {
    if (!purchase?.id) return;

    if (!purchase?.rubrica_id) {
      smartToast.error('Não é possível aprovar sem rubrica vinculada.');
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
            const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

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

      await refreshFinanceiroCompleto();

      await notifyPurchaseApproved(
        {
          ...purchase,
          status: 'APROVADO_COORD'
        },
        currentUser
      ).catch((error) => {
        console.warn('Falha ao notificar aprovação de compra:', error);
      });

      smartToast.success('Solicitação aprovada e rubrica debitada.');
    } catch (error) {
      console.error('Erro ao aprovar solicitação:', error);
      smartToast.error('Erro ao aprovar', error.message);
    }
  }

  async function handleReturnPurchase(purchase) {
    if (!purchase?.id) return;

    const comentario = window.prompt(
      'Informe o comentário de devolução:',
      'Devolvido pela coordenação para ajustes.'
    );

    if (comentario === null) return;

    try {
      const response = await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: 'devolver',
        comentario: comentario || 'Devolvido pela coordenação.'
      });

      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao devolver.');
      }

      await refreshFinanceiroCompleto();

      await notifyPurchaseReturned(
        {
          ...purchase,
          status: 'DEVOLVIDO',
          comentario_devolucao: comentario || ''
        },
        currentUser
      ).catch((error) => {
        console.warn('Falha ao notificar devolução de compra:', error);
      });

      smartToast.success('Solicitação devolvida.');
    } catch (error) {
      try {
        await base44.entities.PurchaseRequest.update(purchase.id, {
          status: 'DEVOLVIDO',
          comentario_devolucao: comentario || ''
        });

        await refreshFinanceiroCompleto();

        await notifyPurchaseReturned(
          {
            ...purchase,
            status: 'DEVOLVIDO',
            comentario_devolucao: comentario || ''
          },
          currentUser
        ).catch((error) => {
          console.warn('Falha ao notificar devolução de compra:', error);
        });

        smartToast.success('Solicitação devolvida.');
      } catch (e2) {
        smartToast.error('Erro ao devolver', e2.message);
      }
    }
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
            const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

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

      await refreshFinanceiroCompleto();

      smartToast.success('Registro deletado e rubrica estornada com sucesso.');
    } catch (error) {
      console.error('Erro ao deletar solicitação:', error);
      smartToast.error('Erro ao deletar', error.message);
    }
  }

  async function recalcularTodasRubricas() {
    if (
      !window.confirm(
        'Executar agora a restauração/recalculo das rubricas oficiais do 3º Aditivo?'
      )
    ) {
      return;
    }

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

  const isInitialPageLoading =
    userLoading ||
    (!!currentUser &&
      (loadingUserPermission ||
        isLoading ||
        loadingRubricas ||
        loadingAnexos));

  if (isInitialPageLoading) {
    return (
      <LoadingPage
        message="Carregando página..."
        description="Estamos carregando solicitações, rubricas, documentos e permissões. Aguarde alguns instantes."
      />
    );
  }

  if (userLoadError && !currentUser) {
    return (
      <LoadingPage
        error
        errorTitle="Não foi possível carregar a página"
        errorDescription="Não conseguimos carregar os dados do usuário. Atualize a página ou tente novamente em alguns instantes."
      />
    );
  }

  const isSyncingPage = fetchingPurchases || fetchingRubricas || fetchingAnexos;

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

        {isSyncingPage && (
          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            Atualizando informações financeiras e documentais...
          </div>
        )}

        {isCoordenador && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">Total Previsto</p>
              <p className="mt-1 break-words text-lg font-bold leading-tight text-gray-900 tabular-nums">
                {fmtBRL(totaisConsolidados.totalPrevisto)}
              </p>
              <p className="text-xs text-gray-400">Valor total do 3º Aditivo</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">Total Utilizado</p>
              <p className="mt-1 break-words text-lg font-bold leading-tight text-gray-900 tabular-nums">
                {fmtBRL(totaisConsolidados.totalUtilizado)}
              </p>
              <p className="text-xs text-gray-400">
                Aprovado coord. + admin + pago
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">Saldo Disponível</p>
              <p
                className={`mt-1 break-words text-lg font-bold leading-tight tabular-nums ${
                  totaisConsolidados.saldo < 0
                    ? 'text-red-600'
                    : 'text-green-700'
                }`}
              >
                {fmtBRL(totaisConsolidados.saldo)}
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
            ...(podeGerenciarRubricas ? [{ id: 'rubricas', label: 'Rubricas' }] : []),
            { id: 'documentos', label: 'Documentos' },
            ...(isCoordenador ? [{ id: 'equipe', label: 'Equipe' }] : []),
            { id: 'meus_pagamentos', label: 'Meus Pagamentos' }
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

              {isMobile ? (
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
                      }))
                    ]}
                  />

                  <NativeSelect
                    value={filters.rubrica_id}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, rubrica_id: v }))
                    }
                    placeholder="Rubrica"
                    items={[
                      { value: 'all', label: 'Todas as rubricas' },
                      ...(rubricas || [])
                        .filter((r) => r?.ativo !== false)
                        .map((r) => ({
                          value: r.id,
                          label: r.rubrica || r.nome
                        }))
                    ]}
                  />

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
                      }))
                    ]}
                  />
                </>
              ) : (
                <>
                  <Select
                    value={filters.status}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, status: v }))
                    }
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
                </>
              )}
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
                  className="gap-2 border-amber-300 text-xs text-amber-700 hover:bg-amber-50"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {recalculando ? 'Recalculando...' : 'Recalcular Rubricas'}
                </Button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
                <ShoppingCart className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="font-medium text-gray-400">
                  Nenhuma solicitação encontrada
                </p>
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
                userPermission={userPermission}
                onApprove={handleApprovePurchase}
                onReturn={handleReturnPurchase}
                onUnapprove={handleUnapprovePurchase}
                onMarkPaid={(purchase) => setPaymentPurchase(purchase)}
                onAccess={(purchase) => {
                  setEditingPurchase({ ...purchase });
                  setShowForm(true);
                }}
                onDelete={handleDeletePurchase}
              />
            )}
          </div>
        )}

        {tab === 'rubricas' && podeGerenciarRubricas && (
          <div className="space-y-6">
            {selectedRubrica ? (
              <RubricaDetail
                rubrica={selectedRubrica}
                onClose={async () => {
                  setSelectedRubrica(null);
                  await refreshFinanceiroCompleto();
                }}
              />
            ) : (
              <>
                <div className="flex gap-2 border-b border-gray-200">
                  <button
                    onClick={() => setTab('rubricas-resumo')}
                    className="border-b-2 border-black px-4 py-2 text-sm font-medium text-gray-900"
                  >
                    Visão Consolidada
                  </button>

                  <button
                    onClick={() => setTab('rubricas-museus')}
                    className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
                  >
                    Por Museu
                  </button>

                  <button
                    onClick={() => setTab('rubricas-performance')}
                    className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
                  >
                    Performance
                  </button>

                  <button
                    onClick={() => setTab('rubricas-detalhe')}
                    className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
                  >
                    Detalhe
                  </button>
                </div>

                {podeGerenciarRubricas && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => setShowNovaRubrica(true)}
                      className="gap-2 bg-black text-white hover:bg-gray-800"
                    >
                      <Plus className="h-4 w-4" />
                      Nova Rubrica
                    </Button>
                  </div>
                )}

                <RubricasGrid
                  rubricas={rubricas}
                  onSelectRubrica={setSelectedRubrica}
                  onRefresh={refreshFinanceiroCompleto}
                  isCoordenador={isCoordenador}
                  totalPrevisto={totaisConsolidados.totalPrevisto}
                />
              </>
            )}

            {fetchingRubricas && (
              <div className="text-sm text-gray-400">
                Atualizando dados financeiros...
              </div>
            )}
          </div>
        )}

        {tab === 'rubricas-museus' && podeGerenciarRubricas && (
          <div className="space-y-6">
            <div className="mb-4 flex gap-2 border-b border-gray-200">
              <button
                onClick={() => setTab('rubricas')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Visão Consolidada
              </button>

              <button
                onClick={() => setTab('rubricas-museus')}
                className="border-b-2 border-black px-4 py-2 text-sm font-medium text-gray-900"
              >
                Por Museu
              </button>

              <button
                onClick={() => setTab('rubricas-performance')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Performance
              </button>

              <button
                onClick={() => setTab('rubricas-detalhe')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Detalhe
              </button>
            </div>

            <RubricasByMuseuDashboard
              rubricas={rubricas}
              purchases={purchases}
              onRefresh={refreshFinanceiroCompleto}
            />
          </div>
        )}

        {tab === 'rubricas-performance' && podeGerenciarRubricas && (
          <div className="space-y-6">
            <div className="mb-4 flex gap-2 border-b border-gray-200">
              <button
                onClick={() => setTab('rubricas')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Visão Consolidada
              </button>

              <button
                onClick={() => setTab('rubricas-museus')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Por Museu
              </button>

              <button
                onClick={() => setTab('rubricas-performance')}
                className="border-b-2 border-black px-4 py-2 text-sm font-medium text-gray-900"
              >
                Performance
              </button>

              <button
                onClick={() => setTab('rubricas-detalhe')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Detalhe
              </button>
            </div>

            <MuseuPerformanceDashboard purchases={purchases} rubricas={rubricas} />
          </div>
        )}

        {tab === 'rubricas-detalhe' && podeGerenciarRubricas && (
          <div className="space-y-6">
            <div className="mb-4 flex gap-2 border-b border-gray-200">
              <button
                onClick={() => setTab('rubricas')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Visão Consolidada
              </button>

              <button
                onClick={() => setTab('rubricas-museus')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Por Museu
              </button>

              <button
                onClick={() => setTab('rubricas-performance')}
                className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Performance
              </button>

              <button
                onClick={() => setTab('rubricas-detalhe')}
                className="border-b-2 border-black px-4 py-2 text-sm font-medium text-gray-900"
              >
                Detalhe
              </button>
            </div>

            {!selectedRubrica && podeGerenciarRubricas && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => setShowNovaRubrica(true)}
                  className="gap-2 bg-black text-white hover:bg-gray-800"
                >
                  <Plus className="h-4 w-4" />
                  Nova Rubrica
                </Button>
              </div>
            )}

            {selectedRubrica ? (
              <RubricaDetail
                rubrica={selectedRubrica}
                onClose={async () => {
                  setSelectedRubrica(null);
                  await refreshFinanceiroCompleto();
                }}
              />
            ) : (
              <RubricasGrid
                rubricas={rubricas}
                onSelectRubrica={setSelectedRubrica}
                onRefresh={refreshFinanceiroCompleto}
                isCoordenador={isCoordenador}
                totalPrevisto={totaisConsolidados.totalPrevisto}
              />
            )}
          </div>
        )}

        {tab === 'documentos' && (
          <div className="max-w-7xl space-y-6">
            {isCoordenador && (
              <EntradaUnicaComprovante onSuccess={refreshFinanceiroCompleto} />
            )}

            <GestaoDocumental />
          </div>
        )}

        {tab === 'equipe' && isCoordenador && (
          <TeamManager budgetLines={budgetLines} />
        )}

        {tab === 'meus_pagamentos' && (
          <MeusPagamentosTab
            purchases={purchasesWithFlags}
            attachments={anexosCompras}
            currentUser={currentUser}
            isCoordenador={isCoordenador}
            hasGestaoCompras={hasGestaoCompras}
          />
        )}

        {isCoordenador && (
          <div className="mt-8">
            <AuditoriaFinanceiraCard
              purchases={purchases}
              rubricas={rubricas}
              onEditPurchase={(purchase) => {
                setEditingPurchase({ ...purchase });
                setShowForm(true);
                setTab('lista');
              }}
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

      {paymentPurchase && (
        <PagarSolicitacaoDialog
          purchase={paymentPurchase}
          currentUser={currentUser}
          onClose={() => setPaymentPurchase(null)}
          onSuccess={async () => {
            setPaymentPurchase(null);
            await refreshFinanceiroCompleto();
          }}
        />
      )}

      <NovaRubricaDialog
        open={showNovaRubrica}
        currentUser={currentUser}
        onClose={async () => {
          setShowNovaRubrica(false);
          await refreshFinanceiroCompleto();
        }}
      />
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
