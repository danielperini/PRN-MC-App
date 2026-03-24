import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Filter, ChevronDown, RefreshCw } from 'lucide-react';
import { format, isBefore, startOfDay } from 'date-fns';
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
        id: `${item.row_index || index}-${item.titulo}`,
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

function CalendarioAtividadesInner() {
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');
  const [filtroEquipe, setFiltroEquipe] = useState('Todas');
  const [expandedGroup, setExpandedGroup] = useState(null);

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

  const atividadesAgrupadasPeriodo = useMemo(() => {
    const proximas = [];
    const passadas = [];

    for (const ativ of atividadesFiltradas) {
      if (isBefore(ativ._date, hoje)) {
        passadas.push(ativ);
      } else {
        proximas.push(ativ);
      }
    }

    proximas.sort((a, b) => a._date - b._date);
    passadas.sort((a, b) => b._date - a._date);

    return { proximas, passadas };
  }, [atividadesFiltradas, hoje]);

  return (
    <div className="w-full py-6 md:py-10">
      <div className="max-w-5xl mx-auto px-4 md:px-6">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-black" />
            <h1 className="text-3xl font-bold text-black">Agenda</h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>

            <Filter className="w-4 h-4 text-gray-500" />

            <Select value={filtroMuseu} onValueChange={setFiltroMuseu}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MUSEUS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filtroEquipe} onValueChange={setFiltroEquipe}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EQUIPES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>

            <Badge variant="outline" className="text-xs">
              {atividadesFiltradas.length} ações
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-2 text-xs">
          {Object.entries(CLASSIF_COLORS).map(([k, v]) => (
            <span key={k} className={`px-2 py-0.5 rounded-full font-medium ${v}`}>{k}</span>
          ))}
        </div>

        <div className="text-xs text-gray-500 mb-6">
          Origem: Google Sheets em tempo real
          {mirrorData?.last_sync ? ` · Atualizado em ${new Date(mirrorData.last_sync).toLocaleString('pt-BR')}` : ''}
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando ações...</div>
        ) : atividadesFiltradas.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma ação encontrada</p>
          </div>
        ) : (
          <div className="space-y-6">

            {atividadesAgrupadasPeriodo.proximas.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedGroup(expandedGroup === 'proximas' ? null : 'proximas')}
                  className="w-full flex items-center gap-3 mb-4"
                >
                  <ChevronDown className={`w-5 h-5 ${expandedGroup === 'proximas' ? 'rotate-180' : ''}`} />
                  <h2 className="text-lg font-semibold">Próximas Ações</h2>
                  <Badge className="ml-auto">{atividadesAgrupadasPeriodo.proximas.length}</Badge>
                </button>

                {(expandedGroup === 'proximas' || expandedGroup === null) && (
                  <div className="space-y-3 pl-8">
                    {atividadesAgrupadasPeriodo.proximas.map((a) => (
                      <div key={a.id} className="flex gap-4 p-4 border rounded-lg">
                        <div className={`w-3 h-3 rounded-full mt-1.5 ${MUSEU_COLORS[a.museu]}`} />
                        <div>
                          <div className="flex gap-2 mb-1">
                            <span className="font-semibold text-sm">{a.titulo}</span>
                            {a.classificacao && (
                              <Badge className={CLASSIF_COLORS[a.classificacao]}>
                                {a.classificacao}
                              </Badge>
                            )}
                          </div>

                          <div className="text-xs text-gray-600">
                            {format(a._date, "d 'de' MMMM", { locale: ptBR })} · {a.museu} · {a.equipe_responsavel}
                          </div>

                          {a.descricao && (
                            <p className="text-xs text-gray-500 mt-1">{a.descricao}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {atividadesAgrupadasPeriodo.passadas.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedGroup(expandedGroup === 'passadas' ? null : 'passadas')}
                  className="w-full flex items-center gap-3 mb-4"
                >
                  <ChevronDown className={`w-5 h-5 ${expandedGroup === 'passadas' ? 'rotate-180' : ''}`} />
                  <h2 className="text-lg font-semibold text-gray-600">Ações Passadas</h2>
                  <Badge className="ml-auto">{atividadesAgrupadasPeriodo.passadas.length}</Badge>
                </button>

                {expandedGroup === 'passadas' && (
                  <div className="space-y-3 pl-8">
                    {atividadesAgrupadasPeriodo.passadas.map((a) => (
                      <div key={a.id} className="flex gap-4 p-4 border rounded-lg opacity-70">
                        <div className={`w-3 h-3 rounded-full mt-1.5 ${MUSEU_COLORS[a.museu]}`} />
                        <div>
                          <div className="flex gap-2 mb-1">
                            <span className="font-semibold text-sm">{a.titulo}</span>
                            {a.classificacao && (
                              <Badge className={CLASSIF_COLORS[a.classificacao]}>
                                {a.classificacao}
                              </Badge>
                            )}
                          </div>

                          <div className="text-xs text-gray-500">
                            {format(a._date, "d 'de' MMMM", { locale: ptBR })} · {a.museu} · {a.equipe_responsavel}
                          </div>

                          {a.descricao && (
                            <p className="text-xs text-gray-400 mt-1">{a.descricao}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
