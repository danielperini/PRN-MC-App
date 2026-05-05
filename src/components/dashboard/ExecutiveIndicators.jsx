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
  return a?.data_realizacao || a?.data_programacao || a?.data_inicio || a?.data || a?.created_date || null;
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

function isReportAprovado(report) {
  const status = String(report?.status || '').trim().toUpperCase();
  return status === 'APPROVED' || status === 'APROVADO';
}

function getPeriodoAnterior() {
  const now = new Date();
  const mesAnteriorIndex = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const anoAnterior = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  return {
    mesIndex: mesAnteriorIndex,
    mesNumero: mesAnteriorIndex + 1,
    mesNome: MONTH_ORDER[mesAnteriorIndex],
    ano: anoAnterior,
  };
}

function deduplicarAtividades(atividades) {
  const seen = new Set();

  return (atividades || []).filter((a) => {
    const titulo = String(a?.titulo || a?.nome || a?.descricao || '').trim().toLowerCase();
    const data = String(getDataAtividade(a) || '').trim();

    if (!titulo && !data) return true;

    const key = `${titulo}|${data}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function atividadePertenceAoPeriodo(a, periodo) {
  const dataField = getDataAtividade(a);
  if (!dataField) return true;

  const d = new Date(dataField);
  if (Number.isNaN(d.getTime())) return true;

  return d.getMonth() + 1 === periodo.mesNumero && d.getFullYear() === periodo.ano;
}

export default function ExecutiveIndicators({ reports = [], programacao = [] }) {
  const periodoAnterior = React.useMemo(() => getPeriodoAnterior(), []);

  const reportsAprovadosMesAnterior = React.useMemo(() => {
    return (reports || []).filter((r) => {
      if (!isReportAprovado(r)) return false;

      const mesReferencia = String(r?.mes_referencia || r?.mes || '').trim();
      const anoReferencia = Number(r?.ano || r?.ano_referencia || periodoAnterior.ano);

      return mesReferencia === periodoAnterior.mesNome && anoReferencia === periodoAnterior.ano;
    });
  }, [reports, periodoAnterior]);

  const atividadesMesAnterior = React.useMemo(() => {
    const atividades = reportsAprovadosMesAnterior.flatMap((r) => Array.isArray(r.atividades) ? r.atividades : []);
    const filtradasPorData = atividades.filter((a) => atividadePertenceAoPeriodo(a, periodoAnterior));
    return deduplicarAtividades(filtradasPorData);
  }, [reportsAprovadosMesAnterior, periodoAnterior]);

  const todasAtividadesAprovadas = React.useMemo(() => {
    const atividadesRelatorios = (reports || [])
      .filter(isReportAprovado)
      .flatMap((r) => Array.isArray(r.atividades) ? r.atividades : []);

    return deduplicarAtividades(atividadesRelatorios);
  }, [reports]);

  const publicoTotal = React.useMemo(() => {
    return todasAtividadesAprovadas.reduce((sum, a) => sum + getPublicoAtividade(a), 0);
  }, [todasAtividadesAprovadas]);

  const publicoMesAnterior = React.useMemo(() => {
    return atividadesMesAnterior.reduce((sum, a) => sum + getPublicoAtividade(a), 0);
  }, [atividadesMesAnterior]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      <CardSection title={`Atividades (${periodoAnterior.mesNome}/${periodoAnterior.ano} aprovadas)`}>
        <div className="text-3xl font-bold text-black">
          {atividadesMesAnterior.length.toLocaleString('pt-BR')}
        </div>
      </CardSection>

      <CardSection title="Atividades (acumulado aprovado)">
        <div className="text-3xl font-bold text-black">
          {todasAtividadesAprovadas.length.toLocaleString('pt-BR')}
        </div>
      </CardSection>

      <CardSection title="Público Total (aprovado)">
        <div className="text-3xl font-bold text-black">
          {Math.round(publicoTotal).toLocaleString('pt-BR')}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {Math.round(publicoMesAnterior).toLocaleString('pt-BR')} em {periodoAnterior.mesNome}/{periodoAnterior.ano}
        </p>
      </CardSection>

    </div>
  );
}
