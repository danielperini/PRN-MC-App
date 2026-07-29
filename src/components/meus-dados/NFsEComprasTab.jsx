import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ChevronDown, ChevronUp, FileText, ShoppingCart, TrendingUp, CheckCircle2, Clock, DollarSign } from 'lucide-react';

function fmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR');
}

const STATUS_COLORS = {
  RASCUNHO: 'bg-gray-100 text-gray-600',
  SOLICITADO: 'bg-blue-100 text-blue-700',
  APROVADO_COORD: 'bg-amber-100 text-amber-700',
  APROVADO_ADMIN: 'bg-green-100 text-green-700',
  PAGO: 'bg-green-100 text-green-800',
  RECUSADO: 'bg-red-100 text-red-700',
  CANCELADO: 'bg-gray-100 text-gray-500',
  DEVOLVIDO: 'bg-orange-100 text-orange-700',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {status || '—'}
    </span>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-base font-bold">{value}</p>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, count, total, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-800">{title}</span>
          {count != null && (
            <span className="bg-slate-200 text-slate-700 text-xs font-medium px-2 py-0.5 rounded-full">{count}</span>
          )}
          {total != null && total > 0 && (
            <span className="text-xs text-gray-500 ml-1">— {fmtBRL(total)}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export default function NFsEComprasTab({ targetEmail, museuVinculado, memberName }) {
  // NFs vinculadas ao museu do membro
  const { data: comprasMuseu = [], isLoading: loadingMuseu } = useQuery({
    queryKey: ['compras-museu-sala', museuVinculado],
    queryFn: () => museuVinculado
      ? base44.entities.PurchaseRequest.filter({ centro_custo: museuVinculado }, '-created_date', 200)
      : Promise.resolve([]),
    enabled: !!museuVinculado,
    staleTime: 120000,
  });

  // NFs vinculadas ao nome do membro (fornecedor_nome contains first name)
  const firstName = (memberName || '').split(' ')[0];
  const nfsMembro = comprasMuseu.filter(p => {
    if (!firstName) return false;
    const fn = (p.fornecedor_nome || p.nf_emitente_nome || '').toLowerCase();
    return fn.includes(firstName.toLowerCase());
  });

  // Todas as solicitações do museu
  const solicitacoesMuseu = comprasMuseu;

  const totalNFs = nfsMembro.reduce((s, p) => s + Number(p.nf_valor_total || p.valor_solicitado || 0), 0);
  const totalSol = solicitacoesMuseu.reduce((s, p) => s + Number(p.valor_solicitado || 0), 0);
  const totalAprovado = solicitacoesMuseu.filter(p => ['APROVADO_ADMIN', 'APROVADO_COORD', 'PAGO'].includes(p.status))
    .reduce((s, p) => s + Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0), 0);
  const totalPago = solicitacoesMuseu.filter(p => p.status === 'PAGO')
    .reduce((s, p) => s + Number(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado || 0), 0);

  if (!museuVinculado) {
    return (
      <div className="text-sm text-muted-foreground py-6 flex items-center gap-2">
        <FileText className="w-4 h-4" />
        Museu vinculado não informado no perfil.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={FileText} label="NFs Vinculadas" value={nfsMembro.length} color="border-blue-200 bg-blue-50 text-blue-800" />
        <SummaryCard icon={ShoppingCart} label="Solicitações Museu" value={solicitacoesMuseu.length} color="border-slate-200 bg-slate-50 text-slate-700" />
        <SummaryCard icon={CheckCircle2} label="Valor Aprovado" value={fmtBRL(totalAprovado)} color="border-green-200 bg-green-50 text-green-800" />
        <SummaryCard icon={DollarSign} label="Total Pago" value={fmtBRL(totalPago)} color="border-emerald-200 bg-emerald-50 text-emerald-800" />
      </div>

      {/* NFs do membro */}
      <CollapsibleSection
        title={`Notas Fiscais — ${firstName || 'Membro'}`}
        count={nfsMembro.length}
        total={totalNFs}
        defaultOpen={nfsMembro.length > 0}
      >
        {nfsMembro.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma NF encontrada com o nome do membro neste museu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Nº NF</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Data Emissão</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Emitente</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Valor</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-700">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {nfsMembro.map((p, i) => (
                  <tr key={p.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="px-3 py-2 text-gray-700 font-mono text-xs">{p.nf_numero || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(p.nf_data_emissao)}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate">{p.nf_emitente_nome || p.fornecedor_nome || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{fmtBRL(p.nf_valor_total || p.valor_solicitado)}</td>
                    <td className="px-3 py-2 text-center"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <div className="flex items-center gap-1 justify-center">
                        {p.nf_pdf_url && (
                          <a href={p.nf_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> PDF
                          </a>
                        )}
                        {p.drive_backup_folder_url && (
                          <a href={p.drive_backup_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:underline flex items-center gap-1 ml-1">
                            <ExternalLink className="w-3 h-3" /> Drive
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Solicitações do museu */}
      <CollapsibleSection
        title={`Solicitações de Compra — ${museuVinculado}`}
        count={solicitacoesMuseu.length}
        total={totalSol}
        defaultOpen={false}
      >
        {solicitacoesMuseu.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação encontrada para este museu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Descrição</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Data</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700">Valor</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-700">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Meta</th>
                </tr>
              </thead>
              <tbody>
                {solicitacoesMuseu.map((p, i) => (
                  <tr key={p.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{p.descricao_item || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">{fmtDate(p.nf_data_emissao || p.created_date)}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{fmtBRL(p.valor_solicitado)}</td>
                    <td className="px-3 py-2 text-center"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.meta_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}