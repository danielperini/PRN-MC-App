import { base44 } from '@/api/base44Client';

const APPROVED = new Set(['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PUBLICADO', 'FINALIZADO', 'CONCLUIDO']);
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const OFFICIAL_BUDGET = 1320000;

const text = (value) => String(value ?? '').trim();
const norm = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const number = (value) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };

function approved(report) {
  return APPROVED.has(text(report?.status).toUpperCase());
}

function isNoturno(item = {}) {
  const value = norm([
    item.projeto, item.projeto_nome, item.centro_custo, item.meta_nome, item.meta,
    item.titulo, item.nome, item.nome_atividade, item.atividade, item.descricao,
  ].filter(Boolean).join(' '));
  return value.includes('noturno nos museus') || value.includes('noturno 2026') || value.includes('noturno pampulha');
}

function reportMonth(report) {
  const raw = report?.mes_referencia ?? report?.mes ?? report?.competencia;
  const numeric = Number(raw);
  if (numeric >= 1 && numeric <= 12) return numeric;
  const value = norm(raw);
  const index = MONTHS.findIndex((month) => value.includes(norm(month)));
  return index >= 0 ? index + 1 : null;
}

function reportYear(report) {
  const value = Number(report?.ano ?? report?.ano_referencia);
  return Number.isFinite(value) && value > 1900 ? value : new Date().getFullYear();
}

function reportActivities(report) {
  const source = [
    report?.atividades,
    report?.activities,
    report?.atividades_realizadas,
    report?.descricao_acoes?.atividades,
    report?.tabelas_estruturadas?.atividades,
  ].find(Array.isArray) || [];
  return source.map((activity) => ({ ...activity, _report: report }));
}

function activityPublic(activity = {}) {
  const direct = number(
    activity.publico_total ?? activity.publico_realizado ?? activity.publico_presente ??
    activity.participantes ?? activity.visitantes ?? activity.presentes ?? activity.publico ?? 0
  );
  if (direct > 0) return Math.round(direct);
  if (Array.isArray(activity.lista_presenca)) return activity.lista_presenca.length;
  if (Array.isArray(activity.participantes_lista)) return activity.participantes_lista.length;
  return 0;
}

function activityDate(activity = {}, report = {}) {
  const raw = activity.data_realizacao || activity.data_inicio || activity.data || activity.inicio;
  const match = text(raw).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  return `${reportYear(report)}-${String(reportMonth(report) || '').padStart(2, '0')}`;
}

function activityKey(activity = {}) {
  const report = activity._report || {};
  const explicit = activity.programacao_id || activity.programacaoId || activity.id_programacao || activity.agenda_id || activity.activity_id || activity.atividade_id || activity.id;
  if (explicit) return `id:${explicit}`;
  const title = norm(activity.nome_atividade || activity.nome || activity.titulo || activity.acao || activity.atividade || activity.descricao);
  const museum = norm(activity.museu || activity.centro_custo || report.museu || report.museu_secundario);
  return `${title}|${activityDate(activity, report)}|${museum}`;
}

function dedupeActivities(items) {
  const map = new Map();
  for (const item of items) {
    const key = activityKey(item);
    if (!key || key.startsWith('||')) continue;
    const current = map.get(key);
    if (!current || activityPublic(item) > activityPublic(current)) map.set(key, item);
  }
  return [...map.values()];
}

function dedupeReports(reports) {
  const map = new Map();
  for (const report of reports.filter(approved)) {
    const key = [norm(report.museu || report.museu_secundario), reportMonth(report), reportYear(report), norm(report.author_name || report.responsavel || report.profissional)].join('|');
    const current = map.get(key);
    if (!current) map.set(key, report);
    else {
      const currentDate = new Date(current.updated_date || current.created_date || 0).getTime();
      const nextDate = new Date(report.updated_date || report.created_date || 0).getTime();
      if (nextDate >= currentDate) map.set(key, report);
    }
  }
  return [...map.values()];
}

function setCardValue(labelPart, value, newLabel) {
  const cards = [...document.querySelectorAll('div.rounded-2xl.border')];
  const card = cards.find((element) => norm(element.textContent).includes(norm(labelPart)));
  if (!card) return;
  const label = card.querySelector('span');
  const output = card.querySelector('p');
  if (label && newLabel) label.textContent = newLabel;
  if (output) output.textContent = typeof value === 'number' ? Math.round(value).toLocaleString('pt-BR') : value;
}

async function auditDashboard() {
  if (!/dashboard|^\/$/i.test(window.location.pathname)) return;
  const [reports, rubricas] = await Promise.all([
    base44?.entities?.Report?.list?.('-updated_date', 10000).catch(() => []) || [],
    base44?.entities?.Rubrica?.list?.('rubrica', 5000).catch(() => []) || [],
  ]);

  const approvedReports = dedupeReports(Array.isArray(reports) ? reports : []);
  const regularReports = approvedReports.filter((report) => !isNoturno(report));
  const activities = dedupeActivities(regularReports.flatMap(reportActivities).filter((activity) => !isNoturno(activity)));
  const publicTotal = activities.reduce((sum, activity) => sum + activityPublic(activity), 0);
  const previous = new Date();
  previous.setMonth(previous.getMonth() - 1, 1);
  const monthNumber = previous.getMonth() + 1;
  const year = previous.getFullYear();
  const monthActivities = activities.filter((activity) => {
    const report = activity._report || {};
    return reportMonth(report) === monthNumber && reportYear(report) === year;
  });

  setCardValue('Aprovados', regularReports.length);
  setCardValue('Atividades em', monthActivities.length, `Atividades em ${MONTHS[monthNumber - 1]} (aprovados)`);
  setCardValue('Público Total', publicTotal, 'Público Total Museus Centro (sem Noturno)');

  const active = (Array.isArray(rubricas) ? rubricas : []).filter((item) => item?.ativo !== false);
  const unique = new Map();
  for (const item of active) {
    const key = item.id || [norm(item.grupo || item.grupo_rubrica || item.categoria), norm(item.rubrica || item.nome || item.descricao), norm(item.natureza_despesa || item.codigo_natureza), norm(item.centro_custo || item.museu)].join('|');
    const current = unique.get(key);
    if (!current || new Date(item.updated_date || item.created_date || 0) >= new Date(current.updated_date || current.created_date || 0)) unique.set(key, item);
  }
  const canonical = [...unique.values()];
  const used = canonical.reduce((sum, item) => sum + number(item.valor_utilizado ?? item.utilizado ?? item.valor_usado ?? item.valor_executado), 0);
  const balance = OFFICIAL_BUDGET - used;
  const percent = OFFICIAL_BUDGET > 0 ? (used / OFFICIAL_BUDGET) * 100 : 0;
  setCardValue('Previsto', OFFICIAL_BUDGET.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  setCardValue('Utilizado', used.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  setCardValue('Saldo', balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  setCardValue('Rubricas ativas', canonical.length);

  window.__dashboardAuditMetrics = {
    approvedReports: regularReports.length,
    activities: activities.length,
    publicTotal,
    noturnoExcluded: approvedReports.length - regularReports.length,
    budget: { previsto: OFFICIAL_BUDGET, utilizado: used, saldo: balance, percentual: percent, rubricas: canonical.length },
  };
}

export function installDashboardAuditMetrics() {
  if (typeof window === 'undefined' || window.__dashboardAuditMetricsInstalled) return;
  window.__dashboardAuditMetricsInstalled = true;
  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => auditDashboard().catch((error) => console.warn('[Dashboard Audit]', error)), 300);
  };
  window.addEventListener('load', schedule);
  window.addEventListener('popstate', schedule);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
}
