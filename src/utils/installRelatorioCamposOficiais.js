import { base44 } from '@/api/base44Client';

const REPORT_ROUTE = /RelatorioExecucaoObjeto/i;
const TEAM_FIELDS = [
  ['nome', 'Nome'],
  ['cargo', 'Cargo'],
  ['tipo_contratacao', 'Forma de contratação'],
  ['atribuicoes', 'Atribuições no projeto'],
  ['periodo', 'Período trabalhado'],
  ['carga_horaria', 'Carga horária semanal'],
  ['valor_mensal_bruto', 'Valor mensal bruto'],
];

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isReportRoute() {
  return typeof window !== 'undefined' && REPORT_ROUTE.test(window.location.pathname);
}

async function latestReport() {
  try {
    const reports = await base44.entities.RelatorioExecucaoObjeto.list('-created_date', 20);
    if (!Array.isArray(reports)) return null;
    const start = document.querySelector('input[type="date"]')?.value;
    const dates = [...document.querySelectorAll('input[type="date"]')].map((input) => input.value);
    const end = dates[1];
    return reports.find((item) => (!start || item.data_inicio === start) && (!end || item.data_fim === end)) || reports[0] || null;
  } catch {
    return null;
  }
}

function createField(labelText, value = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'space-y-1';
  const label = document.createElement('label');
  label.className = 'text-xs font-medium';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.className = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
  input.value = value;
  wrapper.append(label, input);
  return { wrapper, input };
}

function installReportNumberField() {
  if (document.querySelector('[data-report-number-field="true"]')) return;
  const typeLabel = [...document.querySelectorAll('label')].find((label) => normalize(label.textContent) === 'tipo');
  const grid = typeLabel?.closest('.grid');
  if (!grid) return;

  const { wrapper, input } = createField('Número do relatório', localStorage.getItem('relatorio_execucao_numero') || '');
  wrapper.dataset.reportNumberField = 'true';
  input.type = 'number';
  input.min = '1';
  input.placeholder = 'Ex.: 1';
  input.addEventListener('input', () => localStorage.setItem('relatorio_execucao_numero', input.value));
  grid.insertBefore(wrapper, grid.children[1] || null);
}

async function persistHeaderFields() {
  const report = await latestReport();
  if (!report) return;
  const number = document.querySelector('[data-report-number-field="true"] input')?.value || '';
  const selects = [...document.querySelectorAll('button[role="combobox"]')];
  const typeText = normalize(selects[0]?.textContent).includes('final') ? 'final' : 'parcial';
  const dates = [...document.querySelectorAll('input[type="date"]')].map((input) => input.value);
  await base44.entities.RelatorioExecucaoObjeto.update(report.id, {
    numero_relatorio: number,
    tipo: typeText,
    data_inicio: dates[0] || report.data_inicio,
    data_fim: dates[1] || report.data_fim,
  });
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeTeam(team = []) {
  return (Array.isArray(team) ? team : []).map((person) => ({
    nome: person.nome || '',
    cargo: person.cargo || person.funcao || '',
    tipo_contratacao: person.tipo_contratacao || person.forma_contratacao || 'Pessoa Jurídica',
    atribuicoes: person.atribuicoes || person.atribuicoes_projeto || person.descricao_cargo || '',
    periodo: person.periodo || person.periodo_trabalhado || '',
    carga_horaria: person.carga_horaria || person.carga_horaria_semanal || '',
    valor_mensal_bruto: money(person.valor_mensal_bruto || person.valor_mensal || person.valor),
    editavel: true,
  }));
}

function teamTable(team, reportId) {
  const wrapper = document.createElement('div');
  wrapper.dataset.teamOfficialForm = 'true';
  wrapper.className = 'mt-4 space-y-3';
  const scroll = document.createElement('div');
  scroll.className = 'overflow-x-auto rounded-lg border';
  const table = document.createElement('table');
  table.className = 'min-w-[1400px] w-full border-collapse text-xs';
  const head = document.createElement('tr');
  TEAM_FIELDS.forEach(([, label]) => {
    const th = document.createElement('th');
    th.className = 'border bg-slate-100 p-2 text-left';
    th.textContent = label;
    head.appendChild(th);
  });
  table.appendChild(document.createElement('thead')).appendChild(head);
  const tbody = document.createElement('tbody');
  team.forEach((person, index) => {
    const tr = document.createElement('tr');
    TEAM_FIELDS.forEach(([field]) => {
      const td = document.createElement('td');
      td.className = 'border p-1 align-top';
      const input = document.createElement(field === 'atribuicoes' ? 'textarea' : 'input');
      input.className = 'w-full min-w-[150px] rounded border px-2 py-1 text-xs';
      input.dataset.teamIndex = String(index);
      input.dataset.teamField = field;
      input.value = person[field] ?? '';
      if (field === 'valor_mensal_bruto') input.type = 'number';
      td.appendChild(input);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  scroll.appendChild(table);

  const actions = document.createElement('div');
  actions.className = 'flex gap-2';
  const add = document.createElement('button');
  add.className = 'rounded-md border px-3 py-2 text-xs';
  add.textContent = 'Adicionar profissional';
  add.onclick = () => {
    team.push(normalizeTeam([{}])[0]);
    wrapper.replaceWith(teamTable(team, reportId));
  };
  const save = document.createElement('button');
  save.className = 'rounded-md bg-slate-900 px-3 py-2 text-xs text-white';
  save.textContent = 'Salvar equipe';
  save.onclick = async () => {
    const rows = normalizeTeam(team);
    wrapper.querySelectorAll('[data-team-index]').forEach((input) => {
      const index = Number(input.dataset.teamIndex);
      const field = input.dataset.teamField;
      rows[index][field] = field === 'valor_mensal_bruto' ? money(input.value) : input.value;
    });
    await base44.entities.RelatorioExecucaoObjeto.update(reportId, { equipe_trabalho: rows, _equipe_real: rows });
    save.textContent = 'Salvo';
    setTimeout(() => { save.textContent = 'Salvar equipe'; }, 1500);
  };
  actions.append(add, save);
  wrapper.append(scroll, actions);
  return wrapper;
}

async function installTeamForm() {
  const heading = [...document.querySelectorAll('h3')].find((item) => normalize(item.textContent).includes('8. equipe de trabalho'));
  const section = heading?.closest('.rounded-xl.border');
  if (!section || section.querySelector('[data-team-official-form="true"]')) return;
  const report = await latestReport();
  if (!report) return;
  const team = normalizeTeam(report.equipe_trabalho || report._equipe_real || []);
  section.appendChild(teamTable(team, report.id));
}

function wrapImpactGeneration() {
  const functions = base44.functions;
  if (!functions?.invoke || functions.__impactOfficialWrapped) return;
  const original = functions.invoke.bind(functions);
  functions.invoke = async (name, payload = {}) => {
    if (name === 'iniciarRelatorioExecucao') {
      payload = { ...payload, numero_relatorio: document.querySelector('[data-report-number-field="true"] input')?.value || '' };
    }
    if (name === 'gerarSecaoRelatorioExecucao' && ['impactos', 'impactos_economicos_sociais'].includes(payload.secao)) {
      let report = null;
      try { report = payload.relatorio_id ? await base44.entities.RelatorioExecucaoObjeto.get(payload.relatorio_id) : await latestReport(); } catch (_) {}
      const spent = money(report?._total_financeiro);
      const audience = money(report?._publico_dashboard?.total || report?.publico_alvo?.total_realizado);
      const costPerPerson = audience > 0 ? spent / audience : null;
      const instruction = `Produza texto técnico de até 2.000 caracteres sobre impactos econômicos e sociais. Use somente dados reais: investimento executado de ${spent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, público direto de ${audience.toLocaleString('pt-BR')} pessoas${costPerPerson !== null ? ` e investimento médio de ${costPerPerson.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por participante direto` : ''}. Relacione ações, resultados, formação de público, acesso à cultura, trabalho e renda na cadeia cultural, preservação patrimonial e economia criativa. Contextualize com referências oficiais do IBGE, Ministério da Cultura e IPEA, mas não invente multiplicador de retorno financeiro e não chame custo por participante de ROI. Preserve qualquer texto editado manualmente.`;
      payload = { ...payload, instrucao_usuario: `${payload.instrucao_usuario || ''} ${instruction}`.trim(), limite_caracteres: 2000, investimento_executado: spent, publico_direto: audience, investimento_por_participante: costPerPerson };
    }
    const result = await original(name, payload);
    if (name === 'iniciarRelatorioExecucao') setTimeout(persistHeaderFields, 1500);
    return result;
  };
  functions.__impactOfficialWrapped = true;
}

function run() {
  if (!isReportRoute()) return;
  installReportNumberField();
  installTeamForm();
}

export function installRelatorioCamposOficiais() {
  if (typeof window === 'undefined' || window.__relatorioCamposOficiaisInstalled) return;
  window.__relatorioCamposOficiaisInstalled = true;
  wrapImpactGeneration();
  const schedule = () => window.requestAnimationFrame(run);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  schedule();
}
