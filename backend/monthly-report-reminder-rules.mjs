const FIRST_REQUIRED_MONTH = { year: 2026, month: 3 };
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const COMPLETE_STATUSES = new Set(['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN']);
export const emailOf = (row) => String(row?.email || row?.user_email || '').trim().toLowerCase();

export const isProfessional = (row) => {
  if (row?.acesso_liberado !== true || row?.is_verified !== true || row?.is_service === true) return false;
  const role = String(row?.role || row?.perfil || row?.user_role || '').trim().toUpperCase();
  if (!role) return false;
  if (['ADMIN', 'COORDENADOR', 'COORDINATOR', 'PATROCINADOR', 'OBSERVADOR'].includes(role)) return false;
  return ['PROFISSIONAL', 'PROFESSIONAL', 'COLABORADOR', 'USUARIO', 'USER'].includes(role);
};

export const shouldSubmit = (row) => row?.permission_must_submit_monthly_reports !== false &&
  row?.must_submit_monthly_reports !== false && row?.must_submit_monthly_report !== false;

export function requiredMonths(now = new Date()) {
  // The current month remains open; only completed months are due.
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const result = [];
  for (let year = FIRST_REQUIRED_MONTH.year, month = FIRST_REQUIRED_MONTH.month;
    year < last.getFullYear() || (year === last.getFullYear() && month <= last.getMonth() + 1);) {
    result.push({ year, month, label: `${MONTH_NAMES[month - 1]}/${year}` });
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return result;
}

export function reportMonths(record) {
  const year = Number(record?.ano);
  const raw = String(record?.mes_referencia || '').trim();
  if (!year || !raw) return [];
  // Legacy reports can explicitly cover two months, e.g. "Maio–Junho".
  // Credit only month names present in the reference field; never infer from prose.
  const parts = raw.split(/\s*(?:[–—\-/,]|\be\b|\ba\b)\s*/i).filter(Boolean);
  const months = parts.map((part) => MONTH_NAMES.findIndex((name) =>
    name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
    part.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()) + 1);
  return months.length && months.every(Boolean) ? [...new Set(months.map((month) => `${year}-${month}`))] : [];
}

export function localDateKey(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
}
