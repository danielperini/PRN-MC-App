import React from 'react';
import { CheckCircle2, AlertCircle, Target } from 'lucide-react';

const METAS_ADITIVO = [
  {
    numero: 'META 01',
    titulo: 'Equipe principal',
    percentual: 100,
    detalhe: 'Cargos previstos e cargos ocupados na equipe',
    indicador: '100% concluído · contagem de cargos ativa',
    status: 'CONCLUÍDA',
  },
  {
    numero: 'META 02',
    titulo: 'Plano de comunicação',
    percentual: 0,
    detalhe: 'Quantidade de peças produzidas',
    indicador: 'Aguardando consolidação de peças',
    status: 'A MONITORAR',
  },
  {
    numero: 'META 03',
    titulo: 'Manutenção das exposições',
    percentual: 0,
    detalhe: 'Execução financeira da rubrica de manutenção, sem educadoras',
    indicador: 'Percentual da rubrica utilizada',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 04',
    titulo: 'Alteração de núcleos e salas expositivas',
    percentual: 0,
    detalhe: 'Duas atividades previstas, 50% cada',
    indicador: 'Atividade 1 + Atividade 2',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 05',
    titulo: '30 atividades culturais ou educativas',
    percentual: 0,
    detalhe: 'Atividades únicas confirmadas por programação, relatórios e vínculos',
    indicador: '0/30 atividades validadas',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 06',
    titulo: 'Incorporada operacionalmente à META 05',
    percentual: 0,
    detalhe: 'Mantida na numeração oficial para prestação de contas',
    indicador: 'Não operacionalizar separadamente',
    status: 'DOCUMENTAL',
  },
  {
    numero: 'META 07',
    titulo: 'Contratação de educadores',
    percentual: 100,
    detalhe: 'Educadores contratados para MIS, MUMO e MHAB',
    indicador: '100% concluído',
    status: 'CONCLUÍDA',
  },
  {
    numero: 'META 08',
    titulo: 'Não considerar',
    percentual: 0,
    detalhe: 'Meta não operacionalizada em 2026',
    indicador: 'Ignorada no acompanhamento operacional',
    status: 'NÃO CONSIDERAR',
  },
  {
    numero: 'META 09',
    titulo: 'Não considerar',
    percentual: 0,
    detalhe: 'Meta não operacionalizada em 2026',
    indicador: 'Ignorada no acompanhamento operacional',
    status: 'NÃO CONSIDERAR',
  },
  {
    numero: 'META 10',
    titulo: 'Mostras e exposições',
    percentual: 50,
    detalhe: 'Uma no MHAB e uma no MIS',
    indicador: '1/2 mostras realizadas ou em curso',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 11',
    titulo: 'Noturno nos Museus',
    percentual: 0,
    detalhe: 'Atividades realizadas no Noturno, cada atividade conta percentual',
    indicador: 'A validar pela programação e relatórios',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 12',
    titulo: 'Exposição MHAB',
    percentual: 0,
    detalhe: 'Pesquisa, identidade visual, curadoria e expografia',
    indicador: 'Andamento identificado em relatórios, NFs e evidências',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 13',
    titulo: 'Leis de incentivo e editais',
    percentual: 0,
    detalhe: 'Ao menos uma inscrição/submissão',
    indicador: '0% sem submissão · 100% com uma submissão',
    status: 'A MONITORAR',
  },
  {
    numero: 'META 14',
    titulo: 'Acessibilidade',
    percentual: 100,
    detalhe: 'Entrega de dispositivos acessíveis',
    indicador: '100% entregue',
    status: 'CONCLUÍDA',
  },
  {
    numero: 'META 15',
    titulo: 'Diárias de educadores',
    percentual: 0,
    detalhe: 'Execução financeira da rubrica de diárias de educadores',
    indicador: 'Percentual da rubrica utilizada',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 16',
    titulo: 'Publicações e catálogos',
    percentual: 0,
    detalhe: 'Catálogo MHAB desta edição',
    indicador: '1 catálogo = 100%',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 17',
    titulo: 'Custeio das atividades educativas e culturais',
    percentual: 0,
    detalhe: 'Materiais, insumos, lanches, consultorias e apoio pedagógico',
    indicador: 'Percentual da rubrica utilizada',
    status: 'EM EXECUÇÃO',
  },
];

function clampPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function getStatusClass(status) {
  if (status === 'CONCLUÍDA') return 'border-black bg-black text-white';
  if (status === 'NÃO CONSIDERAR') return 'border-neutral-200 bg-neutral-100 text-neutral-500';
  if (status === 'DOCUMENTAL') return 'border-neutral-300 bg-white text-neutral-600';
  return 'border-neutral-300 bg-neutral-50 text-neutral-700';
}

function StatusIcon({ status }) {
  if (status === 'CONCLUÍDA') {
    return <CheckCircle2 className="w-4 h-4" />;
  }

  return <AlertCircle className="w-4 h-4" />;
}

function ResumoCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-black">{value}</p>
      {helper && <p className="mt-1 text-xs text-neutral-500">{helper}</p>}
    </div>
  );
}

function MetaCard({ meta }) {
  const percentual = clampPercent(meta.percentual);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{meta.numero}</p>
          <h3 className="mt-1 text-sm font-semibold leading-snug text-black">{meta.titulo}</h3>
        </div>

        <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${getStatusClass(meta.status)}`}>
          <StatusIcon status={meta.status} />
          {meta.status}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-neutral-500">{meta.detalhe}</p>
          <p className="mt-1 text-xs font-medium text-neutral-700">{meta.indicador}</p>
        </div>
        <p className="shrink-0 text-2xl font-bold text-black">{percentual}%</p>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className="h-full rounded-full bg-black transition-all"
          style={{ width: `${percentual}%` }}
        />
      </div>
    </div>
  );
}

export default function MetasAditivoSection() {
  const metasValidas = METAS_ADITIVO.filter((meta) => meta.status !== 'NÃO CONSIDERAR');
  const concluidas = metasValidas.filter((meta) => clampPercent(meta.percentual) >= 100).length;
  const andamento = metasValidas.filter((meta) => meta.status === 'EM EXECUÇÃO').length;
  const media = metasValidas.length
    ? Math.round(metasValidas.reduce((sum, meta) => sum + clampPercent(meta.percentual), 0) / metasValidas.length)
    : 0;

  return (
    <section className="space-y-5 rounded-3xl border border-neutral-200 bg-neutral-50/60 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-black" />
            <h2 className="text-xl font-semibold text-black">Metas do 3º Aditivo</h2>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Acompanhamento executivo das metas de 2026, mantendo a numeração oficial para prestação de contas.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ResumoCard label="Metas concluídas" value={`${concluidas}/${metasValidas.length}`} helper="metas com execução integral" />
        <ResumoCard label="Média de execução" value={`${media}%`} helper="média simples dos indicadores" />
        <ResumoCard label="Em andamento" value={andamento} helper="metas com acompanhamento ativo" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {METAS_ADITIVO.map((meta) => (
          <MetaCard key={meta.numero} meta={meta} />
        ))}
      </div>
    </section>
  );
}
