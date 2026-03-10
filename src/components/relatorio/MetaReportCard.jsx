import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, MapPin, Users, RepeatIcon, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const META_LABELS = {
  'MC3A-20': 'Ação Educativa',
  'MC3A-21': 'Exposição / Produção Cultural',
  'MC3A-22': 'Comunicação e Divulgação',
  'MC3A-EXTRA': 'Ações Extras / Outras',
};

const STATUS_CONFIG = {
  'RASCUNHO': { label: 'Rascunho', color: 'bg-gray-100 text-gray-600' },
  'SOLICITADO': { label: 'Solicitado', color: 'bg-blue-100 text-blue-700' },
  'APROVADO_COORD': { label: 'Aprov. Coord', color: 'bg-yellow-100 text-yellow-700' },
  'APROVADO_ADMIN': { label: 'Aprov. Admin', color: 'bg-indigo-100 text-indigo-700' },
  'RECUSADO': { label: 'Recusado', color: 'bg-red-100 text-red-700' },
  'CANCELADO': { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
  'PAGO': { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' },
};

const STATUS_META_CONFIG = {
  'Em andamento': { icon: Clock, color: 'text-blue-600' },
  'Parcial': { icon: AlertCircle, color: 'text-yellow-600' },
  'Cumprida': { icon: CheckCircle2, color: 'text-green-600' },
  'Superada': { icon: CheckCircle2, color: 'text-emerald-700' },
};

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export default function MetaReportCard({ data, periodoLabel }) {
  const [expandedAts, setExpandedAts] = useState(false);
  const [expandedCompras, setExpandedCompras] = useState(false);

  const { meta, atividades, compras, totalPublico, totalOcorrencias, totalSolicitado, totalAprovado, totalPago, museus, statusMetas } = data;
  const label = META_LABELS[meta] || meta;

  const execPct = totalSolicitado > 0 ? Math.min((totalPago / totalSolicitado) * 100, 100) : 0;
  const aprvPct = totalSolicitado > 0 ? Math.min((totalAprovado / totalSolicitado) * 100, 100) : 0;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">{meta}</span>
            <span className="text-base font-semibold text-gray-900">{label}</span>
          </div>
          {museus.length > 0 && (
            <div className="hidden md:flex items-center gap-1 flex-wrap">
              {museus.map(m => (
                <span key={m} className="flex items-center gap-0.5 text-[10px] text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                  <MapPin className="w-2.5 h-2.5" />{m}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="text-xs text-gray-400">{periodoLabel}</span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-gray-100 border-b border-gray-100">
        {[
          { label: 'Atividades', value: atividades.length },
          { label: 'Ocorrências', value: totalOcorrencias },
          { label: 'Público', value: totalPublico.toLocaleString('pt-BR') },
          { label: 'Solicitado', value: `R$\u00a0${fmt(totalSolicitado)}` },
          { label: 'Aprovado', value: `R$\u00a0${fmt(totalAprovado)}` },
          { label: 'Pago', value: `R$\u00a0${fmt(totalPago)}` },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-sm font-bold text-gray-800">{value || '—'}</p>
          </div>
        ))}
      </div>

      {/* Financial bars */}
      <div className="px-5 py-3 border-b border-gray-100 space-y-2">
        <div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
            <span>Aprovado / Solicitado</span>
            <span>{aprvPct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${aprvPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
            <span>Pago / Solicitado</span>
            <span>{execPct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${execPct}%` }} />
          </div>
        </div>
      </div>

      {/* Atividades expandable */}
      <div className="px-5 py-3 border-b border-gray-100">
        <button
          className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-black"
          onClick={() => setExpandedAts(!expandedAts)}
        >
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Atividades físicas ({atividades.length})
          </span>
          {expandedAts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expandedAts && (
          <div className="mt-3 overflow-x-auto">
            {atividades.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nenhuma atividade registrada para esta meta no período.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="text-left py-1.5 pr-3 font-medium">Título</th>
                    <th className="text-left py-1.5 pr-3 font-medium hidden md:table-cell">Museu</th>
                    <th className="text-center py-1.5 pr-3 font-medium">Ocorr.</th>
                    <th className="text-center py-1.5 pr-3 font-medium">Público</th>
                    <th className="text-left py-1.5 font-medium hidden md:table-cell">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {atividades.map(a => {
                    const stConf = STATUS_META_CONFIG[a.status_meta];
                    const StIcon = stConf?.icon;
                    return (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-3">
                          <span className="font-medium text-gray-800">{a.titulo}</span>
                          {a.data_realizacao && (
                            <span className="block text-gray-400 text-[10px]">{a.data_realizacao}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-gray-600 hidden md:table-cell">{a.museu || '—'}</td>
                        <td className="py-2 pr-3 text-center text-gray-700">
                          <span className="flex items-center justify-center gap-1">
                            <RepeatIcon className="w-3 h-3 text-gray-400" />
                            {a.quantas_repeticoes || 1}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-center font-medium text-gray-800">
                          {((Number(a.publico_estimado) || 0) * (Number(a.quantas_repeticoes) || 1)).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2 hidden md:table-cell">
                          {stConf ? (
                            <span className={`flex items-center gap-1 ${stConf.color}`}>
                              <StIcon className="w-3 h-3" />
                              {a.status_meta}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Compras expandable */}
      <div className="px-5 py-3">
        <button
          className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-black"
          onClick={() => setExpandedCompras(!expandedCompras)}
        >
          <span>Execução financeira — {compras.length} compra(s)</span>
          {expandedCompras ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expandedCompras && (
          <div className="mt-3 overflow-x-auto">
            {compras.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nenhuma compra vinculada a esta meta no período.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="text-left py-1.5 pr-3 font-medium">Item</th>
                    <th className="text-left py-1.5 pr-3 font-medium hidden md:table-cell">Categoria</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Solicitado</th>
                    <th className="text-right py-1.5 pr-3 font-medium hidden md:table-cell">Aprovado</th>
                    <th className="text-center py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map(c => {
                    const stConf = STATUS_CONFIG[c.status] || { label: c.status, color: 'bg-gray-100 text-gray-600' };
                    return (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-3">
                          <span className="font-medium text-gray-800 line-clamp-1">{c.descricao_item}</span>
                          {c.fornecedor_nome && <span className="block text-gray-400 text-[10px]">{c.fornecedor_nome}</span>}
                        </td>
                        <td className="py-2 pr-3 text-gray-600 hidden md:table-cell">
                          <span className="line-clamp-1">{c.categoria || '—'}</span>
                        </td>
                        <td className="py-2 pr-3 text-right font-medium text-gray-800">
                          R$&nbsp;{fmt(c.valor_solicitado)}
                        </td>
                        <td className="py-2 pr-3 text-right text-indigo-700 font-medium hidden md:table-cell">
                          {c.valor_aprovado_admin ? `R$\u00a0${fmt(c.valor_aprovado_admin)}` : '—'}
                        </td>
                        <td className="py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${stConf.color}`}>
                            {stConf.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className="py-2 pr-3 text-gray-700 text-xs">Total</td>
                    <td className="hidden md:table-cell" />
                    <td className="py-2 pr-3 text-right text-xs text-gray-800">R$&nbsp;{fmt(totalSolicitado)}</td>
                    <td className="py-2 pr-3 text-right text-xs text-indigo-700 hidden md:table-cell">R$&nbsp;{fmt(totalAprovado)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}