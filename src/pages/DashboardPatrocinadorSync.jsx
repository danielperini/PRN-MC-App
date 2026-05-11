import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Cell,
} from 'recharts';
import { Activity, Calendar, MapPin, RotateCw, TrendingUp, Users } from 'lucide-react';
import AgendaCard from '@/components/patrocinador/AgendaCard';

const TOTAL_OFICIAL = 1320000;
const MUSEUS = ['MIS', 'MHAB', 'MUMO'];
const CHART_COLORS = ['#111827', '#4B5563', '#9CA3AF', '#D1D5DB'];

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v || 0));
const fmtInt = (v) => Math.round(Number(v || 0)).toLocaleString('pt-BR');

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function safeList(entity, order = '-created_date', limit = 1000) {
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
  const raw = item?.data_realizacao || item?.data_programacao || item?.data_inicio || item?.data || item?.inicio || item?.created_date || item?.updated_date;
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
  const publicoDireto = Number(atividade?.publico_total) || Number(atividade?.publico_estimado) || Number(atividade?.publico) || 0;
  if (publicoDireto > 0) return publicoDireto;

  const publicoMedio = Number(atividade?.publico_medio) || Number(atividade?.publico_medio_sessao) || Number(atividade?.publico_por_sessao) || 0;
  const ocorrencias = Number(atividade?.quantas_vezes_ocorreu) || Number(atividade?.qtd_ocorrencias) || Number(atividade?.ocorrencias) || 1;
  return publicoMedio * ocorrencias;
}

function getReportMonthDate(report) {
  const direct = getDateValue(report);
  if (direct) return direct;

  const ano = Number(report?.ano || report?.ano_referencia);
  const mesRaw = report?.mes_referencia || report?.mes || report?.competencia;
  const mesTexto = String(mesRaw || '').toLowerCase();
  const meses = ['janeiro', 'fevereiro', 'março', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  let mes = Number(mesRaw);
  if (!mes || Number.isNaN(mes)) {
    const idx = meses.findIndex((nome) => mesTexto.includes(nome));
    if (idx >= 0) mes = idx === 3 ? 3 : idx + 1;
  }

  if (ano && mes >= 1 && mes <= 12) return new Date(ano, mes - 1, 1);
  return null;
}

function getMonthKey(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key) {
  if (!key) return '—';
  const [ano, mes] = key.split('-').map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

function getProgramacaoTitle(item) {
  return item?.nome_acao || item?.titulo || item?.atividade || item?.nome || item?.evento || 'Atividade programada';
}

function getProgramacaoMuseu(item) {
  return item?.museu || item?.centro_custo || item?.local_museu || item?.equipamento || item?.local || 'Museus Centro';
}

function normalizeMuseu(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('MIS') || text.includes('IMAGEM') || text.includes('SOM')) return 'MIS';
  if (text.includes('MHAB') || text.includes('ABILIO') || text.includes('ABÍLIO') || text.includes('HIST')) return 'MHAB';
  if (text.includes('MUMO') || text.includes('MODA')) return 'MUMO';
  return 'GERAL';
}

function getActivityKey(item, report) {
  const date = getDateValue(item) || getReportMonthDate(report);
  return [
    item?.id,
    item?.nome_atividade || item?.titulo || item?.acao || item?.nome || item?.atividade,
    date ? date.toISOString().slice(0, 10) : '',
    report?.id,
  ].filter(Boolean).join('|').toLowerCase();
}

function KpiCard({ icon: Icon, label, value, helper, dark = false }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm min-w-0 ${dark ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${dark ? 'text-white' : 'text-gray-500'}`} />
        <span className={`text-[11px] uppercase tracking-wide font-semibold ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{label}</span>
      </div>
      <p className={`text-3xl font-bold leading-tight truncate ${dark ? 'text-white' : 'text-black'}`}>{value}</p>
      {helper && <p className={`text-xs mt-1 truncate ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{helper}</p>}
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <Card className="rounded-2xl border-gray-200 shadow-sm">
      <CardContent className="p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">{title}</h3>
        {children}
      </CardContent>
    </Card>
  );
}

export default function DashboardPatrocinadorSync() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loadError, setLoadError] = useState('');
  const isFetchingRef = useRef(false);
  const [data, setData] = useState({
    periodo: '',
    totalAtividadesMes: 0,
    totalAtividadesAno: 0,
    totalPublico: 0,
    publicoMes: 0,
    atividadesPrevistasMes: 0,
    programacao: [],
    proximaAgenda: null,
    agendaDoDia: [],
    dadosMensais: [],
    dadosClassificacao: [],
    comparativoMuseu: [],
    totalOrcado: TOTAL_OFICIAL,
    totalUtilizado: 0,
    saldoTotal: TOTAL_OFICIAL,
    percentualExecucao: 0,
    hasData: false,
  });

  const loadDashboardData = useCallback(async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoadError('');
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const hoje = new Date();
      const hojeInicio = startOfDay(hoje);
      const mesAtual = hoje.getMonth();
      const anoAtual = hoje.getFullYear();

      const [reportsAll, programacaoRaw, rubricasRaw] = await Promise.all([
        safeList(base44.entities.Report, '-updated_date', 500),
        safeList(base44.entities.Programacao, '-data_realizacao', 1000),
        safeList(base44.entities.Rubrica, 'ordem_exibicao', 1000),
      ]);

      const reports = reportsAll.filter(isApprovedReport);

      const atividadesMap = new Map();
      reports.forEach((report) => {
        const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
        atividades.forEach((atividade) => {
          const reportDate = getReportMonthDate(report);
          const date = getDateValue(atividade) || reportDate;
          const item = {
            ...atividade,
            _source: 'report',
            _museu: normalizeMuseu(atividade?.museu || atividade?.centro_custo || report?.museu || report?.museu_secundario),
            _date: date,
            _reportId: report?.id,
          };
          const key = getActivityKey(atividade, report);
          if (!atividadesMap.has(key)) atividadesMap.set(key, item);
        });
      });

      const atividadesRealizadas = Array.from(atividadesMap.values()).filter((item) => item._date);

      const programacao = programacaoRaw.filter((item) => {
        const status = String(item?.status || item?.situacao || '').toUpperCase();
        return !['CANCELADO', 'CANCELADA', 'INATIVO', 'INATIVA'].includes(status);
      }).map((item) => ({ ...item, _date: getDateValue(item), _museu: normalizeMuseu(getProgramacaoMuseu(item)) }));

      const atividadesMes = atividadesRealizadas.filter((item) => item._date.getMonth() === mesAtual && item._date.getFullYear() === anoAtual);
      const programacaoMes = programacao.filter((item) => item._date && item._date.getMonth() === mesAtual && item._date.getFullYear() === anoAtual);

      const agendaHoje = programacao
        .filter((item) => item._date && startOfDay(item._date).getTime() === hojeInicio.getTime())
        .sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')));

      const futuras = programacao
        .filter((item) => item._date && startOfDay(item._date).getTime() >= hojeInicio.getTime())
        .sort((a, b) => startOfDay(a._date).getTime() - startOfDay(b._date).getTime());

      const atividadesPorMes = {};
      atividadesRealizadas.forEach((item) => {
        const chave = getMonthKey(item._date);
        if (!chave) return;
        if (!atividadesPorMes[chave]) atividadesPorMes[chave] = { mes: getMonthLabel(chave), key: chave, atividades: 0, publico: 0 };
        atividadesPorMes[chave].atividades += 1;
        atividadesPorMes[chave].publico += getActivityPublico(item);
      });

      const dadosMensais = Object.values(atividadesPorMes)
        .sort((a, b) => a.key.localeCompare(b.key))
        .slice(-6)
        .map((item) => ({ mes: item.mes, atividades: Math.round(item.atividades), publico: Math.round(item.publico) }));

      const classificacao = {};
      atividadesRealizadas.forEach((item) => {
        const nome = String(item?.classificacao || 'Outro').toUpperCase();
        classificacao[nome] = (classificacao[nome] || 0) + 1;
      });

      const dadosClassificacao = Object.entries(classificacao).map(([nome, quantidade]) => ({
        nome,
        quantidade,
        display: nome === 'META' ? 'Metas' : nome === 'ROTINA' ? 'Rotina' : nome === 'EXTRA' ? 'Extra' : nome,
      }));

      const comparativoMuseu = MUSEUS.map((museu) => {
        const items = atividadesRealizadas.filter((item) => item._museu === museu);
        return {
          museu,
          atividades: items.length,
          publico: Math.round(items.reduce((sum, item) => sum + getActivityPublico(item), 0)),
        };
      });

      const rubricasUnicas = new Map();
      rubricasRaw.forEach((rubrica) => {
        if (rubrica?.ativo === false) return;
        if (rubrica?.id && !rubricasUnicas.has(rubrica.id)) rubricasUnicas.set(rubrica.id, rubrica);
      });

      const totalUtilizado = Array.from(rubricasUnicas.values()).reduce((sum, rubrica) => sum + Number(rubrica?.valor_utilizado || 0), 0);
      const saldoTotal = TOTAL_OFICIAL - totalUtilizado;
      const percentualExecucao = TOTAL_OFICIAL > 0 ? Number(((totalUtilizado / TOTAL_OFICIAL) * 100).toFixed(1)) : 0;
      const publicoMes = Math.round(atividadesMes.reduce((sum, item) => sum + getActivityPublico(item), 0));
      const totalPublico = Math.round(atividadesRealizadas.reduce((sum, item) => sum + getActivityPublico(item), 0));

      setData({
        periodo: `${String(mesAtual + 1).padStart(2, '0')}/${anoAtual}`,
        totalAtividadesMes: atividadesMes.length,
        totalAtividadesAno: atividadesRealizadas.length,
        totalPublico,
        publicoMes,
        atividadesPrevistasMes: programacaoMes.length,
        programacao,
        agendaDoDia: agendaHoje,
        proximaAgenda: agendaHoje[0] || futuras[0] || null,
        dadosMensais,
        dadosClassificacao,
        comparativoMuseu,
        totalOrcado: TOTAL_OFICIAL,
        totalUtilizado,
        saldoTotal,
        percentualExecucao,
        hasData: reports.length > 0 || atividadesRealizadas.length > 0,
      });

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erro ao carregar dashboard patrocinador sincronizado:', error);
      setLoadError('Alguns dados não puderam ser carregados. O painel exibiu o que estava disponível.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData(false);
    const interval = setInterval(() => loadDashboardData(true), 60000);
    const onUpdate = () => loadDashboardData(true);
    window.addEventListener('dashboard:update', onUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('dashboard:update', onUpdate);
    };
  }, [loadDashboardData]);

  const renderProximaAgenda = useMemo(() => {
    if (!data.proximaAgenda) return <p className="text-sm text-gray-500">Nenhuma atividade futura cadastrada na programação.</p>;
    const item = data.proximaAgenda;
    const date = item?._date;
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-bold text-black">{date ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}</p>
            <p className="text-sm font-semibold text-black line-clamp-2 mt-1">{getProgramacaoTitle(item)}</p>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{getProgramacaoMuseu(item)}</p>
          </div>
          <div className="rounded-full border border-black px-3 py-1 text-[11px] font-semibold text-black">{data.agendaDoDia.length > 0 ? 'Hoje' : 'Próxima'}</div>
        </div>
      </div>
    );
  }, [data.proximaAgenda, data.agendaDoDia.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Carregando painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {loadError && <div className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-700">{loadError}</div>}

      {!data.hasData && <div className="bg-white border border-black rounded-2xl p-5 text-sm text-black font-medium">Sem dados disponíveis. Sincronize relatórios aprovados e atividades para visualizar métricas.</div>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-black">Painel do Patrocinador</h1>
          <p className="text-sm text-gray-500">Dados sincronizados com relatórios aprovados. Agenda exibida separadamente como previsão.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => loadDashboardData(true)} disabled={refreshing} className="gap-2">
          <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Activity} label="Atividades do mês" value={fmtInt(data.totalAtividadesMes)} helper={`${fmtInt(data.totalAtividadesAno)} no acumulado`} dark />
        <KpiCard icon={Calendar} label="Previstas na agenda" value={fmtInt(data.atividadesPrevistasMes)} helper={`período ${data.periodo}`} dark />
        <KpiCard icon={Users} label="Público total" value={fmtInt(data.totalPublico)} helper={`${fmtInt(data.publicoMes)} no mês`} />
        <KpiCard icon={TrendingUp} label="Execução orçamentária" value={`${data.percentualExecucao}%`} helper={`${fmtBRL(data.totalUtilizado)} utilizado`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard title="Próxima agenda">{renderProximaAgenda}</SectionCard>
        <SectionCard title="Orçamento oficial">
          <div className="space-y-3">
            <div className="flex justify-between text-xs"><span className="text-gray-500">Previsto</span><span className="font-semibold text-black">{fmtBRL(data.totalOrcado)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Utilizado</span><span className="font-semibold text-black">{fmtBRL(data.totalUtilizado)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Saldo</span><span className="font-semibold text-black">{fmtBRL(data.saldoTotal)}</span></div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-1.5 rounded-full bg-black" style={{ width: `${Math.min(data.percentualExecucao, 100)}%` }} /></div>
          </div>
        </SectionCard>
        <SectionCard title="Museus acompanhados">
          <div className="grid grid-cols-3 gap-2">
            {MUSEUS.map((museu) => {
              const item = data.comparativoMuseu.find((x) => x.museu === museu) || {};
              return <div key={museu} className="rounded-xl border border-gray-200 p-3"><p className="text-sm font-bold text-black">{museu}</p><p className="text-xs text-gray-500 mt-1">{fmtInt(item.atividades)} atividades</p><p className="text-xs text-gray-500">{fmtInt(item.publico)} público</p></div>;
            })}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title="Atividades realizadas por mês">
          {data.dadosMensais.length === 0 ? <p className="text-sm text-gray-400">Sem dados disponíveis.</p> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dadosMensais}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="atividades" fill="#111827" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Classificação de atividades">
          {data.dadosClassificacao.length === 0 ? <p className="text-sm text-gray-400">Sem dados disponíveis.</p> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.dadosClassificacao} dataKey="quantidade" nameKey="display" outerRadius={86} innerRadius={48} paddingAngle={3}>
                    {data.dadosClassificacao.map((entry, index) => <Cell key={entry.nome} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <SectionCard title="Agenda"><AgendaCard programacao={data.programacao} /></SectionCard>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500 border border-gray-200 rounded-2xl px-4 py-3 bg-white">
        <span>Dados sincronizados com relatórios aprovados. Programação é usada apenas para agenda e atividades previstas.</span>
        {lastUpdate && <span>Última atualização: {lastUpdate.toLocaleString('pt-BR')}</span>}
      </div>
    </div>
  );
}
