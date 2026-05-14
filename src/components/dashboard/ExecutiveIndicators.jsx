import React from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, Wallet, BarChart3, CalendarDays, MapPin } from 'lucide-react';

const MONTH_ORDER = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function fmtInt(value) {
  return toInt(value).toLocaleString('pt-BR');
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatDateBR(date) {
  if (!date) return '—';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function getProgramacaoDate(item) {
  const raw =
    item?.data_realizacao ||
    item?.data_programacao ||
    item?.data_inicio ||
    item?.data ||
    item?.inicio ||
    '';

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

function getProgramacaoTitle(item) {
  return (
    item?.nome_acao ||
    item?.titulo ||
    item?.atividade ||
    item?.nome ||
    item?.evento ||
    'Atividade programada'
  );
}

function getProgramacaoMuseu(item) {
  return (
    item?.museu ||
    item?.centro_custo ||
    item?.local_museu ||
    item?.equipamento ||
    item?.local ||
    'Museus Centro'
  );
}

function MiniBar({ label, value, max, color = 'bg-primary' }) {
  const safeValue = toInt(value);
  const safeMax = Math.max(toInt(max), 1);
  const pct = Math.min((safeValue / safeMax) * 100, 100);

  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span className="truncate max-w-[60%]">{label}</span>
        <span className="font-semibold text-foreground">{fmtInt(safeValue)}</span>
      </div>
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-1 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CardSection({ title, children, empty, className = '' }) {
  return (
    <div className={`border border-border rounded-2xl p-4 bg-card shadow-sm ${className}`}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
      {empty ? (
        <p className="text-xs text-muted-foreground">Sem dados disponíveis</p>
      ) : children}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, highlight = false, helper }) {
  return (
    <div className={`p-5 border rounded-2xl transition-all shadow-sm min-w-0 ${
      highlight
        ? 'border-primary bg-primary text-primary-foreground shadow-md'
        : 'border-border bg-card hover:shadow-md'
    }`}>
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-primary-foreground' : 'text-muted-foreground'}`} />}
        <span className={`text-[11px] font-semibold uppercase tracking-wide truncate ${highlight ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {label}
        </span>
      </div>
      <p className={`text-xl font-bold leading-tight ${highlight ? 'text-primary-foreground' : 'text-foreground'}`}>
        {value}
      </p>
      {helper && (
        <p className={`text-xs mt-1 truncate ${highlight ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          {helper}
        </p>
      )}
    </div>
  );
}

function AgendaKpiCard({ agendaItems = [], agendaDate, agendaIndex }) {
  const current = agendaItems.length > 0 ? agendaItems[agendaIndex % agendaItems.length] : null;
  const hoje = new Date();
  const isHoje = agendaDate && sameDay(agendaDate, hoje);

  return (
    <div className="p-5 border border-border rounded-2xl transition-all shadow-sm min-w-0 bg-card hover:shadow-md">
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <CalendarDays className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wide truncate text-muted-foreground">
          {isHoje ? 'Agenda de hoje' : 'Próxima agenda'}
        </span>
      </div>

      {current ? (
        <>
          <p className="text-3xl font-bold leading-tight truncate text-foreground">
            {formatDateBR(agendaDate)}
          </p>
          <p className="text-xs mt-1 truncate text-muted-foreground">
            {getProgramacaoTitle(current)}
          </p>
          <p className="text-xs mt-1 truncate text-foreground font-semibold flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {getProgramacaoMuseu(current)}
          </p>

          {agendaItems.length > 1 && (
            <div className="flex items-center gap-1 mt-3">
              {agendaItems.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1 rounded-full transition-all ${
                    idx === agendaIndex % agendaItems.length ? 'w-5 bg-primary' : 'w-1.5 bg-muted'
                  }`}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-3xl font-bold leading-tight truncate text-foreground">—</p>
          <p className="text-xs mt-1 truncate text-muted-foreground">sem atividade futura</p>
        </>
      )}
    </div>
  );
}

export default function ExecutiveIndicators({ reports = [], rubricas = [] }) {
  const TOTAL_PREVISTO = 1320000;
  const [atividadesPrevistasMes, setAtividadesPrevistasMes] = React.useState(0);
  const [agendaItems, setAgendaItems] = React.useState([]);
  const [agendaDate, setAgendaDate] = React.useState(null);
  const [agendaIndex, setAgendaIndex] = React.useState(0);

  React.useEffect(() => {
    let mounted = true;

    async function carregarProgramacao() {
      try {
        const hoje = new Date();
        const hojeInicio = startOfDay(hoje);
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();

        const lista = await base44.entities.Programacao.list('-data_realizacao', 1000).catch(() => []);

        const ativos = (lista || []).filter((item) => {
          const status = String(item?.status || item?.situacao || '').toUpperCase();
          return !['CANCELADO', 'CANCELADA', 'INATIVO', 'INATIVA'].includes(status);
        });

        const totalMes = ativos.filter((item) => {
          const d = getProgramacaoDate(item);
          if (!d) return false;
          return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
        }).length;

        const futuras = ativos
          .map((item) => ({ item, date: getProgramacaoDate(item) }))
          .filter(({ date }) => date && startOfDay(date).getTime() >= hojeInicio.getTime())
          .sort((a, b) => startOfDay(a.date).getTime() - startOfDay(b.date).getTime());

        const targetDate = futuras[0]?.date || null;
        const itemsMesmoDia = targetDate
          ? futuras.filter(({ date }) => sameDay(date, targetDate)).map(({ item }) => item)
          : [];

        if (mounted) {
          setAtividadesPrevistasMes(totalMes);
          setAgendaDate(targetDate);
          setAgendaItems(itemsMesmoDia);
          setAgendaIndex(0);
        }
      } catch {
        if (mounted) {
          setAtividadesPrevistasMes(0);
          setAgendaDate(null);
          setAgendaItems([]);
          setAgendaIndex(0);
        }
      }
    }

    carregarProgramacao();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (agendaItems.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setAgendaIndex((prev) => (prev + 1) % agendaItems.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [agendaItems.length]);

  // REGRA: só contar atividades com público_total > 0 (público de atividades/eventos)
  // publico_geral_declarado do relatório é exibido separadamente, nunca somado aqui
  const activitiesByMonth = React.useMemo(() => {
    const map = {};

    reports.forEach(r => {
      if (!['APPROVED', 'APROVADO'].includes(String(r.status || '').toUpperCase())) return;
      const mes = r.mes_referencia;
      if (!mes) return;

      if (!map[mes]) map[mes] = { atividades: 0, publico: 0 };

      (Array.isArray(r.atividades) ? r.atividades : []).forEach(a => {
        // Usar publico_total como fonte primária
        const pubTotal = toInt(a.publico_total ?? 0);
        if (pubTotal > 0) {
          map[mes].atividades += 1;
          map[mes].publico += pubTotal;
          return;
        }
        // Fallback: publico_estimado * quantas_repeticoes
        const pubEst = toInt(a.publico_estimado ?? 0);
        const reps = toInt(a.quantas_repeticoes ?? 1);
        if (pubEst > 0) {
          map[mes].atividades += 1;
          map[mes].publico += pubEst * Math.max(reps, 1);
        }
        // publico = 0 → NÃO contabilizar
      });
    });

    return MONTH_ORDER
      .filter(m => map[m])
      .map(m => ({
        mes: m.slice(0, 3),
        atividades: toInt(map[m].atividades),
        publico: toInt(map[m].publico),
      }));
  }, [reports]);

  const classificacaoStats = React.useMemo(() => {
    const map = { META: 0, ROTINA: 0, EXTRA: 0 };

    reports.forEach(r => {
      (Array.isArray(r.atividades) ? r.atividades : []).forEach(a => {
        const vezes = Number(a.quantas_vezes_ocorreu || 1);
        const cls = String(a.classificacao || '').toUpperCase();
        if (map[cls] !== undefined) map[cls] += vezes;
      });
    });

    return {
      META: toInt(map.META),
      ROTINA: toInt(map.ROTINA),
      EXTRA: toInt(map.EXTRA),
    };
  }, [reports]);

  const comparativoMuseu = React.useMemo(() => {
    return MUSEUS.map(museu => {
      const reps = reports.filter(r =>
        ['APPROVED', 'APROVADO'].includes(String(r.status || '').toUpperCase()) &&
        (r.museu === museu || r.museu_secundario === museu)
      );
      let totalAtividades = 0;
      let atividadesComPublico = 0;
      let publico = 0;
      let publicoGeral = 0;

      reps.forEach(r => {
        // Público geral declarado — separado, não entra na soma de atividades
        publicoGeral += toInt(r.publico_geral_declarado ?? 0);

        (Array.isArray(r.atividades) ? r.atividades : []).forEach(a => {
          totalAtividades += 1;
          const pubTotal = toInt(a.publico_total ?? 0);
          if (pubTotal > 0) {
            atividadesComPublico += 1;
            publico += pubTotal;
            return;
          }
          const pubEst = toInt(a.publico_estimado ?? 0);
          const reps2 = toInt(a.quantas_repeticoes ?? 1);
          if (pubEst > 0) {
            atividadesComPublico += 1;
            publico += pubEst * Math.max(reps2, 1);
          }
          // sem público → não contar
        });
      });

      return {
        museu,
        relatorios: reps.length,
        atividades: totalAtividades,
        atividadesComPublico,
        publico: toInt(publico),
        publicoGeral: toInt(publicoGeral),
        mediaPublico: atividadesComPublico > 0 ? Math.round(publico / atividadesComPublico) : 0,
      };
    });
  }, [reports]);

  const orcamento = React.useMemo(() => {
    const totalUtilizado = rubricas.reduce((acc, r) => acc + Number(r.valor_utilizado || 0), 0);
    const saldo = TOTAL_PREVISTO - totalUtilizado;
    const percentual = TOTAL_PREVISTO > 0 ? (totalUtilizado / TOTAL_PREVISTO) * 100 : 0;

    return {
      totalUtilizado,
      saldo,
      percentual,
    };
  }, [rubricas]);

  const ultimoMes = activitiesByMonth[activitiesByMonth.length - 1] || {
    mes: '—',
    atividades: 0,
    publico: 0,
  };

  const totalClasse = classificacaoStats.META + classificacaoStats.ROTINA + classificacaoStats.EXTRA;
  const maxAtiv = activitiesByMonth.length > 0 ? Math.max(...activitiesByMonth.map(m => m.atividades), 1) : 1;
  const maxPub = activitiesByMonth.length > 0 ? Math.max(...activitiesByMonth.map(m => m.publico), 1) : 1;
  const maxMuseuAtiv = Math.max(...comparativoMuseu.map(m => m.atividades), 1);
  const maxMuseuPub = Math.max(...comparativoMuseu.map(m => m.publico), 1);

  const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Indicadores Executivos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Síntese operacional, agenda, museus e execução financeira.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          label={`Atividades ${ultimoMes.mes}`}
          value={fmtInt(ultimoMes.atividades)}
          icon={Activity}
          highlight
          helper="relatórios aprovados"
        />

        <KpiCard
          label="Atividades previstas"
          value={fmtInt(atividadesPrevistasMes)}
          icon={CalendarDays}
          highlight
          helper="mês atual na agenda"
        />

        <AgendaKpiCard
          agendaItems={agendaItems}
          agendaDate={agendaDate}
          agendaIndex={agendaIndex}
        />

        <KpiCard
          label="Execução"
          value={`${orcamento.percentual.toFixed(1)}%`}
          icon={BarChart3}
          helper="orçamento utilizado"
        />

        <KpiCard
          label="Utilizado"
          value={fmtBRL(orcamento.totalUtilizado)}
          icon={Wallet}
          helper="valor realizado"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection title="Atividades por Mês" empty={activitiesByMonth.length === 0}>
          {activitiesByMonth.map(m => (
            <MiniBar key={m.mes} label={m.mes} value={m.atividades} max={maxAtiv} color="bg-primary" />
          ))}
        </CardSection>

        <CardSection title="Público por Mês" empty={activitiesByMonth.length === 0}>
          {activitiesByMonth.map(m => (
            <MiniBar key={m.mes} label={m.mes} value={m.publico} max={maxPub} color="bg-chart-secondary" />
          ))}
        </CardSection>

        <CardSection title="Classificação de Atividades" empty={totalClasse === 0}>
          {[
            { label: 'Meta', value: classificacaoStats.META, color: 'bg-primary' },
            { label: 'Rotina', value: classificacaoStats.ROTINA, color: 'bg-chart-secondary' },
            { label: 'Extra', value: classificacaoStats.EXTRA, color: 'bg-muted' },
          ].map(item => (
            <MiniBar key={item.label} label={item.label} value={item.value} max={Math.max(totalClasse, 1)} color={item.color} />
          ))}

          {totalClasse > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Total: {fmtInt(totalClasse)} atividade{totalClasse !== 1 ? 's' : ''}
            </p>
          )}
        </CardSection>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <CardSection title="Comparativo por Museu" empty={comparativoMuseu.every(m => m.relatorios === 0)} className="xl:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {comparativoMuseu.map(m => (
              <div key={m.museu} className="border border-border rounded-xl p-3 bg-secondary/50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-foreground">{m.museu}</span>
                  <span className="text-xs text-muted-foreground">{fmtInt(m.relatorios)} rel.</span>
                </div>

                {m.publicoGeral > 0 && (
                  <div className="border-t border-border pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Público Geral Declarado</p>
                    <p className="text-sm font-bold text-foreground">{fmtInt(m.publicoGeral)}</p>
                  </div>
                )}

                <div className={m.publicoGeral > 0 ? 'border-t border-dashed border-border pt-2' : ''}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Atividades com Público</p>
                  <MiniBar label={`${fmtInt(m.atividadesComPublico)} de ${fmtInt(m.atividades)}`} value={m.atividadesComPublico} max={maxMuseuAtiv} color="bg-primary" />
                  <MiniBar label={`Participantes`} value={m.publico} max={maxMuseuPub} color="bg-chart-secondary" />
                  {m.mediaPublico > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">Média: {fmtInt(m.mediaPublico)} por atividade</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardSection>

        <CardSection title="Execução Orçamentária" empty={false}>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Previsto</span>
              <span className="font-semibold text-foreground">{fmtBRL(TOTAL_PREVISTO)}</span>
            </div>

            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Utilizado</span>
              <span className="font-semibold text-foreground">{fmtBRL(orcamento.totalUtilizado)}</span>
            </div>

            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Saldo</span>
              <span className={`font-semibold ${orcamento.saldo >= 0 ? 'text-foreground' : 'text-status-error'}`}>
                {fmtBRL(orcamento.saldo)}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Execução</span>
                <span>{orcamento.percentual.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(orcamento.percentual, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </CardSection>
      </div>
    </div>
  );
}