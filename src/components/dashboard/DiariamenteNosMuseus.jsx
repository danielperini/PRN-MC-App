import React, { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Quote, MapPin, Calendar, User, RefreshCw, BookOpen, ChevronRight } from 'lucide-react';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];

const MUSEU_COLORS = {
  MIS:  { bg: 'bg-blue-50',    border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  MHAB: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  MUMO: { bg: 'bg-violet-50',  border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
};

function getMuseuStyle(museu) {
  for (const key of Object.keys(MUSEU_COLORS)) {
    if (museu && museu.toUpperCase().includes(key)) return MUSEU_COLORS[key];
  }
  return { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' };
}

function FraseCard({ item, idx }) {
  const style = getMuseuStyle(item.museu);
  const delay = idx * 80;

  return (
    <div
      className={`relative flex flex-col gap-3 p-5 rounded-2xl border ${style.bg} ${style.border} shadow-sm hover:shadow-md transition-all duration-300`}
      style={{ animation: `fade-up 0.4s ease both`, animationDelay: `${delay}ms` }}
    >
      {/* Quote icon decorativa */}
      <Quote className="w-7 h-7 text-slate-200 absolute top-4 right-4" />

      {/* Frase */}
      <p className="text-slate-800 text-sm leading-relaxed font-medium pr-6">
        "{item.frase}"
      </p>

      {/* Meta */}
      <div className="flex flex-col gap-1.5 mt-auto">
        {item.museu && (
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
              {item.museu}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          {item.data && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {item.data}
            </span>
          )}
          {item.autor && item.autor !== 'null' && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {item.autor}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-1">
          <span className="flex items-center gap-1 text-xs text-slate-400 italic">
            <BookOpen className="w-3 h-3" />
            {item.fonte || 'Fonte: relatório interno'}
          </span>
          {item.report_id && (
            <a
              href={`/ReportEditor?id=${item.report_id}`}
              className="flex items-center gap-0.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
            >
              Ver relatório
              <ChevronRight className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50 space-y-3 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-full" />
      <div className="h-4 bg-slate-200 rounded w-4/5" />
      <div className="h-4 bg-slate-200 rounded w-3/5" />
      <div className="h-3 bg-slate-100 rounded w-1/3 mt-4" />
    </div>
  );
}

export default function DiariamenteNosMuseus() {
  const [frases, setFrases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [museuFilter, setMuseuFilter] = useState('Todos');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (museu) => {
    setLoading(true);
    setFrases([]);
    try {
      const res = await base44.functions.invoke('extrairFrasesMuseus', {
        museu: museu === 'Todos' ? null : museu,
        limit: 6,
      });
      setFrases(res?.data?.frases || []);
    } catch (e) {
      console.error('DiariamenteNosMuseus:', e);
      setFrases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(museuFilter);
  }, [museuFilter, refreshKey, load]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Diariamente nos Museus</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Fragmentos positivos dos relatórios que revelam o cotidiano vivo dos museus.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro museu */}
          <div className="flex gap-1">
            {MUSEUS.map((m) => (
              <button
                key={m}
                onClick={() => setMuseuFilter(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  museuFilter === m
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Atualizar */}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs text-slate-600 hover:border-slate-400 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Novas frases
          </button>
        </div>
      </div>

      {/* Separador decorativo */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-100" />
        <Quote className="w-4 h-4 text-slate-300" />
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : frases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Quote className="w-10 h-10 opacity-20" />
          <p className="text-sm">Nenhuma frase encontrada para este filtro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {frases.map((item, idx) => (
            <FraseCard key={idx} item={item} idx={idx} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}