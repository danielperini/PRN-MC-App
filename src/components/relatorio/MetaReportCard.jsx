import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, MapPin, Users, RepeatIcon, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const META_LABELS = {
  'MC3A-20': 'Ação Educativa',
  'MC3A-21': 'Exposição / Produção Cultural',
  'MC3A-22': 'Comunicação e Divulgação',
  'MC3A-23': 'Noturno nos Museus 2026',
  'MC3A-24': 'Emenda Parlamentar',
  'MC3A-25': 'Outras Ações',
  'MC3A-EXTRA': 'Ações Extras',
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

function toNumberOrZero(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export default function MetaReportCard({ data, periodoLabel }) {
  const [expandedAts, setExpandedAts] = useState(false);
  const [expandedCompras, setExpandedCompras] = useState(false);

  const { meta, atividades, compras, totalPublico, totalOcorrencias, totalSolicitado, totalAprovado, totalPago, museus } = data;
  const label = META_LABELS[meta] || meta;

  const execPct = totalSolicitado > 0 ? Math.min((totalPago / totalSolicitado) * 100, 100) : 0;
  const aprvPct = totalSolicitado > 0 ? Math.min((totalAprovado / totalSolicitado) * 100, 100) : 0;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      
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

      <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-gray-100 border-b border-gray-100">
        {[
          { label: 'Atividades', value: atividades.length },
          { label: 'Ocorrências', value: totalOcorrencias },
          { label: 'Público', value: totalPublico.toLocaleString('pt-BR') },
          { label: 'Solicitado', value: `R$ ${fmt(totalSolicitado)}` },
          { label: 'Aprovado', value: `R$ ${fmt(totalAprovado)}` },
          { label: 'Pago', value: `R$ ${fmt(totalPago)}` },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-sm font-bold text-gray-800">{value || '—'}</p>
          </div>
        ))}
      </div>

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
            <table className="w-full text-xs">
              <tbody>
                {atividades.map(a => {
                  const repeticoes = toNumberOrZero(a.quantas_repeticoes);
                  const publico = toNumberOrZero(a.publico_estimado) * repeticoes;

                  return (
                    <tr key={a.id}>
                      <td className="py-2">{a.titulo}</td>
                      <td className="text-center">
                        <span className="flex items-center justify-center gap-1">
                          <RepeatIcon className="w-3 h-3 text-gray-400" />
                          {repeticoes}
                        </span>
                      </td>
                      <td className="text-center">{publico.toLocaleString('pt-BR')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
