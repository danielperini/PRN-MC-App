import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ChevronDown, ChevronRight, FileText, Search, Download,
  CreditCard, CheckCircle2, Clock, AlertCircle, DollarSign,
  ExternalLink, Calendar, Building2, Hash, Paperclip, Info,
} from 'lucide-react';

// ─── utils ────────────────────────────────────────────────────────────────────

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

function fmtDate(v) {
  if (!v) return null;
  const d = new Date(String(v).includes('T') ? v : v + 'T00:00:00');
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('pt-BR');
}

function normalize(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function isAtrasada(dateStr) {
  if (!dateStr) return false;
  const d = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  return !isNaN(d.getTime()) && d < new Date();
}

// ─── constantes de status ─────────────────────────────────────────────────────

const STATUS_CONFIG = {
  RASCUNHO:       { label: 'Rascunho',     cls: 'bg-gray-100 text-gray-600',       icon: Clock },
  SOLICITADO:     { label: 'Em aprovação', cls: 'bg-blue-100 text-blue-700',        icon: Clock },
  DEVOLVIDO:      { label: 'Devolvido',    cls: 'bg-amber-100 text-amber-700',      icon: AlertCircle },
  APROVADO_COORD: { label: 'Aprovado',     cls: 'bg-green-100 text-green-700',      icon: CheckCircle2 },
  APROVADO_ADMIN: { label: 'Aprovado',     cls: 'bg-green-100 text-green-700',      icon: CheckCircle2 },
  APROVADO:       { label: 'Aprovado',     cls: 'bg-green-100 text-green-700',      icon: CheckCircle2 },
  PAGO:           { label: 'Pago',         cls: 'bg-emerald-100 text-emerald-800',  icon: CheckCircle2 },
  RECUSADO:       { label: 'Recusado',     cls: 'bg-red-100 text-red-700',          icon: AlertCircle },
  CANCELADO:      { label: 'Cancelado',    cls: 'bg-gray-100 text-gray-500',        icon: AlertCircle },
};

const STATUS_APROVADOS    = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_EM_APROVACAO = new Set(['SOLICITADO', 'DEVOLVIDO']);
const STATUS_VISIVEIS     = new Set([...STATUS_APROVADOS, ...STATUS_EM_APROVACAO, 'RASCUNHO']);

function getStatusCfg(s) {
  return STATUS_CONFIG[String(s || '').toUpperCase()] || { label: s || '—', cls: 'bg-gray-100 text-gray-600', icon: Clock };
}

function getBestValue(p) {
  const candidates = [
    p?.valor_pago, p?.valor_aprovado_admin, p?.valor_aprovado,
    p?.valor_total, p?.valor_solicitado, p?.valor,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

// ─── sub-componentes ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = getStatusCfg(status);
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function FileLink({ label, url }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
      <FileText className="w-3 h-3" />{label}
    </a>
  );
}

function InfoCell({ label, value, highlight }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      <p className={`text-xs font-medium mt-0.5 ${highlight ? 'text-emerald-700' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

// ─── Tabela de parcelas ───────────────────────────────────────────────────────

function ParcelasSection({ purchase }) {
  const ia = purchase?.resultado_ia || {};
  const numParc = Number(ia?.numero_parcelas || purchase?.numero_parcelas || 1);
  if (numParc <= 1) return null;

  const valor       = getBestValue(purchase);
  const valorParc   = Number(ia?.valor_parcela || purchase?.valor_parcela || valor / Math.max(numParc, 1));
  const datasArray  = Array.isArray(ia?.datas_pagamento) ? ia.datas_pagamento : [];
  const isPago      = String(purchase?.status || '').toUpperCase() === 'PAGO';

  const parcelas = Array.from({ length: numParc }, (_, i) => {
    const data = datasArray[i] || null;
    let status = 'prevista';
    if (isPago) status = 'paga';
    else if (data && isAtrasada(data) && !STATUS_APROVADOS.has(String(purchase?.status || '').toUpperCase())) status = 'atrasada';
    else if (STATUS_APROVADOS.has(String(purchase?.status || '').toUpperCase()) && i === 0) status = 'aprovada';
    return { numero: i + 1, valor: valorParc, data, status };
  });

  const statusCls = {
    paga:     'bg-emerald-100 text-emerald-700',
    aprovada: 'bg-green-100 text-green-700',
    atrasada: 'bg-red-100 text-red-700',
    prevista: 'bg-gray-100 text-gray-600',
  };

  const pagas     = parcelas.filter(p => p.status === 'paga').length;
  const atrasadas = parcelas.filter(p => p.status === 'atrasada').length;
  const proxima   = parcelas.find(p => p.status !== 'paga' && p.data);

  return (
    <div className="mt-3 rounded-xl border border-gray-100 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600">{numParc}x de {fmtBRL(valorParc)}</span>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {pagas > 0 && <span className="text-emerald-700">{pagas} paga(s)</span>}
          {atrasadas > 0 && <span className="text-red-700 font-medium">{atrasadas} atrasada(s)</span>}
          {proxima?.data && <span>Próxima: {fmtDate(proxima.data)}</span>}
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {parcelas.map(parc => (
          <div key={parc.numero} className="grid grid-cols-4 gap-2 px-4 py-2.5 text-xs items-center hover:bg-gray-50/50">
            <span className="text-gray-600 font-medium">Parcela {parc.numero}/{numParc}</span>
            <span className="font-semibold text-gray-800">{fmtBRL(parc.valor)}</span>
            <span className="text-gray-500">{parc.data ? fmtDate(parc.data) : '—'}</span>
            <span className={`w-fit rounded-full px-2 py-0.5 font-medium ${statusCls[parc.status] || statusCls.prevista}`}>
              {parc.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Card de solicitação ──────────────────────────────────────────────────────

function PurchaseCard({ purchase, attachments }) {
  const [expanded, setExpanded] = useState(false);
  const ia        = purchase?.resultado_ia || {};
  const valor     = getBestValue(purchase);
  const statusKey = String(purchase.status || '').toUpperCase();
  const numParc   = Number(ia?.numero_parcelas || purchase?.numero_parcelas || 1);
  const valorParc = Number(ia?.valor_parcela || purchase?.valor_parcela || valor / Math.max(numParc, 1));
  const pagas     = statusKey === 'PAGO' ? numParc : 0;
  const pendentes = numParc - pagas;
  const datasArray = Array.isArray(ia?.datas_pagamento) ? ia.datas_pagamento : [];
  const proxData   = datasArray.find(d => d && !isAtrasada(d)) || datasArray[0];

  const contratoUrl    = ia?.drive_file_url || purchase?.orcamento_url || purchase?.link_proposta;
  const notaFiscalUrl  = purchase?.nota_fiscal_url || purchase?.nf_pdf_url;
  const arquivoUrl     = purchase?.arquivo_url || purchase?.file_url || purchase?.documento_url;
  const comprovanteUrl = purchase?.comprovante_pagamento_url || purchase?.comprovante_url;
  const temAnexos      = contratoUrl || notaFiscalUrl || arquivoUrl || comprovanteUrl;
  const aprovado       = STATUS_APROVADOS.has(statusKey);

  return (
    <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-gray-50">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {purchase.numero_processamento && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                  <Hash className="w-2.5 h-2.5" />{purchase.numero_processamento}
                </span>
              )}
              <StatusBadge status={purchase.status} />
              {purchase.meta_id && purchase.meta_id !== 'MC3A-EXTRA' && (
                <Badge variant="outline" className="text-[10px] font-mono">{purchase.meta_id}</Badge>
              )}
            </div>
            <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
              {purchase.descricao_item || '—'}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {(purchase.fornecedor_nome || ia?.fornecedor_nome) && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Building2 className="w-3 h-3" />{purchase.fornecedor_nome || ia?.fornecedor_nome}
                </span>
              )}
              {purchase.centro_custo && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-400 border-l border-gray-200 pl-2">
                  {purchase.centro_custo}
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0 min-w-[90px]">
            <p className="break-words text-lg font-bold leading-tight text-gray-900 tabular-nums">{fmtBRL(valor)}</p>
            {numParc > 1 && <p className="text-[11px] text-gray-500 mt-0.5">{numParc}x {fmtBRL(valorParc)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3 px-4 py-3 border-b border-gray-50">
          <InfoCell label="Parcelas"        value={numParc > 1 ? `${numParc}x` : '—'} />
          <InfoCell label="Pagas"           value={numParc > 1 ? String(pagas) : '—'} highlight={pagas > 0} />
          <InfoCell label="Pendentes"       value={numParc > 1 ? String(pendentes) : '—'} />
          <InfoCell label="Próx. pagamento" value={proxData ? fmtDate(proxData) : '—'} />
          <InfoCell label="Data aprovação"  value={fmtDate(purchase.aprov_coord_data || purchase.approved_at)} />
          <InfoCell label="Data pagamento"  value={fmtDate(purchase.data_pagamento_efetivo || purchase.data_pagamento)} highlight />
          <InfoCell label="Vigência até"    value={fmtDate(ia?.vigencia_fim)} />
          <InfoCell label="Rubrica"         value={purchase.rubrica_nome} />
          <InfoCell label="N° contrato"     value={ia?.numero_contrato || purchase.numero_contrato} />
          <InfoCell label="Assinatura"      value={fmtDate(ia?.data_assinatura)} />
          <InfoCell label="Resp. técnico"   value={ia?.responsavel_tecnico} />
          <InfoCell label="Museu"           value={ia?.museu_relacionado || purchase.museu} />
        </div>

        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2 flex items-center gap-1">
            <Paperclip className="w-3 h-3" />Arquivos e comprovantes
          </p>
          <div className="flex flex-wrap gap-2">
            <FileLink label="Abrir contrato"     url={contratoUrl} />
            <FileLink label="Arquivo original"   url={arquivoUrl} />
            <FileLink label="Nota fiscal"        url={notaFiscalUrl} />
            <FileLink label="Baixar comprovante" url={comprovanteUrl} />
            {!temAnexos && aprovado && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-400 italic">
                Comprovante ainda não disponível.
              </span>
            )}
            {!temAnexos && !aprovado && (
              <span className="text-xs text-gray-300 italic">Nenhum arquivo vinculado.</span>
            )}
          </div>
        </div>

        <div className="px-4 py-2.5">
          {numParc > 1 ? (
            <>
              <button type="button" onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors">
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {expanded ? 'Ocultar parcelas' : `Ver ${numParc} parcelas`}
                <span className="text-gray-400">({fmtBRL(valorParc)} cada)</span>
              </button>
              {expanded && <ParcelasSection purchase={purchase} />}
            </>
          ) : (
            <span className="text-xs text-gray-300">Pagamento único</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MeusPagamentosTab({ purchases = [], attachments = [], currentUser, isCoordenador, hasGestaoCompras }) {
  const [search, setSearch]                   = useState('');
  const [filterStatus, setFilterStatus]       = useState('all');
  const [filterMuseu, setFilterMuseu]         = useState('all');
  const [filterForn, setFilterForn]           = useState('all');
  const [filterPeriodo, setFilterPeriodo]     = useState('all');
  const [filterParcelas, setFilterParcelas]   = useState('all');

  const email = String(currentUser?.email || '').toLowerCase().trim();

  // ── Buscar TeamMember do usuário atual ────────────────────────────────────
  const { data: meusMembros = [] } = useQuery({
    queryKey: ['my-team-members', email],
    queryFn: async () => {
      if (!email) return [];
      // Busca pelo email da plataforma
      const por_email = await base44.entities.TeamMember.filter({ user_email: currentUser.email }).catch(() => []);
      // Busca também por nome parcial se não encontrar
      return Array.isArray(por_email) ? por_email : [];
    },
    enabled: !!email,
    staleTime: 30000,
  });

  // ── Buscar TeamPayments do usuário ────────────────────────────────────────
  const { data: meusTeamPayments = [] } = useQuery({
    queryKey: ['my-team-payments', email],
    queryFn: async () => {
      if (!email) return [];
      const res = await base44.entities.TeamPayment.filter({ user_email: currentUser.email }).catch(() => []);
      return Array.isArray(res) ? res : [];
    },
    enabled: !!email,
    staleTime: 30000,
  });

  // ── Buscar TODAS as solicitações para cruzamento amplo ────────────────────
  const { data: todasSolicitacoes = [], isLoading: loadingAll } = useQuery({
    queryKey: ['all-purchases-pagamentos', isCoordenador, email],
    queryFn: async () => {
      if (!email) return [];
      const res = await base44.entities.PurchaseRequest.list('-created_date', 800);
      return Array.isArray(res) ? res : [];
    },
    enabled: !!email,
    staleTime: 30000,
  });

  // ── Identificação ampla do usuário ────────────────────────────────────────
  const meusCpfsCnpjs = useMemo(() => {
    const s = new Set();
    meusMembros.forEach(m => {
      if (m?.cpf) s.add(onlyDigits(m.cpf));
      if (m?.cnpj) s.add(onlyDigits(m.cnpj));
    });
    return s;
  }, [meusMembros]);

  const meusTeamMemberIds = useMemo(() => new Set(meusMembros.map(m => m?.id).filter(Boolean)), [meusMembros]);

  const teamPaymentPurchaseIds = useMemo(() => {
    const s = new Set();
    meusTeamPayments.forEach(tp => {
      if (tp?.purchase_request_id) s.add(tp.purchase_request_id);
    });
    return s;
  }, [meusTeamPayments]);

  // ── Lógica de pertencimento ampliada ──────────────────────────────────────
  const pertenceAoUsuario = useMemo(() => (p) => {
    if (hasGestaoCompras || isCoordenador) return true;
    if (!email) return false;

    // 1. Criado pelo usuário
    const ownerEmails = [p.created_by, p.user_email, p.requester_email, p.solicitante_email, p.author_email, p.owner_email]
      .map(v => String(v || '').toLowerCase().trim()).filter(Boolean);
    if (ownerEmails.includes(email)) return true;

    // 2. TeamPayment vinculado
    if (p.team_payment_id && meusTeamPayments.some(tp => tp.id === p.team_payment_id)) return true;
    if (teamPaymentPurchaseIds.has(p.id)) return true;

    // 3. TeamMember vinculado diretamente
    if (p.team_member_id && meusTeamMemberIds.has(p.team_member_id)) return true;

    // 4. CPF/CNPJ do fornecedor bate com o do membro
    if (meusCpfsCnpjs.size > 0) {
      const cnpjForn = onlyDigits(p.fornecedor_cnpj || p.nf_emitente_cpf_cnpj || p.fornecedor_cpf_cnpj || '');
      if (cnpjForn && meusCpfsCnpjs.has(cnpjForn)) return true;
    }

    // 5. Fornecedor nome bate com nome do membro
    if (meusMembros.length > 0 && p.fornecedor_nome) {
      const normForn = normalize(p.fornecedor_nome);
      if (meusMembros.some(m => m?.user_name && normalize(m.user_name).split(' ').some(part => part.length > 3 && normForn.includes(part)))) return true;
    }

    return false;
  }, [email, hasGestaoCompras, isCoordenador, meusMembros, meusTeamPayments, meusTeamMemberIds, meusCpfsCnpjs, teamPaymentPurchaseIds]);

  // ── Unir props passadas + busca ampla ─────────────────────────────────────
  const minhasSolicitacoes = useMemo(() => {
    const map = new Map();

    // Props passadas pela página pai — sempre filtrar pelo pertenceAoUsuario,
    // independente do que veio (coordenador pode passar tudo, mas aqui só mostramos do usuário)
    purchases.forEach(p => {
      if (p?.id && pertenceAoUsuario(p)) map.set(p.id, p);
    });

    // Adiciona as encontradas na busca ampla que ainda não estejam no mapa
    todasSolicitacoes.forEach(p => {
      if (p?.id && !map.has(p.id) && pertenceAoUsuario(p)) {
        map.set(p.id, p);
      }
    });

    return Array.from(map.values())
      .sort((a, b) => new Date(b?.created_date || 0) - new Date(a?.created_date || 0));
  }, [purchases, todasSolicitacoes, pertenceAoUsuario]);

  // Mostra todas (incluindo rascunhos) na visão de "Meus Pagamentos"
  const visiveis = useMemo(() =>
    minhasSolicitacoes.filter(p => STATUS_VISIVEIS.has(String(p.status || '').toUpperCase())),
    [minhasSolicitacoes]
  );

  // semVinculo removido — o alerta causava confusão ao exibir registros de terceiros como "sem vínculo"
  const semVinculo = false;

  // ── Listas de filtros dinâmicos ───────────────────────────────────────────
  const museus = useMemo(() => {
    const s = new Set();
    visiveis.forEach(p => { const v = p.centro_custo || p?.resultado_ia?.museu_relacionado || p.museu; if (v) s.add(v); });
    return Array.from(s).sort();
  }, [visiveis]);

  const fornecedores = useMemo(() => {
    const s = new Set();
    visiveis.forEach(p => { const v = p.fornecedor_nome || p?.resultado_ia?.fornecedor_nome; if (v) s.add(v); });
    return Array.from(s).sort();
  }, [visiveis]);

  // ── Filtros aplicados ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = normalize(search);
    const agora = new Date();
    return visiveis.filter(p => {
      const s = String(p.status || '').toUpperCase();
      const matchStatus = filterStatus === 'all' || s === filterStatus ||
        (filterStatus === 'aprovados'    && STATUS_APROVADOS.has(s)) ||
        (filterStatus === 'em_aprovacao' && STATUS_EM_APROVACAO.has(s));

      const museuP = p.centro_custo || p?.resultado_ia?.museu_relacionado || p.museu || '';
      const matchMuseu = filterMuseu === 'all' || museuP === filterMuseu;

      const fornP = p.fornecedor_nome || p?.resultado_ia?.fornecedor_nome || '';
      const matchForn = filterForn === 'all' || fornP === filterForn;

      const created = new Date(p.created_date || 0);
      let matchPeriodo = true;
      if (filterPeriodo !== 'all') {
        const limit = new Date(agora);
        limit.setMonth(limit.getMonth() - parseInt(filterPeriodo));
        matchPeriodo = created >= limit;
      }

      const ia = p?.resultado_ia || {};
      const numParc = Number(ia?.numero_parcelas || p?.numero_parcelas || 1);
      const pagas = s === 'PAGO' ? numParc : 0;
      const matchParcelas = filterParcelas === 'all' ||
        (filterParcelas === 'pagas' && pagas > 0) ||
        (filterParcelas === 'pendentes' && numParc - pagas > 0);

      const matchSearch = !q ||
        normalize(p.descricao_item).includes(q) ||
        normalize(p.fornecedor_nome).includes(q) ||
        normalize(p.numero_processamento).includes(q) ||
        normalize(ia?.fornecedor_nome).includes(q);

      return matchStatus && matchMuseu && matchForn && matchPeriodo && matchParcelas && matchSearch;
    });
  }, [visiveis, search, filterStatus, filterMuseu, filterForn, filterPeriodo, filterParcelas]);

  // ── Totais dos cards resumo ───────────────────────────────────────────────
  const totais = useMemo(() => {
    // Previsto: TODAS as solicitações visíveis do usuário (independente de filtro)
    const previsto = visiveis.reduce((acc, p) => acc + Number(p.valor_solicitado || p.valor_total || 0), 0);

    // Aprovado: status aprovado/pago
    const aprovado = visiveis
      .filter(p => STATUS_APROVADOS.has(String(p.status || '').toUpperCase()))
      .reduce((acc, p) => acc + Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || p.valor_total || 0), 0);

    // Pago: status PAGO ou com comprovante+data
    const pago = visiveis
      .filter(p => {
        const s = String(p.status || '').toUpperCase();
        const temComprovante = !!(p.comprovante_pagamento_url || p.comprovante_url);
        const temData = !!(p.data_pagamento_efetivo || p.data_pagamento);
        return s === 'PAGO' || (temComprovante && temData);
      })
      .reduce((acc, p) => acc + Number(p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || p.valor_total || 0), 0);

    const pendente = Math.max(0, aprovado - pago);
    const emAprov  = visiveis.filter(p => STATUS_EM_APROVACAO.has(String(p.status || '').toUpperCase())).length;
    const totalParc = visiveis.reduce((acc, p) => {
      const ia = p?.resultado_ia || {};
      return acc + Number(ia?.numero_parcelas || p?.numero_parcelas || 1);
    }, 0);

    return { previsto, aprovado, pago, pendente, emAprov, totalParc };
  }, [visiveis]);

  const SUMMARY = [
    { label: 'Total previsto',     value: fmtBRL(totais.previsto),   icon: DollarSign,  dark: true },
    { label: 'Total aprovado',     value: fmtBRL(totais.aprovado),   icon: CheckCircle2 },
    { label: 'Total pago',         value: fmtBRL(totais.pago),       icon: CreditCard   },
    { label: 'Pendente',           value: fmtBRL(totais.pendente),   icon: Clock        },
    { label: 'Em aprovação',       value: `${totais.emAprov} sol.`,  icon: AlertCircle  },
    { label: 'Parcelas previstas', value: `${totais.totalParc}`,     icon: Calendar     },
  ];

  const loading = loadingAll;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Meus Pagamentos</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Solicitações, parcelas, arquivos e comprovantes vinculados ao seu perfil.
        </p>
      </div>

      {/* Alerta de solicitações sem vínculo */}
      {semVinculo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Foram encontradas solicitações existentes sem vínculo direto com seu perfil. Revise CPF, e-mail, fornecedor ou contrato junto ao coordenador para associar corretamente.
          </p>
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {SUMMARY.map(({ label, value, icon: Icon, dark }) => (
          <div key={label} className={`rounded-xl border p-3 shadow-sm flex flex-col gap-1 ${dark ? 'bg-black border-black text-white' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${dark ? 'text-gray-400' : 'text-gray-400'}`} />
              <p className={`text-[10px] font-semibold uppercase tracking-wide leading-tight ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
            </div>
            <p className={`text-lg font-bold leading-tight ${dark ? 'text-white' : 'text-gray-900'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input placeholder="Buscar solicitação, fornecedor, número..." className="pl-8 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-36">
            <option value="all">Todos os status</option>
            <option value="em_aprovacao">Em aprovação</option>
            <option value="aprovados">Aprovados</option>
            <option value="PAGO">Pago</option>
            <option value="DEVOLVIDO">Devolvido</option>
          </select>
          {museus.length > 0 && (
            <select value={filterMuseu} onChange={e => setFilterMuseu(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-28">
              <option value="all">Todos os museus</option>
              {museus.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {fornecedores.length > 1 && (
            <select value={filterForn} onChange={e => setFilterForn(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-36 max-w-48">
              <option value="all">Todos os fornecedores</option>
              {fornecedores.map(f => <option key={f} value={f}>{f.length > 30 ? f.slice(0, 30) + '…' : f}</option>)}
            </select>
          )}
          <select value={filterPeriodo} onChange={e => setFilterPeriodo(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-28">
            <option value="all">Qualquer período</option>
            <option value="1">Último mês</option>
            <option value="3">Últimos 3 meses</option>
            <option value="6">Últimos 6 meses</option>
            <option value="12">Último ano</option>
          </select>
          <select value={filterParcelas} onChange={e => setFilterParcelas(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-36">
            <option value="all">Parcelas: todas</option>
            <option value="pagas">Com parcelas pagas</option>
            <option value="pendentes">Com parcelas pendentes</option>
          </select>
        </div>
        <p className="text-xs text-gray-400 pt-0.5">{loading ? 'Carregando...' : `${filtered.length} solicitação(ões) — ${visiveis.length} vinculadas ao seu perfil`}</p>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center bg-gray-50/30">
          <div className="mx-auto mb-3 h-8 w-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Carregando solicitações...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center bg-gray-50/30">
          <CreditCard className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-400">Nenhuma solicitação encontrada</p>
          <p className="text-xs text-gray-400 mt-1">
            {visiveis.length === 0
              ? 'Nenhuma solicitação vinculada ao seu perfil foi encontrada.'
              : 'Nenhuma solicitação corresponde aos filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => <PurchaseCard key={p.id} purchase={p} attachments={attachments} />)}
        </div>
      )}
    </div>
  );
}
