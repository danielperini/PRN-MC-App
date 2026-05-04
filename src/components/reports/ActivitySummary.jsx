import React from 'react';
import { Users, Activity } from 'lucide-react';

function parseNumberBR(value) {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value)
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPublicoAtividade(activity) {
  const vezes =
    parseNumberBR(activity?.quantas_vezes_ocorreu) ||
    parseNumberBR(activity?.quantas_repeticoes) ||
    parseNumberBR(activity?.ocorrencias) ||
    1;

  const publicoMedio =
    parseNumberBR(activity?.publico_medio) ||
    parseNumberBR(activity?.publico_medio_sessao) ||
    parseNumberBR(activity?.publico_por_sessao) ||
    0;

  if (publicoMedio > 0) {
    return vezes * publicoMedio;
  }

  return (
    parseNumberBR(activity?.publico_total) ||
    parseNumberBR(activity?.publico_estimado) ||
    parseNumberBR(activity?.publico) ||
    0
  );
}

export default function ActivitySummary({ activities = [], dateRange = null, dashboardPublico = null }) {
  if (activities.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-400">
        Nenhuma atividade para exibir
      </div>
    );
  }

  const totalPublico = activities.reduce((sum, activity) => {
    return sum + getPublicoAtividade(activity);
  }, 0);

  const totalAtividades = activities.reduce((sum, activity) => {
    const vezes =
      parseNumberBR(activity?.quantas_vezes_ocorreu) ||
      parseNumberBR(activity?.quantas_repeticoes) ||
      parseNumberBR(activity?.ocorrencias) ||
      1;

    return sum + vezes;
  }, 0);

  const publicoInteiro = Math.round(totalPublico);
  const atividadesInteiro = Math.round(totalAtividades);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
        <Users className="w-7 h-7 text-white mb-2" />
        <p className="text-4xl font-bold text-white leading-none">
          {publicoInteiro.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
        </p>
        <p className="text-sm text-gray-300">Público total alcançado</p>
      </div>

      <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
        <Activity className="w-7 h-7 text-white mb-2" />
        <p className="text-4xl font-bold text-white leading-none">
          {atividadesInteiro.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
        </p>
        <p className="text-sm text-gray-300">Atividades realizadas</p>
      </div>
    </div>
  );
}
