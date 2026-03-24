import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Calendar, RefreshCw, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  format,
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
        id: `${item.row_index || index}-${item.nome || item.titulo || index}`,
        nome: item.nome || item.titulo || `Atividade ${index + 1}`,
        descricao: item.sinopse || item.descricao || '',
        horario: item.horario || '',
        vagas: item.vagas || '',
        inscricao: item.inscricao || item.inscricao_acesso || '',
        link: item.link || '',
        museu: item.museu || 'Externo',
        _date: date,
        raw: item,
      };
    })
    .filter(Boolean);
}

function CalendarioAtividadesInner() {
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(new Date());

  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const { data: mirrorData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['calendario-atividades-google-sheet'],
    queryFn: async () => {
      const res = await base44.functions.invoke('syncBaseConhecimento');
      return res?.data || {};
    },
  });

  const todasAtividades = useMemo(() => {
    const timeline = mirrorData?.timeline_by_museum || {};
    const grupo = timeline[filtroMuseu] || timeline.Todos || {};

    const combinadas = [
      ...(grupo.futuras || []),
      ...(grupo.atuais || []),
      ...(grupo.passadas || []),
    ];

    return mapItems(combinadas);
  }, [mirrorData, filtroMuseu]);

  const atividadesDoDiaSelecionado = useMemo(() => {
    return todasAtividades.filter((a) => isSameDay(a._date, selectedDay));
  }, [todasAtividades, selectedDay]);

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

    todasAtividades.forEach((activity) => {
      const key = format(activity._date, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(activity);
    });

    return map;
  }, [todasAtividades]);

  const abrirNovo = () => {
    setForm({
      nome: '',
      data: format(selectedDay, 'yyyy-MM-dd'),
      museu: 'MIS',
      horario: '',
      vagas: '',
      inscricao: '',
      descricao: '',
      link: '',
    });
    setShowEditor(true);
  };

  const abrirEditar = (item) => {
    setForm({
      ...item.raw,
      nome: item.raw?.nome || item.raw?.titulo || '',
      descricao: item.raw?.descricao || item.raw?.sinopse || '',
      inscricao: item.raw?.inscricao || item.raw?.inscricao_acesso || '',
      link: item.raw?.link || '',
    });
    setShowEditor(true);
  };

  const salvar = async () => {
    setSaving(true);

    try {
      const res = await base44.functions.invoke('updateProgramacaoMuseu', {
        data: form,
      });

      if (res?.data?.locked) {
        alert('Este mês já está bloqueado para edição');
        return;
      }

      await refetch();
      alert(res?.data?.message || 'Salvo e sincronizado com sucesso');
      setShowEditor(false);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        'Erro ao salvar';

      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full py-6">
      <div className="max-w-7xl mx-auto px-4">
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

          <div className="flex items-center gap-2">
            <Button onClick={() => refetch()}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>

            <Button onClick={abrirNovo}>
              <Plus className="w-4 h-4 mr-2" />
              Nova atividade
            </Button>

            <Badge>{todasAtividades.length}</Badge>
          </div>
        </div>

        {isLoading ? (
          <div>Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
            <div>
              <div className="flex justify-between mb-4">
                <Button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft />
                </Button>

                <div>{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</div>

                <Button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((d) => {
                  const key = format(d, 'yyyy-MM-dd');
                  const acts = activitiesByDayKey.get(key) || [];

                  const agrupado = {};
                  acts.forEach((a) => {
                    if (!agrupado[a.museu]) agrupado[a.museu] = [];
                    agrupado[a.museu].push(a);
                  });

                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedDay(d)}
                      className="border p-2 cursor-pointer hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium">{format(d, 'd')}</div>

                      {Object.entries(agrupado).map(([museu, lista]) => (
                        <div key={museu} className="mt-1">
                          <div className="text-[10px] font-bold">{museu}</div>
                          {lista.map((a) => (
                            <div key={a.id} className="text-[10px] truncate">
                              {a.nome}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="font-semibold mb-3">
                {format(selectedDay, 'd MMMM yyyy', { locale: ptBR })}
              </h2>

              {atividadesDoDiaSelecionado.map((a) => (
                <div key={a.id} className="border p-3 mb-3 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold">{a.nome}</div>
                    <div className={`w-2 h-2 rounded-full ${MUSEU_COLORS[a.museu] || 'bg-gray-400'}`} />
                  </div>

                  <div className="text-xs text-gray-500">
                    {[a.museu, a.horario].filter(Boolean).join(' · ')}
                  </div>

                  {a.descricao ? (
                    <div className="text-sm mt-2">{a.descricao}</div>
                  ) : null}

                  <div className="text-xs text-gray-600 mt-2 space-y-1">
                    {a.vagas ? <div>Vagas: {a.vagas}</div> : null}
                    {a.inscricao ? <div>{a.inscricao}</div> : null}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => abrirEditar(a)}>
                      Editar
                    </Button>

                    {a.link ? (
                      <Button size="sm" variant="outline" onClick={() => window.open(a.link, '_blank')}>
                        Saiba mais
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Editar atividade' : 'Nova atividade'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              placeholder="Nome"
              value={form.nome || ''}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />

            <Input
              placeholder="Data"
              value={form.data || ''}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />

            <Input
              placeholder="Museu"
              value={form.museu || ''}
              onChange={(e) => setForm({ ...form, museu: e.target.value })}
            />

            <Input
              placeholder="Horário"
              value={form.horario || ''}
              onChange={(e) => setForm({ ...form, horario: e.target.value })}
            />

            <Input
              placeholder="Vagas"
              value={form.vagas || ''}
              onChange={(e) => setForm({ ...form, vagas: e.target.value })}
            />

            <Input
              placeholder="Inscrição"
              value={form.inscricao || ''}
              onChange={(e) => setForm({ ...form, inscricao: e.target.value })}
            />

            <Input
              placeholder="Link"
              value={form.link || ''}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />

            <Input
              placeholder="Descrição"
              value={form.descricao || ''}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button onClick={salvar} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar e sincronizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
