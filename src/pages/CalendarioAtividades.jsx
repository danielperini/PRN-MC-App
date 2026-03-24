import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Filter, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format,
  isBefore,
  isSameMonth,
  startOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
} from 'date-fns';
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

function mapItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      if (!item?.data_iso) return null;

      const date = new Date(item.data_iso);

      return {
        id: `${item.row_index || index}-${item.titulo || index}`,
        titulo: item.titulo || `Atividade ${index + 1}`,
        descricao: item.descricao || '',
        classificacao: item.classificacao || '',
        equipe_responsavel: item.equipe || '',
        publico_estimado: item.publico_estimado || '',
        museu: item.museu || 'Externo',
        _date: date,
      };
    })
    .filter(Boolean);
}

function DayCell({ day, monthStart, activities, onSelectDay, selectedDay }) {
  const isCurrentMonth = isSameMonth(day, monthStart);
  const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;

  return (
    <button
      type="button"
      onClick={() => onSelectDay(day)}
      className={`min-h-[120px] border rounded-lg p-2 text-left transition ${
        isSelected ? 'ring-2 ring-black' : ''
      } ${isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-medium ${isCurrentMonth ? 'text-black' : 'text-gray-400'}`}>
          {format(day, 'd')}
        </span>
        {activities.length > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {activities.length}
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        {activities.slice(0, 3).map((activity) => (
          <div
            key={activity.id}
            className="rounded px-2 py-1 text-[10px] text-white truncate"
            style={{}}
          >
            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${MUSEU_COLORS[activity.museu] || 'bg-gray-400'}`}></span>
            <span className="text-gray-700">{activity.titulo}</span>
          </div>
        ))}

        {activities.length > 3 && (
          <div className="text-[10px] text-gray-500">
            + {activities.length - 3} mais
          </div>
        )}
      </div>
    </button>
  );
}

function ActivityCard({ activity }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`w-3 h-3 rounded-full ${MUSEU_COLORS[activity.museu] || 'bg-gray-400'}`} />
        <span className="font-semibold text-sm">{activity.titulo}</span>

        {activity.classificacao && (
          <Badge className={CLASSIF_COLORS[activity.classificacao] || 'bg-gray-200 text-gray-700'}>
            {activity.classificacao}
          </Badge>
        )}

        <Badge variant="outline">{activity.museu}</Badge>
      </div>

      <div className="text-xs text-gray-600">
        {format(activity._date, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        {activity.equipe_responsavel ? ` · ${activity.equipe_responsavel}` : ''}
      </div>

      {activity.descricao ? (
        <div className="text-sm text-gray-600">{activity.descricao}</div>
      ) : null}

      {activity.publico_estimado ? (
        <div className="text-xs text-gray-500">Público estimado: {activity.publico_estimado}</div>
      ) : null}
    </div>
  );
}

function CalendarioAtividadesInner() {
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');
  const [filtroEquipe, setFiltroEquipe] = useState('Todas');
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(new Date());

  const {
    data: mirrorData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['calendario-atividades-google-sheet'],
    queryFn: async () => {
      const res = await base44.functions.invoke('syncBaseConhecimento', {
        mode: 'calendario_atividades',
      });
      return res?.data || {};
    },
  });

  const todasAtividades = useMemo(() => {
    return mapItems(mirrorData?.items || []);
  }, [mirrorData]);

  const atividadesFiltradas = useMemo(() => {
    return todasAtividades.filter((a) => {
      if (filtroMuseu !== 'Todos' && a.museu !== filtroMuseu) return false;
      if (filtroEquipe !== 'Todas' && a.equipe_responsavel !== filtroEquipe) return false;
      return true;
    });
  }, [todasAtividades, filtroMuseu, filtroEquipe]);

  const hoje = startOfDay(new Date());

  const atividadesDoDiaSelecionado = useMemo(() => {
    return atividadesFiltradas
      .filter((a) => selectedDay && isSameDay(a._date, selectedDay))
      .sort((a, b) => a._date - b._date);
  }, [atividadesFiltradas, selectedDay]);

  const atividadesProximas = useMemo(() => {
    return atividadesFiltradas
      .filter((a) => !isBefore(a._date, hoje))
      .sort((a, b) => a._date - b._date)
      .slice(0, 8);
  }, [atividadesFiltradas, hoje]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const calendarDays = [];
  let day = calendarStart;

  while (day <= calendarEnd) {
    calendarDays.push(day);
    day = addDays(day, 1);
  }

  const activitiesByDayKey = useMemo(() => {
    const map = new Map();

    atividadesFiltradas.forEach((activity) => {
      const key = format(activity._date, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(activity);
    });

    return map;
  }, [atividadesFiltradas]);

  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="w-full py-6 md:py-10">
      <div className="max-w-7xl mx-auto px-4 md:px-6">

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6" />
            <h1 className="text-3xl font-bold">Agenda</h1>
          </div>

          <div className="flex gap-2 flex-wrap">
            {MUSEUS.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={filtroMuseu === m ? 'default' : 'outline'}
                onClick={() => setFiltroMuseu(m)}
              >
                {m}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>

            <Filter className="w-4 h-4 text-gray-500" />

            <Select value={filtroEquipe} onValueChange={setFiltroEquipe}>
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPES.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Badge variant="outline">
              {atividadesFiltradas.length} ações
            </Badge>
          </div>

          <div className="text-xs text-gray-500">
            Origem: Google Sheets em tempo real
            {mirrorData?.last_sync ? ` · Atualizado em ${new Date(mirrorData.last_sync).toLocaleString('pt-BR')}` : ''}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando agenda...</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">

            <div className="space-y-4">
              <div className="flex items-center justify-between border rounded-lg p-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <div className="text-lg font-semibold">
                  {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {diasSemana.map((diaSemana) => (
                  <div
                    key={diaSemana}
                    className="text-center text-xs font-semibold text-gray-500 py-2"
                  >
                    {diaSemana}
                  </div>
                ))}

                {calendarDays.map((dayItem) => {
                  const key = format(dayItem, 'yyyy-MM-dd');
                  const activities = activitiesByDayKey.get(key) || [];

                  return (
                    <DayCell
                      key={key}
                      day={dayItem}
                      monthStart={monthStart}
                      activities={activities}
                      onSelectDay={setSelectedDay}
                      selectedDay={selectedDay}
                    />
                  );
                })}
              </div>
            </div>

            <div className="space-y-6">
              <div className="border rounded-lg p-4">
                <div className="font-semibold mb-3">
                  {selectedDay
                    ? `Atividades em ${format(selectedDay, "d 'de' MMMM", { locale: ptBR })}`
                    : 'Atividades do dia'}
                </div>

                <div className="space-y-3">
                  {atividadesDoDiaSelecionado.length > 0 ? (
                    atividadesDoDiaSelecionado.map((activity) => (
                      <ActivityCard key={activity.id} activity={activity} />
                    ))
                  ) : (
                    <div className="text-sm text-gray-500">
                      Nenhuma atividade neste dia.
                    </div>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="font-semibold mb-3">Próximas ações</div>

                <div className="space-y-3">
                  {atividadesProximas.length > 0 ? (
                    atividadesProximas.map((activity) => (
                      <ActivityCard key={`next-${activity.id}`} activity={activity} />
                    ))
                  ) : (
                    <div className="text-sm text-gray-500">
                      Nenhuma ação futura encontrada.
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default function CalendarioAtividades() {
  return (
    <RequireAuth>
      <CalendarioAtividadesInner />
    </RequireAuth>
  );
}
