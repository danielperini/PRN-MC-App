import React, { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Quote, MapPin, Calendar, User, RefreshCw, BookOpen, ChevronRight } from 'lucide-react';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];

const MUSEU_COLORS = {
  MIS:  { bg: 'bg-white', accentBar: 'bg-blue-600',  badge: 'bg-blue-600 text-white',   dot: 'bg-blue-600' },
  MHAB: { bg: 'bg-white', accentBar: 'bg-emerald-700', badge: 'bg-emerald-700 text-white', dot: 'bg-emerald-700' },
  MUMO: { bg: 'bg-white', accentBar: 'bg-violet-700', badge: 'bg-violet-700 text-white', dot: 'bg-violet-700' },
};

function getMuseuStyle(museu) {
  for (const key of Object.keys(MUSEU_COLORS)) {
    if (museu && museu.toUpperCase().includes(key)) return MUSEU_COLORS[key];
  }
  return { bg: 'bg-white', accentBar: 'bg-slate-700', badge: 'bg-slate-800 text-white', dot: 'bg-slate-700' };
}

function FraseCard({ item, idx }) {
  const style = getMuseuStyle(item.museu);
  const delay = idx * 80;
  const hasThumb = item.imagem_url && item.imagem_url.length > 0;
  const autorValido = item.autor && item.autor !== 'null' && item.autor !== 'undefined';

  return (
    <div
      className="relative flex flex-col rounded-xl bg-white overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
      style={{
        border: '1px solid rgba(0,0,0,0.18)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        animation: `fade-up 0.4s ease both`,
        animationDelay: `${delay}ms`,
      }}
    >
      {/* Barra de acento colorido no topo */}
      <div className={`h-1 w-full ${style.accentBar} shrink-0`} />

      {/* Thumbnail — menor e proporcional */}
      {hasThumb && (
        <div className="w-full h-24 overflow-hidden shrink-0">
          <img
            src={item.imagem_url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Corpo */}
      <div className="flex flex-col gap-2.5 p-4 flex-1">
        {/* Quote + frase */}
        <div className="relative">
          <Quote className="w-4 h-4 text-slate-300 mb-1" />
          <p className="text-slate-900 text-sm leading-relaxed font-medium">
            {item.frase}
          </p>
        </div>

        {/* Autor */}
        {autorValido && (
          <div className="flex items-center gap-2 mt-0.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${style.badge}`}>
              {item.autor.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-slate-700 font-semibold truncate">{item.autor}</span>
          </div>
        )}

        {/* Rodapé */}
        <div
          className="mt-auto pt-2.5 flex flex-col gap-1.5"
          style={{ borderTop: '1px solid rgba(0,0,0,0.12)' }}
        >
          <div className="flex items-center justify-between">
            {item.museu && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm tracking-wide uppercase ${style.badge}`}>
                {item.museu}
              </span>
            )}
            {item.data && (
              <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                <Calendar className="w-3 h-3" />
                {item.data}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <BookOpen className="w-3 h-3" />
              {item.fonte || 'Relatório interno'}
            </span>
            {item.report_id && (
              <a
                href={`/ReportEditor?id=${item.report_id}`}
                className="flex items-center gap-0.5 text-[10px] text-slate-600 hover:text-slate-900 font-semibold transition-colors"
              >
                Ver relatório
                <ChevronRight className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden animate-pulse" style={{ border: '1px solid rgba(0,0,0,0.12)' }}>
      <div className="h-1 bg-slate-300" />
      <div className="h-24 bg-slate-100" />
      <div className="p-4 space-y-3 bg-white">
        <div className="h-3 bg-slate-200 rounded w-full" />
        <div className="h-3 bg-slate-200 rounded w-4/5" />
        <div className="h-3 bg-slate-200 rounded w-3/5" />
        <div className="h-2 bg-slate-100 rounded w-1/3 mt-3" />
      </div>
    </div>
  );
}

// Calcula o seed do dia: dia muda às 6h da manhã (horário de Brasília)
function getDailySeed() {
  const now = new Date();
  // BRT = UTC-3, então 6h BRT = 9h UTC
  const utcHour = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  // Se ainda não passou das 9h UTC (6h BRT), usa data de ontem como seed
  const d = new Date(now);
  if (utcHour < 9 || (utcHour === 9 && utcMinutes === 0)) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getCacheKey(museu) {
  return `diariamente_museus_${getDailySeed()}_${museu}`;
}

export default function DiariamenteNosMuseus() {
  const [frases, setFrases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [museuFilter, setMuseuFilter] = useState('Todos');
  const [forceRefresh, setForceRefresh] = useState(false);

  const load = useCallback(async (museu, force = false) => {
    setLoading(true);
    setFrases([]);

    const cacheKey = getCacheKey(museu);

    // Usar cache do dia se disponível e não forçando refresh
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.frases?.length > 0) {
            setFrases(parsed.frases);
            setLoading(false);
            return;
          }
        }
      } catch {}
    }

    try {
      const res = await base44.functions.invoke('extrairFrasesMuseus', {
        museu: museu === 'Todos' ? null : museu,
        limit: 3,
        daily_seed: getDailySeed(),
      });
      const resultado = res?.data?.frases || [];
      setFrases(resultado);

      // Salvar no cache diário
      if (resultado.length > 0) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ frases: resultado }));
        } catch {}
      }
    } catch (e) {
      console.error('DiariamenteNosMuseus:', e);
      setFrases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(museuFilter, forceRefresh);
    if (forceRefresh) setForceRefresh(false);
  }, [museuFilter, forceRefresh, load]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Diariamente nos Museus</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            3 fragmentos selecionados hoje — renova às 6h. Curadoria automática dos relatórios aprovados.
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
            onClick={() => {
              // Limpa cache do dia para forçar nova chamada IA
              try { localStorage.removeItem(getCacheKey(museuFilter)); } catch {}
              setForceRefresh(true);
            }}
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
        <div className="flex-1 h-px bg-slate-300" />
        <Quote className="w-4 h-4 text-slate-500" />
        <div className="flex-1 h-px bg-slate-300" />
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : frases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Quote className="w-10 h-10 opacity-20" />
          <p className="text-sm">Nenhuma frase encontrada para este filtro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {frases.slice(0, 3).map((item, idx) => (
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