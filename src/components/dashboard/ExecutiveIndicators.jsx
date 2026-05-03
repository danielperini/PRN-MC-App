import React from 'react';

const MONTH_ORDER = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function MiniBar({ label, value, max, color = 'bg-black', suffix = '' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span className="truncate max-w-[60%]">{label}</span>
        <span className="font-medium text-black">{value.toLocaleString('pt-BR')}{suffix}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CardSection({ title, children, empty }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      {empty ? (
        <p className="text-xs text-gray-400">Sem dados disponíveis</p>
      ) : children}
    </div>
  );
}

export default function ExecutiveIndicators({ reports = [], rubricas = [] }) {
  const TOTAL_PREVISTO = 1320000;

  // Atividades por mês
  const activitiesByMonth = React.useMemo(() => {
    const map = {};
    reports.forEach(r => {
      const mes = r.mes_referencia;
      if (!mes) return;
      if (!map[mes]) map[mes] = { atividades: 0, publico: 0 };
      (Array.isArray(r.atividades) ? r.atividades : []).forEach(a => {
        const vezes = Number(a.quantas_vezes_ocorreu || 1);
        const pub = Number(a.publico_medio || a.publico_estimado || 0);
        map[mes].atividades += vezes;
        map[mes].publico += vezes * pub;
      });
    });
    return MONTH_ORDER
      .filter(m => map[m])
      .map(m => ({ mes: m.slice(0, 3), atividades: map[m].atividades, publico: map[m].publico }));
  }, [reports]);

  // Classificação META/ROTINA/EXTRA
  const classificacaoStats = React.useMemo(() => {
    const map = { META: 0, ROTINA: 0, EXTRA: 0 };
    reports.forEach(r => {
      (Array.isArray(r.atividades) ? r.atividades : []).forEach(a => {
        const vezes = Number(a.quantas_vezes_ocorreu || 1);
        const cls = a.classificacao;
        if (map[cls] !== undefined) map[cls] += vezes;
      });
    });
    return map;
  }, [reports]);

  // Comparativo por museu
  const comparativoMuseu = React.useMemo(() => {
    return MUSEUS.map(museu => {
      const reps = reports.filter(r => r.museu === museu || r.museu_secundario === museu);
      let atividades = 0, publico = 0;
      reps.forEach(r => {
        (Array.isArray(r.atividades) ? r.atividades : []).forEach(a => {
          const vezes = Number(a.quantas_vezes_ocorreu || 1);
          const pub = Number(a.publico_medio || a.publico_estimado || 0);
          atividades += vezes;
          publico += vezes * pub;
        });
      });
      return { museu, relatorios: reps.length, atividades, publico };
    });
  }, [reports]);

  // Orçamento
  const orcamento = React.useMemo(() => {
    const totalUtilizado = rubricas.reduce((acc, r) => acc + Number(r.valor_utilizado || 0), 0);
    const saldo = TOTAL_PREVISTO - totalUtilizado;
    const percentual = TOTAL_PREVISTO > 0 ? (totalUtilizado / TOTAL_PREVISTO) * 100 : 0;
    return { totalUtilizado, saldo, percentual };
  }, [rubricas]);

  const maxAtiv = activitiesByMonth.length > 0 ? Math.max(...activitiesByMonth.map(m => m.atividades)) : 0;
  const maxPub  = activitiesByMonth.length > 0 ? Math.max(...activitiesByMonth.map(m => m.publico)) : 0;
  const maxMuseuAtiv = Math.max(...comparativoMuseu.map(m => m.atividades), 1);
  const totalClasse = classificacaoStats.META + classificacaoStats.ROTINA + classificacaoStats.EXTRA;

  const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  return (
    <div className="mt-8">
      <h2 className="text-lg font-medium text-black mb-4">Indicadores Executivos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Atividades por mês */}
        <CardSection title="Atividades por Mês" empty={activitiesByMonth.length === 0}>
          {activitiesByMonth.map(m => (
            <MiniBar key={m.mes} label={m.mes} value={m.atividades} max={maxAtiv} />
          ))}
        </CardSection>

        {/* Público por mês */}
        <CardSection title="Público por Mês" empty={activitiesByMonth.length === 0}>
          {activitiesByMonth.map(m => (
            <MiniBar key={m.mes} label={m.mes} value={m.publico} max={maxPub} color="bg-gray-600" />
          ))}
        </CardSection>

        {/* Classificação */}
        <CardSection title="Classificação de Atividades" empty={totalClasse === 0}>
          {[
            { label: 'Meta', value: classificacaoStats.META, color: 'bg-black' },
            { label: 'Rotina', value: classificacaoStats.ROTINA, color: 'bg-gray-500' },
            { label: 'Extra', value: classificacaoStats.EXTRA, color: 'bg-gray-300' },
          ].map(item => (
            <MiniBar key={item.label} label={item.label} value={item.value} max={Math.max(totalClasse, 1)} color={item.color} />
          ))}
          {totalClasse > 0 && (
            <p className="text-xs text-gray-400 mt-2">Total: {totalClasse} atividade{totalClasse !== 1 ? 's' : ''}</p>
          )}
        </CardSection>

        {/* Comparativo por Museu */}
        <CardSection title="Comparativo por Museu" empty={comparativoMuseu.every(m => m.relatorios === 0)}>
          {comparativoMuseu.map(m => (
            <div key={m.museu} className="mb-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-black">{m.museu}</span>
                <span className="text-xs text-gray-500">{m.relatorios} rel.</span>
              </div>
              <MiniBar label="Atividades" value={m.atividades} max={maxMuseuAtiv} />
              <MiniBar label="Público" value={m.publico} max={Math.max(...comparativoMuseu.map(x => x.publico), 1)} color="bg-gray-500" />
            </div>
          ))}
        </CardSection>

        {/* Execução Orçamentária */}
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
              <span className={`font-semibold ${orcamento.saldo >= 0 ? 'text-black' : 'text-red-600'}`}>{fmtBRL(orcamento.saldo)}</span>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Execução</span>
                <span>{orcamento.percentual.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full">
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