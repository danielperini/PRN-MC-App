import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Calendar } from 'lucide-react';
import { isObservador, isPatrocinador } from '@/components/auth/permissions';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Externo'];
const ALL_VALUE = '__ALL__';
const SYNC_TIMEOUT_MS = 6000;

const DATA_CORRECAO_NOTURNO_2024 = '06/12/2024';
const DATA_ISO_CORRECAO_NOTURNO_2024 = '2024-12-06';
const MONTH_KEY_CORRECAO_NOTURNO_2024 = '2024-12';

const ATIVIDADES_NOTURNO_2024 = [
  'pensamento do fora',
  'iluminacao das esculturas dos jardins',
  'instalacao da obra pensamento do fora',
  'corpo agua',
  'corpo-agua',
  'samba de roda oridende',
  'mostra digital de trabalhos de arte da galeria aut',
  'coletivo as pandeirista',
  'oficina de estamparia com preta aya',
  'aline calixto',
  'clara nunes',
  'victor santana',
  'samba da meia noite',
  'visitas mediadas complexa cidade',
  'belo horizonte fora dos planos',
  'quarteto chico amaral',
];

const ATIVIDADES_OCULTAS = [
  'grupo de percursao do projeto querubins',
  'grupo de percussao do projeto querubins',
  'faraoeste',
];

const MONTH_NAME_TO_NUMBER = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12,
};

function getNextMonthSelection() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    ano: String(next.getFullYear()),
    mes: MESES[next.getMonth()],
  };
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/["“”'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getProgramacaoTitle(item) {
  return item?.titulo || item?.nome_acao || item?.nome || item?.atividade || item?.acao || '';
}

function getProgramacaoSinopse(item) {
  return item?.sinopse || item?.descricao || item?.resumo || item?.observacoes || '—';
}

function shouldHideProgramacao(item) {
  const title = normalizeText(getProgramacaoTitle(item));
  return ATIVIDADES_OCULTAS.some((needle) => title.includes(needle));
}

function isAtividadeNoturno2024(item) {
  const text = normalizeText([
    getProgramacaoTitle(item),
    item?.sinopse,
    item?.descricao,
    item?.local,
  ].filter(Boolean).join(' '));

  return ATIVIDADES_NOTURNO_2024.some((needle) => text.includes(normalizeText(needle)));
}

function getDateFromItem(item) {
  const raw = item?.data_inicio || item?.data_realizacao || item?.data || item?.inicio;
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(String(raw))) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const brFull = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
  if (brFull) {
    const d = new Date(Number(brFull[3]), Number(brFull[2]) - 1, Number(brFull[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function getYearFromContext(item) {
  const explicit = Number(item?.ano || item?.ano_referencia || item?.year || item?.sync_year);
  if (Number.isFinite(explicit) && explicit >= 2020 && explicit <= 2035) return explicit;

  const keys = [
    item?.month_key,
    item?.sync_month,
    item?.aba,
    item?.sheet_name,
    item?.sheet,
    item?.worksheet,
    item?.origem_aba,
    item?.nome_aba,
    item?.tab,
    item?.source_tab,
    item?.source_sheet,
  ];

  for (const value of keys) {
    const text = String(value || '');
    const full = text.match(/20\d{2}/);
    if (full) return Number(full[0]);

    const short = text.match(/(?:^|\D)(2[4-9]|3[0-5])(?:\D|$)/);
    if (short) return 2000 + Number(short[1]);
  }

  const date = getDateFromItem(item);
  return date ? date.getFullYear() : null;
}

function getMonthNumberFromContext(item) {
  const key = item?.month_key || item?.sync_month;
  const keyMatch = String(key || '').match(/20\d{2}-(\d{2})/);
  if (keyMatch) return Number(keyMatch[1]);

  const mesNumero = Number(item?.mes_numero || item?.month_number);
  if (Number.isFinite(mesNumero) && mesNumero >= 1 && mesNumero <= 12) return mesNumero;

  const mesTexto = normalizeText(item?.mes || item?.mes_referencia || item?.month || '');
  if (MONTH_NAME_TO_NUMBER[mesTexto]) return MONTH_NAME_TO_NUMBER[mesTexto];

  const contextText = normalizeText([
    item?.aba,
    item?.sheet_name,
    item?.sheet,
    item?.worksheet,
    item?.origem_aba,
    item?.nome_aba,
    item?.tab,
    item?.source_tab,
    item?.source_sheet,
  ].filter(Boolean).join(' '));

  for (const [monthName, monthNumber] of Object.entries(MONTH_NAME_TO_NUMBER)) {
    if (contextText.includes(monthName)) return monthNumber;
  }

  const date = getDateFromItem(item);
  return date ? date.getMonth() + 1 : null;
}

function normalizeDateBySheetContext(item) {
  if (isAtividadeNoturno2024(item)) {
    return {
      ...item,
      data: DATA_CORRECAO_NOTURNO_2024,
      data_inicio: DATA_ISO_CORRECAO_NOTURNO_2024,
      data_realizacao: DATA_ISO_CORRECAO_NOTURNO_2024,
      month_key: MONTH_KEY_CORRECAO_NOTURNO_2024,
      sync_month: MONTH_KEY_CORRECAO_NOTURNO_2024,
      ano: 2024,
      ano_referencia: 2024,
      mes: 'Dezembro',
    };
  }

  return item;
}

function itemMatchesFilters(item, anoSelecionado, mesSelecionado, museuSelecionado) {
  if (shouldHideProgramacao(item)) return false;

  const year = getYearFromContext(item);
  const monthNumber = getMonthNumberFromContext(item);
  const mes = monthNumber ? MESES[monthNumber - 1] : item?.mes;

  if (anoSelecionado !== ALL_VALUE && String(year) !== String(anoSelecionado)) return false;
  if (mesSelecionado !== ALL_VALUE && mes !== mesSelecionado) return false;
  if (museuSelecionado !== ALL_VALUE && item?.museu !== museuSelecionado) return false;

  return true;
}

function sortProgramacoes(a, b) {
  const da = getDateFromItem(a);
  const db = getDateFromItem(b);
  if (da && db) return da.getTime() - db.getTime();
  if (da) return -1;
  if (db) return 1;
  return getProgramacaoTitle(a).localeCompare(getProgramacaoTitle(b), 'pt-BR');
}

async function syncProgramacaoFromFonte() {
  try {
    await Promise.race([
      base44.functions.invoke('syncBaseConhecimento', {
        mode: 'programacao-page',
        origem: 'ProgramacaoEspelho',
        force_programacao_sync: true,
      }),
      new Promise((resolve) => setTimeout(resolve, SYNC_TIMEOUT_MS)),
    ]);
  } catch (error) {
    console.warn('Sincronização da programação indisponível. Carregando dados locais.', error);
  }
}

export default function ProgramacaoEspelho() {
  const nextMonthSelection = getNextMonthSelection();
  const [isSponsor, setIsSponsor] = useState(false);
  const [allProgramacoes, setAllProgramacoes] = useState([]);
  const [programacoes, setProgramacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState(nextMonthSelection.mes);
  const [museuSelecionado, setMuseuSelecionado] = useState(ALL_VALUE);
  const [anoSelecionado, setAnoSelecionado] = useState(nextMonthSelection.ano);

  useEffect(() => {
    let mounted = true;
    base44.auth.me().then(async (user) => {
      let permission = null;
      try {
        const permissions = await base44.entities.UserPermission.filter({ user_email: user.email.toLowerCase() });
        permission = permissions?.[0] || null;
      } catch {}
      const userWithPermission = { ...user, base_role: permission?.base_role || user.base_role };
      if (mounted) setIsSponsor(isPatrocinador(userWithPermission) || isObservador(userWithPermission, permission));
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    carregarProgramacoes({ syncFonte: false });
    sincronizarEmSegundoPlano();
  }, []);

  useEffect(() => {
    const filtradas = allProgramacoes
      .filter((item) => itemMatchesFilters(item, anoSelecionado, mesSelecionado, museuSelecionado))
      .sort(sortProgramacoes);

    setProgramacoes(filtradas);
  }, [allProgramacoes, mesSelecionado, museuSelecionado, anoSelecionado]);

  async function aplicarSelecaoPadrao(normalized) {
    const visibleItems = normalized.filter((item) => !shouldHideProgramacao(item));
    const years = Array.from(new Set(visibleItems.map(getYearFromContext).filter(Boolean))).sort((a, b) => b - a);
    const defaultSelection = getNextMonthSelection();
    const hasNextMonthData = visibleItems.some((item) => {
      const monthNumber = getMonthNumberFromContext(item);
      const mes = monthNumber ? MESES[monthNumber - 1] : item?.mes;
      return String(getYearFromContext(item)) === defaultSelection.ano && mes === defaultSelection.mes;
    });

    if (hasNextMonthData) {
      setAnoSelecionado(defaultSelection.ano);
      setMesSelecionado(defaultSelection.mes);
    } else if (years.length > 0 && !years.includes(Number(anoSelecionado))) {
      setAnoSelecionado(String(years[0]));
    }
  }

  async function carregarProgramacoes({ syncFonte = false } = {}) {
    setLoading(true);
    try {
      if (syncFonte) {
        await syncProgramacaoFromFonte();
      }

      const data = await base44.entities.Programacao.list('-data_inicio', 5000);
      const normalized = (Array.isArray(data) ? data : []).map(normalizeDateBySheetContext);
      setAllProgramacoes(normalized);
      await aplicarSelecaoPadrao(normalized);
    } catch (err) {
      console.warn('Programações indisponíveis no carregamento inicial. Exibindo lista vazia.', err);
      setAllProgramacoes([]);
      setProgramacoes([]);
    } finally {
      setLoading(false);
    }
  }

  async function sincronizarEmSegundoPlano() {
    setSyncing(true);
    try {
      await syncProgramacaoFromFonte();
      const data = await base44.entities.Programacao.list('-data_inicio', 5000);
      const normalized = (Array.isArray(data) ? data : []).map(normalizeDateBySheetContext);
      setAllProgramacoes(normalized);
      await aplicarSelecaoPadrao(normalized);
    } catch (error) {
      console.warn('Falha na sincronização em segundo plano da programação:', error);
    } finally {
      setSyncing(false);
    }
  }

  const anosDisponiveis = useMemo(() => {
    const availableYears = Array.from(new Set(allProgramacoes.filter((item) => !shouldHideProgramacao(item)).map(getYearFromContext).filter(Boolean))).sort((a, b) => b - a);
    const currentYear = Number(anoSelecionado);
    return Number.isFinite(currentYear) && !availableYears.includes(currentYear)
      ? [currentYear, ...availableYears]
      : availableYears;
  }, [allProgramacoes, anoSelecionado]);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set();
    allProgramacoes.forEach((item) => {
      if (shouldHideProgramacao(item)) return;
      if (anoSelecionado !== ALL_VALUE && String(getYearFromContext(item)) !== String(anoSelecionado)) return;
      const monthNumber = getMonthNumberFromContext(item);
      if (monthNumber) set.add(monthNumber);
    });
    const meses = Array.from(set).sort((a, b) => a - b).map((n) => MESES[n - 1]);
    return mesSelecionado !== ALL_VALUE && !meses.includes(mesSelecionado)
      ? [mesSelecionado, ...meses]
      : meses;
  }, [allProgramacoes, anoSelecionado, mesSelecionado]);

  const museusDisponiveis = useMemo(() => {
    const set = new Set(MUSEUS);
    allProgramacoes.forEach((item) => {
      if (shouldHideProgramacao(item)) return;
      if (item?.museu) set.add(item.museu);
    });
    return Array.from(set);
  }, [allProgramacoes]);

  const agrupadoPorMuseu = museusDisponiveis.reduce((acc, museu) => {
    acc[museu] = programacoes.filter(p => p.museu === museu);
    return acc;
  }, {});

  const totalGeral = programacoes.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Programação</h1>
          <p className="text-slate-500 text-sm mt-1">Visualização da programação registrada no sistema</p>
        </div>
        {!isSponsor && (
          <Button variant="outline" size="sm" onClick={() => carregarProgramacoes({ syncFonte: true })} disabled={loading || syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${(loading || syncing) ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando' : 'Atualizar'}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map((ano) => (
              <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos os meses</SelectItem>
            {mesesDisponiveis.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={museuSelecionado} onValueChange={setMuseuSelecionado}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Museu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos</SelectItem>
            {museusDisponiveis.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-slate-600">
          <Calendar className="w-4 h-4" />
          <span className="text-sm font-medium">
            {totalGeral} atividade{totalGeral !== 1 ? 's' : ''} encontrada{totalGeral !== 1 ? 's' : ''}
            {mesSelecionado !== ALL_VALUE ? ` em ${mesSelecionado}` : ''}
            {anoSelecionado !== ALL_VALUE ? ` de ${anoSelecionado}` : ''}
            {syncing ? ' · sincronizando fonte em segundo plano' : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Carregando programação...</span>
        </div>
      ) : totalGeral === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma programação encontrada para os filtros selecionados.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {museusDisponiveis.map(museu => {
            const itens = agrupadoPorMuseu[museu];
            if (itens.length === 0) return null;

            return (
              <div key={museu}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-semibold text-slate-800">{museu}</h2>
                  <Badge variant="secondary">{itens.length}</Badge>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Data</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Nome da Ação</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Sinopse</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itens.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {item.data_inicio
                              ? new Date(item.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                              : item.data || '—'}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800 max-w-xs">
                            {item.titulo || item.nome || item.atividade || item.nome_acao || '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-500 max-w-xl">
                            <span className="line-clamp-3">{getProgramacaoSinopse(item)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
