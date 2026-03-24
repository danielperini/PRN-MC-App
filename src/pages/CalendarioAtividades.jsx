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
  isSameMonth,
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
        equipe_responsavel: item.equipe || '',
        museu: item.museu || 'Externo',
        _date: date,
      };
    })
    .filter(Boolean);
}

function CalendarioAtividadesInner() {
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');
  const [filtroEquipe, setFiltroEquipe] = useState('Todas');
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(new Date());

  const { data: mirrorData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['calendario-atividades-google-sheet'],
    queryFn: async () => {
      const res = await base44.functions.invoke('syncBaseConhecimento');
      return res?.data || {};
    },
  });

  // 🔥 NOVO: usa timeline estruturado
  const todasAtividades = useMemo(() => {
    const timeline = mirrorData?.timeline_by_museum || {};
    const grupo = timeline[filtroMuseu] || timeline['Todos'] || {};

    const combinadas = [
      ...(grupo.futuras || []),
      ...(grupo.atuais || []),
      ...(grupo.passadas || [])
    ];

    return mapItems(combinadas);
  }, [mirrorData, filtroMuseu]);

  const atividadesFiltradas = useMemo(() => {
    return todasAtividades.filter((a) => {
      if (filtroEquipe !== 'Todas' && a.equipe_responsavel !== filtroEquipe) return false;
      return true;
    });
  }, [todasAtividades, filtroEquipe]);

  const atividadesDoDiaSelecionado = useMemo(() => {
    return atividadesFiltradas.filter((a) => isSameDay(a._date, selectedDay));
  }, [atividadesFiltradas, selectedDay]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

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

  return (
    <div className="w-full py-6">
      <div className="max-w-7xl mx-auto px-4">

        <div className="flex flex-col gap-4 mb-6">

          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6" />
            <h1 className="text-3xl font-bold">Agenda</h1>
          </div>

          {/* FILTRO MUSEU */}
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

          <div className="flex items-center gap-2">
            <Button onClick={() => refetch()}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>

            <Select value={filtroEquipe} onValueChange={setFiltroEquipe}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPES.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Badge>{atividadesFiltradas.length}</Badge>
          </div>

        </div>

        {isLoading ? (
          <div>Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">

            {/* CALENDÁRIO */}
            <div>

              <div className="flex justify-between mb-4">
                <Button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft />
                </Button>

                <div>{format(currentMonth, "MMMM yyyy", { locale: ptBR })}</div>

                <Button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((d) => {
                  const key = format(d, 'yyyy-MM-dd');
                  const acts = activitiesByDayKey.get(key) || [];

                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedDay(d)}
                      className="border p-2 cursor-pointer"
                    >
                      <div>{format(d, 'd')}</div>

                      {acts.map((a) => (
                        <div key={a.id} className="text-xs">
                          {a.titulo}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

            </div>

            {/* LATERAL */}
            <div>
              <h2 className="font-semibold mb-2">
                {format(selectedDay, "d MMMM", { locale: ptBR })}
              </h2>

              {atividadesDoDiaSelecionado.map((a) => (
                <div key={a.id} className="border p-2 mb-2">
                  {a.titulo}
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default function CalendarioAtividades() {
  return <RequireAuth><CalendarioAtividadesInner /></RequireAuth>;
}
