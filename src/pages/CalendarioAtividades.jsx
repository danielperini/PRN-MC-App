import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const MUSEUS = ['Todos', 'MHAB', 'MIS', 'MUMO', 'Externo'];
const EQUIPES = ['Todas', 'Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];

const CLASSIF_COLORS = {
  META: 'bg-blue-500 text-white',
  ROTINA: 'bg-green-500 text-white',
  EXTRA: 'bg-orange-500 text-white',
};

const MUSEU_COLORS = {
  MHAB: 'bg-purple-500',
  MIS: 'bg-cyan-500',
  MUMO: 'bg-pink-500',
  Externo: 'bg-gray-500',
};

function CalendarioAtividadesInner() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');
  const [filtroEquipe, setFiltroEquipe] = useState('Todas');
  const [selectedDay, setSelectedDay] = useState(null);

  // Buscar todos os relatórios
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['reports-calendario'],
    queryFn: () => base44.entities.Report.list('-updated_date', 500),
  });

  // Extrair todas as atividades com data
  const todasAtividades = useMemo(() => {
    const result = [];
    for (const report of reports) {
      const atividades = Array.isArray(report.atividades) ? report.atividades : [];
      for (const ativ of atividades) {
        if (!ativ.data_inicio) continue;
        const date = parseISO(ativ.data_inicio);
        if (!isValid(date)) continue;
        result.push({
          ...ativ,
          _reportId: report.id,
          _reportMuseu: report.museu || ativ.museu || '',
          _reportAuthor: report.author_name || '',
          _reportMes: report.mes_referencia || '',
          _date: date,
        });
      }
    }
    return result;
  }, [reports]);

  // Aplicar filtros
  const atividadesFiltradas = useMemo(() => {
    return todasAtividades.filter(a => {
      if (filtroMuseu !== 'Todos' && a._reportMuseu !== filtroMuseu && a.museu !== filtroMuseu) return false;
      if (filtroEquipe !== 'Todas' && a.equipe_responsavel !== filtroEquipe) return false;
      return true;
    });
  }, [todasAtividades, filtroMuseu, filtroEquipe]);

  // Dias do mês atual
  const diasDoMes = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  // Atividades por dia
  const atividadesPorDia = useMemo(() => {
    const map = {};
    for (const ativ of atividadesFiltradas) {
      const key = format(ativ._date, 'yyyy-MM-dd');
      if (!map[key]) map[key] = [];
      map[key].push(ativ);
    }
    return map;
  }, [atividadesFiltradas]);

  const primeiroDiaSemana = getDay(startOfMonth(currentDate)); // 0=dom
  const blanks = Array(primeiroDiaSemana).fill(null);

  const atividadesDoDiaSelected = selectedDay
    ? (atividadesPorDia[format(selectedDay, 'yyyy-MM-dd')] || [])
    : [];

  const prevMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="w-full py-6 md:py-10">
      <div className="max-w-6xl mx-auto px-4 md:px-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-black" />
            <h1 className="text-2xl font-bold text-black">Calendário de Atividades</h1>
          </div>
          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select value={filtroMuseu} onValueChange={setFiltroMuseu}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroEquipe} onValueChange={setFiltroEquipe}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">
              {atividadesFiltradas.length} atividade(s)
            </Badge>
          </div>
        </div>

        {/* Navegação do mês */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-5 h-5" /></Button>
          <h2 className="text-lg font-semibold capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-5 h-5" /></Button>
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          {Object.entries(CLASSIF_COLORS).map(([k, v]) => (
            <span key={k} className={`px-2 py-0.5 rounded-full font-medium ${v}`}>{k}</span>
          ))}
          <span className="text-gray-400 ml-2">· Clique num dia para ver detalhes</span>
        </div>

        {/* Grid calendário */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando atividades...</div>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Cabeçalho dias da semana */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500">{d}</div>
              ))}
            </div>
            {/* Células */}
            <div className="grid grid-cols-7">
              {blanks.map((_, i) => (
                <div key={`blank-${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50/50" />
              ))}
              {diasDoMes.map(dia => {
                const key = format(dia, 'yyyy-MM-dd');
                const ativs = atividadesPorDia[key] || [];
                const isSelected = selectedDay && isSameDay(dia, selectedDay);
                const isToday = isSameDay(dia, new Date());

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedDay(isSelected ? null : dia)}
                    className={`min-h-[80px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-black/5 ring-2 ring-inset ring-black' :
                      isToday ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-black text-white' : 'text-gray-700'
                    }`}>
                      {format(dia, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {ativs.slice(0, 3).map((a, i) => (
                        <div
                          key={i}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${
                            CLASSIF_COLORS[a.classificacao] || 'bg-gray-200 text-gray-700'
                          }`}
                          title={a.nome || 'Atividade'}
                        >
                          {a.nome || 'Atividade'}
                        </div>
                      ))}
                      {ativs.length > 3 && (
                        <div className="text-[10px] text-gray-400 pl-1">+{ativs.length - 3} mais</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Painel de detalhes do dia selecionado */}
        {selectedDay && (
          <div className="mt-6 border border-gray-200 rounded-xl p-5">
            <h3 className="font-semibold text-black mb-4">
              {format(selectedDay, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({atividadesDoDiaSelected.length} atividade(s))
              </span>
            </h3>
            {atividadesDoDiaSelected.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma atividade neste dia com os filtros aplicados.</p>
            ) : (
              <div className="space-y-3">
                {atividadesDoDiaSelected.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg">
                    <div className={`w-2 h-full min-h-[40px] rounded-full flex-shrink-0 ${MUSEU_COLORS[a._reportMuseu] || 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm text-black">{a.nome || 'Atividade sem nome'}</span>
                        {a.classificacao && (
                          <Badge className={`text-[10px] px-1.5 py-0 ${CLASSIF_COLORS[a.classificacao] || ''}`}>
                            {a.classificacao}
                          </Badge>
                        )}
                        {a._reportMuseu && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a._reportMuseu}</Badge>
                        )}
                        {a.equipe_responsavel && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a.equipe_responsavel}</Badge>
                        )}
                      </div>
                      {a.objetivo && <p className="text-xs text-gray-600 line-clamp-2">{a.objetivo}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {a._reportAuthor} · {a._reportMes}
                        {a.publico_estimado ? ` · ${a.publico_estimado} pessoas` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CalendarioAtividades() {
  return <RequireAuth><CalendarioAtividadesInner /></RequireAuth>;
}