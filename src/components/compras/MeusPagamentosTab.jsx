import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Search,
  Download,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  DollarSign,
  ExternalLink,
  Calendar,
  Building2,
  Hash,
  Paperclip,
  ArrowRight,
} from 'lucide-react';

// ─── utils ───────────────────────────────────────────────────────────────────

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

function fmtDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('pt-BR');
}

function normalize(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function isAtrasada(dataStr) {
  if (!dataStr) return false;
  const d = new Date(dataStr);
  if (isNaN(d.getTime())) return false;
  return d < new Date();
}

// ─── constantes de status ─────────────────────────────────────────────────────

const STATUS_CONFIG = {
  RASCUNHO:       { label: 'Rascunho',        cls: 'bg-gray-100 text-gray-600',    icon: Clock },
  SOLICITADO:     { label: 'Em aprovação',    cls: 'bg-blue-100 text-blue-700',    icon: Clock },
  DEVOLVIDO:      { label: 'Devolvido',       cls: 'bg-amber-100 text-amber-700',  icon: AlertCircle },
  APROVADO_COORD: { label: 'Aprovado',        cls: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  APROVADO_ADMIN: { label: 'Aprovado',        cls: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  APROVADO:       { label: 'Aprovado',        cls: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  PAGO:           { label: 'Pago',            cls: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  RECUSADO:       { label: 'Recusado',        cls: 'bg-red-100 text-red-700',      icon: AlertCircle },
  CANCELADO:      { label: 'Cancelado',       cls: 'bg-gray-100 text-gray-500',    icon: AlertCircle },
};

const STATUS_APROVADOS     = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_EM_APROVACAO  = new Set(['SOLICITADO', 'DEVOLVIDO']);
const STATUS_VISIVEIS      = new Set([...STATUS_APROVADOS, ...STATUS_EM_APROVACAO]);

function getStatusCfg(s) {
  return STATUS_CONFIG[String(s || '').toUpperCase()] || { label: s || '—', cls: 'bg-gray-100 text-gray-600', icon: Clock };
}

function getPurchaseValue(p) {
  return Number(p?.valor_pago || p?.valor_aprovado_admin || p?.valor_aprovado || p?.valor_solicitado || p?.valor_total || 0);
}

// ─── sub-componentes menores ──────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = getStatusCfg(status);
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function FileButton({ label, url, variant = 'default' }) {
  if (!url) return null;
  const base = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors';
  const cls = variant === 'primary'
    ? `${base} border-black bg-black text-white hover:bg-gray-800`
    : `${base} border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>
      <FileText className="w-3 h-3" />
      {label}
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

// ─── Parcelas Accordion ───────────────────────────────────────────────────────

function ParcelasSection({ purchase }) {
  const ia = purchase?.resultado_ia || {};
  const numeroParcelas = Number(ia?.numero_parcelas || purchase?.numero_parcelas || 1);
  if (numeroParcelas <= 1) return null;

  const valor = getPurchaseValue(purchase);
  const valorParcela = Number(ia?.valor_parcela || purchase?.valor_parcela || valor / Math.max(numeroParcelas, 1));
  const datasArray = Array.isArray(ia?.datas_pagamento) ? ia.datas_pagamento : [];
  const jaFoiPago = String(purchase?.status || '').toUpperCase() === 'PAGO';

  const parcelas = Array.from({ length: numeroParcelas }, (_, i) => {
    const data = datasArray[i] || null;
    let status;
    if (jaFoiPago) status = 'paga';
    else if (data && isAtrasada(data) && !STATUS_APROVADOS.has(String(purchase?.status || '').toUpperCase())) status = 'atrasada';
    else if (STATUS_APROVADOS.has(String(purchase?.status || '').toUpperCase()) && i === 0) status = 'aprovada';
    else status = 'prevista';
    return { numero: i + 1, valor: valorParcela, data, status };
  });

  const statusCls = {
    paga:     'bg-emerald-100 text-emerald-700',
    aprovada: 'bg-green-100 text-green-700',
    atrasada: 'bg-red-100 text-red-700',
    prevista: 'bg-gray-100 text-gray-600',
  };

  const pagas    = parcelas.filter((p) => p.status === 'paga').length;
  const atrasadas = parcelas.filter((p) => p.status === 'atrasada').length;
  const proxima  = parcelas.find((p) => p.status !== 'paga' && p.data);

  return (
    <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
      {/* Sumário das parcelas */}
      <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600">
          {numeroParcelas}x de {fmtBRL(valorParcela)}
        </span>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {pagas > 0 && <span className="text-emerald-700">{pagas} paga(s)</span>}
          {atrasadas > 0 && <span className="text-red-700 font-medium">{atrasadas} atrasada(s)</span>}
          {proxima?.data && <span>Próxima: {fmtDate(proxima.data)}</span>}
        </div>
      </div>

      {/* Lista de parcelas */}
      <div className="divide-y divide-gray-50">
        {parcelas.map((parc) => (
          <div key={parc.numero} className="grid grid-cols-4 gap-2 px-4 py-2.5 text-xs items-center hover:bg-gray-50/50">
            <span className="text-gray-600 font-medium">Parcela {parc.numero} / {numeroParcelas}</span>
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
  const valor     = getPurchaseValue(purchase);
  const statusKey = String(purchase.status || '').toUpperCase();

  const numeroParcelas = Number(ia?.numero_parcelas || purchase?.numero_parcelas || 1);
  const valorParcela   = Number(ia?.valor_parcela || purchase?.valor_parcela || valor / Math.max(numeroParcelas, 1));
  const pagas          = statusKey === 'PAGO' ? numeroParcelas : 0;
  const pendentes      = numeroParcelas - pagas;

  const datasArray = Array.isArray(ia?.datas_pagamento) ? ia.datas_pagamento : [];
  const proxData   = datasArray.find((d) => d && !isAtrasada(d)) || datasArray[0];

  const anexosRelacionados = (attachments || []).filter(
    (a) => a.purchase_request_id === purchase.id || a.report_id === purchase.report_id
  );

  const contratoUrl    = ia?.drive_file_url || purchase?.orcamento_url || purchase?.link_proposta;
  const notaFiscalUrl  = purchase?.nota_fiscal_url || purchase?.nf_pdf_url;
  const arquivoUrl     = purchase?.arquivo_url || purchase?.file_url || purchase?.documento_url;
  const comprovanteUrl = purchase?.comprovante_pagamento_url || purchase?.comprovante_url;
  const temAnexos      = contratoUrl || notaFiscalUrl || arquivoUrl || comprovanteUrl || anexosRelacionados.length > 0;

  const aprovadoAprovado = STATUS_APROVADOS.has(statusKey);

  return (
    <Card className="border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-0">

        {/* ── Linha superior: número + status + valor ── */}
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
                  <Building2 className="w-3 h-3" />
                  {purchase.fornecedor_nome || ia?.fornecedor_nome}
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
            <p className="text-xl font-bold text-gray-900">{fmtBRL(valor)}</p>
            {numeroParcelas > 1 && (
              <p className="text-[11px] text-gray-500 mt-0.5">{numeroParcelas}x {fmtBRL(valorParcela)}</p>
            )}
          </div>
        </div>

        {/* ── Grid de informações ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3 px-4 py-3 border-b border-gray-50">
          <InfoCell label="Parcelas" value={numeroParcelas > 1 ? `${numeroParcelas}x` : '—'} />
          <InfoCell label="Pagas" value={numeroParcelas > 1 ? `${pagas}` : '—'} highlight={pagas > 0} />
          <InfoCell label="Pendentes" value={numeroParcelas > 1 ? `${pendentes}` : '—'} />
          <InfoCell label="Próx. pagamento" value={proxData ? fmtDate(proxData) : '—'} />
          <InfoCell label="Data aprovação" value={fmtDate(purchase.aprov_coord_data || purchase.approved_at)} />
          <InfoCell label="Data pagamento" value={fmtDate(purchase.data_pagamento_efetivo || purchase.data_pagamento)} highlight />
          <InfoCell label="Vigência até" value={fmtDate(ia?.vigencia_fim)} />
          <InfoCell label="Rubrica" value={purchase.rubrica_nome} />
          <InfoCell label="N° contrato" value={ia?.numero_contrato || purchase.numero_contrato} />
          <InfoCell label="Assinatura" value={fmtDate(ia?.data_assinatura)} />
          <InfoCell label="Resp. técnico" value={ia?.responsavel_tecnico} />
          <InfoCell label="Museu" value={ia?.museu_relacionado || purchase.museu} />
        </div>

        {/* ── Arquivos e comprovantes ── */}
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2 flex items-center gap-1">
            <Paperclip className="w-3 h-3" />
            Arquivos e comprovantes
          </p>
          <div className="flex flex-wrap gap-2">
            {contratoUrl && (
              <FileButton label="Abrir contrato" url={contratoUrl} variant="primary" />
            )}
            {arquivoUrl && (
              <FileButton label="Arquivo original" url={arquivoUrl} />
            )}
            {notaFiscalUrl && (
              <FileButton label="Nota fiscal" url={notaFiscalUrl} />
            )}
            {comprovanteUrl ? (
              <FileButton label="Baixar comprovante" url={comprovanteUrl} />
            ) : aprovadoAprovado ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-400 italic">
                Comprovante ainda não disponível.
              </span>
            ) : null}
            {anexosRelacionados.slice(0, 3).map((a) =>
              a.file_url ? (
                <FileButton key={a.id} label={a.file_name || 'Anexo'} url={a.file_url} />
              ) : null
            )}
            {!temAnexos && (
              <span className="text-xs text-gray-300 italic">Nenhum arquivo vinculado.</span>
            )}
          </div>
        </div>

        {/* ── Botão de parcelas + accordion ── */}
        <div className="px-4 py-2.5">
          {numeroParcelas > 1 ? (
            <>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {expanded ? 'Ocultar parcelas' : `Ver ${numeroParcelas} parcelas`}
                <span className="text-gray-400">({fmtBRL(valorParcela)} cada)</span>
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

export default function MeusPagamentosTab({
  purchases = [],
  attachments = [],
  currentUser,
  isCoordenador,
  hasGestaoCompras,
}) {
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [filterMuseu, setFilterMuseu]     = useState('all');
  const [filterForn, setFilterForn]       = useState('all');
  const [filterPeriodo, setFilterPeriodo] = useState('all');
  const [filterParcelas, setFilterParcelas] = useState('all'); // all | pagas | pendentes

  // ── Filtrar por permissão ──────────────────────────────────────────────────
  const minhasSolicitacoes = useMemo(() => {
    if (hasGestaoCompras) return purchases;
    const email = String(currentUser?.email || '').toLowerCase().trim();
    return purchases.filter((p) => {
      const owners = [p.created_by, p.user_email, p.requester_email, p.solicitante_email, p.author_email]
        .map((v) => String(v || '').toLowerCase().trim())
        .filter(Boolean);
      return owners.includes(email);
    });
  }, [purchases, currentUser, hasGestaoCompras]);

  const visiveis = useMemo(() =>
    minhasSolicitacoes.filter((p) => STATUS_VISIVEIS.has(String(p.status || '').toUpperCase())),
    [minhasSolicitacoes]
  );

  // ── Listas de filtros dinâmicos ───────────────────────────────────────────
  const museus = useMemo(() => {
    const s = new Set();
    visiveis.forEach((p) => { const v = p.centro_custo || p?.resultado_ia?.museu_relacionado || p.museu; if (v) s.add(v); });
    return Array.from(s).sort();
  }, [visiveis]);

  const fornecedores = useMemo(() => {
    const s = new Set();
    visiveis.forEach((p) => { const v = p.fornecedor_nome || p?.resultado_ia?.fornecedor_nome; if (v) s.add(v); });
    return Array.from(s).sort();
  }, [visiveis]);

  // ── Filtros aplicados ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = normalize(search);
    const agora = new Date();

    return visiveis.filter((p) => {
      const s = String(p.status || '').toUpperCase();
      const matchStatus = filterStatus === 'all' || s === filterStatus ||
        (filterStatus === 'aprovados' && STATUS_APROVADOS.has(s)) ||
        (filterStatus === 'em_aprovacao' && STATUS_EM_APROVACAO.has(s));

      const museuP = p.centro_custo || p?.resultado_ia?.museu_relacionado || p.museu || '';
      const matchMuseu = filterMuseu === 'all' || museuP === filterMuseu;

      const fornP = p.fornecedor_nome || p?.resultado_ia?.fornecedor_nome || '';
      const matchForn = filterForn === 'all' || fornP === filterForn;

      const created = new Date(p.created_date || 0);
      let matchPeriodo = true;
      if (filterPeriodo !== 'all') {
        const meses = parseInt(filterPeriodo);
        const limit = new Date(agora);
        limit.setMonth(limit.getMonth() - meses);
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
    const previsto  = filtered.reduce((acc, p) => acc + Number(p.valor_solicitado || p.valor_total || 0), 0);
    const aprovado  = filtered.filter((p) => STATUS_APROVADOS.has(String(p.status || '').toUpperCase()))
                              .reduce((acc, p) => acc + Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0), 0);
    const pago      = filtered.filter((p) => String(p.status || '').toUpperCase() === 'PAGO')
                              .reduce((acc, p) => acc + Number(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
    const pendente  = Math.max(0, aprovado - pago);
    const emAprov   = filtered.filter((p) => STATUS_EM_APROVACAO.has(String(p.status || '').toUpperCase())).length;
    const totalParc = filtered.reduce((acc, p) => acc + Number(p?.resultado_ia?.numero_parcelas || p?.numero_parcelas || 1), 0);
    return { previsto, aprovado, pago, pendente, emAprov, totalParc };
  }, [filtered]);

  const SUMMARY = [
    { label: 'Total previsto',     value: fmtBRL(totais.previsto),                    icon: DollarSign,   dark: true },
    { label: 'Total aprovado',     value: fmtBRL(totais.aprovado),                    icon: CheckCircle2  },
    { label: 'Total pago',         value: fmtBRL(totais.pago),                        icon: CreditCard    },
    { label: 'Pendente',           value: fmtBRL(totais.pendente),                    icon: Clock         },
    { label: 'Em aprovação',       value: `${totais.emAprov} sol.`,                   icon: AlertCircle   },
    { label: 'Parcelas previstas', value: `${totais.totalParc}`,                      icon: Calendar      },
  ];

  return (
    <div className="space-y-6">

      {/* ── Cabeçalho ── */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Meus Pagamentos</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Acompanhe suas solicitações, parcelas, arquivos e comprovantes de pagamento.
        </p>
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {SUMMARY.map(({ label, value, icon: Icon, dark }) => (
          <div
            key={label}
            className={`rounded-xl border p-3 shadow-sm flex flex-col gap-1 ${
              dark ? 'bg-black border-black text-white' : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${dark ? 'text-gray-400' : 'text-gray-400'}`} />
              <p className={`text-[10px] font-semibold uppercase tracking-wide leading-tight ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                {label}
              </p>
            </div>
            <p className={`text-lg font-bold leading-tight ${dark ? 'text-white' : 'text-gray-900'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Buscar solicitação, fornecedor, número..."
              className="pl-8 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-36"
          >
            <option value="all">Todos os status</option>
            <option value="em_aprovacao">Em aprovação</option>
            <option value="aprovados">Aprovados</option>
            <option value="PAGO">Pago</option>
            <option value="DEVOLVIDO">Devolvido</option>
          </select>
          {museus.length > 0 && (
            <select
              value={filterMuseu}
              onChange={(e) => setFilterMuseu(e.target.value)}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-28"
            >
              <option value="all">Todos os museus</option>
              {museus.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {fornecedores.length > 1 && (
            <select
              value={filterForn}
              onChange={(e) => setFilterForn(e.target.value)}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-36 max-w-48"
            >
              <option value="all">Todos os fornecedores</option>
              {fornecedores.map((f) => <option key={f} value={f}>{f.length > 30 ? f.slice(0, 30) + '…' : f}</option>)}
            </select>
          )}
          <select
            value={filterPeriodo}
            onChange={(e) => setFilterPeriodo(e.target.value)}
            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-28"
          >
            <option value="all">Qualquer período</option>
            <option value="1">Último mês</option>
            <option value="3">Últimos 3 meses</option>
            <option value="6">Últimos 6 meses</option>
            <option value="12">Último ano</option>
          </select>
          <select
            value={filterParcelas}
            onChange={(e) => setFilterParcelas(e.target.value)}
            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 min-w-36"
          >
            <option value="all">Parcelas: todas</option>
            <option value="pagas">Com parcelas pagas</option>
            <option value="pendentes">Com parcelas pendentes</option>
          </select>
        </div>
        <p className="text-xs text-gray-400 pt-0.5">{filtered.length} solicitação(ões)</p>
      </div>

      {/* ── Lista ── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center bg-gray-50/30">
          <CreditCard className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-400">Nenhuma solicitação encontrada</p>
          <p className="text-xs text-gray-400 mt-1">Solicitações aprovadas ou em aprovação aparecerão aqui.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PurchaseCard key={p.id} purchase={p} attachments={attachments} />
          ))}
        </div>
      )}
    </div>
  );
}