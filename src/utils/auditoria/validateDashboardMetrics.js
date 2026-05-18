export function validateDashboardMetrics(metrics = {}) {
  const issues = [];

  if (metrics.audience?.publicoTotal < metrics.audience?.publicoAtividades) {
    issues.push({
      type: 'DASHBOARD_AUDIENCE_TOTAL_INVALID',
      severity: 'error',
      message: 'Público total menor que público de atividades.',
    });
  }

  if (metrics.financeiro?.percentualExecucao > 100) {
    issues.push({
      type: 'DASHBOARD_FINANCIAL_PERCENT_OVER_100',
      severity: 'error',
      message: 'Percentual de execução financeira acima de 100%.',
    });
  }

  if (metrics.activities?.duplicateActivities?.length > 0) {
    issues.push({
      type: 'DASHBOARD_DUPLICATE_ACTIVITIES',
      severity: 'warning',
      message: `${metrics.activities.duplicateActivities.length} possível(is) atividade(s) duplicada(s) detectada(s).`,
      count: metrics.activities.duplicateActivities.length,
    });
  }

  return { issues };
}
