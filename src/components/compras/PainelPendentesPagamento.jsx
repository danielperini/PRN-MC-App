import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Clock, Search, ChevronDown, ChevronRight, CreditCard,
  Building2, Calendar, FileText, ExternalLink, AlertCircle,
  Hash, Wallet, RefreshCw, Filter, X, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Utils ──────────────────────────────────────────────────────────────────

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).includes('T') ? v : v + 'T00:00:00');
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('pt-BR');
}

const MEIO_PAGAMENTO_LABELS = {
  PIX: 'PIX',
  'TED/Transferência': 'TED',
  Boleto: 'Boleto',
  Cartão: 'Cartão',
  Dinheiro: 'Dinheiro',
};

const MEIO_PAGAMENTO_CLS = {
  PIX: 'bg-emerald-100 text-emerald-700',
  'TED/Transferência': 'bg-blue-100 text-blue-700',
  Boleto: 'bg-amber-100 text-amber-700',
  Cartão: 'bg-violet-100 text-violet-700',
  Dinheiro: 'bg-gray-100 text-gray-700',
};

// ─── Item Card ──────────────────────────────────────────────────────────────

function PendenteItemRow({ purchase }) {
  const [expanded, setExpanded] = useState(false);
  const valor = purchase.valor_aprovado_admin || purchase.valor_aprovado || purchase.valor_solicitado || 0;
  const meioCls = MEIO_PAGAMENTO_CLS[purchase.meio_pagamento] || 'bg-gray-100 text-gray-600';

  return (
    <div className="border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition-colors overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge className="bg-green-100 text-green-800 text-xs font-medium">Aprovado</Badge>
            {purchase.meio_pagamento && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meioCls}`}>
                {MEIO_PAGAMENTO_LABELS[purchase.meio_pagamento] || purchase.meio_pagamento}
              </span>
            )}
            {purchase.nf_numero && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Hash className="w-3 h-3" />NF {purchase.nf_numero}
              </span>
            )}
          </div>
          <p className="font-medium text-gray-900 text-sm">{purchase.descricao_item}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
            {purchase.fornecedor_nome && (
              <span className="text-xs text-gray-500">{purchase.fornecedor_nome}</span>
            )}
            {purchase.fornecedor_cnpj && (
              <span className="text-xs text-gray-400">CNPJ: {purchase.fornecedor_cnpj}</span>
            )}
          </div>
          {purchase.aprov_admin_data && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />Aprovado em {fmtDate(purchase.aprov_admin_data)}
              {purchase.aprov_admin_nome ? ` por ${purchase.aprov_admin_nome}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="font-bold text-gray-900 text-lg">{fmtBRL(valor)}</p>
            {purchase.detalhe_pagamento && (
              <p className="text-xs text-gray-400 max-w-[180px] truncate" title={purchase.detalhe_pagamento}>
                {purchase.detalhe_pagamento}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs px-4 pb-4 pt-3 border-t border-gray-100">
          {purchase.categoria && (
            <div>
              <span className="text-gray-400">Categoria</span>
              <p className="font-medium text-gray-700">{purchase.categoria}</p>
            </div>
          )}
          {purchase.qtd && (
            <div>
              <span className="text-gray-400">Quantidade</span>
              <p className="font-medium text-gray-700">{purchase.qtd} {purchase.unidade || ''}</p>
            </div>
          )}
          {purchase.rubrica_nome && (
            <div>
              <span className="text-gray-400">Rubrica</span>
              <p className="font-medium text-gray-700 truncate">{purchase.rubrica_nome}</p>
            </div>
          )}
          {purchase.nf_data_emissao && (
            <div>
              <span className="text-gray-400">Data NF</span>
              <p className="font-medium text-gray-700">{fmtDate(purchase.nf_data_emissao)}</p>
            </div>
          )}
          {(purchase.nota_fiscal_url || purchase.nf_pdf_url || purchase.comprovante_url) && (
            <div className="col-span-2 md:col-span-4 flex flex-wrap gap-3 pt-1">
              {(purchase.nota_fiscal_url || purchase.nf_pdf_url) && (
                <a
                  href={purchase.nota_fiscal_url || purchase.nf_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <FileText className="w-3 h-3" />Nota Fiscal (PDF)
                </a>
              )}
              {purchase.comprovante_url && (
                <a
                  href={purchase.comprovante_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />Comprovante
                </a>
              )}
              <a
                href={`/Compras?id=${purchase.id}`}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />Abrir no sistema
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Group Block ────────────────────────────────────────────────────────────

function CentroCustoGroup({ centroCusto, items, isOpen, onToggle }) {
  const total = items.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0), 0);

  return (
    <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <Building2 className="w-4 h-4 text-gray-400" />
        <span className="font-semibold text-gray-900 text-sm flex-1 text-left">{centroCusto}</span>
        <span className="text-xs text-gray-500">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
        <span className="text-sm font-bold text-gray-900">{fmtBRL(total)}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-2.5">
          {items.map((p) => (
            <PendenteItemRow key={p.id} purchase={p} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export default function PainelPendentesPagamento({ currentUser: propUser }) {
  const [search, setSearch] = useState('');
  const [filtroMeio, setFiltroMeio] = useState('');
  const [filtroCentro, setFiltroCentro] = useState('');
  const [openGroups, setOpenGroups] = useState({});

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases_pendentes_pagamento', propUser?.email],
    queryFn: async () => {
      const all = await base44.entities.PurchaseRequest.filter({ status: 'APROVADO_ADMIN' }, '-created_date', 500);
      // Apenas pendentes de pagamento (não pagos, não quitados)
      return all.filter((p) => {
        const jaPago = p.pago === true || p.quitada === true || p.status_pagamento === 'pago';
        return !jaPago;
      });
    },
    enabled: !!propUser,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter((p) => {
      if (filtroMeio && p.meio_pagamento !== filtroMeio) return false;
      if (filtroCentro && p.centro_custo !== filtroCentro) return false;
      if (!q) return true;
      return [
        p.descricao_item, p.fornecedor_nome, p.fornecedor_cnpj,
        p.centro_custo, p.rubrica_nome, p.nf_numero,
      ].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [purchases, search, filtroMeio, filtroCentro]);

  // Agrupar por centro de custo
  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((p) => {
      const key = p.centro_custo || 'Sem Centro de Custo';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const totalGeral = filtered.reduce(
    (sum, p) => sum + (p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0),
    0
  );

  const totalPorMeio = useMemo(() => {
    const map = {};
    filtered.forEach((p) => {
      const meio = p.meio_pagamento || 'Outro';
      if (!map[meio]) map[meio] = { count: 0, total: 0 };
      map[meio].count++;
      map[meio].total += (p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0);
    });
    return map;
  }, [filtered]);

  const centrosDisponiveis = useMemo(() => {
    const set = new Set();
    purchases.forEach((p) => { if (p.centro_custo) set.add(p.centro_custo); });
    return Array.from(set).sort();
  }, [purchases]);

  const meiosDisponiveis = useMemo(() => {
    const set = new Set();
    purchases.forEach((p) => { if (p.meio_pagamento) set.add(p.meio_pagamento); });
    return Array.from(set);
  }, [purchases]);

  const hasActiveFilters = search || filtroMeio || filtroCentro;

  function toggleGroup(key) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function clearFilters() {
    setSearch('');
    setFiltroMeio('');
    setFiltroCentro('');
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center">
          <Clock className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Compras Aguardando Pagamento</h2>
          <p className="text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? 'solicitação aprovada' : 'solicitações aprovadas'} pendentes de processamento financeiro
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-amber-700">
            <Clock className="w-3.5 h-3.5" />
            <p className="text-xs font-medium uppercase tracking-wide">Pendentes</p>
          </div>
          <p className="text-2xl font-bold text-amber-800 mt-1">{filtered.length}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-gray-300">
            <Wallet className="w-3.5 h-3.5" />
            <p className="text-xs font-medium uppercase tracking-wide">Valor Total</p>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{fmtBRL(totalGeral)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-blue-700">
            <Building2 className="w-3.5 h-3.5" />
            <p className="text-xs font-medium uppercase tracking-wide">Centros de Custo</p>
          </div>
          <p className="text-2xl font-bold text-blue-800 mt-1">{grouped.length}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <CreditCard className="w-3.5 h-3.5" />
            <p className="text-xs font-medium uppercase tracking-wide">Meios de Pgto</p>
          </div>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{Object.keys(totalPorMeio).length}</p>
        </div>
      </div>

      {/* Resumo por meio de pagamento */}
      {Object.keys(totalPorMeio).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(totalPorMeio).map(([meio, data]) => (
            <div key={meio} className={`text-xs font-medium px-3 py-1.5 rounded-full ${MEIO_PAGAMENTO_CLS[meio] || 'bg-gray-100 text-gray-600'}`}>
              {MEIO_PAGAMENTO_LABELS[meio] || meio}: {data.count} · {fmtBRL(data.total)}
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por item, fornecedor, CNPJ, rubrica ou NF..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {centrosDisponiveis.length > 0 && (
          <select
            value={filtroCentro}
            onChange={(e) => setFiltroCentro(e.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white min-w-[180px]"
          >
            <option value="">Todos os centros</option>
            {centrosDisponiveis.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {meiosDisponiveis.length > 0 && (
          <select
            value={filtroMeio}
            onChange={(e) => setFiltroMeio(e.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white min-w-[140px]"
          >
            <option value="">Todos os meios</option>
            {meiosDisponiveis.map((m) => (
              <option key={m} value={m}>{MEIO_PAGAMENTO_LABELS[m] || m}</option>
            ))}
          </select>
        )}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
            <X className="w-4 h-4 mr-1" />Limpar
          </Button>
        )}
      </div>

      {/* Lista agrupada por centro de custo */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50">
          <CheckCircle2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {hasActiveFilters
              ? 'Nenhuma solicitação corresponde aos filtros'
              : 'Nenhuma compra aguardando pagamento'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {hasActiveFilters
              ? 'Tente limpar os filtros para ver mais resultados.'
              : 'Todas as aprovações já foram processadas ou pagas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([centro, items]) => (
            <CentroCustoGroup
              key={centro}
              centroCusto={centro}
              items={items}
              isOpen={openGroups[centro] !== false}
              onToggle={() => toggleGroup(centro)}
            />
          ))}
        </div>
      )}
    </div>
  );
}