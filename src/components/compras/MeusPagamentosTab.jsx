import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Search,
  Download,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  DollarSign,
} from 'lucide-react';

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('pt-BR');
}

function normalizeText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const STATUS_LABEL = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600', icon: Clock },
  SOLICITADO: { label: 'Em aprovação', color: 'bg-blue-100 text-blue-700', icon: Clock },
  DEVOLVIDO: { label: 'Devolvido', color: 'bg-amber-100 text-amber-700', icon: AlertCircle },
  APROVADO_COORD: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  APROVADO_ADMIN: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  APROVADO: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  RECUSADO: { label: 'Recusado', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  CANCELADO: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500', icon: AlertCircle },
};

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_EM_APROVACAO = new Set(['SOLICITADO', 'DEVOLVIDO']);

function getStatusInfo(status) {
  const key = String(status || '').toUpperCase();
  return STATUS_LABEL[key] || { label: status || '—', color: 'bg-gray-100 text-gray-600', icon: Clock };
}

function getPurchaseValue(p) {
  return Number(p?.valor_pago || p?.valor_aprovado_admin || p?.valor_aprovado || p?.valor_final || p?.valor_solicitado || p?.valor_total || 0);
}

function AnexoLink({ label, url, icon: Icon }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
    >
      <Icon className="w-3 h-3" />
      {label}
    </a>
  );
}

function ParcelasAccordion({ purchase, attachments }) {
  const ia = purchase?.resultado_ia || {};
  const numeroParcelas = Number(ia?.numero_parcelas || purchase?.numero_parcelas || 1);
  const valorParcela = Number(ia?.valor_parcela || purchase?.valor_parcela || getPurchaseValue(purchase) / Math.max(numeroParcelas, 1));
  const datasArray = Array.isArray(ia?.datas_pagamento) ? ia.datas_pagamento : [];

  if (numeroParcelas <= 1) return null;

  const parcelas = Array.from({ length: numeroParcelas }, (_, i) => ({
    numero: i + 1,
    valor: valorParcela,
    data_prevista: datasArray[i] || null,
    status: purchase?.status === 'PAGO' ? 'paga' : i === 0 && STATUS_APROVADOS.has(String(purchase?.status || '').toUpperCase()) ? 'aprovada' : 'prevista',
  }));

  return (
    <div className="mt-3 rounded-xl border border-gray-100 overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-100">
        Parcelas ({numeroParcelas}x)
      </div>
      <div className="divide-y divide-gray-50">
        {parcelas.map((p) => (
          <div key={p.numero} className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-gray-600">Parcela {p.numero} de {numeroParcelas}</span>
            <span className="font-medium text-gray-800">{fmtBRL(p.valor)}</span>
            {p.data_prevista && <span className="text-gray-500">{fmtDate(p.data_prevista)}</span>}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              p.status === 'paga' ? 'bg-emerald-100 text-emerald-700' :
              p.status === 'aprovada' ? 'bg-green-100 text-green-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PurchaseCard({ purchase, attachments }) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = getStatusInfo(purchase.status);
  const StatusIcon = statusInfo.icon;
  const valor = getPurchaseValue(purchase);
  const ia = purchase?.resultado_ia || {};

  const annexosRelacionados = (attachments || []).filter(
    (a) => a.purchase_request_id === purchase.id || a.report_id === purchase.report_id
  );

  const contratoUrl = purchase?.orcamento_url || ia?.drive_file_url || purchase?.link_proposta;
  const comprovante = purchase?.comprovante_pagamento_url || purchase?.comprovante_url;
  const notaFiscal = purchase?.nota_fiscal_url || purchase?.nf_pdf_url;
  const arquivoOriginal = purchase?.arquivo_url || purchase?.file_url;

  const ia_resultado = purchase?.resultado_ia || {};
  const numeroParcelas = Number(ia_resultado?.numero_parcelas || purchase?.numero_parcelas || 1);
  const valorParcela = Number(ia_resultado?.valor_parcela || purchase?.valor_parcela || valor);

  return (
    <Card className="border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {purchase.numero_processamento && (
                <span className="text-[10px] font-mono text-gray-400">#{purchase.numero_processamento}</span>
              )}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>
                <StatusIcon className="w-3 h-3" />
                {statusInfo.label}
              </span>
              {purchase._centro_custo_normalizado && (
                <Badge variant="outline" className="text-[10px]">{purchase._centro_custo_normalizado}</Badge>
              )}
            </div>
            <p className="font-semibold text-gray-900 line-clamp-2 text-sm">{purchase.descricao_item || '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {purchase.fornecedor_nome || ia_resultado?.fornecedor_nome || '—'}
              {(purchase.meta_id && purchase.meta_id !== 'MC3A-EXTRA') && (
                <span className="ml-2 text-gray-400">· {purchase.meta_id}</span>
              )}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-bold text-gray-900">{fmtBRL(valor)}</p>
            {numeroParcelas > 1 && (
              <p className="text-xs text-gray-500">{numeroParcelas}x {fmtBRL(valorParcela)}</p>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
          {purchase.aprov_coord_data && (
            <div>
              <span className="text-gray-400">Aprovado em</span>
              <p className="font-medium">{fmtDate(purchase.aprov_coord_data)}</p>
            </div>
          )}
          {purchase.data_pagamento_efetivo && (
            <div>
              <span className="text-gray-400">Pago em</span>
              <p className="font-medium text-emerald-700">{fmtDate(purchase.data_pagamento_efetivo)}</p>
            </div>
          )}
          {ia_resultado?.vigencia_fim && (
            <div>
              <span className="text-gray-400">Vigência até</span>
              <p className="font-medium">{fmtDate(ia_resultado.vigencia_fim)}</p>
            </div>
          )}
          {purchase.rubrica_nome && (
            <div>
              <span className="text-gray-400">Rubrica</span>
              <p className="font-medium truncate">{purchase.rubrica_nome}</p>
            </div>
          )}
        </div>

        {/* Arquivos */}
        <div className="mt-3 flex flex-wrap gap-2">
          {contratoUrl && <AnexoLink label="Abrir contrato" url={contratoUrl} icon={FileText} />}
          {notaFiscal && <AnexoLink label="Nota fiscal" url={notaFiscal} icon={FileText} />}
          {arquivoOriginal && <AnexoLink label="Arquivo original" url={arquivoOriginal} icon={FileText} />}
          {comprovante ? (
            <AnexoLink label="Comprovante" url={comprovante} icon={Download} />
          ) : (
            STATUS_APROVADOS.has(String(purchase.status || '').toUpperCase()) && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400 italic px-2 py-1">
                Comprovante ainda não disponível.
              </span>
            )
          )}
          {annexosRelacionados.slice(0, 2).map((a) => (
            a.file_url && (
              <AnexoLink key={a.id} label={a.file_name || 'Anexo'} url={a.file_url} icon={FileText} />
            )
          ))}
        </div>

        {/* Accordion de parcelas */}
        {numeroParcelas > 1 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Ver parcelas ({numeroParcelas}x de {fmtBRL(valorParcela)})
          </button>
        )}
        {expanded && <ParcelasAccordion purchase={purchase} attachments={attachments} />}
      </CardContent>
    </Card>
  );
}

export default function MeusPagamentosTab({ purchases = [], attachments = [], currentUser, isCoordenador, hasGestaoCompras }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMuseu, setFilterMuseu] = useState('all');

  // Filtrar por permissão
  const minhasSolicitacoes = useMemo(() => {
    if (hasGestaoCompras || (isCoordenador && hasGestaoCompras)) {
      return purchases;
    }
    const email = String(currentUser?.email || '').toLowerCase().trim();
    return purchases.filter((p) => {
      const owners = [p.created_by, p.user_email, p.requester_email, p.solicitante_email, p.author_email]
        .map((v) => String(v || '').toLowerCase().trim())
        .filter(Boolean);
      return owners.includes(email);
    });
  }, [purchases, currentUser, isCoordenador, hasGestaoCompras]);

  // Apenas aprovadas e em aprovação
  const visiveis = useMemo(() => {
    return minhasSolicitacoes.filter((p) => {
      const s = String(p.status || '').toUpperCase();
      return STATUS_APROVADOS.has(s) || STATUS_EM_APROVACAO.has(s);
    });
  }, [minhasSolicitacoes]);

  const museus = useMemo(() => {
    const set = new Set();
    visiveis.forEach((p) => { if (p.centro_custo) set.add(p.centro_custo); });
    return Array.from(set).sort();
  }, [visiveis]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return visiveis.filter((p) => {
      const matchStatus = filterStatus === 'all' || String(p.status || '').toUpperCase() === filterStatus;
      const matchMuseu = filterMuseu === 'all' || p.centro_custo === filterMuseu;
      const matchSearch = !q || normalizeText(p.descricao_item).includes(q) || normalizeText(p.fornecedor_nome).includes(q);
      return matchStatus && matchMuseu && matchSearch;
    });
  }, [visiveis, filterStatus, filterMuseu, search]);

  // Totais
  const totais = useMemo(() => {
    const previsto = filtered.reduce((acc, p) => acc + Number(p.valor_solicitado || 0), 0);
    const aprovado = filtered
      .filter((p) => STATUS_APROVADOS.has(String(p.status || '').toUpperCase()))
      .reduce((acc, p) => acc + (Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0)), 0);
    const pago = filtered
      .filter((p) => String(p.status || '').toUpperCase() === 'PAGO')
      .reduce((acc, p) => acc + (Number(p.valor_pago || p.valor_aprovado_admin || 0)), 0);
    const pendente = aprovado - pago;
    const emAprovacao = filtered.filter((p) => STATUS_EM_APROVACAO.has(String(p.status || '').toUpperCase())).length;
    const totalParcelas = filtered.reduce((acc, p) => acc + Number(p?.resultado_ia?.numero_parcelas || p?.numero_parcelas || 1), 0);
    return { previsto, aprovado, pago, pendente, emAprovacao, totalParcelas };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Meus Pagamentos</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Acompanhe suas solicitações, parcelas, arquivos e comprovantes de pagamento.
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total previsto', value: fmtBRL(totais.previsto), icon: DollarSign, dark: true },
          { label: 'Total aprovado', value: fmtBRL(totais.aprovado), icon: CheckCircle2 },
          { label: 'Total pago', value: fmtBRL(totais.pago), icon: CreditCard },
          { label: 'Pendente', value: fmtBRL(Math.max(0, totais.pendente)), icon: Clock },
          { label: 'Em aprovação', value: totais.emAprovacao, icon: AlertCircle },
          { label: 'Parcelas previstas', value: totais.totalParcelas, icon: FileText },
        ].map(({ label, value, icon: Icon, dark }) => (
          <div key={label} className={`rounded-xl border p-3 shadow-sm ${dark ? 'bg-black border-black text-white' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={`w-3.5 h-3.5 ${dark ? 'text-gray-300' : 'text-gray-400'}`} />
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{label}</p>
            </div>
            <p className={`text-lg font-bold leading-tight ${dark ? 'text-white' : 'text-gray-900'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar solicitação, fornecedor..."
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700"
        >
          <option value="all">Todos os status</option>
          <option value="SOLICITADO">Em aprovação</option>
          <option value="APROVADO_COORD">Aprovado coord</option>
          <option value="APROVADO_ADMIN">Aprovado admin</option>
          <option value="PAGO">Pago</option>
          <option value="DEVOLVIDO">Devolvido</option>
        </select>
        {museus.length > 0 && (
          <select
            value={filterMuseu}
            onChange={(e) => setFilterMuseu(e.target.value)}
            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700"
          >
            <option value="all">Todos os museus</option>
            {museus.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      <p className="text-xs text-gray-400">{filtered.length} solicitação(ões)</p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
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