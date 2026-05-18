import { getMonthLabel } from './temporalFilters';
import { toAuditInteger } from './deduplicateAudience';

export function getReportSpontaneousAudience(report = {}) {
  return toAuditInteger(report.publico_espontaneo ?? report.publico_livre ?? report.publico_geral_declarado ?? 0);
}

export function getReportScheduledVisitsAudience(report = {}) {
  return toAuditInteger(report.publico_visitas_agendadas ?? report.publico_agendado ?? report.publico_escolar ?? 0);
}

export function reconcileAudienceTotals({ reports = [], activities = [] } = {}) {
  const publicoAtividades = activities.reduce((sum, activity) => sum + toAuditInteger(activity._publico_contabil ?? activity._publico), 0);
  const publicoEspontaneo = reports.reduce((sum, report) => sum + getReportSpontaneousAudience(report), 0);
  const visitasAgendadas = reports.reduce((sum, report) => sum + getReportScheduledVisitsAudience(report), 0);
  const byMonthMap = {};
  const byMuseumMap = {};

  activities.forEach((activity) => {
    const monthKey = activity._monthKey || 'sem-mes';
    const museum = activity._museu || 'Atuação Geral';
    const publico = toAuditInteger(activity._publico_contabil ?? activity._publico);

    if (!byMonthMap[monthKey]) byMonthMap[monthKey] = { key: monthKey, mes: getMonthLabel(monthKey), atividades: 0, publico_atividades: 0, espontaneo: 0, visitas_agendadas: 0, total: 0 };
    byMonthMap[monthKey].atividades += 1;
    byMonthMap[monthKey].publico_atividades += publico;

    if (!byMuseumMap[museum]) byMuseumMap[museum] = { museu: museum, atividades: 0, publico_atividades: 0, espontaneo: 0, visitas_agendadas: 0, total: 0 };
    byMuseumMap[museum].atividades += 1;
    byMuseumMap[museum].publico_atividades += publico;
  });

  reports.forEach((report) => {
    const monthKey = report._monthKey || 'sem-mes';
    const museum = report._museu || 'Atuação Geral';
    if (!byMonthMap[monthKey]) byMonthMap[monthKey] = { key: monthKey, mes: getMonthLabel(monthKey), atividades: 0, publico_atividades: 0, espontaneo: 0, visitas_agendadas: 0, total: 0 };
    if (!byMuseumMap[museum]) byMuseumMap[museum] = { museu: museum, atividades: 0, publico_atividades: 0, espontaneo: 0, visitas_agendadas: 0, total: 0 };

    byMonthMap[monthKey].espontaneo += getReportSpontaneousAudience(report);
    byMonthMap[monthKey].visitas_agendadas += getReportScheduledVisitsAudience(report);
    byMuseumMap[museum].espontaneo += getReportSpontaneousAudience(report);
    byMuseumMap[museum].visitas_agendadas += getReportScheduledVisitsAudience(report);
  });

  Object.values(byMonthMap).forEach((item) => {
    item.total = item.publico_atividades + item.espontaneo + item.visitas_agendadas;
  });
  Object.values(byMuseumMap).forEach((item) => {
    item.total = item.publico_atividades + item.espontaneo + item.visitas_agendadas;
  });

  return {
    publicoAtividades,
    publicoEspontaneo,
    visitasAgendadas,
    publicoTotal: publicoAtividades + publicoEspontaneo + visitasAgendadas,
    byMonth: Object.values(byMonthMap).sort((a, b) => String(a.key).localeCompare(String(b.key))),
    byMuseum: Object.values(byMuseumMap).sort((a, b) => a.museu.localeCompare(b.museu)),
  };
}
