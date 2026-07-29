import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChevronDown, ChevronUp, FileText, ShoppingCart, CheckCircle2, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

const STATUS_CONFIG = {
  RASCUNHO:       { label: 'Rascunho',     cls: 'bg-gray-100 text-gray-600' },
  SOLICITADO:     { label: 'Em aprovação', cls: 'bg-blue-100 text-blue-700' },
  DEVOLVIDO:      { label: 'Devolvido',    cls: 'bg-amber-100 text-amber-700' },
  APROVADO_COORD: { label: 'Aprovado',     cls: 'bg-green-100 text-green-700' },
  APROVADO_ADMIN: { label: 'Aprovado',     cls: 'bg-green-100 text-green-700' },
  APROVADO:       { label: 'Aprovado',     cls: 'bg-green-100 text-green-700' },
  PAGO:           { label: 'Pago',         cls: 'bg-emerald-100 text-emerald-800' },
  RECUSADO:       { label: 'Recusado',     cls: 'bg-red-100 text-red-700' },
  CANCELADO:      { label: 'Cancelado',    cls: 'bg-gray-100 text-gray-500' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[String(status || '').toUpperCase()] || { label: status || '—', cls: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function AccordionSection({ title, count, total, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-sm text-gray-800">{title}</span>
          {count > 0 && (
            <span className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-xs font-medium text-gray-600">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="text-sm font-semibold text-gray-700">{fmtBRL(total)}</span>}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export default function NFsSolicitacoesMuseuSection({ targetEmail, museuVinculado, targetName }) {
  // Busca PurchaseRequests do museu vinculado
  const { data: comprasMuseu = [], isLoading: loadingCompras } = useQuery({
    queryKey: ['compras-museu-meusdados', museuVinculado, targetEmail],
    queryFn: async () => {
      if (!museuVinculado || museuVinculado === 'Geral/Transversal') return [];
      const res = await base44.entities.PurchaseRequest.filter({ centro_custo: museuVinculado }, '-created_date', 200);
      return Array.isArray(res) ? res : [];
    },
    enabled: !!museuVinculado,
    staleTime: 60000,
  });

  // Separa NFs (têm nf_numero ou nf_emitente_nome) de solicitações gerais
  const { nfs, solicitacoes } = useMemo(() => {
    const targetNameLower = (targetName || '').toLowerCase();
    const nfs = comprasMuseu.filter(p => {
      const temNF = !!(p.nf_numero || p.nf_emitente_nome || p.nota_fiscal_url || p.nf_pdf_url);
      const nomeForneced = (p.fornecedor_nome || p.nf_emitente_nome || '').toLowerCase();
      const matchNome = targetNameLower && nomeForneced && targetNameLower.split(' ').some(
        part => part.length > 3 && nomeForneced.includes(part.toLowerCase())
      );
      return temNF || matchNome;
    });
    const nfIds = new Set(nfs.map(p => p.id));
    const solicitacoes = comprasMuseu.filter(p => !nfIds.has(p.id));
    return { nfs, solicitacoes };
  }, [comprasMuseu, targetName]);

  const totalNFs = useMemo(() => nfs.reduce((s, p) => s + Number(p.nf_valor_total || p.valor_solicitado || p.valor_total || 0), 0), [nfs]);
  const totalSol = useMemo(() => solicitacoes.reduce((s, p) => s + Number(p.valor_solicitado || p.valor_total || 0), 0), [solicitacoes]);
  const totalAprovado = useMemo(() => comprasMuseu.filter(p => ['APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO'].includes(String(p.status||'').toUpperCase())).reduce((s,p) => s + Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0), 0), [comprasMuseu]);
  const totalPago = useMemo(() => comprasMuseu.filter(p => String(p.status||'').toUpperCase() === 'PAGO').reduce((s,p) => s + Number(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado || 0), 0), [comprasMuseu]);

  if (!museuVinculado || museuVinculado === 'Geral/Transversal') return null;

  return (
    <div className="mt-8 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-800">Financeiro do Museu — {museuVinculado}</h3>
        <p className="text-xs text-gray-500 mt-0.5">NFs e solicitações registradas no seu museu vinculado</p>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total NFs', value: fmtBRL(totalNFs) },
          { label: 'Total Solicitações', value: fmtBRL(totalSol) },
          { label: 'Valor Aprovado', value: fmtBRL(totalAprovado) },
          { label: 'Valor Pago', value: fmtBRL(totalPago) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{label}</p>
            <p className="text-base font-bold text-gray-900 mt-1">{loadingCompras ? '...' : value}</p>
          </div>
        ))}
      </div>

      {/* Seção NFs */}
      <AccordionSection
        title="Notas Fiscais Encontradas"
        count={nfs.length}
        total={totalNFs}
        icon={FileText}
      >
        {loadingCompras ? (
          <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
        ) : nfs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma NF encontrada para {museuVinculado}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 pr-3">Nº NF</th>
                  <th className="text-left py-2 pr-3">Data</th>
                  <th className="text-left py-2 pr-3">Emitente / Fornecedor</th>
                  <th className="text-right py-2 pr-3">Valor</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="py-2">Arquivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {nfs.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="py-2 pr-3 font-mono text-gray-600">{p.nf_numero || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500">{fmtDate(p.nf_data_emissao)}</td>
                    <td className="py-2 pr-3 text-gray-700 max-w-[180px] truncate">{p.nf_emitente_nome || p.fornecedor_nome || '—'}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-gray-900">{fmtBRL(p.nf_valor_total || p.valor_solicitado || p.valor_total)}</td>
                    <td className="py-2 pr-3"><StatusBadge status={p.status} /></td>
                    <td className="py-2 text-center">
                      {(p.nota_fiscal_url || p.nf_pdf_url) && (
                        <a href={p.nota_fiscal_url || p.nf_pdf_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AccordionSection>

      {/* Seção Solicitações do Museu */}
      <AccordionSection
        title="Solicitações de Compra do Museu"
        count={solicitacoes.length}
        total={totalSol}
        icon={ShoppingCart}
      >
        {loadingCompras ? (
          <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
        ) : solicitacoes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma solicitação adicional encontrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 pr-3">Descrição</th>
                  <th className="text-left py-2 pr-3">Data</th>
                  <th className="text-right py-2 pr-3">Valor</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2">Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {solicitacoes.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="py-2 pr-3 text-gray-800 max-w-[200px] truncate">{p.descricao_item || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500">{fmtDate(p.created_date)}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-gray-900">{fmtBRL(p.valor_solicitado || p.valor_total)}</td>
                    <td className="py-2 pr-3"><StatusBadge status={p.status} /></td>
                    <td className="py-2">
                      {p.meta_id && p.meta_id !== 'MC3A-EXTRA' && (
                        <span className="text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5">{p.meta_id}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AccordionSection>
    </div>
  );
}