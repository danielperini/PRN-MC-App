import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Filter, ChevronDown, RefreshCw } from 'lucide-react';
import { format, isValid, isBefore, startOfDay } from 'date-fns';
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseFlexibleDate(value) {
  if (!value) return null;

  if (value instanceof Date && isValid(value)) return value;

  const text = String(value).trim();
  if (!text) return null;

  const iso = new Date(text);
  if (isValid(iso)) return iso;

  const brMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    let year = Number(brMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (isValid(d)) return d;
  }

  return null;
}

function findValueByPossibleKeys(values, possibleKeys) {
  const entries = Object.entries(values || {});

  for (const [key, value] of entries) {
    const normalizedKey = normalizeText(key);
    const matched = possibleKeys.some((candidate) => normalizedKey.includes(candidate));
    if (matched && String(value || '').trim()) {
      return value;
    }
  }

  return '';
}

function detectMuseum(values) {
  const explicitMuseum =
    findValueByPossibleKeys(values, ['museu', 'unidade', 'local']) || '';

  const sourceText = explicitMuseum || Object.values(values || {}).join(' ');
  const text = normalizeText(sourceText);

  if (text.includes('mhab') || text.includes('mab')) return 'MHAB';
  if (text.includes('mis')) return 'MIS';
  if (text.includes('mumo') || text.includes('mumu')) return 'MUMO';

  return 'Externo';
}

function detectClassification(values) {
  const explicit =
    findValueByPossibleKeys(values, ['classificacao', 'tipo', 'categoria']) || '';

  const text = normalizeText(explicit);

  if (text.includes('meta')) return 'META';
  if (text.includes('rotina')) return 'ROTINA';
  if (text.includes('extra')) return 'EXTRA';

  return '';
}

function detectEquipe(values) {
  const explicit =
    findValueByPossibleKeys(values, ['equipe', 'responsavel', 'área', 'area', 'setor']) || '';

  const text = normalizeText(explicit);

  if (text.includes('comunic')) return 'Comunicação';
  if (text.includes('admin')) return 'Administração';
  if (text.includes('educ')) return 'Educativo';
  if (text.includes('produ')) return 'Produção';

  return explicit ? 'Outra' : '';
}

function mapSpreadsheetItemsToActivities(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const values = item?.values || {};

      const rawDate =
        findValueByPossibleKeys(values, ['data']) ||
        findValueByPossibleKeys(values, ['dia']) ||
        item?.first_text ||
        '';

      const parsedDate = parseFlexibleDate(rawDate);

      if (!parsedDate) return null;

      const titulo =
        findValueByPossibleKeys(values, ['titulo', 'atividade', 'acao', 'ação', 'programacao', 'programação', 'evento', 'nome']) ||
        item?.first_text ||
        `Atividade ${index + 1}`;

      const descricao =
        findValueByPossibleKeys(values, ['descricao', 'descrição', 'resumo', 'observacao', 'observação', 'detalhe']) || '';

      const equipe = detectEquipe(values);
      const museu = detectMuseum(values);
      const classificacao = detectClassification(values);
      const publicoEstimado =
        findValueByPossibleKeys(values, ['publico', 'público', 'participantes']) || '';

      return {
        id: `${item?.row_index || index}-${titulo}`,
        titulo,
        nome: titulo,
        descricao,
        classificacao,
        equipe_responsavel: equipe,
        publico_estimado: publicoEstimado,
        _reportId: item?.row_index || index,
        _reportMuseu: museu,
        _reportAuthor: 'Google Sheets',
        _reportMes: '',
        _date: parsedDate,
        _raw: item,
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
    return mapSpreadsheetItemsToActivities(mirrorData?.items || []);
  }, [mirrorData]);

  const atividadesFiltradas = useMemo(() => {
    return todasAtividades.filter((a) => {
      if (filtroMuseu !== 'Todos' && a._reportMuseu !== filtroMuseu) return false;
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
            <p className="text-gray-500">Nenhuma ação encontrada na planilha com os filtros aplicados</p>
          </div>
        ) : (
          <div className="space-y-6">

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
                    {atividadesAgrupadasPeriodo.proximas.map((a) => (
                      <div key={a.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
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

                          <div className="flex items-center gap-2 text-xs text-gray-600 mb-2 flex-wrap">
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
                    {atividadesAgrupadasPeriodo.passadas.map((a) => (
                      <div key={a.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors opacity-70">
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

                          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2 flex-wrap">
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
