import { base44 } from '@/api/base44Client';

const SECOES = [
  ['endereco_execucao', 'Endereço de execução'],
  ['divulgacao_parceria', 'Divulgação da parceria'],
  ['descricao_acoes', 'Descrição das ações'],
  ['publico_alvo', 'Público-alvo'],
  ['pesquisa_satisfacao', 'Pesquisa de satisfação'],
  ['cronograma_metas', 'Cronograma de metas'],
  ['equipe_trabalho', 'Equipe de trabalho'],
  ['impactos_economicos_sociais', 'Impactos econômicos e sociais'],
  ['sustentabilidade', 'Sustentabilidade'],
  ['avaliacao_parceria', 'Avaliação da parceria'],
  ['assinatura', 'Assinatura'],
  ['anexos', 'Anexos e evidências'],
];

const ESTIMATIVA_SEGUNDOS_POR_SECAO = 12;
let ativo = false;
let concluidas = new Set();
let iniciadoEm = 0;

function texto(value) {
  return String(value ?? '').trim();
}

function normalizar(value) {
  return texto(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function nomePessoa(item = {}) {
  return texto(item.nome || item.nome_completo || item.profissional_nome || item.colaborador_nome || item.fornecedor_nome || item.nf_emitente_nome);
}

function cargoPessoa(item = {}) {
  return texto(item.cargo || item.funcao || item.papel || item.descricao_cargo || item.meta_nome || item.rubrica_nome || item.descricao_item);
}

function idsMeta1(metas = []) {
  const ids = new Set();
  for (const meta of metas) {
    const nome = normalizar(meta?.nome || meta?.meta_nome || meta?.titulo || meta?.descricao);
    const codigo = normalizar(meta?.codigo || meta?.meta_codigo || meta?.id);
    const ehMeta1 = /^1(?:\s|\-|\.|$)/.test(nome)
      || /^1(?:\s|\-|\.|$)/.test(codigo)
      || nome.includes('contratacao da equipe principal')
      || nome.includes('equipe principal');
    if (!ehMeta1) continue;
    for (const id of [meta?.id, meta?.meta_id, meta?.codigo, meta?.meta_codigo]) {
      if (id) ids.add(String(id));
    }
  }
  return ids;
}

function metasManutencao(metas = []) {
  const ids = new Set();
  for (const meta of metas) {
    const nome = normalizar(meta?.nome || meta?.meta_nome || meta?.titulo || meta?.descricao);
    if (!(nome.includes('manutencao') && nome.includes('expos'))) continue;
    for (const id of [meta?.id, meta?.meta_id, meta?.codigo, meta?.meta_codigo]) {
      if (id) ids.add(String(id));
    }
  }
  return ids;
}

function notaPertence(nota = {}, ids = new Set()) {
  const candidatos = [nota.meta_id, nota.project_meta_id, nota.meta_codigo, nota.codigo_meta]
    .filter(Boolean)
    .map(String);
  return candidatos.some((id) => ids.has(id));
}

function filtrarEquipe(payload = {}) {
  if (!Array.isArray(payload.equipe_trabalho)) return payload;

  const metas = Array.isArray(payload.metas_selecionadas) ? payload.metas_selecionadas : [];
  const notas = Array.isArray(payload._notas_fiscais_metas) ? payload._notas_fiscais_metas : [];
  const meta1 = idsMeta1(metas);
  const manutencao = metasManutencao(metas);

  const nomesMeta1 = new Set(
    notas
      .filter((nota) => notaPertence(nota, meta1))
      .map((nota) => normalizar(nota.fornecedor || nota.fornecedor_nome || nota.nf_emitente_nome))
      .filter(Boolean),
  );

  const nomesEducadorasManutencao = new Set(
    notas
      .filter((nota) => notaPertence(nota, manutencao))
      .filter((nota) => /educador|educadora/.test(normalizar(nota.cargo || nota.funcao || nota.descricao || nota.rubrica_nome)))
      .map((nota) => normalizar(nota.fornecedor || nota.fornecedor_nome || nota.nf_emitente_nome))
      .filter(Boolean),
  );

  const equipe = payload.equipe_trabalho.filter((item) => {
    const nome = normalizar(nomePessoa(item));
    const cargo = normalizar(cargoPessoa(item));
    if (!nome) return false;
    if (nomesMeta1.has(nome)) return true;
    return /educador|educadora/.test(cargo) && nomesEducadorasManutencao.has(nome);
  });

  return {
    ...payload,
    equipe_trabalho: equipe,
    _equipe_real: equipe,
    regra_equipe_aplicada: 'NF vinculada à Meta 1; educadoras somente quando vinculadas à meta atual de manutenção de exposições',
  };
}

function isRoute() {
  return typeof window !== 'undefined' && /RelatorioExecucaoObjeto/i.test(window.location.pathname);
}

function progressoAtual(secaoAtual = '') {
  const total = SECOES.length;
  const concluidasCount = concluidas.size;
  const base = ativo ? 8 : 0;
  const valor = ativo ? Math.min(99, Math.round(base + (concluidasCount / total) * 90)) : 100;
  const restantes = Math.max(0, total - concluidasCount);
  const minutos = Math.max(1, Math.ceil((restantes * ESTIMATIVA_SEGUNDOS_POR_SECAO) / 60));
  return { valor, minutos, secaoAtual };
}

function garantirPainel() {
  if (!isRoute()) return null;
  let painel = document.querySelector('[data-relatorio-workflow]');
  if (painel) return painel;

  painel = document.createElement('section');
  painel.dataset.relatorioWorkflow = 'true';
  painel.className = 'rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3';
  painel.style.display = 'none';

  const cards = Array.from(document.querySelectorAll('.rounded-xl.border'));
  const config = cards.find((el) => normalizar(el.textContent).includes('configurar relatorio'));
  if (config?.parentElement) config.parentElement.insertBefore(painel, config.nextSibling);
  else document.querySelector('main')?.prepend(painel);
  return painel;
}

function renderPainel(secaoAtual = '', concluido = false) {
  const painel = garantirPainel();
  if (!painel) return;
  const { valor, minutos } = progressoAtual(secaoAtual);
  painel.style.display = 'block';
  painel.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold text-blue-900">${concluido ? 'Relatório 100% preenchido' : 'Preenchimento campo a campo com IA'}</h3>
        <p class="text-sm text-blue-700">${concluido ? 'Relatório liberado para visualização na tela e exportação.' : `Etapa atual: ${secaoAtual || 'Preparando dados reais do período'}`}</p>
      </div>
      <strong class="text-blue-900">${concluido ? 100 : valor}%</strong>
    </div>
    <div class="h-2 rounded-full bg-blue-100 overflow-hidden"><div class="h-full bg-blue-600 transition-all" style="width:${concluido ? 100 : valor}%"></div></div>
    <p class="text-xs text-blue-700">${concluido ? 'Concluído.' : `Previsão de entrega: aproximadamente ${minutos} minuto(s).`}</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
      ${SECOES.map(([key, label]) => {
        const status = concluidas.has(key) || concluido ? '✓' : key === secaoAtual ? '●' : '○';
        return `<div class="${status === '✓' ? 'text-green-700' : status === '●' ? 'text-blue-700 font-medium' : 'text-slate-500'}">${status} ${label}</div>`;
      }).join('')}
    </div>`;
}

function esconderRelatorioDuranteGeracao() {
  document.documentElement.classList.toggle('relatorio-gerando-campo-a-campo', ativo);
  if (!document.getElementById('relatorio-workflow-style')) {
    const style = document.createElement('style');
    style.id = 'relatorio-workflow-style';
    style.textContent = `
      .relatorio-gerando-campo-a-campo [data-editor-itens-2a5],
      .relatorio-gerando-campo-a-campo [data-relatorio-execucao],
      .relatorio-gerando-campo-a-campo .report-preview { visibility: hidden !important; }
    `;
    document.head.appendChild(style);
  }
}

function iniciar() {
  ativo = true;
  iniciadoEm = Date.now();
  concluidas = new Set();
  esconderRelatorioDuranteGeracao();
  renderPainel('Criando estrutura do relatório');
}

function concluir() {
  ativo = false;
  SECOES.forEach(([key]) => concluidas.add(key));
  esconderRelatorioDuranteGeracao();
  renderPainel('', true);
}

export function installRelatorioGenerationWorkflow() {
  if (typeof window === 'undefined' || window.__relatorioGenerationWorkflowInstalled) return;
  window.__relatorioGenerationWorkflowInstalled = true;

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button');
    if (!button || !isRoute()) return;
    if (normalizar(button.textContent).includes('gerar relatorio')) iniciar();
  }, true);

  const reportEntity = base44?.entities?.RelatorioExecucaoObjeto;
  if (reportEntity?.update && !reportEntity.__workflowEquipeWrapped) {
    const originalUpdate = reportEntity.update.bind(reportEntity);
    reportEntity.update = (id, payload = {}, ...args) => originalUpdate(id, filtrarEquipe(payload), ...args);
    reportEntity.__workflowEquipeWrapped = true;
  }

  if (reportEntity?.get && !reportEntity.__workflowGetWrapped) {
    const originalGet = reportEntity.get.bind(reportEntity);
    reportEntity.get = async (...args) => {
      const result = await originalGet(...args);
      if (ativo) concluir();
      return result;
    };
    reportEntity.__workflowGetWrapped = true;
  }

  const functions = base44?.functions;
  if (functions?.invoke && !functions.__workflowProgressWrapped) {
    const originalInvoke = functions.invoke.bind(functions);
    functions.invoke = async (functionName, payload = {}) => {
      if (functionName === 'iniciarRelatorioExecucao' && !ativo) iniciar();
      if (functionName === 'gerarSecaoRelatorioExecucao') {
        const secao = texto(payload?.secao);
        const label = SECOES.find(([key]) => key === secao)?.[1] || secao || 'Seção do relatório';
        renderPainel(label);
        const result = await originalInvoke(functionName, payload);
        if (secao) concluidas.add(secao);
        renderPainel(label);
        return result;
      }
      return originalInvoke(functionName, payload);
    };
    functions.__workflowProgressWrapped = true;
  }

  const run = () => window.requestAnimationFrame(() => {
    garantirPainel();
    if (ativo && Date.now() - iniciadoEm > 15 * 60 * 1000) concluir();
  });
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  run();
}
