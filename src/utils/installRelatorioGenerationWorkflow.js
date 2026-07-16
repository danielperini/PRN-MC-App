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
const TIMEOUT_GERACAO_MS = 8 * 60 * 1000;
let ativo = false;
let concluidas = new Set();
let iniciadoEm = 0;
let secaoAtualGlobal = '';
let progressoTimer = null;

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
  const decorridoSegundos = ativo && iniciadoEm ? Math.floor((Date.now() - iniciadoEm) / 1000) : 0;
  const progressoTemporal = ativo ? Math.min(88, 8 + Math.floor(decorridoSegundos / 3)) : 100;
  const progressoSecoes = ativo ? Math.round(8 + (concluidasCount / total) * 90) : 100;
  const valor = ativo ? Math.min(99, Math.max(8, progressoTemporal, progressoSecoes)) : 100;
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

function renderPainel(secaoAtual = '', concluido = false, erro = '') {
  const painel = garantirPainel();
  if (!painel) return;
  const { valor, minutos } = progressoAtual(secaoAtual);
  painel.style.display = 'block';
  painel.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold ${erro ? 'text-red-900' : 'text-blue-900'}">${erro ? 'Falha ao concluir o relatório' : concluido ? 'Relatório 100% preenchido' : 'Preenchimento campo a campo com IA'}</h3>
        <p class="text-sm ${erro ? 'text-red-700' : 'text-blue-700'}">${erro || (concluido ? 'Relatório liberado para visualização na tela e exportação.' : `Etapa atual: ${secaoAtual || 'Preparando dados reais do período'}`)}</p>
      </div>
      <strong class="${erro ? 'text-red-900' : 'text-blue-900'}">${concluido ? 100 : valor}%</strong>
    </div>
    <div class="h-2 rounded-full bg-blue-100 overflow-hidden"><div class="h-full ${erro ? 'bg-red-600' : 'bg-blue-600'} transition-all" style="width:${concluido ? 100 : valor}%"></div></div>
    <p class="text-xs ${erro ? 'text-red-700' : 'text-blue-700'}">${erro ? 'Os dados já gravados foram preservados.' : concluido ? 'Concluído.' : `Previsão de entrega: aproximadamente ${minutos} minuto(s).`}</p>
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

function pararTimer() {
  if (progressoTimer) window.clearInterval(progressoTimer);
  progressoTimer = null;
}

function iniciarTimer() {
  pararTimer();
  progressoTimer = window.setInterval(() => {
    if (!ativo) return pararTimer();
    if (Date.now() - iniciadoEm >= TIMEOUT_GERACAO_MS) {
      falhar('A geração ultrapassou o tempo máximo. Tente novamente; nenhum dado anterior foi apagado.');
      return;
    }
    renderPainel(secaoAtualGlobal || 'Processando dados e textos do relatório');
  }, 1000);
}

function iniciar() {
  ativo = true;
  iniciadoEm = Date.now();
  concluidas = new Set();
  secaoAtualGlobal = 'Criando estrutura do relatório';
  esconderRelatorioDuranteGeracao();
  renderPainel(secaoAtualGlobal);
  iniciarTimer();
}

function concluir() {
  ativo = false;
  pararTimer();
  SECOES.forEach(([key]) => concluidas.add(key));
  secaoAtualGlobal = '';
  esconderRelatorioDuranteGeracao();
  renderPainel('', true);
}

function falhar(message) {
  ativo = false;
  pararTimer();
  esconderRelatorioDuranteGeracao();
  renderPainel('', false, texto(message) || 'Não foi possível concluir a geração.');
}

function payloadPareceRelatorioConcluido(payload = {}) {
  const campos = ['descricao_acoes', 'cronograma_metas', 'equipe_trabalho', 'avaliacao_parceria', 'anexos_evidencias'];
  return campos.filter((campo) => payload?.[campo] !== undefined).length >= 2;
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
    reportEntity.update = async (id, payload = {}, ...args) => {
      try {
        const result = await originalUpdate(id, filtrarEquipe(payload), ...args);
        if (ativo && payloadPareceRelatorioConcluido(payload)) concluir();
        return result;
      } catch (error) {
        if (ativo) falhar(error?.message || 'Falha ao salvar o relatório gerado.');
        throw error;
      }
    };
    reportEntity.__workflowEquipeWrapped = true;
  }

  if (reportEntity?.get && !reportEntity.__workflowGetWrapped) {
    const originalGet = reportEntity.get.bind(reportEntity);
    reportEntity.get = async (...args) => {
      const result = await originalGet(...args);
      if (ativo && result) concluir();
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
        secaoAtualGlobal = label;
        renderPainel(label);
        try {
          const result = await originalInvoke(functionName, payload);
          if (secao) concluidas.add(secao);
          renderPainel(label);
          return result;
        } catch (error) {
          falhar(error?.message || `Falha ao gerar ${label}.`);
          throw error;
        }
      }
      try {
        return await originalInvoke(functionName, payload);
      } catch (error) {
        if (ativo && /relatorio/i.test(functionName)) falhar(error?.message || 'Falha na geração do relatório.');
        throw error;
      }
    };
    functions.__workflowProgressWrapped = true;
  }

  const run = () => window.requestAnimationFrame(() => {
    garantirPainel();
    if (ativo) renderPainel(secaoAtualGlobal || 'Processando dados e textos do relatório');
  });
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  run();
}
