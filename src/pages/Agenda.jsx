import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, MapPin, Users, Ticket, ExternalLink, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO', 'Externo'];

const MUSEU_COLORS = {
  MIS: 'bg-blue-100 text-blue-800 border-blue-200',
  MHAB: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  MUMO: 'bg-purple-100 text-purple-800 border-purple-200',
  Externo: 'bg-slate-100 text-slate-600 border-slate-200',
};

const MUSEU_ACCENT = {
  MIS: 'border-l-blue-400',
  MHAB: 'border-l-emerald-400',
  MUMO: 'border-l-purple-400',
  Externo: 'border-l-slate-300',
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
  const accent = MUSEU_ACCENT[museu] || 'border-l-slate-300';
  const badge = MUSEU_COLORS[museu] || MUSEU_COLORS.Externo;

  return (
    <div className={`bg-white rounded-xl border-2 border-black border-l-4 ${accent} shadow-sm hover:shadow-md transition-shadow flex flex-col font-sans`}>
      <div className="p-4 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <Badge className={`text-xs font-medium border ${badge} shrink-0`}>{museu}</Badge>
          {item.data && (
            <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0">
              <Calendar className="w-3 h-3" />
              {item.data}
              {item.horario ? ` · ${item.horario}` : ''}
            </span>
          )}
        </div>

        {/* Nome da ação */}
        <h3 className="font-semibold text-slate-800 text-sm leading-snug mb-2 line-clamp-2">
          {item.titulo || item.nome_acao || '—'}
        </h3>

        {/* Sinopse */}
        {(item.sinopse || item.descricao) && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 mb-3">
            {item.sinopse || item.descricao}
          </p>
        )}

        {/* Infos */}
        <div className="space-y-1.5 text-xs text-slate-600">
          {item.local && (
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
              <span>{item.local}</span>
            </div>
          )}
          {item.publico_alvo && (
            <div className="flex items-start gap-1.5">
              <Users className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
              <span>{item.publico_alvo}</span>
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
              <span className="text-slate-400 mt-0.5">📋</span>
              <span><strong>Inscrição:</strong> {item.inscricao}</span>
            </div>
          )}
        </div>
      </div>

      {/* Link */}
      {item.link_imagens && (
        <div className="px-4 pb-4">
          <a
            href={item.link_imagens}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <ExternalLink className="w-3 h-3" />
            Ver material de comunicação
          </a>
        </div>
      )}
    </div>
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
      setLoading(false);
    }
    load();
  }, []);

  const filtered = allItems.filter((item) => {
    const key = item.month_key || (item.data_inicio ? getMonthKey(new Date(item.data_inicio)) : '');
    if (key !== currentMonth) return false;
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

  const hasPrev = availableMonths.includes(prevMonth(currentMonth));
  const hasNext = availableMonths.includes(nextMonth(currentMonth));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Agenda Museu Centro</h1>
          <p className="text-sm text-slate-500">Programação dos Museus Centro</p>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={!hasPrev} onClick={() => setCurrentMonth(prevMonth(currentMonth))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="capitalize font-semibold text-slate-700 min-w-[170px] text-center text-sm">
            {formatMonthLabel(currentMonth)}
          </span>
          <Button variant="outline" size="icon" disabled={!hasNext} onClick={() => setCurrentMonth(nextMonth(currentMonth))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Buscar atividade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex gap-1 flex-wrap">
          {MUSEUS.map((m) => (
            <Button
              key={m}
              variant={museuFilter === m ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMuseuFilter(m)}
            >
              {m}
            </Button>
          ))}
        </div>
        <span className="text-sm text-slate-400 ml-auto">
          {filtered.length} atividade{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">Carregando agenda...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Calendar className="w-10 h-10 mb-3 opacity-30" />
          <p>Nenhuma atividade encontrada para {formatMonthLabel(currentMonth)}.</p>
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