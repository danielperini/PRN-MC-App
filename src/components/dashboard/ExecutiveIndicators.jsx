import React from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, Wallet, UserRound, BarChart3, CalendarDays } from 'lucide-react';

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

function MiniBar({ label, value, max, color = 'bg-black' }) {
  const safeValue = toInt(value);
  const safeMax = Math.max(toInt(max), 1);
  const pct = Math.min((safeValue / safeMax) * 100, 100);

  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span className="truncate max-w-[60%]">{label}</span>
        <span className="font-semibold text-black">{fmtInt(safeValue)}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CardSection({ title, children, empty, className = '' }) {
  return (
    <div className={`border border-gray-200 rounded-2xl p-4 bg-white shadow-sm ${className}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      {empty ? (
        <p className="text-xs text-gray-400">Sem dados disponíveis</p>
      ) : children}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, highlight = false, helper }) {
  return (
    <div className={`p-5 border rounded-2xl transition-all shadow-sm min-w-0 ${
      highlight
        ? 'border-black bg-black text-white shadow-md'
        : 'border-gray-200 bg-white hover:shadow-md'
    }`}>
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-white' : 'text-gray-500'}`} />}
        <span className={`text-[11px] font-semibold uppercase tracking-wide truncate ${highlight ? 'text-gray-300' : 'text-gray-500'}`}>
          {label}
        </span>
      </div>
      <p className={`text-3xl font-bold leading-tight truncate ${highlight ? 'text-white' : 'text-black'}`}>
        {value}
      </p>
      {helper && (
        <p className={`text-xs mt-1 truncate ${highlight ? 'text-gray-300' : 'text-gray-500'}`}>
          {helper}
        </p>
      )}
    </div>
  );
}

export default function ExecutiveIndicators({ reports = [], rubricas = [], teamMembers = [], team = [] }) {
  const TOTAL_PREVISTO = 1320000;
  const [atividadesPrevistasMes, setAtividadesPrevistasMes] = React.useState(0);

  React.useEffect(() => {
    let mounted = true;

    async function carregarProgramacaoMesAtual() {
      try {
        const hoje = new Date();
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();

        const lista = await base44.entities.Programacao.list('-data_realizacao', 1000).catch(() => []);

        const total = (lista || []).filter((item) => {
          const d = getProgramacaoDate(item);
          if (!d) return false;

          const status = String(item?.status || item?.situacao || '').toUpperCase();
          if (['CANCELADO', 'CANCELADA', 'INATIVO', 'INATIVA'].includes(status)) return false;

          return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
        }).length;

        if (mounted) setAtividadesPrevistasMes(total);
      } catch (e) {
        if (mounted) setAtividadesPrevistasMes(0);
      }
    }

    carregarProgramacaoMesAtual();

    return () => {
      mounted = false;
    };
  }, []);

  const activitiesByMonth = React.useMemo(() => {
    const map = {};

    reports.forEach(r => {
      const mes = r.mes_referencia;
      if (!mes) return;

      if (!map[mes]) map[mes] = { atividades: 0, publico: 0 };

      (Array.isArray(r.atividades) ? r.atividades : []).forEach(a => {
        const vezes = Number(a.quantas_vezes_ocorreu || 1);
        const pub = Number(a.publico_medio || a.publico_estimado || a.publico_total || a.publico || 0);

        map[mes].atividades += vezes;
        map[mes].publico += vezes * pub;
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
      const reps = reports.filter(r => r.museu === museu || r.museu_secundario === museu);
      let atividades = 0;
      let publico = 0;

      reps.forEach(r => {
        (Array.isArray(r.atividades) ? r.atividades : []).forEach(a => {
          const vezes = Number(a.quantas_vezes_ocorreu || 1);
          const pub = Number(a.publico_medio || a.publico_estimado || a.publico_total || a.publico || 0);

          atividades += vezes;
          publico += vezes * pub;
        });
      });

      return {
        museu,
        relatorios: reps.length,
        atividades: toInt(atividades),
        publico: toInt(publico),
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

  const equipeList = Array.isArray(teamMembers) && teamMembers.length > 0 ? teamMembers : team;
  const totalEquipe = Array.isArray(equipeList) ? equipeList.filter(m => m?.ativo !== false).length : 0;

  const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });

  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-black">Indicadores Executivos</h2>
          <p className="text-xs text-gray-500 mt-0.5">
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

        <KpiCard
          label="Equipe"
          value={fmtInt(totalEquipe)}
          icon={UserRound}
          helper="membros ativos"
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
            <MiniBar key={m.mes} label={m.mes} value={m.atividades} max={maxAtiv} />
          ))}
        </CardSection>

        <CardSection title="Público por Mês" empty={activitiesByMonth.length === 0}>
          {activitiesByMonth.map(m => (
            <MiniBar key={m.mes} label={m.mes} value={m.publico} max={maxPub} color="bg-gray-700" />
          ))}
        </CardSection>

        <CardSection title="Classificação de Atividades" empty={totalClasse === 0}>
          {[
            { label: 'Meta', value: classificacaoStats.META, color: 'bg-black' },
            { label: 'Rotina', value: classificacaoStats.ROTINA, color: 'bg-gray-500' },
            { label: 'Extra', value: classificacaoStats.EXTRA, color: 'bg-gray-300' },
          ].map(item => (
            <MiniBar key={item.label} label={item.label} value={item.value} max={Math.max(totalClasse, 1)} color={item.color} />
          ))}

          {totalClasse > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Total: {fmtInt(totalClasse)} atividade{totalClasse !== 1 ? 's' : ''}
            </p>
          )}
        </CardSection>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <CardSection title="Comparativo por Museu" empty={comparativoMuseu.every(m => m.relatorios === 0)} className="xl:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {comparativoMuseu.map(m => (
              <div key={m.museu} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-black">{m.museu}</span>
                  <span className="text-xs text-gray-500">{fmtInt(m.relatorios)} rel.</span>
                </div>
                <MiniBar label="Atividades" value={m.atividades} max={maxMuseuAtiv} />
                <MiniBar label="Público" value={m.publico} max={maxMuseuPub} color="bg-gray-600" />
              </div>
            ))}
          </div>
        </CardSection>

        <CardSection title="Execução Orçamentária" empty={false}>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Previsto</span>
              <span className="font-semibold text-black">{fmtBRL(TOTAL_PREVISTO)}</span>
            </div>

            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Utilizado</span>
              <span className="font-semibold text-black">{fmtBRL(orcamento.totalUtilizado)}</span>
            </div>

            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Saldo</span>
              <span className={`font-semibold ${orcamento.saldo >= 0 ? 'text-black' : 'text-red-600'}`}>
                {fmtBRL(orcamento.saldo)}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Execução</span>
                <span>{orcamento.percentual.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-2 rounded-full bg-black transition-all"
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
