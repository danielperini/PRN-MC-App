import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toastMessages } from '@/lib/toastMessages';
import LoadingPage from '@/components/common/LoadingPage';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Users,
  Ticket,
  ExternalLink,
  Calendar,
  Search,
  Clock
} from 'lucide-react';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO', 'Externo'];

const MUSEU_CONFIG = {
  MIS: {
    color: 'bg-blue-600',
    light: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    bar: 'border-l-blue-500'
  },
  MHAB: {
    color: 'bg-emerald-600',
    light: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    bar: 'border-l-emerald-500'
  },
  MUMO: {
    color: 'bg-violet-600',
    light: 'bg-violet-50 text-violet-700 border-violet-200',
    dot: 'bg-violet-500',
    bar: 'border-l-violet-500'
  },
  Externo: {
    color: 'bg-slate-500',
    light: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    bar: 'border-l-slate-400'
  },
};

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function formatMonthLabel(key) {
  return parseMonthKey(key).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
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
    <div className={`bg-card rounded-2xl border border-border border-l-4 ${cfg.bar} shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col overflow-hidden`}>
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.light}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {museu}
        </span>

        {item.data && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Calendar className="w-3 h-3" />
            <span className="truncate max-w-[130px]">{item.data}</span>
          </span>
        )}
      </div>

      <div className="px-4 pb-4 flex-1 flex flex-col gap-3">
        <div>
          <h3 className="font-bold text-foreground text-sm leading-snug line-clamp-2">
            {item.titulo || item.nome_acao || '—'}
          </h3>

          {item.horario && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Clock className="w-3 h-3" />
              {item.horario}
            </p>
          )}
        </div>

        {(item.sinopse || item.descricao) && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {item.sinopse || item.descricao}
          </p>
        )}

        <div className="space-y-1.5 text-xs text-foreground mt-auto">
          {item.local && (
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="line-clamp-1">{item.local}</span>
            </div>
          )}

          {item.publico_alvo && (
            <div className="flex items-start gap-1.5">
              <Users className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="line-clamp-1">{item.publico_alvo}</span>
            </div>
          )}

          {item.vagas && (
            <div className="flex items-start gap-1.5">
              <Ticket className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span>
                <strong>Vagas:</strong> {item.vagas}
              </span>
            </div>
          )}

          {item.inscricao && (
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 text-muted-foreground mt-0.5">📋</span>
              <span className="line-clamp-2">
                <strong>Inscrição:</strong> {item.inscricao}
              </span>
            </div>
          )}
        </div>
      </div>

      {item.link_imagens && (
        <div className="px-4 pb-4 border-t border-border pt-3 mt-1">
          <a
            href={item.link_imagens}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
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
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-card text-foreground border-border hover:border-muted-foreground'
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
  const [loadError, setLoadError] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(getMonthKey(new Date()));
  const [museuFilter, setMuseuFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setLoadError(false);

      try {
        const data = await base44.entities.Programacao.list('-data_inicio', 5000);
        const items = Array.isArray(data) ? data : [];

        if (!mounted) return;

        setAllItems(items);

        const monthSet = new Set();

        items.forEach((item) => {
          const key =
            item.month_key ||
            (item.data_inicio ? getMonthKey(new Date(item.data_inicio)) : null);

          if (key) {
            monthSet.add(key);
          }
        });

        const sorted = Array.from(monthSet).sort().reverse();

        setAvailableMonths(sorted);

        if (sorted.length > 0 && !monthSet.has(getMonthKey(new Date()))) {
          setCurrentMonth(sorted[0]);
        }
      } catch (e) {
        console.error('Erro ao carregar agenda:', e);

        if (!mounted) return;

        setLoadError(true);
        toastMessages.warning('Erro ao carregar agenda. Tente novamente.');
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <LoadingPage
        fullHeight={false}
        message="Carregando página..."
        description="Estamos carregando a agenda completa, meses disponíveis, filtros e programação dos museus. Aguarde alguns instantes."
      />
    );
  }

  if (loadError) {
    return (
      <LoadingPage
        fullHeight={false}
        error
        errorTitle="Não foi possível carregar a agenda"
        errorDescription="Atualize a página ou tente novamente em alguns instantes."
      />
    );
  }

  const itemsInMonth = allItems.filter((item) => {
    const key =
      item.month_key ||
      (item.data_inicio ? getMonthKey(new Date(item.data_inicio)) : '');

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

  const countByMuseu = MUSEUS.reduce((acc, m) => {
    acc[m] =
      m === 'Todos'
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Agenda
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Programação dos Museus Centro · Viaduto das Artes
          </p>
        </div>

        <div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2 shadow-sm w-fit">
          <button
            disabled={!hasPrev}
            onClick={() => setCurrentMonth(prevMonth(currentMonth))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>

          <div className="text-center min-w-[130px]">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium leading-none">
              {yearName}
            </p>
            <p className="text-base font-bold text-foreground capitalize leading-tight mt-0.5">
              {monthName}
            </p>
          </div>

          <button
            disabled={!hasNext}
            onClick={() => setCurrentMonth(nextMonth(currentMonth))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

          <input
            type="text"
            placeholder="Buscar atividade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

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

        <span className="text-xs text-muted-foreground sm:ml-auto whitespace-nowrap">
          {filtered.length} atividade{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Calendar className="w-12 h-12 opacity-20" />
          <p className="text-sm font-medium">Nenhuma atividade encontrada</p>
          <p className="text-xs text-muted-foreground capitalize">{monthLabel}</p>
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
