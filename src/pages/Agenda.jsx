import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toastMessages } from '@/lib/toastMessages';
import { ChevronLeft, ChevronRight, MapPin, Users, Ticket, ExternalLink, Calendar, Search, Clock } from 'lucide-react';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO', 'Externo'];

const MUSEU_CONFIG = {
  MIS:     { color: 'bg-blue-600',    light: 'bg-blue-50 text-blue-700 border-blue-200',   dot: 'bg-blue-500',    bar: 'border-l-blue-500' },
  MHAB:    { color: 'bg-emerald-600', light: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', bar: 'border-l-emerald-500' },
  MUMO:    { color: 'bg-violet-600',  light: 'bg-violet-50 text-violet-700 border-violet-200',   dot: 'bg-violet-500',  bar: 'border-l-violet-500' },
  Externo: { color: 'bg-slate-500',   light: 'bg-slate-100 text-slate-600 border-slate-200',  dot: 'bg-slate-400',   bar: 'border-l-slate-400' },
};

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}
function formatMonthLabel(key) {
  return parseMonthKey(key).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function prevMonth(key) {
  const d = parseMonthKey(key);
  d.setMonth(d.getMonth() - 1);
  return getMonthKey(d);
}
function nextMonth(key) {
  const d = parseMonthKey(key);
  d.setMonth(d.getMonth() + 1);
  return getMonthKey(d);
}

function ActivityCard({ item }) {
  const museu = item.museu || 'Externo';
  const cfg = MUSEU_CONFIG[museu] || MUSEU_CONFIG.Externo;

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${cfg.bar} shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col overflow-hidden`}>
      {/* Header colorido */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.light}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {museu}
        </span>
        {item.data && (
          <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
            <Calendar className="w-3 h-3" />
            <span className="truncate max-w-[130px]">{item.data}</span>
          </span>
        )}
      </div>

      {/* Corpo */}
      <div className="px-4 pb-4 flex-1 flex flex-col gap-3">
        <div>
          <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">
            {item.titulo || item.nome_acao || '—'}
          </h3>
          {item.horario && (
            <p className="flex items-center gap-1 text-xs text-slate-500 mt-1">
              <Clock className="w-3 h-3" />
              {item.horario}
            </p>
          )}
        </div>

        {(item.sinopse || item.descricao) && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
            {item.sinopse || item.descricao}
          </p>
        )}

        <div className="space-y-1.5 text-xs text-slate-600 mt-auto">
          {item.local && (
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
              <span className="line-clamp-1">{item.local}</span>
            </div>
          )}
          {item.publico_alvo && (
            <div className="flex items-start gap-1.5">
              <Users className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
              <span className="line-clamp-1">{item.publico_alvo}</span>
            </div>
          )}
          {item.vagas && (
            <div className="flex items-start gap-1.5">
              <Ticket className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
              <span><strong>Vagas:</strong> {item.vagas}</span>
            </div>
          )}
          {item.inscricao && (
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 text-slate-400 mt-0.5">📋</span>
              <span className="line-clamp-2"><strong>Inscrição:</strong> {item.inscricao}</span>
            </div>
          )}
        </div>
      </div>

      {item.link_imagens && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 mt-1">
          <a
            href={item.link_imagens}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Ver material de comunicação
          </a>
        </div>
      )}
    </div>
  );
}

function MuseuFilterBtn({ museu, active, count, onClick }) {
  const cfg = MUSEU_CONFIG[museu];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        active
          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
      }`}
    >
      {cfg && (
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : cfg.dot}`} />
      )}
      {museu}
      {count !== undefined && (
        <span className={`ml-0.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>
          ({count})
        </span>
      )}
    </button>
  );
}

export default function Agenda() {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(getMonthKey(new Date()));
  const [museuFilter, setMuseuFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await base44.entities.Programacao.list('-data_inicio', 5000);
        const items = Array.isArray(data) ? data : [];
        setAllItems(items);

        const monthSet = new Set();
        items.forEach((item) => {
          const key = item.month_key || (item.data_inicio ? getMonthKey(new Date(item.data_inicio)) : null);
          if (key) monthSet.add(key);
        });
        const sorted = Array.from(monthSet).sort().reverse();
        setAvailableMonths(sorted);

        if (sorted.length > 0 && !monthSet.has(getMonthKey(new Date()))) {
          setCurrentMonth(sorted[0]);
        }
      } catch (e) {
        console.error('Erro ao carregar agenda:', e);
        toastMessages.warning('Erro ao carregar agenda. Tente novamente.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const itemsInMonth = allItems.filter((item) => {
    const key = item.month_key || (item.data_inicio ? getMonthKey(new Date(item.data_inicio)) : '');
    return key === currentMonth;
  });

  const filtered = itemsInMonth.filter((item) => {
    if (museuFilter !== 'Todos' && item.museu !== museuFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (item.titulo || item.nome_acao || '').toLowerCase().includes(q) ||
        (item.sinopse || item.descricao || '').toLowerCase().includes(q) ||
        (item.local || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Contagem por museu no mês atual
  const countByMuseu = MUSEUS.reduce((acc, m) => {
    acc[m] = m === 'Todos'
      ? itemsInMonth.length
      : itemsInMonth.filter((i) => i.museu === m).length;
    return acc;
  }, {});

  const hasPrev = availableMonths.includes(prevMonth(currentMonth));
  const hasNext = availableMonths.includes(nextMonth(currentMonth));

  const monthLabel = formatMonthLabel(currentMonth);
  const [monthName, yearName] = monthLabel.split(' de ');

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Agenda</h1>
          <p className="text-sm text-slate-500 mt-0.5">Programação dos Museus Centro · Viaduto das Artes</p>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm w-fit">
          <button
            disabled={!hasPrev}
            onClick={() => setCurrentMonth(prevMonth(currentMonth))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div className="text-center min-w-[130px]">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium leading-none">{yearName}</p>
            <p className="text-base font-bold text-slate-900 capitalize leading-tight mt-0.5">{monthName}</p>
          </div>
          <button
            disabled={!hasNext}
            onClick={() => setCurrentMonth(nextMonth(currentMonth))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Busca */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar atividade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* Filtros museu */}
        <div className="flex gap-1.5 flex-wrap">
          {MUSEUS.map((m) => (
            <MuseuFilterBtn
              key={m}
              museu={m}
              active={museuFilter === m}
              count={countByMuseu[m]}
              onClick={() => setMuseuFilter(m)}
            />
          ))}
        </div>

        <span className="text-xs text-slate-400 sm:ml-auto whitespace-nowrap">
          {filtered.length} atividade{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
          <p className="text-sm">Carregando agenda...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <Calendar className="w-12 h-12 opacity-20" />
          <p className="text-sm font-medium">Nenhuma atividade encontrada</p>
          <p className="text-xs text-slate-400 capitalize">{monthLabel}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item, idx) => (
            <ActivityCard key={item.id || idx} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}