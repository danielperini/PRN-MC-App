import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText, ShoppingCart, CheckCircle2, DollarSign, ChevronDown, ChevronUp, ExternalLink, Info } from 'lucide-react';

function fmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR');
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
  const key = String(status || '').toUpperCase();
  const cfg = STATUS_CONFIG[key] || { label: status || '—', cls: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function SummaryCard({ icon: Icon, label, value, colorClass }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${colorClass}`}>
      <Icon className="w-5 h-5 flex-shrink-0 opacity-70" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide font-semibold opacity-60">{label}</p>
        <p className="text-sm font-bold truncate">{value}</p>
      </div>
    </div>
  );
}

function CollapsibleTable({ title, count, total, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-800">{title}</span>
          {count != null && (
            <span className="bg-white border border-gray-200 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">{count}</span>
          )}
          {total > 0 && <span className="text-xs text-gray-500">— {fmtBRL(total)}</span>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function normalize(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Retorna true se a PurchaseRequest é um pagamento pessoal do membro,
 * baseado em CNPJ, nome ou team_payment_id.
 */
function isPagamentoPessoal(p, teamMember, targetEmail) {
  if (!teamMember) return false;

  // Critério 1: team_payment_id vinculado ao email do membro
  if (p.team_payment_id && targetEmail && p.team_payment_id === targetEmail) return true;

  // Critério 2: CNPJ do fornecedor bate com CNPJ do membro (comparação sem formatação)
  const cnpjMembro = (teamMember.cnpj || '').replace(/\D/g, '');
  const cnpjFornecedor = (p.fornecedor_cnpj || p.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
  if (cnpjMembro && cnpjFornecedor && cnpjMembro === cnpjFornecedor) return true;

  // Critério 3: CPF do membro bate com CPF do fornecedor
  const cpfMembro = (teamMember.cpf || '').replace(/\D/g, '');
  const cpfFornecedor = (p.nf_emitente_cpf_cnpj || p.fornecedor_cnpj || '').replace(/\D/g, '');
  if (cpfMembro && cpfFornecedor && cpfMembro === cpfFornecedor) return true;

  // Critério 4: nome do fornecedor contém primeiro E último nome do membro
  const partes = (teamMember.user_name || '').trim().split(/\s+/);
  if (partes.length >= 2) {
    const primeiroNome = normalize(partes[0]);
    const ultimoNome = normalize(partes[partes.length - 1]);
    const nomeFornecedor = normalize(p.fornecedor_nome || p.nf_emitente_nome || '');
    if (
      primeiroNome.length > 2 && ultimoNome.length > 2 &&
      nomeFornecedor.includes(primeiroNome) && nomeFornecedor.includes(ultimoNome)
    ) return true;
  }

  return false;
}

const MUSEU_LABELS = {
  MUMO: 'MUMO — Museu das Orçadas',
  MIS: 'MIS — Museu da Imagem e do Som',
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
};

export default function NFsEComprasTab({ targetEmail, museuVinculado, memberName, teamMember }) {
  const isGeral = !museuVinculado || museuVinculado === 'Geral/Transversal';

  // Determinar os centros de custo a buscar
  const centrosCusto = isGeral
    ? ['Geral', 'Geral/Transversal']
    : [museuVinculado];

  const { data: comprasRaw = [], isLoading } = useQuery({
    queryKey: ['nfs-compras-museu-tab', museuVinculado, targetEmail],
    queryFn: async () => {
      if (isGeral) {
        // Para geral, busca dois centros de custo
        const [r1, r2] = await Promise.all([
          base44.entities.PurchaseRequest.filter({ centro_custo: 'Geral' }, '-created_date', 150),
          base44.entities.PurchaseRequest.filter({ centro_custo: 'Geral/Transversal' }, '-created_date', 150),
        ]);
        const combined = [...(r1 || []), ...(r2 || [])];
        // Deduplica por id
        const seen = new Set();
        return combined.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      }
      return base44.entities.PurchaseRequest.filter({ centro_custo: museuVinculado }, '-created_date', 300);
    },
    staleTime: 120000,
  });

  // Aplica exclusão de pagamentos pessoais
  const solicitacoesMuseu = useMemo(() => {
    return comprasRaw.filter(p => !isPagamentoPessoal(p, teamMember, targetEmail));
  }, [comprasRaw, teamMember, targetEmail]);

  // Limitar a 300 e ordenar por data decrescente
  const limited = useMemo(() => {
    return [...solicitacoesMuseu]
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
      .slice(0, 300);
  }, [solicitacoesMuseu]);

  const hitLimit = solicitacoesMuseu.length > 300;

  // Totais
  const totalSolicitacoes = limited.length;
  const totalValorSolicitado = limited.reduce((s, p) => s + Number(p.valor_solicitado || 0), 0);
  const totalAprovado = limited
    .filter(p => ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(String(p.status || '').toUpperCase()))
    .reduce((s, p) => s + Number(p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0), 0);
  const totalPago = limited
    .filter(p => String(p.status || '').toUpperCase() === 'PAGO')
    .reduce((s, p) => s + Number(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado || 0), 0);

  const museuLabel = MUSEU_LABELS[museuVinculado] || museuVinculado || 'Geral';

  return (
    <div className="space-y-5">
      {/* Cabeçalho da seção */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          Solicitações de Compra — {isGeral ? 'Equipe Geral' : museuLabel}
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Exceto pagamentos pessoais da equipe</p>
        {isGeral && (
          <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Este membro está vinculado à equipe geral — exibindo solicitações transversais.
          </div>
        )}
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={ShoppingCart} label="Solicitações" value={totalSolicitacoes} colorClass="border-slate-200 bg-slate-50 text-slate-700" />
        <SummaryCard icon={FileText} label="Valor Solicitado" value={fmtBRL(totalValorSolicitado)} colorClass="border-blue-200 bg-blue-50 text-blue-800" />
        <SummaryCard icon={CheckCircle2} label="Valor Aprovado" value={fmtBRL(totalAprovado)} colorClass="border-green-200 bg-green-50 text-green-800" />
        <SummaryCard icon={DollarSign} label="Valor Pago" value={fmtBRL(totalPago)} colorClass="border-emerald-200 bg-emerald-50 text-emerald-800" />
      </div>

      {/* Tabela collapsível */}
      <CollapsibleTable
        title={`Compras do ${isGeral ? 'Geral' : museuVinculado}`}
        count={limited.length}
        total={totalValorSolicitado}
        defaultOpen={true}
      >
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
        ) : limited.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma solicitação encontrada para este museu.</p>
        ) : (
          <>
            {hitLimit && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mb-3">
                Mostrando os 300 registros mais recentes.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 pr-3 font-semibold">Descrição</th>
                    <th className="text-left py-2 pr-3 font-semibold">Fornecedor</th>
                    <th className="text-right py-2 pr-3 font-semibold">Valor</th>
                    <th className="text-center py-2 pr-3 font-semibold">Status</th>
                    <th className="text-left py-2 pr-3 font-semibold">Meta</th>
                    <th className="text-left py-2 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {limited.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="py-2 pr-3 text-gray-800 max-w-[180px] truncate" title={p.descricao_item}>
                        {p.nf_pdf_url ? (
                          <a href={p.nf_pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                            {p.descricao_item || '—'}
                            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                          </a>
                        ) : (p.descricao_item || '—')}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 max-w-[140px] truncate" title={p.fornecedor_nome || p.nf_emitente_nome}>
                        {p.fornecedor_nome || p.nf_emitente_nome || '—'}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {fmtBRL(p.valor_solicitado || p.valor_total)}
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="py-2 pr-3">
                        {p.meta_id && p.meta_id !== 'MC3A-EXTRA' ? (
                          <span className="text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5">
                            {p.meta_id}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2 text-gray-500 whitespace-nowrap">
                        {fmtDate(p.nf_data_emissao || p.created_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CollapsibleTable>
    </div>
  );
}