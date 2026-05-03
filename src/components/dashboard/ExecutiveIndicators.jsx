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

export default function ExecutiveIndicators({ reports = [], programacao = [] }) {
  const TOTAL_PREVISTO = 1320000;

  const now = new Date();
  const mesAtual = now.getMonth() + 1;
  const anoAtual = now.getFullYear();

  // 🔥 UNIFICAÇÃO CORRETA (igual DashboardPatrocinador)
  const todasAtividades = [
    ...(reports || []).flatMap(r => Array.isArray(r.atividades) ? r.atividades : []),
    ...(programacao || [])
  ];

  // ✅ ATIVIDADES POR MÊS (CORRIGIDO)
  const activitiesByMonth = React.useMemo(() => {
    const map = {};

    todasAtividades.forEach(a => {
      const dataField = a?.data_realizacao || a?.data_programacao;
      if (!dataField) return;

      const d = new Date(dataField);
      const mesNome = MONTH_ORDER[d.getMonth()];

      if (!map[mesNome]) {
        map[mesNome] = { atividades: 0, publico: 0 };
      }

      map[mesNome].atividades += 1;
      map[mesNome].publico += Number(a?.publico_total || a?.publico_estimado) || 0;
    });

    return MONTH_ORDER
      .filter(m => map[m])
      .map(m => ({
        mes: m.slice(0, 3),
        atividades: map[m].atividades,
        publico: map[m].publico
      }));
  }, [todasAtividades]);

  // ✅ ATIVIDADES DO MÊS ATUAL (FIX PRINCIPAL)
  const atividadesMesAtual = React.useMemo(() => {
    return todasAtividades.filter(a => {
      const dataField = a?.data_realizacao || a?.data_programacao;
      if (!dataField) return false;

      const d = new Date(dataField);
      return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual;
    }).length;
  }, [todasAtividades, mesAtual, anoAtual]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      
      <CardSection title="Atividades (mês)">
        <div className="text-3xl font-bold text-black">
          {atividadesMesAtual}
        </div>
      </CardSection>

      <CardSection title="Atividades (acumulado)">
        <div className="text-3xl font-bold text-black">
          {todasAtividades.length}
        </div>
      </CardSection>

    </div>
  );
}
