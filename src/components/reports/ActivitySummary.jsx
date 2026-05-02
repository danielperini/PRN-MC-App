import React from 'react';
import { Users, Activity } from 'lucide-react';

export default function ActivitySummary({ activities = [], dateRange = null, dashboardPublico = null }) {
  if (activities.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-400">
        Nenhuma atividade para exibir
      </div>
    );
  }

  // Calcular público real: publico_estimado × quantas_repeticoes (mesma fórmula do Dashboard)
  const totalPublico = activities.reduce((sum, a) => {
    const repeticoes = Number(a.quantas_repeticoes) || 1;
    const publico = Number(a.publico_estimado) || 0;
    return sum + (publico * repeticoes);
  }, 0);
  const totalActividades = activities.length;
  const aprovados = activities.filter(a => a.status === 'APROVADO').length;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
        <Users className="w-7 h-7 text-white mb-2" />
        <p className="text-4xl font-bold text-white leading-none">{totalPublico.toLocaleString('pt-BR')}</p>
        <p className="text-sm text-gray-300">Público total alcançado</p>
      </div>
      <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
        <Activity className="w-7 h-7 text-white mb-2" />
        <p className="text-4xl font-bold text-white leading-none">{totalActividades}</p>
        <p className="text-sm text-gray-300">Atividades realizadas</p>
      </div>

    </div>
  );
}