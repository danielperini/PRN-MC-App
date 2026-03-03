import React from 'react';
import { Progress } from '@/components/ui/progress';

export default function ActivityProgressBar({ atividades = [], oportunidades = [] }) {
  const hasAtividades = atividades && atividades.length > 0;
  const hasOportunidades = oportunidades && oportunidades.length > 0;
  
  let completedSteps = 0;
  let totalSteps = 2;

  if (hasAtividades) completedSteps += 1;
  if (hasOportunidades) completedSteps += 1;

  const progress = (completedSteps / totalSteps) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-black">Progresso do Registro</h3>
        <span className="text-xs text-gray-500">{completedSteps}/{totalSteps} seções preenchidas</span>
      </div>
      <Progress value={progress} className="h-2" />
      <div className="flex gap-4 text-xs">
        <div className={`flex items-center gap-1.5 ${hasAtividades ? 'text-green-600' : 'text-gray-400'}`}>
          <div className={`w-3 h-3 rounded-full ${hasAtividades ? 'bg-green-600' : 'bg-gray-300'}`} />
          Atividades {hasAtividades ? '✓' : ''}
        </div>
        <div className={`flex items-center gap-1.5 ${hasOportunidades ? 'text-green-600' : 'text-gray-400'}`}>
          <div className={`w-3 h-3 rounded-full ${hasOportunidades ? 'bg-green-600' : 'bg-gray-300'}`} />
          Oportunidades {hasOportunidades ? '✓' : ''}
        </div>
      </div>
    </div>
  );
}