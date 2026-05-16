import React, { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertCircle, Target, X, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'museus_centro_metas_rubricas_override_v1';

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
  { numero: 'META 07', titulo: 'Contratação de educadores', percentual: 100, detalhe: 'Educadores contratados para MIS, MUMO e MHAB', indicador: '100% concluído', status: 'CONCLUÍDA', editableRubricas: false }
];

function MetaCard({ meta, rubricas }) {
  const statusColor = meta.status === 'CONCLUÍDA'
    ? 'bg-green-50 border-green-200'
    : 'bg-white border-slate-200';

  const progressColor = meta.status === 'CONCLUÍDA'
    ? 'bg-green-500'
    : meta.percentual >= 70
    ? 'bg-blue-500'
    : meta.percentual >= 30
    ? 'bg-amber-500'
    : 'bg-slate-400';

  const StatusIcon = meta.status === 'CONCLUÍDA' ? CheckCircle2 : AlertCircle;
  const iconColor = meta.status === 'CONCLUÍDA' ? 'text-green-500' : 'text-amber-500';

  return (
    <div className={`rounded-xl border p-4 ${statusColor} flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{meta.numero}</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.status === 'CONCLUÍDA' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {meta.status}
        </span>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-800">{meta.titulo}</p>
        <p className="text-xs text-slate-500 mt-0.5">{meta.detalhe}</p>
      </div>

      <div className="mt-1">
        <div className="flex justify-between text-xs text-slate-600 mb-1">
          <span>{meta.indicador}</span>
          <span className="font-bold">{meta.percentual}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${progressColor}`}
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
      <div className="flex items-center gap-2 mb-1">
        <Target className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-700">Metas do 3º Aditivo</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {BASE_METAS_ADITIVO.map((meta) => (
          <MetaCard key={meta.numero} meta={meta} rubricas={rubricas} />
        ))}
      </div>
    </div>
  );
}