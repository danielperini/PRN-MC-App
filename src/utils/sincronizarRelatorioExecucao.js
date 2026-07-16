import { base44 } from '@/api/base44Client';

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const CAMPOS_DATA = ['data', 'data_atividade', 'data_inicio', 'start_date', 'created_date'];
const CAMPOS_META = ['meta_id', 'project_meta_id', 'meta', 'meta_codigo'];
const CAMPOS_FOTO = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url'];

function normalizar(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function dataISO(v) {
  if (!v) return '';
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function primeiro(item, campos) {
  for (const campo of campos) if (item?.[campo]) return item[campo];
  return null;
}

function pertence3ou4(meta) {
  const texto = normalizar([
    meta?.aditivo, meta?.termo_aditivo, meta?.numero_aditivo, meta?.aditivo_numero,
    meta?.origem, meta?.versao, meta?.grupo, meta?.codigo, meta?.meta_codigo,
    meta?.nome, meta?.titulo, meta?.descricao, meta?.resultado_esperado
  ].filter(Boolean).join(' '));
  const numero = Number(meta?.numero_aditivo || meta?.aditivo_numero || meta?.aditivo);
  if (numero === 3 || numero === 4) return true;
  return ['3 aditivo', '3o aditivo', 'terceiro aditivo', 'meses 19 ao 28', 'mc3a', '4 aditivo', '4o aditivo', 'quarto aditivo', 'noturno 2026', 'noturno nos museus 2026', 'mc4a'].some(m => texto.includes(normalizar(m)));
}

function idMeta(item) {
  return String(primeiro(item, CAMPOS_META) || item?.id || '');
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
  const n = Number(item?.valor_total || item?.valor || item?.nf_valor_total || 0);
  return Number.isFinite(n) ? n : 0;
}

function nomeMeta(meta) {
  return meta?.meta_nome || meta?.nome || meta?.titulo || meta?.descricao || meta?.codigo || 'Meta';
}

function documentoNF(p) {
  const numero = p?.nf_numero || p?.numero_nf || p?.numero_nota || 's/n';
  const fornecedor = p?.fornecedor_nome || p?.nf_emitente_nome || 'Fornecedor não informado';
  return {
    id: p.id,
    tipo: 'nota_fiscal',
    numero_nf: numero,
    fornecedor,
    valor: valor(p),
    data_emissao: dataISO(p?.nf_data_emissao || p?.data_nf || p?.data_emissao_nf),
    pdf_url: p?.nf_pdf_url || p?.arquivo_original_url || p?.pdf_url || '',
    xml_url: p?.nf_xml_url || p?.xml_url || '',
    meta_id: String(p?.meta_id || p?.project_meta_id || p?.meta_codigo || ''),
  };
}

export function validarPeriodoRelatorio(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return { valido: false, erro: 'Informe as datas inicial e final.' };
  if (dataInicio > dataFim) return { valido: false, erro: 'A data inicial não pode ser posterior à data final.' };
  return { valido: true };
}

export async function listarMetasRelatorio() {
  const grupos = await Promise.all(['ProjectMeta', 'MetaProjeto', 'Meta'].map(nome => listar(nome, 1000)));
  return unico(grupos.flat().filter(pertence3ou4), m => String(m.id || m.meta_codigo || nomeMeta(m)))
    .sort((a, b) => nomeMeta(a).localeCompare(nomeMeta(b), 'pt-BR'));
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
    Promise.all(['Activity', 'Atividade', 'Programacao', 'Evento'].map(nome => listar(nome, 3000))).then(r => r.flat()),
    Promise.all(['ActivityPhoto', 'AtividadeFoto', 'GalleryPhoto', 'GaleriaFoto', 'Photo', 'Foto'].map(nome => listar(nome, 3000))).then(r => r.flat()),
    listar('PurchaseRequest', 5000),
  ]);

  const metas = metasTodas.filter(meta => selecionadas.has(String(meta.id || meta.meta_codigo || nomeMeta(meta))));
  const metasPorId = new Map(metas.map(meta => [String(meta.id || meta.meta_codigo), meta]));

  const atividades = unico(atividadesBrutas.filter(item => {
    const metaId = String(primeiro(item, CAMPOS_META) || '');
    return dentroPeriodo(item, dataInicio, dataFim) && selecionadas.has(metaId);
  }), item => item.id || `${item.titulo || item.nome}-${dataISO(primeiro(item, CAMPOS_DATA))}`);

  const atividadeIds = new Set(atividades.map(a => a.id));
  const fotos = unico(fotosBrutas.filter(foto => {
    const atividadeId = foto?.activity_id || foto?.atividade_id || foto?.evento_id;
    const metaId = String(primeiro(foto, CAMPOS_META) || '');
    const url = primeiro(foto, CAMPOS_FOTO);
    return !!url && ((atividadeId && atividadeIds.has(atividadeId)) || (selecionadas.has(metaId) && dentroPeriodo(foto, dataInicio, dataFim)));
  }), foto => primeiro(foto, CAMPOS_FOTO)).slice(0, 24);

  const notas = compras.filter(p => {
    const status = String(p?.status || '').toUpperCase();
    const metaId = String(p?.meta_id || p?.project_meta_id || p?.meta_codigo || '');
    const data = dataISO(p?.nf_data_emissao || p?.data_nf || p?.data_emissao_nf);
    return STATUS_APROVADOS.has(status) && selecionadas.has(metaId) && !!data && data >= dataInicio && data <= dataFim;
  }).map(documentoNF);

  const notasPorMeta = new Map();
  for (const nota of notas) {
    const atual = notasPorMeta.get(nota.meta_id) || [];
    atual.push(nota);
    notasPorMeta.set(nota.meta_id, atual);
  }

  const cronogramaMetas = metas.map(meta => {
    const chave = String(meta.id || meta.meta_codigo || '');
    const atividadesMeta = atividades.filter(a => String(primeiro(a, CAMPOS_META) || '') === chave);
    const notasMeta = notasPorMeta.get(chave) || [];
    return {
      ...meta,
      meta_id: chave,
      meta_nome: nomeMeta(meta),
      resultado_esperado: meta.resultado_esperado || meta.descricao || nomeMeta(meta),
      acoes: atividadesMeta.map(a => a.titulo || a.nome || a.descricao).filter(Boolean).join('; ') || 'Nenhuma atividade registrada no período selecionado.',
      resultado_alcancado: atividadesMeta.length > 0 ? `${atividadesMeta.length} atividade(s) registrada(s).` : 'Sem atividade registrada no período selecionado.',
      periodo: `${dataInicio} a ${dataFim}`,
      documentos_verificacao: notasMeta.map(n => `NF ${n.numero_nf} — ${n.fornecedor}`),
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
  const totalFinanceiro = notas.reduce((s, n) => s + n.valor, 0);

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
    data_inicio: dataInicio,
    data_fim: dataFim,
    filtro_museu: filtroMuseu,
    filtro_versao: filtroVersao,
    filtro_meta_ids: filtroMetaIds,
    metas_selecionadas: metas.map(m => ({ id: String(m.id || m.meta_codigo), nome: nomeMeta(m) })),
    cronograma_metas: cronogramaMetas,
    _atividades_periodo: atividades,
    _fotos_atividades: fotos,
    anexos_evidencias: fotos.map(f => ({
      foto_url: primeiro(f, CAMPOS_FOTO),
      atividade_nome: f?.atividade_nome || f?.legenda || f?.descricao || 'Registro da atividade',
      atividade_data: dataISO(primeiro(f, CAMPOS_DATA)),
      meta_id: String(primeiro(f, CAMPOS_META) || ''),
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
  });

  const secoes = ['descricao_acoes', 'publico_alvo', 'pesquisa_satisfacao', 'cronograma_metas', 'equipe_trabalho', 'impactos', 'avaliacao', 'anexos'];
  const erros = [];
  for (const secao of secoes) {
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

  for (const secao of ['auditoria', 'finalizar']) {
    try {
      await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
        relatorio_id: relatorioId,
        secao,
        data_inicio: dataInicio,
        data_fim: dataFim,
        filtro_museu: filtroMuseu,
        filtro_versao: filtroVersao,
        filtro_meta_ids: filtroMetaIds,
      });
    } catch (error) {
      erros.push({ secao, erro: error?.message || String(error) });
    }
  }

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
