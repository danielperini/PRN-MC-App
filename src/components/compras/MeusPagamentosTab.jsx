// src/components/compras/MeusPagamentosTab.jsx

import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ChevronDown, ChevronRight, FileText, Search,
  CreditCard, CheckCircle2, Clock, AlertCircle, DollarSign,
  Calendar, Building2, Hash, Paperclip, Info,
} from 'lucide-react';

// ─── utils ────────────────────────────────────────────────────────────────────

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(v) || 0);
}

function fmtDate(v) {
  if (!v) return null;

  const d = new Date(String(v).includes('T') ? v : v + 'T00:00:00');

  if (isNaN(d.getTime())) return String(v);

  return d.toLocaleDateString('pt-BR');
}

function normalize(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function isAtrasada(dateStr) {
  if (!dateStr) return false;

  const d = new Date(
    String(dateStr).includes('T')
      ? dateStr
      : dateStr + 'T00:00:00'
  );

  return !isNaN(d.getTime()) && d < new Date();
}

// ─── status ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  RASCUNHO: {
    label: 'Rascunho',
    cls: 'bg-gray-100 text-gray-600',
    icon: Clock,
  },

  SOLICITADO: {
    label: 'Em aprovação',
    cls: 'bg-blue-100 text-blue-700',
    icon: Clock,
  },

  DEVOLVIDO: {
    label: 'Devolvido',
    cls: 'bg-amber-100 text-amber-700',
    icon: AlertCircle,
  },

  APROVADO_COORD: {
    label: 'Aprovado',
    cls: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
  },

  APROVADO_ADMIN: {
    label: 'Aprovado',
    cls: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
  },

  APROVADO: {
    label: 'Aprovado',
    cls: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
  },

  PAGO: {
    label: 'Pago',
    cls: 'bg-emerald-100 text-emerald-800',
    icon: CheckCircle2,
  },

  RECUSADO: {
    label: 'Recusado',
    cls: 'bg-red-100 text-red-700',
    icon: AlertCircle,
  },

  CANCELADO: {
    label: 'Cancelado',
    cls: 'bg-gray-100 text-gray-500',
    icon: AlertCircle,
  },
};

const STATUS_APROVADOS = new Set([
  'APROVADO',
  'APROVADO_COORD',
  'APROVADO_ADMIN',
  'PAGO',
]);

const STATUS_EM_APROVACAO = new Set([
  'SOLICITADO',
  'DEVOLVIDO',
]);

const STATUS_VISIVEIS = new Set([
  ...STATUS_APROVADOS,
  ...STATUS_EM_APROVACAO,
  'RASCUNHO',
]);

function getStatusCfg(s) {
  return (
    STATUS_CONFIG[String(s || '').toUpperCase()] || {
      label: s || '—',
      cls: 'bg-gray-100 text-gray-600',
      icon: Clock,
    }
  );
}

function getBestValue(p) {
  const candidates = [
    p?.valor_pago,
    p?.valor_aprovado_admin,
    p?.valor_aprovado,
    p?.valor_total,
    p?.valor_solicitado,
    p?.valor,
  ];

  for (const c of candidates) {
    const n = Number(c);

    if (Number.isFinite(n) && n > 0) return n;
  }

  return 0;
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = getStatusCfg(status);
  const Icon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function FileLink({ label, url }) {
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
    >
      <FileText className="w-3 h-3" />
      {label}
    </a>
  );
}

function InfoCell({ label, value, highlight }) {
  if (!value) return null;

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
        {label}
      </p>

      <p
        className={`text-xs font-medium mt-0.5 ${
          highlight ? 'text-emerald-700' : 'text-gray-800'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── parcelas ────────────────────────────────────────────────────────────────

function ParcelasSection({ purchase }) {
  const ia = purchase?.resultado_ia || {};

  const numParc = Number(
    ia?.numero_parcelas ||
      purchase?.numero_parcelas ||
      1
  );

  if (numParc <= 1) return null;

  const valor = getBestValue(purchase);

  const valorParc = Number(
    ia?.valor_parcela ||
      purchase?.valor_parcela ||
      valor / Math.max(numParc, 1)
  );

  const datasArray = Array.isArray(ia?.datas_pagamento)
    ? ia.datas_pagamento
    : [];

  const isPago =
    String(purchase?.status || '').toUpperCase() === 'PAGO';

  const parcelas = Array.from({ length: numParc }, (_, i) => {
    const data = datasArray[i] || null;

    let status = 'prevista';

    if (isPago) {
      status = 'paga';
    } else if (
      data &&
      isAtrasada(data) &&
      !STATUS_APROVADOS.has(
        String(purchase?.status || '').toUpperCase()
      )
    ) {
      status = 'atrasada';
    } else if (
      STATUS_APROVADOS.has(
        String(purchase?.status || '').toUpperCase()
      ) &&
      i === 0
    ) {
      status = 'aprovada';
    }

    return {
      numero: i + 1,
      valor: valorParc,
      data,
      status,
    };
  });

  const statusCls = {
    paga: 'bg-emerald-100 text-emerald-700',
    aprovada: 'bg-green-100 text-green-700',
    atrasada: 'bg-red-100 text-red-700',
    prevista: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-100 overflow-hidden">
      <div className="divide-y divide-gray-50">
        {parcelas.map((parc) => (
          <div
            key={parc.numero}
            className="grid grid-cols-4 gap-2 px-4 py-2.5 text-xs items-center hover:bg-gray-50/50"
          >
            <span className="text-gray-600 font-medium">
              Parcela {parc.numero}/{numParc}
            </span>

            <span className="font-semibold text-gray-800">
              {fmtBRL(parc.valor)}
            </span>

            <span className="text-gray-500">
              {parc.data ? fmtDate(parc.data) : '—'}
            </span>

            <span
              className={`w-fit rounded-full px-2 py-0.5 font-medium ${
                statusCls[parc.status] || statusCls.prevista
              }`}
            >
              {parc.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── card ────────────────────────────────────────────────────────────────────

function PurchaseCard({ purchase }) {
  const [expanded, setExpanded] = useState(false);

  const ia = purchase?.resultado_ia || {};

  const valor = getBestValue(purchase);

  const statusKey = String(
    purchase.status || ''
  ).toUpperCase();

  const numParc = Number(
    ia?.numero_parcelas ||
      purchase?.numero_parcelas ||
      1
  );

  const valorParc = Number(
    ia?.valor_parcela ||
      purchase?.valor_parcela ||
      valor / Math.max(numParc, 1)
  );

  return (
    <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-gray-50">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {purchase.numero_processamento && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                  <Hash className="w-2.5 h-2.5" />
                  {purchase.numero_processamento}
                </span>
              )}

              <StatusBadge status={purchase.status} />
            </div>

            <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
              {purchase.descricao_item || '—'}
            </p>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {(purchase.fornecedor_nome ||
                ia?.fornecedor_nome) && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Building2 className="w-3 h-3" />
                  {purchase.fornecedor_nome ||
                    ia?.fornecedor_nome}
                </span>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0 min-w-[90px]">
            <p className="text-xl font-bold text-gray-900">
              {fmtBRL(valor)}
            </p>

            {numParc > 1 && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                {numParc}x {fmtBRL(valorParc)}
              </p>
            )}
          </div>
        </div>

        <div className="px-4 py-2.5">
          {numParc > 1 ? (
            <>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}

                {expanded
                  ? 'Ocultar parcelas'
                  : `Ver ${numParc} parcelas`}
              </button>

              {expanded && (
                <ParcelasSection purchase={purchase} />
              )}
            </>
          ) : (
            <span className="text-xs text-gray-300">
              Pagamento único
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── principal ───────────────────────────────────────────────────────────────

export default function MeusPagamentosTab({
  purchases = [],
  currentUser,
}) {
  const [search, setSearch] = useState('');

  const email = String(
    currentUser?.email || ''
  )
    .toLowerCase()
    .trim();

  // ── TeamMember ────────────────────────────────────────────────────────────

  const { data: meusMembros = [] } = useQuery({
    queryKey: ['my-team-members', email],

    queryFn: async () => {
      if (!email) return [];

      const porEmail =
        await base44.entities.TeamMember.filter({
          user_email: currentUser.email,
        }).catch(() => []);

      return Array.isArray(porEmail)
        ? porEmail
        : [];
    },

    enabled: !!email,
    staleTime: 30000,
  });

  // ── TeamPayment ───────────────────────────────────────────────────────────

  const { data: meusTeamPayments = [] } = useQuery({
    queryKey: ['my-team-payments', email],

    queryFn: async () => {
      if (!email) return [];

      const res =
        await base44.entities.TeamPayment.filter({
          user_email: currentUser.email,
        }).catch(() => []);

      return Array.isArray(res)
        ? res
        : [];
    },

    enabled: !!email,
    staleTime: 30000,
  });

  // ── Todas solicitações ────────────────────────────────────────────────────

  const {
    data: todasSolicitacoes = [],
    isLoading: loadingAll,
  } = useQuery({
    queryKey: ['all-purchases-pagamentos', email],

    queryFn: async () => {
      if (!email) return [];

      const res =
        await base44.entities.PurchaseRequest.list(
          '-created_date',
          800
        );

      return Array.isArray(res)
        ? res
        : [];
    },

    enabled: !!email,
    staleTime: 30000,
  });

  // ── identificação ─────────────────────────────────────────────────────────

  const meusCpfsCnpjs = useMemo(() => {
    const s = new Set();

    meusMembros.forEach((m) => {
      if (m?.cpf) s.add(onlyDigits(m.cpf));
      if (m?.cnpj) s.add(onlyDigits(m.cnpj));
    });

    return s;
  }, [meusMembros]);

  const meusTeamMemberIds = useMemo(
    () =>
      new Set(
        meusMembros
          .map((m) => m?.id)
          .filter(Boolean)
      ),
    [meusMembros]
  );

  const teamPaymentPurchaseIds = useMemo(() => {
    const s = new Set();

    meusTeamPayments.forEach((tp) => {
      if (tp?.purchase_request_id) {
        s.add(tp.purchase_request_id);
      }
    });

    return s;
  }, [meusTeamPayments]);

  // ── FILTRO CORRIGIDO ──────────────────────────────────────────────────────
  // IMPORTANTE:
  // "Meus Pagamentos" agora SEMPRE mostra somente
  // pagamentos vinculados ao usuário logado.
  // Coordenador NÃO vê pagamentos de terceiros aqui.

  const pertenceAoUsuario = useMemo(
    () => (p) => {
      if (!email) return false;

      // 1. Criado pelo usuário

      const ownerEmails = [
        p.created_by,
        p.user_email,
        p.requester_email,
        p.solicitante_email,
        p.author_email,
        p.owner_email,
      ]
        .map((v) =>
          String(v || '')
            .toLowerCase()
            .trim()
        )
        .filter(Boolean);

      if (ownerEmails.includes(email)) return true;

      // 2. TeamPayment

      if (
        p.team_payment_id &&
        meusTeamPayments.some(
          (tp) => tp.id === p.team_payment_id
        )
      ) {
        return true;
      }

      if (teamPaymentPurchaseIds.has(p.id)) {
        return true;
      }

      // 3. TeamMember

      if (
        p.team_member_id &&
        meusTeamMemberIds.has(p.team_member_id)
      ) {
        return true;
      }

      // 4. CPF/CNPJ

      if (meusCpfsCnpjs.size > 0) {
        const cnpjForn = onlyDigits(
          p.fornecedor_cnpj ||
            p.nf_emitente_cpf_cnpj ||
            p.fornecedor_cpf_cnpj ||
            ''
        );

        if (
          cnpjForn &&
          meusCpfsCnpjs.has(cnpjForn)
        ) {
          return true;
        }
      }

      // 5. Nome fornecedor

      if (
        meusMembros.length > 0 &&
        p.fornecedor_nome
      ) {
        const normForn = normalize(
          p.fornecedor_nome
        );

        if (
          meusMembros.some(
            (m) =>
              m?.user_name &&
              normalize(m.user_name)
                .split(' ')
                .some(
                  (part) =>
                    part.length > 3 &&
                    normForn.includes(part)
                )
          )
        ) {
          return true;
        }
      }

      return false;
    },

    [
      email,
      meusMembros,
      meusTeamPayments,
      meusTeamMemberIds,
      meusCpfsCnpjs,
      teamPaymentPurchaseIds,
    ]
  );

  // ── solicitações ──────────────────────────────────────────────────────────

  const minhasSolicitacoes = useMemo(() => {
    const map = new Map();

    purchases.forEach((p) => {
      if (p?.id && pertenceAoUsuario(p)) {
        map.set(p.id, p);
      }
    });

    todasSolicitacoes.forEach((p) => {
      if (
        p?.id &&
        !map.has(p.id) &&
        pertenceAoUsuario(p)
      ) {
        map.set(p.id, p);
      }
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b?.created_date || 0) -
        new Date(a?.created_date || 0)
    );
  }, [
    purchases,
    todasSolicitacoes,
    pertenceAoUsuario,
  ]);

  const visiveis = useMemo(
    () =>
      minhasSolicitacoes.filter((p) =>
        STATUS_VISIVEIS.has(
          String(p.status || '').toUpperCase()
        )
      ),
    [minhasSolicitacoes]
  );

  // ── filtro busca ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = normalize(search);

    return visiveis.filter((p) => {
      if (!q) return true;

      return (
        normalize(p.descricao_item).includes(q) ||
        normalize(p.fornecedor_nome).includes(q) ||
        normalize(p.numero_processamento).includes(q)
      );
    });
  }, [visiveis, search]);

  const loading = loadingAll;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">
          Meus Pagamentos
        </h2>

        <p className="text-sm text-gray-500 mt-0.5">
          Solicitações, parcelas, arquivos e
          comprovantes vinculados ao seu perfil.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />

          <Input
            placeholder="Buscar solicitação, fornecedor, número..."
            className="pl-8 h-9 text-sm"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />
        </div>

        <p className="text-xs text-gray-400 pt-2">
          {loading
            ? 'Carregando...'
            : `${filtered.length} solicitação(ões) vinculadas ao seu perfil`}
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center bg-gray-50/30">
          <div className="mx-auto mb-3 h-8 w-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />

          <p className="text-sm text-gray-400">
            Carregando solicitações...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center bg-gray-50/30">
          <CreditCard className="mx-auto mb-3 h-10 w-10 text-gray-300" />

          <p className="text-sm font-medium text-gray-400">
            Nenhuma solicitação encontrada
          </p>

          <p className="text-xs text-gray-400 mt-1">
            Nenhuma solicitação vinculada ao
            seu perfil foi encontrada.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PurchaseCard
              key={p.id}
              purchase={p}
            />
          ))}
        </div>
      )}
    </div>
  );
}
