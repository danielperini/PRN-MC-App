import { base44 } from '@/api/base44Client';

const EQUIPAMENTOS = [
  'Museu de Arte da Pampulha (MAP)',
  'Casa do Baile',
  'Museu Casa Kubitschek',
  'Museu da Moda de Belo Horizonte (MUMO)',
  'Museu da Imagem e do Som de Belo Horizonte (MIS BH)',
  'Museu Histórico Abílio Barreto (MHAB)',
];
const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO', 'FINALIZADO']);
const CAMPOS_FOTO = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url'];

function texto(value) {
  return String(value ?? '').trim();
}

function normalizar(value) {
  return texto(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function nestedTexto(value = '', atual = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {
    ...(atual && typeof atual === 'object' ? atual : {}),
    texto_ia: texto(value),
    texto_editado: '',
    modo: 'ia',
    editavel: true,
  };
}

function textoNested(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.texto_editado || value.texto_ia || value.texto || '';
}

async function listar(nome, limite = 5000) {
  try {
    const entidade = base44?.entities?.[nome];
    if (!entidade?.list) return [];
    const lista = await entidade.list('-created_date', limite);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function dataISO(value) {
  const match = texto(value).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const data = new Date(value);
  return Number.isNaN(data.getTime()) ? '' : data.toISOString().slice(0, 10);
}

function dentroPeriodo(item, inicio, fim) {
  const data = dataISO(item?.data_atividade || item?.data || item?.data_inicio || item?.created_date);
  return !!data && (!inicio || data >= inicio) && (!fim || data <= fim);
}

function fotoUrl(item) {
  for (const campo of CAMPOS_FOTO) if (item?.[campo]) return item[campo];
  return '';
}

async function carregarAtividadesAprovadas(relatorio) {
  const [relatorios, atividades, fotos] = await Promise.all([
    Promise.all(['RelatorioAtividade', 'ActivityReport', 'RelatorioMensalAtividade'].map((nome) => listar(nome, 10000))).then((r) => r.flat()),
    Promise.all(['Programacao', 'Activity', 'Atividade', 'Evento'].map((nome) => listar(nome, 10000))).then((r) => r.flat()),
    Promise.all(['ActivityPhoto', 'AtividadeFoto', 'GalleryPhoto', 'GaleriaFoto', 'Photo', 'Foto'].map((nome) => listar(nome, 10000))).then((r) => r.flat()),
  ]);

  const inicio = relatorio?.data_inicio || '';
  const fim = relatorio?.data_fim || '';
  const aprovados = relatorios.filter((item) => {
    const status = texto(item?.status || item?.situacao).toUpperCase();
    return STATUS_APROVADOS.has(status) && dentroPeriodo(item, inicio, fim);
  });

  const atividadePorId = new Map(atividades.map((item) => [String(item.id || ''), item]));
  return aprovados.map((rel) => {
    const atividadeId = String(rel?.atividade_id || rel?.activity_id || rel?.programacao_id || rel?.evento_id || '');
    const atividade = atividadePorId.get(atividadeId) || {};
    const fotosRelacionadas = fotos
      .filter((foto) => String(foto?.atividade_id || foto?.activity_id || foto?.programacao_id || foto?.evento_id || '') === atividadeId)
      .map((foto) => ({ url: fotoUrl(foto), legenda: texto(foto?.legenda || foto?.titulo || foto?.descricao) }))
      .filter((foto) => foto.url)
      .slice(0, 3);
    return {
      id: rel.id,
      atividade_id: atividadeId,
      titulo: rel?.titulo || rel?.nome_atividade || atividade?.titulo || atividade?.nome || 'Atividade',
      data: dataISO(rel?.data_atividade || rel?.data || atividade?.data_inicio || atividade?.data),
      local: rel?.local || rel?.museu || atividade?.local || atividade?.museu || '',
      publico: Number(rel?.publico_total || rel?.publico_realizado || atividade?.publico_total || 0),
      responsaveis: rel?.responsaveis || rel?.equipe || atividade?.responsaveis || '',
      descricao: rel?.descricao || rel?.relato || rel?.texto || atividade?.descricao || atividade?.sinopse || '',
      status: rel?.status || rel?.situacao || '',
      fotos: fotosRelacionadas,
      galeria_url: rel?.galeria_url || rel?.link_galeria || atividade?.link_imagens || atividade?.galeria_url || '',
    };
  });
}

function criarCampo(label, name, value = '', type = 'text') {
  const wrap = document.createElement('label');
  wrap.className = 'block space-y-1';
  wrap.innerHTML = `<span class="text-xs font-medium text-slate-600">${label}</span><input data-relatorio-campo="${name}" type="${type}" class="w-full rounded-md border px-3 py-2 text-sm" value="${String(value ?? '').replace(/"/g, '&quot;')}" />`;
  return wrap;
}

function criarTextarea(label, name, value = '', maxLength = null) {
  const wrap = document.createElement('label');
  wrap.className = 'block space-y-1';
  const limite = maxLength ? ` maxlength="${maxLength}"` : '';
  wrap.innerHTML = `<span class="text-xs font-medium text-slate-600">${label}</span><textarea data-relatorio-campo="${name}" class="w-full min-h-[110px] rounded-md border px-3 py-2 text-sm"${limite}>${texto(value)}</textarea>`;
  return wrap;
}

function valorCampo(card, name) {
  return card.querySelector(`[data-relatorio-campo="${name}"]`)?.value || '';
}

async function salvar(card) {
  const id = window.__relatorioExecucaoAtualId;
  const atual = window.__relatorioExecucaoAtual || {};
  if (!id) return;

  const locais = EQUIPAMENTOS.map((nome, index) => ({
    nome,
    endereco: valorCampo(card, `local_${index}_endereco`),
    endereco_virtual: valorCampo(card, `local_${index}_virtual`),
    periodo_inicio: valorCampo(card, `local_${index}_inicio`),
    periodo_fim: valorCampo(card, `local_${index}_fim`),
    editavel: true,
  }));

  const identificacao = {
    ...(atual.identificacao_projeto || {}),
    organizacao: valorCampo(card, 'organizacao'),
    projeto: valorCampo(card, 'projeto'),
    instrumento_juridico: valorCampo(card, 'instrumento_juridico'),
    processo_administrativo: valorCampo(card, 'processo_administrativo'),
    vigencia_inicio: valorCampo(card, 'vigencia_inicio'),
    vigencia_fim: valorCampo(card, 'vigencia_fim'),
    primeiro_repasse: valorCampo(card, 'primeiro_repasse'),
    responsavel: valorCampo(card, 'responsavel'),
    telefone: valorCampo(card, 'telefone'),
    email: valorCampo(card, 'email'),
  };

  const descricao = valorCampo(card, 'descricao_acoes').slice(0, 3000);
  const payload = {
    identificacao_projeto: identificacao,
    endereco_execucao: {
      tipo: valorCampo(card, 'tipo_endereco') || 'fisico',
      locais,
      texto_editado: locais.map((item) => `${item.nome}${item.endereco ? ` — ${item.endereco}` : ''}`).join('\n'),
      editavel: true,
    },
    divulgacao_parceria: {
      texto_editado: valorCampo(card, 'divulgacao'),
      modo: 'manual',
      editavel: true,
    },
    descricao_acoes: {
      ...(atual.descricao_acoes || {}),
      texto_editado: descricao,
      modo: 'hibrido',
      editavel: true,
    },
  };

  await base44.entities.RelatorioExecucaoObjeto.update(id, payload);
  window.__relatorioExecucaoAtual = { ...atual, ...payload };
  const aviso = card.querySelector('[data-relatorio-aviso]');
  if (aviso) aviso.textContent = 'Itens 2 a 5 salvos com sucesso.';
}

async function gerarDescricaoIA(card) {
  const id = window.__relatorioExecucaoAtualId;
  const relatorio = window.__relatorioExecucaoAtual || {};
  if (!id) return;
  const atividades = await carregarAtividadesAprovadas(relatorio);
  await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
    relatorio_id: id,
    secao: 'descricao_acoes',
    data_inicio: relatorio.data_inicio,
    data_fim: relatorio.data_fim,
    atividades_aprovadas: atividades,
    limite_caracteres: 3000,
    maximo_fotos_por_atividade: 3,
    incluir_link_galeria: true,
    nao_inventar_dados: true,
    instrucao_usuario: 'Escreva a descrição das ações executadas usando somente relatórios de atividades aprovados. Organize por museu e ordem cronológica, informando data, local, público e responsáveis quando disponíveis. Trate cancelamentos ou remarcações apenas quando registrados. Limite a 3000 caracteres. Vincule no máximo 3 fotos por atividade e preserve o link da galeria do app.',
  });
  const atualizado = await base44.entities.RelatorioExecucaoObjeto.get(id);
  window.__relatorioExecucaoAtual = atualizado;
  const textarea = card.querySelector('[data-relatorio-campo="descricao_acoes"]');
  if (textarea) textarea.value = textoNested(atualizado?.descricao_acoes).slice(0, 3000);
}

function renderizarEditor() {
  if (!/RelatorioExecucaoObjeto/i.test(window.location.pathname)) return;
  const relatorio = window.__relatorioExecucaoAtual;
  if (!relatorio || document.querySelector('[data-editor-itens-2a5]')) return;
  const cardRelatorio = Array.from(document.querySelectorAll('h3')).find((h) => normalizar(h.textContent).includes('2. endereco de execucao'))?.closest('.rounded-xl.border')?.parentElement;
  if (!cardRelatorio) return;

  const card = document.createElement('section');
  card.dataset.editorItens2a5 = 'true';
  card.className = 'rounded-xl border bg-white p-4 space-y-5';
  const id = relatorio.identificacao_projeto || {};
  card.innerHTML = '<div><h3 class="font-semibold text-base">Itens 2 a 5 — Dados editáveis</h3><p class="text-xs text-slate-500">Revise antes da exportação final.</p></div>';

  const blocoId = document.createElement('div');
  blocoId.className = 'grid grid-cols-1 md:grid-cols-2 gap-3';
  [
    ['Organização da Sociedade Civil', 'organizacao', id.organizacao || 'Viaduto das Artes'],
    ['Nome do projeto', 'projeto', id.projeto || 'Museus Centro'],
    ['Instrumento jurídico', 'instrumento_juridico', id.instrumento_juridico || 'Termo de Colaboração nº 01-031.069/24-80'],
    ['Processo administrativo', 'processo_administrativo', id.processo_administrativo || '01-031.069/24-80'],
    ['Vigência inicial', 'vigencia_inicio', id.vigencia_inicio || '', 'date'],
    ['Vigência final', 'vigencia_fim', id.vigencia_fim || '', 'date'],
    ['Data do primeiro repasse', 'primeiro_repasse', id.primeiro_repasse || '', 'date'],
    ['Responsável pelo relatório', 'responsavel', id.responsavel || 'Daniel Perini'],
    ['Telefone', 'telefone', id.telefone || ''],
    ['E-mail', 'email', id.email || ''],
  ].forEach((args) => blocoId.appendChild(criarCampo(...args)));
  card.appendChild(blocoId);

  const tipo = document.createElement('label');
  tipo.className = 'block space-y-1';
  tipo.innerHTML = `<span class="text-xs font-medium text-slate-600">Tipo de endereço</span><select data-relatorio-campo="tipo_endereco" class="w-full rounded-md border px-3 py-2 text-sm"><option value="fisico">Físico</option><option value="virtual">Virtual</option><option value="ambos">Ambos</option></select>`;
  tipo.querySelector('select').value = relatorio?.endereco_execucao?.tipo || 'fisico';
  card.appendChild(tipo);

  const locaisAtuais = Array.isArray(relatorio?.endereco_execucao?.locais) ? relatorio.endereco_execucao.locais : [];
  EQUIPAMENTOS.forEach((nome, index) => {
    const atual = locaisAtuais.find((item) => item.nome === nome) || {};
    const bloco = document.createElement('div');
    bloco.className = 'rounded-lg border p-3 space-y-2';
    bloco.innerHTML = `<p class="text-sm font-semibold">${nome}</p>`;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-2';
    grid.appendChild(criarCampo('Endereço físico', `local_${index}_endereco`, atual.endereco || ''));
    grid.appendChild(criarCampo('Endereço virtual', `local_${index}_virtual`, atual.endereco_virtual || ''));
    grid.appendChild(criarCampo('Período inicial', `local_${index}_inicio`, atual.periodo_inicio || relatorio.data_inicio || '', 'date'));
    grid.appendChild(criarCampo('Período final', `local_${index}_fim`, atual.periodo_fim || relatorio.data_fim || '', 'date'));
    bloco.appendChild(grid);
    card.appendChild(bloco);
  });

  card.appendChild(criarTextarea('Divulgação da parceria', 'divulgacao', textoNested(relatorio.divulgacao_parceria) || 'O Relatório de Comunicação encontra-se anexo a este Relatório de Execução do Objeto.'));
  card.appendChild(criarTextarea('Descrição das ações executadas', 'descricao_acoes', textoNested(relatorio.descricao_acoes), 3000));
  const acoes = document.createElement('div');
  acoes.className = 'flex flex-wrap gap-2 items-center';
  acoes.innerHTML = '<button type="button" data-gerar-ia class="rounded-md border px-3 py-2 text-sm">Gerar descrição com IA</button><button type="button" data-salvar class="rounded-md bg-slate-900 text-white px-3 py-2 text-sm">Salvar itens 2 a 5</button><span data-relatorio-aviso class="text-xs text-green-700"></span>';
  acoes.querySelector('[data-gerar-ia]').addEventListener('click', () => gerarDescricaoIA(card));
  acoes.querySelector('[data-salvar]').addEventListener('click', () => salvar(card));
  card.appendChild(acoes);
  cardRelatorio.prepend(card);
}

export function installRelatorioItens2a5() {
  if (typeof window === 'undefined' || window.__relatorioItens2a5Installed) return;
  window.__relatorioItens2a5Installed = true;
  const entidade = base44?.entities?.RelatorioExecucaoObjeto;
  if (entidade?.get && !entidade.__itens2a5GetWrapped) {
    const originalGet = entidade.get.bind(entidade);
    entidade.get = async (id, ...args) => {
      const relatorio = await originalGet(id, ...args);
      window.__relatorioExecucaoAtualId = id;
      window.__relatorioExecucaoAtual = relatorio;
      return relatorio;
    };
    entidade.__itens2a5GetWrapped = true;
  }
  const executar = () => window.requestAnimationFrame(renderizarEditor);
  new MutationObserver(executar).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', executar);
  window.addEventListener('hashchange', executar);
  executar();
}
