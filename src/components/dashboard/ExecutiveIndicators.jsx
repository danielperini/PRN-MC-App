import React from 'react';

const MONTH_ORDER = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

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

function getDataAtividade(a) {
  return a?.data_realizacao || a?.data_programacao || a?.data || a?.created_date || null;
}

function getPublicoAtividade(a) {
  const publicoDireto =
    Number(a?.publico_total) ||
    Number(a?.publico_estimado) ||
    Number(a?.publico) ||
    0;

  if (publicoDireto > 0) return publicoDireto;

  const publicoMedio =
    Number(a?.publico_medio) ||
    Number(a?.publico_medio_sessao) ||
    Number(a?.publico_por_sessao) ||
    0;

  const vezes =
    Number(a?.quantas_vezes_ocorreu) ||
    Number(a?.qtd_ocorrencias) ||
    Number(a?.ocorrencias) ||
    1;

  return publicoMedio * vezes;
}

export default function ExecutiveIndicators({ reports = [], programacao = [] }) {
  const now = new Date();
  const mesAtual = now.getMonth() + 1;
  const anoAtual = now.getFullYear();

  const todasAtividades = [
    ...(reports || []).flatMap(r => Array.isArray(r.atividades) ? r.atividades : []),
    ...(programacao || [])
  ];

  const atividadesMesAtual = React.useMemo(() => {
    return todasAtividades.filter(a => {
      const dataField = getDataAtividade(a);
      if (!dataField) return false;

      const d = new Date(dataField);
      if (Number.isNaN(d.getTime())) return false;

      return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual;
    }).length;
  }, [todasAtividades, mesAtual, anoAtual]);

  const publicoTotal = React.useMemo(() => {
    return todasAtividades.reduce((sum, a) => sum + getPublicoAtividade(a), 0);
  }, [todasAtividades]);

  const publicoMesAtual = React.useMemo(() => {
    return todasAtividades.reduce((sum, a) => {
      const dataField = getDataAtividade(a);
      if (!dataField) return sum;

      const d = new Date(dataField);
      if (Number.isNaN(d.getTime())) return sum;

      const isMesAtual = d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual;
      if (!isMesAtual) return sum;

      return sum + getPublicoAtividade(a);
    }, 0);
  }, [todasAtividades, mesAtual, anoAtual]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      <CardSection title="Atividades (mês)">
        <div className="text-3xl font-bold text-black">
          {atividadesMesAtual.toLocaleString('pt-BR')}
        </div>
      </CardSection>

      <CardSection title="Atividades (acumulado)">
        <div className="text-3xl font-bold text-black">
          {todasAtividades.length.toLocaleString('pt-BR')}
        </div>
      </CardSection>

      <CardSection title="Público Total">
        <div className="text-3xl font-bold text-black">
          {Math.round(publicoTotal).toLocaleString('pt-BR')}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {Math.round(publicoMesAtual).toLocaleString('pt-BR')} este mês
        </p>
      </CardSection>

    </div>
  );
}
