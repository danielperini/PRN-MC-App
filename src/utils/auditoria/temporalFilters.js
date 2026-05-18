export const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function parseAuditDate(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const br = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const date = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(date) {
  const value = parseAuditDate(date) || new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date) {
  const value = parseAuditDate(date) || new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function getEntityDate(item = {}) {
  return parseAuditDate(
    item.data_realizacao ||
      item.data_programacao ||
      item.data_inicio ||
      item.data ||
      item.inicio ||
      item.data_referencia ||
      item.competencia_data ||
      item.created_date ||
      item.updated_date
  );
}

export function getMonthKey(date) {
  const value = parseAuditDate(date);
  if (!value) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthLabel(key) {
  if (!key) return 'Sem mês';
  const [year, month] = String(key).split('-').map(Number);
  if (!year || !month) return key;
  return `${MONTHS_PT[month - 1]} ${year}`;
}

export function getMonthNumberFromText(value) {
  const numeric = Number(value);
  if (numeric >= 1 && numeric <= 12) return numeric;

  const text = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const index = MONTHS_PT.findIndex((month) => {
    const normalized = month.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return text.includes(normalized);
  });

  return index >= 0 ? index + 1 : null;
}

export function getReportReferenceDate(report = {}) {
  const month = getMonthNumberFromText(report.mes_referencia || report.mes || report.competencia);
  const year = Number(report.ano || report.ano_referencia || new Date().getFullYear());
  if (month >= 1 && month <= 12 && year > 1900) return new Date(year, month - 1, 1);

  const fromDate = getEntityDate(report);
  if (fromDate) return fromDate;

  return null;
}

export function buildTemporalFilter({ from, to, month, quarter, semester, year, mode = 'custom' } = {}) {
  let start = from ? startOfDay(from) : null;
  let end = to ? endOfDay(to) : null;
  const safeYear = Number(year || new Date().getFullYear());

  if (mode === 'month' && month) {
    const monthNumber = getMonthNumberFromText(month);
    if (monthNumber) {
      start = startOfDay(new Date(safeYear, monthNumber - 1, 1));
      end = endOfDay(new Date(safeYear, monthNumber, 0));
    }
  }

  if (mode === 'quarter' && quarter) {
    const q = Math.max(1, Math.min(4, Number(quarter)));
    const firstMonth = (q - 1) * 3;
    start = startOfDay(new Date(safeYear, firstMonth, 1));
    end = endOfDay(new Date(safeYear, firstMonth + 3, 0));
  }

  if (mode === 'semester' && semester) {
    const firstMonth = Number(semester) === 2 ? 6 : 0;
    start = startOfDay(new Date(safeYear, firstMonth, 1));
    end = endOfDay(new Date(safeYear, firstMonth + 6, 0));
  }

  if (mode === 'year' && safeYear) {
    start = startOfDay(new Date(safeYear, 0, 1));
    end = endOfDay(new Date(safeYear, 11, 31));
  }

  return {
    mode,
    from: start,
    to: end,
    key: [start?.toISOString().slice(0, 10), end?.toISOString().slice(0, 10)].filter(Boolean).join(':') || 'acumulado',
    contains(value) {
      const date = parseAuditDate(value);
      if (!date) return !start && !end;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    },
  };
}

export function filterByPeriod(items = [], filter, getDate = getEntityDate) {
  if (!filter?.from && !filter?.to) return Array.isArray(items) ? items : [];
  return (Array.isArray(items) ? items : []).filter((item) => filter.contains(getDate(item)));
}
