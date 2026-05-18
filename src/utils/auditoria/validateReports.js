import { isApprovedReport } from './reconcileActivities';

export function validateReports(reports = []) {
  const issues = [];
  const approved = (Array.isArray(reports) ? reports : []).filter(isApprovedReport);

  approved.forEach((report) => {
    if (!Array.isArray(report.atividades) || report.atividades.length === 0) {
      issues.push({
        type: 'REPORT_WITHOUT_ACTIVITIES',
        severity: 'warning',
        message: `Relatório aprovado sem atividades registradas: ${report.titulo || report.mes_referencia || report.id}`,
        entityId: report.id,
      });
    }
    if (!report.mes_referencia && !report.mes && !report.data_referencia) {
      issues.push({
        type: 'REPORT_WITHOUT_PERIOD',
        severity: 'warning',
        message: `Relatório sem período de referência: ${report.titulo || report.id}`,
        entityId: report.id,
      });
    }
  });

  return { approvedReports: approved, issues };
}
