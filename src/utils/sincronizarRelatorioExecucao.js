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
  for (const campo of campos) if (item?.[campo] !== undefined && item?.[campo] !== null && item?.[campo] !== '') return item[campo];
  return null;
}

function valorPrimitivo(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function objetoMetaDaCompra(compra) {
  const candidatos = [
    compra?.meta,
    compra?.project_meta,
    compra?.meta_projeto,
    compra?.meta_vinculada,
    compra?.goal,
    compra?.project_goal,
    compra?.rubrica?.meta,
    compra?.rubrica_objeto?.meta,
  ];
  return candidatos.find((item) => item && typeof item === 'object') || null;
}

function extrairMetaId(compra) {
  const direto = valorPrimitivo(primeiro(compra, CAMPOS_META_ID));
  if (direto) return direto;
  const objeto = objetoMetaDaCompra(compra);
  return valorPrimitivo(objeto && (objeto.id || objeto.meta_id || objeto.codigo || objeto.meta_codigo));
}

function extrairMetaNome(compra) {
  for (const campo of CAMPOS_META_NOME) {
    const value = compra?.[campo];
    const texto = valorPrimitivo(value);
    if (texto) return texto;
    if (value && typeof value === 'object') {
      const nome = nomeCanonicoMeta(value);
      if (nome && nome !== 'Meta') return nome;
    }
  }

  const objeto = objetoMetaDaCompra(compra);
  if (objeto) {
    const nome = nomeCanonicoMeta(objeto);
    if (nome && nome !== 'Meta') return nome;
  }

  return valorPrimitivo(
    compra?.rubrica_nome ||
    compra?.item_despesa ||
    compra?.natureza_despesa_nome ||
    compra?.descricao_meta
  );
}

function textoCompra(compra) {
  return normalizarTextoMeta([
    extrairMetaNome(compra),
    compra?.aditivo,
    compra?.numero_aditivo,
    compra?.aditivo_numero,
    compra?.termo_aditivo,
    compra?.projeto,
    compra?.projeto_nome,
    compra?.centro_custo,
    compra?.centro_custo_nome,
    compra?.rubrica,
    compra?.rubrica_nome,
    compra?.item_despesa,
    compra?.descricao,
  ].filter(Boolean).join(' '));
}

function ehMetaAntigaBloqueada(meta) {
  const texto = normalizarTextoMeta(nomeCanonicoMeta(meta));
  return METAS_ANTIGAS_BLOQUEADAS.some((item) => texto.includes(item));
}

function dentroPeriodo(item, inicio, fim) {
  const data = dataISO(primeiro(item, CAMPOS_DATA));
  return !!data && data >= inicio && data <= fim;
}

function unico(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, item);
    else {
      const atual = map.get(key);
      map.set(key, { ...atual, ...item, nome: nomeCanonicoMeta(item) || nomeCanonicoMeta(atual) });
    }
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
  const parsed = Number(item?.valor_total || item?.valor || item?.nf_valor_total || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metaDerivadaDaCompra(compra, metasPorId) {
  const id = extrairMetaId(compra);
  if (!id) return null;

  const cadastrada = metasPorId.get(id);
  const nomeCompra = extrairMetaNome(compra);
  const nome = nomeCompra || (cadastrada ? nomeCanonicoMeta(cadastrada) : '') || `Meta ${id}`;

  return {
    ...(cadastrada || {}),
    id,
    meta_id: id,
    meta_codigo: compra?.meta_codigo || cadastrada?.meta_codigo || cadastrada?.codigo || '',
    nome,
    meta_nome: nome,
    titulo: nome,
    descricao: compra?.meta_descricao || cadastrada?.descricao || nome,
    resultado_esperado: compra?.meta_resultado_esperado || cadastrada?.resultado_esperado || nome,
    aditivo: compra?.aditivo || cadastrada?.aditivo,
    numero_aditivo: compra?.numero_aditivo || compra?.aditivo_numero || cadastrada?.numero_aditivo,
    projeto: compra?.projeto || compra?.projeto_nome || compra?.project_name,
    centro_custo: compra?.centro_custo || compra?.centro_custo_nome,
    rubrica: compra?.rubrica || compra?.rubrica_nome,
    origem: 'Compras',
    total_compras: 1,
  };
}

function documentoNF(compra) {
  return {
    id: compra.id,
    tipo: 'nota_fiscal',
    numero_nf: compra?.nf_numero || compra?.numero_nf || compra?.numero_nota || 's/n',
    fornecedor: compra?.fornecedor_nome || compra?.nf_emitente_nome || 'Fornecedor não informado',
    valor: valor(compra),
    data_emissao: dataISO(compra?.nf_data_emissao || compra?.data_nf || compra?.data_emissao_nf),
    pdf_url: compra?.nf_pdf_url || compra?.arquivo_original_url || compra?.pdf_url || '',
    xml_url: compra?.nf_xml_url || compra?.xml_url || '',
    meta_id: extrairMetaId(compra),
  };
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

  const metasCadastradas = unico(
    grupos.flat().filter(metaPertenceAo3ou4Aditivo).filter((meta) => !ehMetaAntigaBloqueada(meta)),
    (meta) => idCanonicoMeta(meta) || normalizarTextoMeta(nomeCanonicoMeta(meta)),
  );
  const metasPorId = new Map(metasCadastradas.map((meta) => [idCanonicoMeta(meta), meta]));

  const metasCompras = compras
    .map((compra) => metaDerivadaDaCompra(compra, metasPorId))
    .filter(Boolean)
    .filter((meta) => !ehMetaAntigaBloqueada(meta));

  return unico(
    [...metasCadastradas, ...metasCompras],
    (meta) => idCanonicoMeta(meta) || normalizarTextoMeta(nomeCanonicoMeta(meta)),
  ).sort((a, b) => nomeCanonicoMeta(a).localeCompare(nomeCanonicoMeta(b), 'pt-BR'));
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

  const selecionadas = new Set(filtroMetaIds.map(String));
  const [metasTodas, atividadesBrutas, fotosBrutas, compras] = await Promise.all([
    listarMetasRelatorio(),
    Promise.all(['Activity', 'Atividade', 'Programacao', 'Evento'].map((nome) => listar(nome, 3000))).then((r) => r.flat()),
    Promise.all(['ActivityPhoto', 'AtividadeFoto', 'GalleryPhoto', 'GaleriaFoto', 'Photo', 'Foto'].map((nome) => listar(nome, 3000))).then((r) => r.flat()),
    listar('PurchaseRequest', 10000),
  ]);

  const metas = metasTodas.filter((meta) => selecionadas.has(idCanonicoMeta(meta)));

  const atividades = unico(
    atividadesBrutas.filter((item) => dentroPeriodo(item, dataInicio, dataFim) && selecionadas.has(extrairMetaId(item))),
    (item) => item.id || `${item.titulo || item.nome}-${dataISO(primeiro(item, CAMPOS_DATA))}`,
  );

  const atividadeIds = new Set(atividades.map((atividade) => atividade.id));
  const fotos = unico(
    fotosBrutas.filter((foto) => {
      const atividadeId = foto?.activity_id || foto?.atividade_id || foto?.evento_id;
      const metaId = extrairMetaId(foto);
      const url = primeiro(foto, CAMPOS_FOTO);
      return !!url && ((atividadeId && atividadeIds.has(atividadeId)) || (selecionadas.has(metaId) && dentroPeriodo(foto, dataInicio, dataFim)));
    }),
    (foto) => primeiro(foto, CAMPOS_FOTO),
  ).slice(0, 24);

  const notas = compras
    .filter((compra) => {
      const status = String(compra?.status || '').toUpperCase();
      const metaId = extrairMetaId(compra);
      const data = dataISO(compra?.nf_data_emissao || compra?.data_nf || compra?.data_emissao_nf);
      return STATUS_APROVADOS.has(status) && selecionadas.has(metaId) && !!data && data >= dataInicio && data <= dataFim;
    })
    .map(documentoNF);

  const notasPorMeta = new Map();
  for (const nota of notas) {
    const atual = notasPorMeta.get(nota.meta_id) || [];
    atual.push(nota);
    notasPorMeta.set(nota.meta_id, atual);
  }

  const cronogramaMetas = metas.map((meta) => {
    const chave = idCanonicoMeta(meta);
    const atividadesMeta = atividades.filter((atividade) => extrairMetaId(atividade) === chave);
    const notasMeta = notasPorMeta.get(chave) || [];
    return {
      ...meta,
      meta_id: chave,
      meta_nome: nomeCanonicoMeta(meta),
      resultado_esperado: meta.resultado_esperado || meta.descricao || nomeCanonicoMeta(meta),
      acoes: atividadesMeta.map((atividade) => atividade.titulo || atividade.nome || atividade.descricao).filter(Boolean).join('; ') || 'Nenhuma atividade registrada no período selecionado.',
      resultado_alcancado: atividadesMeta.length > 0 ? `${atividadesMeta.length} atividade(s) registrada(s).` : 'Sem atividade registrada no período selecionado.',
      periodo: `${dataInicio} a ${dataFim}`,
      documentos_verificacao: notasMeta.map((nota) => `NF ${nota.numero_nf} — ${nota.fornecedor}`),
      notas_fiscais: notasMeta,
      percentual_execucao: meta.percentual_execucao || (atividadesMeta.length > 0 || notasMeta.length > 0 ? 100 : 0),
      status_meta: meta.status_meta || (atividadesMeta.length > 0 || notasMeta.length > 0 ? 'Realizada Integralmente' : 'Não Realizada'),
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
      filtro_meta_ids: filtroMetaIds,
      aditivos_permitidos: [3, 4],
      excluir_metas_anteriores: true,
    });
    preenchimento = resposta?.data || resposta || preenchimento;
  } catch (error) {
    if (!String(error?.message || error).includes('Service token is required to use asServiceRole')) throw error;
  }

  const atual = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
  const identificacaoAtual = atual?.identificacao_projeto || {};
  const totalFinanceiro = notas.reduce((soma, nota) => soma + nota.valor, 0);
  const dadosPersistidos = {
    data_inicio: dataInicio,
    data_fim: dataFim,
    filtro_museu: filtroMuseu,
    filtro_versao: filtroVersao,
    filtro_meta_ids: filtroMetaIds,
    metas_selecionadas: metas.map((meta) => ({ id: idCanonicoMeta(meta), nome: nomeCanonicoMeta(meta) })),
    cronograma_metas: cronogramaMetas,
    _atividades_periodo: atividades,
    _fotos_atividades: fotos,
    anexos_evidencias: fotos.map((foto) => ({
      foto_url: primeiro(foto, CAMPOS_FOTO),
      atividade_nome: foto?.atividade_nome || foto?.legenda || foto?.descricao || 'Registro da atividade',
      atividade_data: dataISO(primeiro(foto, CAMPOS_DATA)),
      meta_id: extrairMetaId(foto),
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
    sincronizado_em: new Date().toISOString(),
  };

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, dadosPersistidos);

  const erros = [];
  for (const secao of ['descricao_acoes', 'publico_alvo', 'pesquisa_satisfacao', 'cronograma_metas', 'equipe_trabalho', 'impactos', 'avaliacao', 'anexos', 'auditoria', 'finalizar']) {
    try {
      await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
        relatorio_id: relatorioId,
        secao,
        data_inicio: dataInicio,
        data_fim: dataFim,
        filtro_museu: filtroMuseu,
        filtro_versao: filtroVersao,
        filtro_meta_ids: filtroMetaIds,
        incluir_notas_fiscais: true,
        incluir_fotos: true,
        aditivos_permitidos: [3, 4],
        excluir_metas_anteriores: true,
      });
    } catch (error) {
      erros.push({ secao, erro: error?.message || String(error) });
    }
  }

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
    cronograma_metas: cronogramaMetas,
    filtro_meta_ids: filtroMetaIds,
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
      atividades: atividades.length,
      fotos: fotos.length,
      notas_fiscais: notas.length,
      total_financeiro: totalFinanceiro,
      erros_secoes: erros,
    },
  };
}
