import React from 'react';
import { CheckCircle2, AlertCircle, Target } from 'lucide-react';

const COMMUNICATION_CURVE = [
  { mes: 'Mai/26', esperado: 20 },
  { mes: 'Jun/26', esperado: 32 },
  { mes: 'Jul/26', esperado: 44 },
  { mes: 'Ago/26', esperado: 58 },
  { mes: 'Set/26', esperado: 72 },
  { mes: 'Out/26', esperado: 86 },
  { mes: 'Nov/26', esperado: 100 },
];

const BASE_METAS_ADITIVO = [
  { numero: 'META 01', titulo: 'Equipe principal', percentual: 100, detalhe: 'Cargos previstos e cargos ocupados na equipe', indicador: '100% concluído · contagem de cargos ativa', status: 'CONCLUÍDA', editableRubricas: false },
  { numero: 'META 02', titulo: 'Plano de comunicação', percentual: 20, detalhe: 'Indicador composto: releases 70%, posts 20% e fotos válidas 10%', indicador: '20% concluído · média operacional dos últimos 3 meses', status: 'EM EXECUÇÃO', editableRubricas: false, curva: COMMUNICATION_CURVE, subindicadores: [{ label: 'Releases', peso: '70%' }, { label: 'Posts', peso: '20%' }, { label: 'Fotos válidas', peso: '10%' }] },
  { numero: 'META 03', titulo: 'Manutenção das exposições', percentual: 0, detalhe: 'Execução financeira da rubrica de manutenção e disposição, sem educadoras', indicador: 'Percentual da rubrica utilizada', status: 'EM EXECUÇÃO' },
  { numero: 'META 04', titulo: 'Alteração de núcleos e salas expositivas', percentual: 0, detalhe: 'Rubricas de núcleos, salas expositivas, montagem, expografia e ambientação', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 05', titulo: 'Atividades Educativas e Culturais', percentual: 0, detalhe: 'Atividades únicas da Programação/Agenda, filtradas mensalmente desde março/2026', indicador: '0/30 atividades da programação validadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 07', titulo: 'Contratação de educadores', percentual: 100, detalhe: 'Educadores contratados para MIS, MUMO e MHAB', indicador: '100% concluído', status: 'CONCLUÍDA', editableRubricas: false },
];

function MetaCard({ meta }) {
  const isConcluida = meta.status === 'CONCLUÍDA';
  const StatusIcon = isConcluida ? CheckCircle2 : AlertCircle;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:shadow-md flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon className="h-4 w-4 flex-shrink-0 text-black" />
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
            {meta.numero}
          </span>
        </div>

        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
          isConcluida
            ? 'border-black bg-black text-white'
            : 'border-neutral-300 bg-neutral-100 text-neutral-800'
        }`}>
          {meta.status}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-base font-semibold leading-snug text-black">
          {meta.titulo}
        </p>
        <p className="mt-1 text-sm leading-snug text-neutral-600">
          {meta.detalhe}
        </p>
      </div>

      <div className="mt-auto">
        <div className="mb-1 flex items-end justify-between gap-3 text-sm text-neutral-700">
          <span className="leading-snug">{meta.indicador}</span>
          <span className="shrink-0 font-bold text-black">{meta.percentual}%</span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-1.5 rounded-full bg-black transition-all"
            style={{ width: `${Math.min(meta.percentual, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function MetasAditivoSection({ rubricas = [] }) {
  return (
    <div className="space-y-3">
      <div className="mb-1 flex items-center gap-2">
        <Target className="h-4 w-4 text-black" />
        <h3 className="text-sm font-semibold text-black">Metas do 3º Aditivo</h3>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {BASE_METAS_ADITIVO.map((meta) => (
          <MetaCard key={meta.numero} meta={meta} rubricas={rubricas} />
        ))}
      </div>
    </div>
  );
}
