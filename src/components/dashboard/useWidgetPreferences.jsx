import { useState, useEffect } from 'react';

const DEFAULT_WIDGETS = {
  momentos: { enabled: true, position: 0, title: 'Momentos Especiais' },
  compliance: { enabled: true, position: 1, title: 'Conformidade Mensal' },
  activityMetrics: { enabled: true, position: 2, title: 'Métricas de Atividades' },
  recentReports: { enabled: true, position: 3, title: 'Relatórios Recentes' },
  opportunityMetrics: { enabled: true, position: 4, title: 'Análise de Oportunidades' },
};

export function useWidgetPreferences() {
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('dashboardWidgets');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setWidgets({ ...DEFAULT_WIDGETS, ...parsed });
      } catch {
        setWidgets(DEFAULT_WIDGETS);
      }
    } else {
      setWidgets(DEFAULT_WIDGETS);
    }
    setLoaded(true);
  }, []);

  const updateWidgets = (newWidgets) => {
    setWidgets(newWidgets);
    localStorage.setItem('dashboardWidgets', JSON.stringify(newWidgets));
  };

  const toggleWidget = (widgetId) => {
    updateWidgets({
      ...widgets,
      [widgetId]: {
        ...widgets[widgetId],
        enabled: !widgets[widgetId].enabled,
      },
    });
  };

  const resetToDefault = () => {
    setWidgets(DEFAULT_WIDGETS);
    localStorage.removeItem('dashboardWidgets');
  };

  const reorderWidgets = (widgetId, newPosition) => {
    const entries = Object.entries(widgets).map(([id, w]) => [id, { ...w }]);
    const [movedWidget] = entries.splice(
      entries.findIndex(([id]) => id === widgetId),
      1
    );
    entries.splice(newPosition, 0, movedWidget);
    
    const reordered = {};
    entries.forEach(([id, widget], idx) => {
      reordered[id] = { ...widget, position: idx };
    });
    updateWidgets(reordered);
  };

  return { widgets, loaded, toggleWidget, resetToDefault, reorderWidgets, updateWidgets };
}