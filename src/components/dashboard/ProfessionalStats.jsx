import React from 'react';
import { FileText, CheckCircle, AlertCircle, Users } from 'lucide-react';

const STAT_CONFIG = {
  total: { icon: FileText, color: 'bg-slate-100', textColor: 'text-slate-700', label: 'Total de Relatórios' },
  rascunhos: { icon: AlertCircle, color: 'bg-yellow-100', textColor: 'text-yellow-700', label: 'Rascunhos' },
  aprovados: { icon: CheckCircle, color: 'bg-green-100', textColor: 'text-green-700', label: 'Aprovados' },
  publico: { icon: Users, color: 'bg-blue-100', textColor: 'text-blue-700', label: 'Público Total' }
};

export default function ProfessionalStats({ stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {Object.entries(stats).map(([key, value]) => {
        const config = STAT_CONFIG[key];
        const Icon = config.icon;
        const isPublico = key === 'publico';
        
        return (
          <div key={key} className={`p-4 rounded-xl border border-gray-200 ${config.color}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${config.textColor}`} />
              <p className={`text-xs font-medium ${config.textColor}`}>{config.label}</p>
            </div>
            <p className={`text-2xl font-bold ${config.textColor}`}>
              {isPublico ? value.toLocaleString('pt-BR') : value}
            </p>
          </div>
        );
      })}
    </div>
  );
}