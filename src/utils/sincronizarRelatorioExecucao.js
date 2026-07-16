import { base44 } from '@/api/base44Client';
import {
  idCanonicoMeta,
  metaPertenceAo3ou4Aditivo,
  nomeCanonicoMeta,
  normalizarTextoMeta,
} from '@/utils/metasAditivosPermitidos';

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const CAMPOS_DATA = ['data', 'data_atividade', 'data_inicio', 'start_date', 'created_date'];
const CAMPOS_FOTO = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url'];
const CAMPOS_META_ID = [
  'meta_id', 'project_meta_id', 'meta_projeto_id', 'metaProjetoId', 'projectMetaId',
  'goal_id', 'project_goal_id', 'meta_codigo', 'codigo_meta', 'metaId', 'meta_vinculada_id',
];
const CAMPOS_META_NOME = [
  'meta_nome', 'nome_meta', 'meta_titulo', 'titulo_meta', 'meta_descricao', 'descricao_meta',
  'meta_label', 'meta_texto', 'meta_codigo', 'codigo_meta', 'meta', 'meta_vinculada',
];
const METAS_ANTIGAS_BLOQUEADAS = [
  'presente de iemanja',
  '60 acoes educativas',
  '36 acoes culturais',
  '18 mostras de baixa ou media complexidade',
  '101 diarias de educador',
  'emenda parlamentar',
  'meta de comunicacao institucional',
];

function dataISO(value) {
  if (!value) return '';
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function primeiro(item, campos) {
  for (const campo of campos) {
    if (item?.[campo] !== undefined && item?.[campo] !== null && item?.[campo] !== '') return item[campo];
  }
  return null;
}

function valorPrimitivo(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function objetoMeta(item) {
  return [
    item?.meta,
    item?.project_meta,
    item?.meta_projeto,
    item?.meta_vinculada,
    item?.goal,
    item?.project_goal,
    item?.rubrica?.meta,
    item?.rubrica_objeto?.meta,
  ].find((value) => value && typeof value === 'object') || null;
}

function extrairMetaId(item) {
  const direto = valorPrimitivo(primeiro(item, CAMPOS_META_ID));
  if (direto) return direto;
  const objeto = objetoMeta(item);
  return valorPrimitivo(objeto && (objeto.id || objeto.meta_id || objeto.codigo || objeto.meta_codigo));
}

function extrairMetaNome(item) {
  for (const campo of CAMPOS_META_NOME) {
    const value = item?.[campo];
    const texto = valorPrimitivo(value);
    if (texto) return texto;
    if (value && typeof value === 'object') {
      const nome = nomeCanonicoMeta(value);
      if (nome && nome !== 'Meta') return nome;
    }
  }
  const objeto = objetoMeta(item);
  if (objeto) {
    const nome = nomeCanonicoMeta(objeto);
    if (nome && nome !== 'Meta') return nome;
  }
  return valorPrimitivo(item?.rubrica_nome || item?.item_despesa || item?.natureza_despesa_nome || item?.descricao_meta);
}

function nomeRubrica(item) {
  return valorPrimitivo(
    item?.rubrica_nome || item?.rubrica?.nome || item?.rubrica?.rubrica || item?.item_despesa || item?.natureza_despesa_nome,
  );
}

function textoItem(item) {
  return normalizarTextoMeta([
    extrairMetaNome(item),
    nomeRubrica(item),
    item?.descricao_item,
    item?.descricao,
    item?.centro_custo,
    item?.projeto,
    item?.projeto_nome,
    item?.aditivo,
    item?.numero_aditivo,
    item?.termo_aditivo,
  ].filter(Boolean).join(' '));
}

function ehMetaAntigaBloqueada(meta) {
  const texto = normalizarTextoMeta(nomeCanonicoMeta(meta));
  return METAS_ANTIGAS_BLOQUEADAS.some((item) => texto.includes(item));
}

function nomeMetaLogica(metaOuItem) {
  const original = extrairMetaNome(metaOuItem) || nomeCanonicoMeta(metaOuItem) || nomeRubrica(metaOuItem) || 'Meta';
  const texto = normalizarTextoMeta(original);
  const contexto = textoItem(metaOuItem);

  if (texto.includes('educador') || contexto.includes(' educador')) return 'Educador MIS / MUMO / MHAB (mês 19 ao 28)';
  if (texto.includes('material mis') || contexto.includes('material mis')) return 'Material MIS (mês 19 ao mês 28)';
  if (texto.includes('acoes educativo') || contexto.includes('acoes educativo')) return 'Ações educativo-culturais MIS / MUMO / MHAB';
  if (texto.includes('producao mis') || contexto.includes('producao mis')) return 'Produção MIS/MUMO/MHAB (mês 19 ao 28)';
  if (texto.includes('diarias') || contexto.includes('diaria educador')) return 'Diárias MIS / MUMO / MHAB';
  if (texto.includes('rede social') || texto.includes('marketing cultural')) return 'Rede Social / Marketing Cultural (mês 19 ao mês 28)';
  if (texto.includes('assessor de imprensa')) return 'Assessor de Imprensa (mês 19 ao 28)';
  if (texto.includes('consultoria de programacao')) return 'Consultoria de programação';
  if (texto.includes('lanches') || texto.includes('buffet')) return 'Lanches/buffet (mês 19 ao 28)';
  if (texto.includes('manutencao mis')) return 'Manutenção MIS (mês 19 ao mês 28)';
  if (texto.includes('material de escritorio')) return 'Material de escritório';
  if (texto.includes('energia eletrica')) return 'Energia elétrica';
  if (texto.includes('exposicao mumo')) return 'Exposição MUMO';
  if (texto.includes('mostra de media complexidade')) return 'Mostra de média complexidade MHAB';
  if (texto.includes('designer mhab')) return 'Designer MHAB';
  if (texto.includes('id / designer') || texto.includes('id designer')) return 'ID / designer (Ed. 2026)';
  if (texto.includes('designer')) return 'Designer (mês 19 ao 28)';
  if (texto.includes('infraestrutura') && contexto.includes('pampulha')) return 'Infraestrutura – Noturno Pampulha';
  if (texto.includes('infraestrutura')) return original;

  return original.replace(/\s*\([^)]*\)\s*$/g, '').trim() || original;
}

function chaveMetaLogica(metaOuItem) {
  return normalizarTextoMeta(nomeMetaLogica(metaOuItem));
}

function idPreferencial(ids = []) {
  const validos = [...new Set(ids.filter(Boolean).map(String))];
  return validos.find((id) => /^[a-f0-9]{20,}$/i.test(id)) || validos[0] || '';
}

function dentroPeriodo(item, inicio, fim) {
  const data = dataISO(primeiro(item, CAMPOS_DATA));
  return !!data && data >= inicio && data <= fim;
}

function unico(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key && !map.has(key)) map.set(key, item);
  }
  return [...map.values()];
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

function valor(item) {
  const parsed = Number(item?.valor_pago || item?.valor_aprovado_admin || item?.valor_aprovado || item?.valor_total || item?.valor || item?.nf_valor_total || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function temDocumentoFiscal(compra) {
  return !!(
    compra?.nf_numero || compra?.numero_nf || compra?.nf_pdf_url || compra?.nota_fiscal_pdf_url ||
    compra?.nota_fiscal_url || compra?.nf_xml_url || compra?.xml_url || compra?.documento_intake_id ||
    compra?.intake_id || compra?.arquivo_nome
  );
}

function agruparMetas(metasCadastradas, compras) {
  const grupos = new Map();
  const cadastradasPorId = new Map(metasCadastradas.map((meta) => [String(idCanonicoMeta(meta)), meta]));

  function incluir(item, origem) {
    const metaIdOriginal = extrairMetaId(item) || String(idCanonicoMeta(item) || '');
    const cadastrada = cadastradasPorId.get(metaIdOriginal);
    const base = cadastrada || item;
    const chave = chaveMetaLogica(base);
    if (!chave || ehMetaAntigaBloqueada(base)) return;

    const atual = grupos.get(chave) || {
      nome: nomeMetaLogica(base),
      ids: [],
      rubricas: [],
      compras: [],
      cadastradas: [],
    };

    if (metaIdOriginal) atual.ids.push(metaIdOriginal);
    const rubrica = nomeRubrica(item);
    if (rubrica) atual.rubricas.push(rubrica);
    if (origem === 'Compra') atual.compras.push(item);
    if (origem === 'Cadastro') atual.cadastradas.push(item);
    grupos.set(chave, atual);
  }

  metasCadastradas.forEach((meta) => incluir(meta, 'Cadastro'));
  compras.filter(temDocumentoFiscal).forEach((compra) => incluir(compra, 'Compra'));

  return [...grupos.entries()]
    .filter(([, grupo]) => grupo.compras.length > 0)
    .map(([chave, grupo]) => {
      const cadastro = grupo.cadastradas[0] || {};
      const ids = [...new Set(grupo.ids.map(String))];
      const rubricas = [...new Set(grupo.rubricas.filter(Boolean))];
      const id = idPreferencial(ids);
      return {
        ...cadastro,
        id,
        meta_id: id,
        nome: grupo.nome,
        meta_nome: grupo.nome,
        titulo: grupo.nome,
        descricao: cadastro?.descricao || grupo.nome,
        resultado_esperado: cadastro?.resultado_esperado || cadastro?.descricao || grupo.nome,
        aliases_ids: ids,
        rubricas_vinculadas: rubricas,
        total_compras: grupo.compras.length,
        chave_logica: chave,
        origem: 'Plano de Trabalho + Compras',
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function documentoNF(compra, metaCanonicaId) {
  return {
    id: compra.id,
    tipo: 'nota_fiscal',
    numero_nf: compra?.nf_numero || compra?.numero_nf || compra?.numero_nota || 's/n',
    fornecedor: compra?.fornecedor_nome || compra?.nf_emitente_nome || 'Fornecedor não informado',
    valor: valor(compra),
    data_emissao: dataISO(compra?.nf_data_emissao || compra?.data_nf || compra?.data_emissao_nf),
    pdf_url: compra?.nf_pdf_url || compra?.nota_fiscal_pdf_url || compra?.arquivo_original_url || compra?.pdf_url || '',
    xml_url: compra?.nf_xml_url || compra?.xml_url || '',
    meta_id: metaCanonicaId,
    meta_id_original: extrairMetaId(compra),
    rubrica: nomeRubrica(compra),
  };
}

function quantidadePrevista(meta) {
  const value = Number(meta?.quantidade_prevista || meta?.meta_quantidade || meta?.quantidade || meta?.total_previsto || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function percentualCalculado(meta, atividadesCount) {
  const previsto = quantidadePrevista(meta);
  if (previsto > 0) return Math.min(100, Math.round((atividadesCount / previsto) * 1000) / 10);
  const explicito = Number(meta?.percentual_execucao);
  if (Number.isFinite(explicito) && explicito >= 0 && explicito <= 100) return explicito;
  return atividadesCount > 0 ? null : 0;
}

export function validarPeriodoRelatorio(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return { valido: false, erro: 'Informe as datas inicial e final.' };
  if (dataInicio > dataFim) return { valido: false, erro: 'A data inicial não pode ser posterior à data final.' };
  return { valido: true };
}

export async function listarMetasRelatorio() {
  const [grupos, compras] = await Promise.all([
    Promise.all(['ProjectMeta', 'MetaProjeto', 'Meta'].map((nome) => listar(nome, 5000))),
    listar('PurchaseRequest', 10000),
  ]);

  const cadastradas = unico(
    grupos.flat().filter(metaPertenceAo3ou4Aditivo).filter((meta) => !ehMetaAntigaBloqueada(meta)),
    (meta) => idCanonicoMeta(meta) || chaveMetaLogica(meta),
  );

  return agruparMetas(cadastradas, compras);
}

export async function sincronizarRelatorioExecucao({
  relatorioId,
  dataInicio,
  dataFim,
  filtroMuseu = 'todos',
  filtroVersao = 'consolidado',
  filtroMetaIds = [],
}) {
  const periodo = validarPeriodoRelatorio(dataInicio, dataFim);
  if (!periodo.valido) throw new Error(periodo.erro);
  if (!relatorioId) throw new Error('Relatório não identificado.');
  if (!Array.isArray(filtroMetaIds) || filtroMetaIds.length === 0) throw new Error('Selecione ao menos uma meta para o relatório.');

  const [metasTodas, atividadesBrutas, fotosBrutas, compras] = await Promise.all([
    listarMetasRelatorio(),
    Promise.all(['Activity', 'Atividade', 'Programacao', 'Evento'].map((nome) => listar(nome, 5000))).then((r) => r.flat()),
    Promise.all(['ActivityPhoto', 'AtividadeFoto', 'GalleryPhoto', 'GaleriaFoto', 'Photo', 'Foto'].map((nome) => listar(nome, 5000))).then((r) => r.flat()),
    listar('PurchaseRequest', 10000),
  ]);

  const aliasParaCanonica = new Map();
  for (const meta of metasTodas) {
    const canonica = String(meta.id);
    aliasParaCanonica.set(canonica, canonica);
    for (const alias of meta.aliases_ids || []) aliasParaCanonica.set(String(alias), canonica);
  }

  const selecionadasCanonicas = new Set(
    filtroMetaIds.map((id) => aliasParaCanonica.get(String(id)) || String(id)),
  );
  const metas = metasTodas.filter((meta) => selecionadasCanonicas.has(String(meta.id)));

  const metaCanonicaDoItem = (item) => aliasParaCanonica.get(extrairMetaId(item)) || '';
  const atividades = unico(
    atividadesBrutas.filter((item) => dentroPeriodo(item, dataInicio, dataFim) && selecionadasCanonicas.has(metaCanonicaDoItem(item))),
    (item) => item.id || `${item.titulo || item.nome}-${dataISO(primeiro(item, CAMPOS_DATA))}`,
  );

  const atividadeIds = new Set(atividades.map((atividade) => atividade.id));
  const fotos = unico(
    fotosBrutas.filter((foto) => {
      const atividadeId = foto?.activity_id || foto?.atividade_id || foto?.evento_id;
      const url = primeiro(foto, CAMPOS_FOTO);
      return !!url && ((atividadeId && atividadeIds.has(atividadeId)) || (selecionadasCanonicas.has(metaCanonicaDoItem(foto)) && dentroPeriodo(foto, dataInicio, dataFim)));
    }),
    (foto) => primeiro(foto, CAMPOS_FOTO),
  ).slice(0, 24);

  const notas = compras
    .filter((compra) => {
      const status = String(compra?.status || '').toUpperCase();
      const data = dataISO(compra?.nf_data_emissao || compra?.data_nf || compra?.data_emissao_nf);
      return STATUS_APROVADOS.has(status) && temDocumentoFiscal(compra) && selecionadasCanonicas.has(metaCanonicaDoItem(compra)) && !!data && data >= dataInicio && data <= dataFim;
    })
    .map((compra) => documentoNF(compra, metaCanonicaDoItem(compra)));

  const cronogramaMetas = metas.map((meta) => {
    const chave = String(meta.id);
    const atividadesMeta = atividades.filter((atividade) => metaCanonicaDoItem(atividade) === chave);
    const notasMeta = notas.filter((nota) => nota.meta_id === chave);
    const percentual = percentualCalculado(meta, atividadesMeta.length);
    const status = atividadesMeta.length > 0
      ? (percentual === 100 ? 'Realizada Integralmente' : 'Em execução')
      : notasMeta.length > 0
        ? 'Em execução — documentação financeira vinculada'
        : 'Não Realizada';

    return {
      ...meta,
      meta_id: chave,
      meta_nome: meta.nome,
      aliases_ids: meta.aliases_ids,
      rubricas_vinculadas: meta.rubricas_vinculadas,
      resultado_esperado: meta.resultado_esperado || meta.descricao || meta.nome,
      acoes: atividadesMeta.map((atividade) => atividade.titulo || atividade.nome || atividade.descricao).filter(Boolean).join('; ') || 'Nenhuma atividade registrada no período selecionado.',
      resultado_alcancado: atividadesMeta.length > 0
        ? `${atividadesMeta.length} atividade(s) registrada(s) e analisada(s) no período.`
        : notasMeta.length > 0
          ? 'Há documentação financeira vinculada, mas não foi localizada atividade correspondente na Agenda no período.'
          : 'Sem atividade ou documento fiscal vinculado no período selecionado.',
      periodo: `${dataInicio} a ${dataFim}`,
      documentos_verificacao: notasMeta.map((nota) => `NF ${nota.numero_nf} — ${nota.fornecedor} — ${nota.rubrica || 'rubrica não informada'}`),
      notas_fiscais: notasMeta,
      percentual_execucao: percentual,
      status_meta: status,
      criterio_calculo: quantidadePrevista(meta) > 0
        ? `Atividades realizadas (${atividadesMeta.length}) ÷ quantidade prevista (${quantidadePrevista(meta)}).`
        : 'Percentual não inferido apenas por notas fiscais; depende de quantidade prevista ou percentual explícito cadastrado.',
      editavel: true,
    };
  });

  let preenchimento = { success: true, resumo: {} };
  try {
    const resposta = await base44.functions.invoke('preencherRelatorioComDados', {
      relatorio_id: relatorioId,
      data_inicio: dataInicio,
      data_fim: dataFim,
      filtro_museu: filtroMuseu,
      filtro_versao: filtroVersao,
      filtro_meta_ids: metas.map((meta) => meta.id),
      metas_unificadas: metas,
      aditivos_permitidos: [3, 4],
      excluir_metas_anteriores: true,
      unificar_metas_por_rubrica: true,
    });
    preenchimento = resposta?.data || resposta || preenchimento;
  } catch (error) {
    if (!String(error?.message || error).includes('Service token is required to use asServiceRole')) throw error;
  }

  const atual = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
  const identificacaoAtual = atual?.identificacao_projeto || {};
  const totalFinanceiro = notas.reduce((soma, nota) => soma + nota.valor, 0);
  const filtroCanonico = metas.map((meta) => String(meta.id));

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
    data_inicio: dataInicio,
    data_fim: dataFim,
    filtro_museu: filtroMuseu,
    filtro_versao: filtroVersao,
    filtro_meta_ids: filtroCanonico,
    metas_selecionadas: metas.map((meta) => ({
      id: meta.id,
      nome: meta.nome,
      aliases_ids: meta.aliases_ids,
      rubricas_vinculadas: meta.rubricas_vinculadas,
    })),
    cronograma_metas: cronogramaMetas,
    _atividades_periodo: atividades,
    _fotos_atividades: fotos,
    anexos_evidencias: fotos.map((foto) => ({
      foto_url: primeiro(foto, CAMPOS_FOTO),
      atividade_nome: foto?.atividade_nome || foto?.legenda || foto?.descricao || 'Registro da atividade',
      atividade_data: dataISO(primeiro(foto, CAMPOS_DATA)),
      meta_id: metaCanonicaDoItem(foto),
    })),
    _notas_fiscais_metas: notas,
    _total_financeiro: totalFinanceiro,
    _total_financeiro_fmt: totalFinanceiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    identificacao_projeto: {
      ...identificacaoAtual,
      organizacao: identificacaoAtual.organizacao || 'Viaduto das Artes',
      projeto: identificacaoAtual.projeto || 'Museus Centro',
      instrumento_juridico: identificacaoAtual.instrumento_juridico || 'Termo de Colaboração nº 01-031.069/24-80',
      processo_administrativo: identificacaoAtual.processo_administrativo || '01-031.069/24-80',
      responsavel: identificacaoAtual.responsavel || 'Daniel Perini',
      email: identificacaoAtual.email || 'daniel@periniprojetos.com.br',
    },
    aditivos_considerados: [3, 4],
    metas_anteriores_excluidas: true,
    metas_unificadas_por_rubrica: true,
    sincronizado_em: new Date().toISOString(),
  });

  const erros = [];
  const instrucaoAnalitica = [
    'Analise conjuntamente Plano de Trabalho, metas unificadas, rubricas, Agenda, atividades, público, equipe e notas fiscais.',
    'Não trate IDs diferentes como metas diferentes quando o objeto e a rubrica forem equivalentes.',
    'Educador MIS/MUMO/MHAB é uma única meta, ainda que existam vários IDs históricos.',
    'Não atribua 100% de execução apenas pela existência de nota fiscal.',
    'Calcule percentuais somente quando houver quantidade prevista ou percentual explícito confiável.',
    'Diferencie execução física, execução financeira, evidências e pendências.',
    'Produza texto técnico, analítico, calculista e fiel aos dados reais; não invente informações.',
  ].join(' ');

  for (const secao of ['descricao_acoes', 'publico_alvo', 'pesquisa_satisfacao', 'cronograma_metas', 'equipe_trabalho', 'impactos', 'avaliacao', 'anexos', 'auditoria', 'finalizar']) {
    try {
      await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
        relatorio_id: relatorioId,
        secao,
        data_inicio: dataInicio,
        data_fim: dataFim,
        filtro_museu: filtroMuseu,
        filtro_versao: filtroVersao,
        filtro_meta_ids: filtroCanonico,
        metas_unificadas: metas,
        cronograma_metas_unificado: cronogramaMetas,
        incluir_notas_fiscais: true,
        incluir_fotos: true,
        incluir_rubricas: true,
        aditivos_permitidos: [3, 4],
        excluir_metas_anteriores: true,
        unificar_metas_por_rubrica: true,
        instrucao_usuario: instrucaoAnalitica,
      });
    } catch (error) {
      erros.push({ secao, erro: error?.message || String(error) });
    }
  }

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
    cronograma_metas: cronogramaMetas,
    filtro_meta_ids: filtroCanonico,
    metas_selecionadas: metas.map((meta) => ({ id: meta.id, nome: meta.nome, aliases_ids: meta.aliases_ids, rubricas_vinculadas: meta.rubricas_vinculadas })),
    _notas_fiscais_metas: notas,
    _total_financeiro: totalFinanceiro,
    _total_financeiro_fmt: totalFinanceiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  });

  const relatorio = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
  return {
    success: erros.length === 0,
    relatorio,
    resumo: preenchimento?.resumo || {},
    auditoria: {
      metas: metas.length,
      metas_unificadas: true,
      aliases_consolidados: metas.reduce((total, meta) => total + Math.max(0, (meta.aliases_ids || []).length - 1), 0),
      atividades: atividades.length,
      fotos: fotos.length,
      notas_fiscais: notas.length,
      total_financeiro: totalFinanceiro,
      erros_secoes: erros,
    },
  };
}
