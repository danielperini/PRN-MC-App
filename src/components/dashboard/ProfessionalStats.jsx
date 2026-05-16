import React from 'react';
import { Activity, Users } from 'lucide-react';

const STAT_CONFIG = {
  publico: {
    icon: Users,
    label: 'Público Total do Museu Atual'
  },
  publicoTodosMuseus: {
    icon: Users,
    label: 'Público Total dos Três Museus'
  },
  atividadesTresMuseus: {
    icon: Activity,
    label: 'Total de Atividades dos Três Museus'
  },
};

export default function ProfessionalStats({ stats }) {
  const entries = Object.entries(stats || {}).filter(([key]) => STAT_CONFIG[key]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {entries.map(([key, value]) => {
        const config = STAT_CONFIG[key];
        const Icon = config.icon;
        const numberValue = Number(value || 0);

        return (
          <div
            key={key}
            className="p-4 rounded-xl border border-gray-200 bg-white text-black shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-2 text-gray-500">
              <Icon className="w-4 h-4 text-black" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                {config.label}
              </p>
            </div>

            <p className="text-2xl font-bold text-black">
              {Math.round(numberValue).toLocaleString('pt-BR')}
            </p>
          </div>
        );
      })}
    </div>
  );
}
