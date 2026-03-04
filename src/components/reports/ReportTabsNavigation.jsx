import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

const TABS_INFO = [
  { value: 'identificacao', label: 'Identificação', icon: '📋' },
  { value: 'atividades', label: 'Atividades', icon: '📝' },
  { value: 'oportunidades', label: 'Oportunidades', icon: '💡' },
  { value: 'avaliacao', label: 'Avaliação', icon: '⭐' },
  { value: 'comentarios', label: 'Comentários', icon: '💬' },
  { value: 'historico', label: 'Histórico', icon: '📊' },
];

export default function ReportTabsNavigation({ currentTab, formData, onTabChange }) {
  // Determina se cada aba tem conteúdo preenchido
  const tabProgress = {
    identificacao: !!(formData.mes_referencia && formData.author_name && formData.museu),
    atividades: (formData.atividades || []).length > 0,
    oportunidades: (formData.oportunidades || []).length > 0,
    avaliacao: !!(formData.avaliacao_pontos_positivos || formData.avaliacao_desafios || formData.avaliacao_sugestoes),
    comentarios: true, // sempre disponível
    historico: true, // sempre disponível
  };

  const totalTabs = TABS_INFO.length;
  const completedTabs = TABS_INFO.filter(t => tabProgress[t.value]).length;
  const progressPercent = Math.round((completedTabs / totalTabs) * 100);

  return (
    <div className="mb-8 space-y-4">
      {/* Progresso Geral */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Progresso do Relatório
          </span>
          <span className="text-xs font-semibold text-gray-900">
            {completedTabs} de {totalTabs} seções
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-black rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Breadcrumbs com Status */}
      <div className="flex flex-wrap gap-2">
        {TABS_INFO.map((tab, idx) => {
          const isCompleted = tabProgress[tab.value];
          const isActive = currentTab === tab.value;

          return (
            <div key={tab.value}>
              <button
                onClick={() => onTabChange(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-black text-white'
                    : isCompleted
                    ? 'bg-green-50 text-green-800 border border-green-200 hover:bg-green-100'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
                {isCompleted && !isActive && (
                  <CheckCircle className="w-3 h-3 ml-0.5" />
                )}
              </button>

              {idx < TABS_INFO.length - 1 && (
                <div className="flex items-center">
                  <span className="text-gray-300">→</span>
                </div>
              )}
              </div>
              );
              })}
      </div>
    </div>
  );
}