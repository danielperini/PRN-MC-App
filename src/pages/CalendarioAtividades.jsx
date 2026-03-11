import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Filter, ChevronDown } from 'lucide-react';
import { format, parseISO, isValid, isBefore, startOfDay } from 'date-fns';
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
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');
  const [filtroEquipe, setFiltroEquipe] = useState('Todas');
  const [expandedGroup, setExpandedGroup] = useState(null);

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
        if (!ativ.data_realizacao) continue;
        const date = parseISO(ativ.data_realizacao);
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

  // Agrupar por período (próximas/passadas)
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
    
    // Ordenar: próximas por data crescente, passadas por data decrescente
    proximas.sort((a, b) => a._date - b._date);
    passadas.sort((a, b) => b._date - a._date);
    
    return { proximas, passadas };
  }, [atividadesFiltradas]);

  return (
    <div className="w-full py-6 md:py-10">
      <div className="max-w-5xl mx-auto px-4 md:px-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-black" />
            <h1 className="text-3xl font-bold text-black">Agenda</h1>
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
              {atividadesFiltradas.length} ações
            </Badge>
          </div>
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap gap-3 mb-6 text-xs">
          {Object.entries(CLASSIF_COLORS).map(([k, v]) => (
            <span key={k} className={`px-2 py-0.5 rounded-full font-medium ${v}`}>{k}</span>
          ))}
        </div>

        {/* Lista de ações */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando ações...</div>
        ) : atividadesFiltradas.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma ação cadastrada com os filtros aplicados</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Ações Próximas */}
            {atividadesAgrupadasPeriodo.proximas.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedGroup(expandedGroup === 'proximas' ? null : 'proximas')}
                  className="w-full flex items-center gap-3 mb-4 group"
                >
                  <ChevronDown className={`w-5 h-5 text-black transition-transform ${expandedGroup === 'proximas' ? 'rotate-180' : ''}`} />
                  <h2 className="text-lg font-semibold text-black">Próximas Ações</h2>
                  <Badge variant="outline" className="ml-auto">{atividadesAgrupadasPeriodo.proximas.length}</Badge>
                </button>

                {(expandedGroup === 'proximas' || expandedGroup === null) && (
                  <div className="space-y-3 pl-8">
                    {atividadesAgrupadasPeriodo.proximas.map((a, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${MUSEU_COLORS[a._reportMuseu] || 'bg-gray-300'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="font-semibold text-black text-sm">{a.titulo || a.nome || 'Ação sem nome'}</span>
                            {a.classificacao && (
                              <Badge className={`text-[10px] px-1.5 py-0 ${CLASSIF_COLORS[a.classificacao] || ''}`}>
                                {a.classificacao}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                            <span className="font-medium">{format(a._date, "d 'de' MMMM", { locale: ptBR })}</span>
                            {a._reportMuseu && <span>·</span>}
                            {a._reportMuseu && <span>{a._reportMuseu}</span>}
                            {a.equipe_responsavel && <span>·</span>}
                            {a.equipe_responsavel && <span>{a.equipe_responsavel}</span>}
                          </div>
                          {a.descricao && <p className="text-xs text-gray-600 line-clamp-2 mb-2">{a.descricao}</p>}
                          <p className="text-xs text-gray-400">
                            {a._reportAuthor}
                            {a.publico_estimado ? ` · ${a.publico_estimado} pessoas` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ações Passadas */}
            {atividadesAgrupadasPeriodo.passadas.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedGroup(expandedGroup === 'passadas' ? null : 'passadas')}
                  className="w-full flex items-center gap-3 mb-4 group"
                >
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${expandedGroup === 'passadas' ? 'rotate-180' : ''}`} />
                  <h2 className="text-lg font-semibold text-gray-600">Ações Passadas</h2>
                  <Badge variant="outline" className="ml-auto">{atividadesAgrupadasPeriodo.passadas.length}</Badge>
                </button>

                {expandedGroup === 'passadas' && (
                  <div className="space-y-3 pl-8">
                    {atividadesAgrupadasPeriodo.passadas.map((a, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors opacity-70">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${MUSEU_COLORS[a._reportMuseu] || 'bg-gray-300'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="font-semibold text-gray-700 text-sm">{a.titulo || a.nome || 'Ação sem nome'}</span>
                            {a.classificacao && (
                              <Badge className={`text-[10px] px-1.5 py-0 ${CLASSIF_COLORS[a.classificacao] || ''}`}>
                                {a.classificacao}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                            <span className="font-medium">{format(a._date, "d 'de' MMMM", { locale: ptBR })}</span>
                            {a._reportMuseu && <span>·</span>}
                            {a._reportMuseu && <span>{a._reportMuseu}</span>}
                            {a.equipe_responsavel && <span>·</span>}
                            {a.equipe_responsavel && <span>{a.equipe_responsavel}</span>}
                          </div>
                          {a.descricao && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{a.descricao}</p>}
                          <p className="text-xs text-gray-400">
                            {a._reportAuthor}
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
        )}
      </div>
    </div>
  );
}

export default function CalendarioAtividades() {
  return <RequireAuth><CalendarioAtividadesInner /></RequireAuth>;
}