import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell } from
'recharts';
import {
  Calendar,
  Users,
  TrendingUp,
  RotateCw,
  MapPin,
  Activity,
  Quote,
  Sparkles } from
'lucide-react';
import { Button } from '@/components/ui/button';
import AgendaCard from '@/components/patrocinador/AgendaCard';
import { useTheme } from '@/context/ThemeContext';

const CHART_COLORS = ['#111827', '#4B5563', '#9CA3AF', '#D1D5DB'];
const MUSEUS = ['MIS', 'MHAB', 'MUMO'];
const TOTAL_OFICIAL = 1320000;

const fmtBRL = (v) =>
new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0
}).format(Number(v || 0));

const fmtInt = (v) =>
Math.round(Number(v || 0)).toLocaleString('pt-BR');

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function safeList(entity, order = '-created_date', limit = 500) {
  try {
    if (!entity?.list) return [];
    const data = await entity.list(order, limit);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('Falha ao listar entidade:', error);
    return [];
  }
}

function getDateValue(item) {
  const raw =
  item?.data_realizacao ||
  item?.data_programacao ||
  item?.data_inicio ||
  item?.data ||
  item?.inicio ||
  item?.created_date ||
  item?.updated_date;

  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(String(raw))) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const br = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isApprovedReport(report) {
  const status = String(report?.status || '').trim().toUpperCase();
  return ['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN'].includes(status);
}

function getActivityPublico(atividade) {
  const publicoDireto =
  Number(atividade?.publico_total) ||
  Number(atividade?.publico_estimado) ||
  Number(atividade?.publico) ||
  0;

  if (publicoDireto > 0) return publicoDireto;

  const publicoMedio =
  Number(atividade?.publico_medio) ||
  Number(atividade?.publico_medio_sessao) ||
  Number(atividade?.publico_por_sessao) ||
  0;

  const ocorrencias =
  Number(atividade?.quantas_vezes_ocorreu) ||
  Number(atividade?.qtd_ocorrencias) ||
  Number(atividade?.ocorrencias) ||
  1;

  return publicoMedio * ocorrencias;
}

function getProgramacaoTitle(item) {
  return (
    item?.nome_acao ||
    item?.titulo ||
    item?.atividade ||
    item?.nome ||
    item?.evento ||
    'Atividade programada');

}

function getProgramacaoMuseu(item) {
  return item?.museu || item?.centro_custo || item?.local_museu || item?.equipamento || item?.local || 'Museus Centro';
}

function normalizeText(value) {
  return String(value || '').
  replace(/\s+/g, ' ').
  trim();
}

function getWeekSeed(extraSeed = 0) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((startOfDay(now) - firstDay) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return Number(`${now.getFullYear()}${String(week).padStart(2, '0')}`) + extraSeed;
}

function seededShuffle(items, seedValue) {
  const arr = [...items];
  let seed = seedValue || 1;

  function random() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function extractTrechosPositivos(reports = [], extraSeed = 0) {
  const candidatos = [];

  const camposRelatorio = [
  'resumo',
  'resumo_executivo',
  'destaques',
  'principais_resultados',
  'resultados',
  'comentarios',
  'avaliacao',
  'aprendizados',
  'oportunidades',
  'observacoes',
  'consideracoes_finais'];


  const camposAtividade = [
  'descricao',
  'descricao_atividade',
  'resultado',
  'resultados',
  'impacto',
  'comentarios',
  'avaliacao',
  'observacoes',
  'aprendizados',
  'destaques'];


  const palavrasPositivas = [
  'participação',
  'participacao',
  'engajamento',
  'fortalecimento',
  'ampliou',
  'aproximou',
  'positivo',
  'positiva',
  'sucesso',
  'relevante',
  'importante',
  'potente',
  'acesso',
  'público',
  'publico',
  'comunidade',
  'educativo',
  'educativa',
  'território',
  'territorio',
  'parceria',
  'aprendizado'];


  reports.forEach((report) => {
    camposRelatorio.forEach((campo) => {
      const texto = normalizeText(report?.[campo]);
      if (texto.length < 70) return;

      candidatos.push({
        texto,
        autor: report?.author_name || report?.created_by || report?.user_email || 'Equipe Museus Centro',
        origem: `${report?.museu || 'Relatório'} · ${report?.mes_referencia || ''} ${report?.ano || ''}`.trim(),
        peso: palavrasPositivas.filter((p) => texto.toLowerCase().includes(p)).length + 1
      });
    });

    (Array.isArray(report?.atividades) ? report.atividades : []).forEach((atividade) => {
      camposAtividade.forEach((campo) => {
        const texto = normalizeText(atividade?.[campo]);
        if (texto.length < 70) return;

        candidatos.push({
          texto,
          autor: report?.author_name || report?.created_by || report?.user_email || 'Equipe Museus Centro',
          origem: `${report?.museu || 'Atividade'} · ${atividade?.nome_atividade || atividade?.titulo || atividade?.acao || report?.mes_referencia || ''}`.trim(),
          peso: palavrasPositivas.filter((p) => texto.toLowerCase().includes(p)).length + 1
        });
      });
    });
  });

  const unicos = [];
  const seen = new Set();

  candidatos.
  sort((a, b) => b.peso - a.peso).
  forEach((item) => {
    const chave = item.texto.slice(0, 90).toLowerCase();
    if (seen.has(chave)) return;
    seen.add(chave);
    unicos.push(item);
  });

  return seededShuffle(unicos.slice(0, 30), getWeekSeed(extraSeed)).
  slice(0, 3).
  map((item) => ({
    ...item,
    texto: item.texto.length > 240 ? `${item.texto.slice(0, 237).trim()}...` : item.texto
  }));
}

function KpiCard({ icon: Icon, label, value, helper, dark = false }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm min-w-0 ${
    dark ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200'}`
    }>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${dark ? 'text-white' : 'text-gray-500'}`} />
        <span className={`text-[11px] uppercase tracking-wide font-semibold ${dark ? 'text-gray-300' : 'text-gray-500'}`}>
          {label}
        </span>
      </div>
      <p className={`text-3xl font-bold leading-tight truncate ${dark ? 'text-white' : 'text-black'}`}>
        {value}
      </p>
      {helper &&
      <p className={`text-xs mt-1 truncate ${dark ? 'text-gray-300' : 'text-gray-500'}`}>
          {helper}
        </p>
      }
    </div>);

}

function SectionCard({ title, children, className = '' }) {
  return (
    <Card className={`rounded-2xl border-gray-200 shadow-sm ${className}`}>
      <CardContent className="p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
          {title}
        </h3>
        {children}
      </CardContent>
    </Card>);

}

function TrechosPositivos({ trechos = [], onRefresh, canRefresh }) {
  return (
    <SectionCard title="Vozes da equipe e das atividades" className="xl:col-span-3">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-black">
            Três trechos positivos selecionados para publicação
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            A seleção muda semanalmente ou quando a coordenação solicita nova curadoria.
          </p>
        </div>

        {canRefresh &&
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          className="border-gray-200 text-black hover:bg-gray-50 gap-1.5">
          
            <Sparkles className="w-3.5 h-3.5" />
            Trocar trechos
          </Button>
        }
      </div>

      {trechos.length === 0 ?
      <p className="text-sm text-gray-400">
          Nenhum trecho positivo encontrado nos relatórios aprovados.
        </p> :

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {trechos.map((item, idx) =>
        <div key={`${item.texto}-${idx}`} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
              <Quote className="w-4 h-4 text-black mb-2" />
              <p className="text-sm text-black leading-relaxed line-clamp-5">
                {item.texto}
              </p>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-black truncate">
                  {item.autor}
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {item.origem}
                </p>
              </div>
            </div>
        )}
        </div>
      }
    </SectionCard>);

}

export default function DashboardPatrocinador() {
  const { themeId } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [curadoriaSeed, setCuradoriaSeed] = useState(0);
  const [loadError, setLoadError] = useState('');
  const isFetchingRef = useRef(false);

  const [data, setData] = useState({
    periodo: '',
    totalAtividadesMes: 0,
    totalAtividadesAno: 0,
    totalPublico: 0,
    publicoMes: 0,
    atividadesPrevistasMes: 0,
    atividades: [],
    programacao: [],
    proximaAgenda: null,
    agendaDoDia: [],
    rubricas: [],
    dadosMensais: [],
    dadosClassificacao: [],
    comparativoMuseu: [],
    trechosPositivos: [],
    totalOrcado: TOTAL_OFICIAL,
    totalUtilizado: 0,
    saldoTotal: TOTAL_OFICIAL,
    percentualExecucao: 0,
    hasData: false
  });

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isCoordenador =
  ['ADMIN', 'admin', 'COORDENADOR', 'COORD_COMUNICACAO', 'COORD_ADMINISTRATIVA', 'COORD_PRODUCAO'].includes(currentUser?.role);

  const loadDashboardData = useCallback(async (silent = false, seedOverride = curadoriaSeed) => {
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setLoadError('');

    if (!silent) setLoading(true);else
    setRefreshing(true);

    try {
      const hoje = new Date();
      const hojeInicio = startOfDay(hoje);
      const mesAtual = hoje.getMonth();
      const anoAtual = hoje.getFullYear();

      const [reportsAll, programacaoRaw, rubricasRaw] = await Promise.all([
      safeList(base44.entities.Report, '-updated_date', 300),
      safeList(base44.entities.Programacao, '-data_realizacao', 1000),
      safeList(base44.entities.Rubrica, 'ordem_exibicao', 1000)]
      );

      const reports = reportsAll.filter(isApprovedReport);

      const programacao = programacaoRaw.filter((item) => {
        const status = String(item?.status || item?.situacao || '').toUpperCase();
        return !['CANCELADO', 'CANCELADA', 'INATIVO', 'INATIVA'].includes(status);
      });

      const atividadesRelatorios = reports.flatMap((report) => {
        const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
        return atividades.map((atividade) => ({
          ...atividade,
          _source: 'report',
          _museu: report?.museu,
          _reportMonth: report?.mes_referencia,
          _reportYear: report?.ano,
          _date: getDateValue(atividade) || getDateValue(report)
        }));
      });

      const atividadesProgramacao = programacao.map((item) => ({
        ...item,
        _source: 'programacao',
        _museu: getProgramacaoMuseu(item),
        _date: getDateValue(item)
      }));

      const todasAsAtividades = [...atividadesRelatorios, ...atividadesProgramacao];

      const atividadesMes = todasAsAtividades.filter((item) => {
        const d = item?._date;
        if (!d) return false;
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
      });

      const programacaoMes = atividadesProgramacao.filter((item) => {
        const d = item?._date;
        if (!d) return false;
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
      });

      const agendaHoje = atividadesProgramacao.
      filter((item) => item?._date && startOfDay(item._date).getTime() === hojeInicio.getTime()).
      sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')));

      const futuras = atividadesProgramacao.
      filter((item) => item?._date && startOfDay(item._date).getTime() >= hojeInicio.getTime()).
      sort((a, b) => startOfDay(a._date).getTime() - startOfDay(b._date).getTime());

      const proximaAgenda = agendaHoje[0] || futuras[0] || null;

      const atividadesPorMes = {};
      todasAsAtividades.forEach((item) => {
        const d = item?._date;
        if (!d) return;

        const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        if (!atividadesPorMes[chave]) {
          atividadesPorMes[chave] = {
            mes: chave,
            atividades: 0,
            publico: 0
          };
        }

        atividadesPorMes[chave].atividades += 1;
        atividadesPorMes[chave].publico += getActivityPublico(item);
      });

      const dadosMensais = Object.values(atividadesPorMes).
      sort((a, b) => a.mes.localeCompare(b.mes)).
      slice(-6).
      map((item) => ({
        ...item,
        atividades: Math.round(item.atividades),
        publico: Math.round(item.publico)
      }));

      const classificacao = {};
      atividadesRelatorios.forEach((item) => {
        const nome = String(item?.classificacao || 'Outro').toUpperCase();
        classificacao[nome] = (classificacao[nome] || 0) + 1;
      });

      const dadosClassificacao = Object.entries(classificacao).map(([nome, quantidade]) => ({
        nome,
        quantidade,
        display:
        nome === 'META' ?
        'Metas' :
        nome === 'ROTINA' ?
        'Rotina' :
        nome === 'EXTRA' ?
        'Extra' :
        nome
      }));

      const comparativoMuseu = MUSEUS.map((museu) => {
        const items = todasAsAtividades.filter((item) => String(item?._museu || '').toUpperCase().includes(museu));
        const relatorios = reports.filter((r) => r.museu === museu || r.museu_secundario === museu).length;

        return {
          museu,
          relatorios,
          atividades: items.length,
          publico: Math.round(items.reduce((sum, item) => sum + getActivityPublico(item), 0))
        };
      });

      const rubricasUnicas = new Map();

      rubricasRaw.forEach((rubrica) => {
        if (rubrica?.ativo === false) return;
        if (rubrica?.id && !rubricasUnicas.has(rubrica.id)) {
          rubricasUnicas.set(rubrica.id, rubrica);
        }
      });

      const totalUtilizado = Array.from(rubricasUnicas.values()).reduce(
        (sum, rubrica) => sum + Number(rubrica?.valor_utilizado || 0),
        0
      );

      const saldoTotal = TOTAL_OFICIAL - totalUtilizado;
      const percentualExecucao = TOTAL_OFICIAL > 0 ? Number((totalUtilizado / TOTAL_OFICIAL * 100).toFixed(1)) : 0;

      const publicoMes = Math.round(atividadesMes.reduce((sum, item) => sum + getActivityPublico(item), 0));
      const totalPublico = Math.round(todasAsAtividades.reduce((sum, item) => sum + getActivityPublico(item), 0));
      const trechosPositivos = extractTrechosPositivos(reports, seedOverride);

      setData({
        periodo: `${String(mesAtual + 1).padStart(2, '0')}/${anoAtual}`,
        totalAtividadesMes: atividadesMes.length,
        totalAtividadesAno: todasAsAtividades.length,
        totalPublico,
        publicoMes,
        atividadesPrevistasMes: programacaoMes.length,
        atividades: atividadesMes,
        programacao,
        agendaDoDia: agendaHoje,
        proximaAgenda,
        rubricas: Array.from(rubricasUnicas.values()),
        dadosMensais,
        dadosClassificacao,
        comparativoMuseu,
        trechosPositivos,
        totalOrcado: TOTAL_OFICIAL,
        totalUtilizado,
        saldoTotal,
        percentualExecucao,
        hasData: reports.length > 0 || todasAsAtividades.length > 0
      });

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erro ao carregar dashboard observador:', error);
      setLoadError('Alguns dados não puderam ser carregados. O painel exibiu o que estava disponível.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [curadoriaSeed]);

  useEffect(() => {
    loadDashboardData(false);

    const interval = setInterval(() => loadDashboardData(true), 60000);

    const unsubscribers = [
    base44.entities.Report?.subscribe?.(() => loadDashboardData(true)),
    base44.entities.Activity?.subscribe?.(() => loadDashboardData(true)),
    base44.entities.Programacao?.subscribe?.(() => loadDashboardData(true)),
    base44.entities.Rubrica?.subscribe?.(() => loadDashboardData(true)),
    base44.entities.TeamPayment?.subscribe?.(() => loadDashboardData(true)),
    base44.entities.PurchaseRequest?.subscribe?.(() => loadDashboardData(true))].
    filter(Boolean);

    return () => {
      clearInterval(interval);
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch {}
      });
    };
  }, [loadDashboardData]);

  function handleTrocarTrechos() {
    const nextSeed = curadoriaSeed + 1;
    setCuradoriaSeed(nextSeed);
    loadDashboardData(true, nextSeed);
  }

  const chartColors = themeId === 'museubh' ? ['#111827', '#374151', '#6B7280', '#D1D5DB'] : CHART_COLORS;

  const renderProximaAgenda = useMemo(() => {
    if (!data.proximaAgenda) {
      return (
        <p className="text-sm text-gray-500">
          Nenhuma atividade futura cadastrada na programação.
        </p>);

    }

    const item = data.proximaAgenda;
    const date = item?._date;

    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-bold text-black">
              {date ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
            </p>
            <p className="text-sm font-semibold text-black line-clamp-2 mt-1">
              {getProgramacaoTitle(item)}
            </p>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {getProgramacaoMuseu(item)}
            </p>
          </div>

          <div className="rounded-full border border-black px-3 py-1 text-[11px] font-semibold text-black">
            {data.agendaDoDia.length > 0 ? 'Hoje' : 'Próxima'}
          </div>
        </div>
      </div>);

  }, [data.proximaAgenda, data.agendaDoDia.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Carregando painel...</p>
        </div>
      </div>);

  }

  return (
    <div className="space-y-8">
      {loadError &&
      <div className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-700">
          {loadError}
        </div>
      }

      {!data.hasData &&
      <div className="bg-white border border-black rounded-2xl p-5 text-sm text-black font-medium">
          Sem dados disponíveis. Sincronize relatórios aprovados e atividades para visualizar métricas.
        </div>
      }

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Activity}
          label="Atividades do mês"
          value={fmtInt(data.totalAtividadesMes)}
          helper={`${fmtInt(data.totalAtividadesAno)} no acumulado`}
          dark />
        

        <KpiCard
          icon={Calendar}
          label="Previstas na agenda"
          value={fmtInt(data.atividadesPrevistasMes)}
          helper={`período ${data.periodo}`}
          dark />
        

        <KpiCard
          icon={Users}
          label="Público total"
          value={fmtInt(data.totalPublico)}
          helper={`${fmtInt(data.publicoMes)} no mês`} />
        

        <KpiCard
          icon={TrendingUp}
          label="Execução orçamentária"
          value={`${data.percentualExecucao}%`}
          helper={`${fmtBRL(data.totalUtilizado)} utilizado`} />
        
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard title="Próxima agenda">
          {renderProximaAgenda}
        </SectionCard>

        <SectionCard title="Orçamento oficial">
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Previsto</span>
              <span className="font-semibold text-black">{fmtBRL(data.totalOrcado)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Utilizado</span>
              <span className="font-semibold text-black">{fmtBRL(data.totalUtilizado)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Saldo</span>
              <span className="font-semibold text-black">{fmtBRL(data.saldoTotal)}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-black"
                style={{ width: `${Math.min(data.percentualExecucao, 100)}%` }} />
              
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Museus acompanhados">
          <div className="grid grid-cols-3 gap-2">
            {MUSEUS.map((museu) => {
              const item = data.comparativoMuseu.find((x) => x.museu === museu) || {};
              return (
                <div key={museu} className="rounded-xl border border-gray-200 p-3">
                  <p className="text-sm font-bold text-black">{museu}</p>
                  <p className="text-xs text-gray-500 mt-1">{fmtInt(item.atividades)} atividades</p>
                  <p className="text-xs text-gray-500">{fmtInt(item.publico)} público</p>
                </div>);

            })}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <TrechosPositivos
          trechos={data.trechosPositivos}
          onRefresh={handleTrocarTrechos}
          canRefresh={isCoordenador} />
        
      </div>

      











































      

      <div className="grid grid-cols-1 gap-4">
        <SectionCard title="Agenda">
          <AgendaCard programacao={data.programacao} />
        </SectionCard>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500 border border-gray-200 rounded-2xl px-4 py-3 bg-white">
        <span>
          Dados sincronizados com relatórios aprovados, programação, rubricas e solicitações financeiras.
        </span>

        <Button
          size="sm"
          variant="outline"
          onClick={() => loadDashboardData(false)}
          disabled={loading || refreshing}
          className="border-gray-200 text-black hover:bg-gray-50 gap-1.5">
          
          <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Atualizando...' : 'Atualizar painel'}
        </Button>

        {lastUpdate &&
        <span>Última sincronização: {lastUpdate.toLocaleTimeString('pt-BR')}</span>
        }
      </div>
    </div>);

}