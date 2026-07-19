import { base44 } from '@/api/base44Client';
import {
  idCanonicoMeta,
  metaPertenceAo3ou4Aditivo,
  metaOcultaNoTerceiroAditivo,
  nomeCanonicoMeta,
  normalizarTextoMeta,
} from '@/utils/metasAditivosPermitidos';
import {
  CAMPOS_DATA,
  CAMPOS_META_ID,
  CAMPOS_META_NOME,
  CAMPOS_PUBLICO,
  CAMPOS_FOTO,
  primeiroCampo,
  resolvePublico,
  resolveValor,
  resolveData,
  resolveFotoUrl,
  resolveMetaId as _resolveMetaIdCanon,
} from '@/utils/fieldResolvers';

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const METAS_ANTIGAS = ['presente de iemanja', '60 acoes educativas', '36 acoes culturais', '18 mostras de baixa ou media complexidade', '101 diarias de educador', 'emenda parlamentar', 'meta de comunicacao institucional'];

// dataISO e primeiro agora são importados de fieldResolvers como resolveData e primeiroCampo
function dataISO(value) {
  return resolveData({ data: value });
}

function primeiro(item, campos) {
  return primeiroCampo(item, campos);
}

function texto(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function objetoMeta(item) {
  return [item?.meta, item?.project_meta, item?.meta_projeto, item?.meta_vinculada, item?.goal, item?.project_goal, item?.rubrica?.meta, item?.rubrica_objeto?.meta]
    .find((value) => value && typeof value === 'object') || null;
}

function extrairMetaId(item) {
  const direto = texto(primeiro(item, CAMPOS_META_ID));
  if (direto) return direto;
  const meta = objetoMeta(item);
  return texto(meta && (meta.id || meta.meta_id || meta.codigo || meta.meta_codigo));
}

function extrairMetaNome(item) {
  for (const campo of CAMPOS_META_NOME) {
    const value = item?.[campo];
    if (typeof value === 'string' || typeof value === 'number') {
      const direto = texto(value);
      if (direto) return direto;
    }
    if (value && typeof value === 'object') {
      const nome = nomeCanonicoMeta(value);
      if (nome && nome !== 'Meta') return nome;
    }
  }
  const meta = objetoMeta(item);
  if (meta) {
    const nome = nomeCanonicoMeta(meta);
    if (nome && nome !== 'Meta') return nome;
  }
  return texto(item?.rubrica_nome || item?.item_despesa || item?.descricao_meta || item?.natureza_despesa_nome);
}

function chaveLogicaMeta(value) {
  const nome = normalizarTextoMeta(typeof value === 'string' ? value : nomeCanonicoMeta(value));
  if (!nome) return '';
  if (nome.includes('educador')) return 'educador-mis-mumo-mhab';
  if (nome.includes('material mis')) return 'material-mis';
  if (nome.includes('rede social') || nome.includes('marketing cultural')) return 'rede-social-marketing-cultural';
  if (nome.includes('producao mis') || nome.includes('producao mumo') || nome.includes('producao mhab')) return 'producao-mis-mumo-mhab';
  if (nome.includes('diaria')) return 'diarias-mis-mumo-mhab';
  if (nome.includes('acoes educativo') || nome.includes('acao educativo')) return 'acoes-educativo-culturais';
  if (nome.includes('designer')) return 'designer';
  if (nome.includes('assessor de imprensa')) return 'assessor-imprensa';
  if (nome.includes('coordenador de comunicacao')) return 'coordenador-comunicacao';
  if (nome.includes('manutencao mis')) return 'manutencao-mis';
  if (nome.includes('lanche') || nome.includes('buffet')) return 'lanches-buffet';
  return nome.replace(/\b(mes|ao|aos|do|da|de|ed|2026|19|28)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function metaBloqueada(meta) {
  const nome = normalizarTextoMeta(nomeCanonicoMeta(meta));
  return METAS_ANTIGAS.some((item) => nome.includes(item));
}

function dentroPeriodo(item, inicio, fim) {
  const data = dataISO(primeiro(item, CAMPOS_DATA));
  return !!data && (!inicio || data >= inicio) && (!fim || data <= fim);
}

function unico(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key && !map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

async function listar(nome, limite = 10000) {
  const entidade = base44?.entities?.[nome];
  if (!entidade?.list) return [];
  try {
    const lista = await entidade.list('-created_date', limite);
    return Array.isArray(lista) ? lista : [];
  } catch (error) {
    const status = Number(error?.response?.status || error?.status || 0);
    if (status !== 404) console.warn(`[Relatório de execução] Falha ao listar ${nome}.`, error);
    return [];
  }
}

// valor e publico agora delegam para fieldResolvers
function valor(item) {
  return resolveValor(item);
}

function publico(item) {
  return resolvePublico(item);
}

function metaDerivada(compra, metasPorId) {
  const id = extrairMetaId(compra);
  const cadastrada = id ? metasPorId.get(id) : null;
  const nome = extrairMetaNome(compra) || (cadastrada ? nomeCanonicoMeta(cadastrada) : '');
  if (!nome) return null;
  const chave = chaveLogicaMeta(nome);
  if (!chave) return null;
  return {
    ...(cadastrada || {}),
    id: id || chave,
    meta_id: id || chave,
    nome,
    meta_nome: nome,
    titulo: nome,
    descricao: compra?.meta_descricao || cadastrada?.descricao || nome,
    resultado_esperado: compra?.meta_resultado_esperado || cadastrada?.resultado_esperado || nome,
    rubrica: compra?.rubrica_nome || compra?.item_despesa || cadastrada?.rubrica || '',
    chave_logica: chave,
    aliases: id ? [id] : [],
    origem: 'Compras',
  };
}

function consolidarMetas(metas) {
  const map = new Map();
  for (const meta of metas) {
    if (!meta || metaBloqueada(meta)) continue;
    const chave = meta.chave_logica || chaveLogicaMeta(meta);
    if (!chave) continue;
    const alias = idCanonicoMeta(meta) || meta.meta_id || meta.id;
    const atual = map.get(chave);
    if (!atual) {
      map.set(chave, { ...meta, chave_logica: chave, aliases: alias ? [String(alias)] : [], rubricas: texto(meta.rubrica) ? [texto(meta.rubrica)] : [] });
      continue;
    }
    if (alias && !atual.aliases.includes(String(alias))) atual.aliases.push(String(alias));
    const rubrica = texto(meta.rubrica);
    if (rubrica && !atual.rubricas.includes(rubrica)) atual.rubricas.push(rubrica);
  }
  return [...map.values()].sort((a, b) => nomeCanonicoMeta(a).localeCompare(nomeCanonicoMeta(b), 'pt-BR'));
}

function documentoNF(compra, metaChave) {
  return {
    id: compra.id,
    tipo: 'nota_fiscal',
    numero_nf: compra?.nf_numero || compra?.numero_nf || compra?.numero_nota || 's/n',
    fornecedor: compra?.fornecedor_nome || compra?.nf_emitente_nome || 'Fornecedor não informado',
    valor: valor(compra),
    data_emissao: dataISO(compra?.nf_data_emissao || compra?.data_nf || compra?.data_emissao_nf || compra?.created_date),
    pdf_url: compra?.drive_backup_nf_pdf_link || compra?.nota_fiscal_pdf_url || compra?.nf_pdf_url || compra?.nota_fiscal_url || compra?.arquivo_original_url || compra?.pdf_url || '',
    xml_url: compra?.drive_backup_nf_xml_link || compra?.nota_fiscal_xml_url || compra?.nf_xml_url || compra?.xml_url || '',
    comprovante_url: compra?.comprovante_pagamento_url || compra?.comprovante_url || '',
    meta_id: extrairMetaId(compra),
    meta_chave: metaChave,
  };
}

function normalizarFoto(item, sourceEntity) {
  return {
    ...item,
    source_entity: sourceEntity,
    file_url: resolveFotoUrl(item),
    data: primeiroCampo(item, CAMPOS_DATA) || item?.updated_date,
    atividade_id: item?.activity_id || item?.atividade_id || item?.evento_id || item?.programacao_id || item?.report_id || '',
    atividade_nome: item?.atividade_titulo || item?.activity_title || item?.titulo || item?.title || item?.legenda || item?.caption || item?.descricao || item?.description || item?.file_name || 'Registro da atividade',
  };
}

export function validarPeriodoRelatorio(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return { valido: false, erro: 'Informe as datas inicial e final.' };
  if (dataInicio > dataFim) return { valido: false, erro: 'A data inicial não pode ser posterior à data final.' };
  return { valido: true };
}

export async function listarMetasRelatorio() {
  // Busca apenas ProjectMeta — não carrega PurchaseRequest para listar metas (causa timeout com 10k registros)
  const projectMetas = await listar('ProjectMeta', 5000);
  const cadastradas = projectMetas
    .filter(metaPertenceAo3ou4Aditivo)
    .filter((meta) => !metaBloqueada(meta) && !metaOcultaNoTerceiroAditivo(meta));
  return consolidarMetas(cadastradas);
}

export async function sincronizarRelatorioExecucao({ relatorioId, dataInicio, dataFim, filtroMuseu = 'todos', filtroVersao = 'consolidado', filtroMetaIds = [] }) {
  const periodo = validarPeriodoRelatorio(dataInicio, dataFim);
  if (!periodo.valido) throw new Error(periodo.erro);
  if (!relatorioId) throw new Error('Relatório não identificado.');
  if (!Array.isArray(filtroMetaIds) || filtroMetaIds.length === 0) throw new Error('Selecione ao menos uma meta para o relatório.');

  const [metasTodas, programacoes, attachments, reportPhotos, compras, equipeBruta] = await Promise.all([
    listarMetasRelatorio(),
    listar('Programacao', 10000),
    listar('Attachment', 10000),
    listar('ReportPhoto', 10000),
    listar('PurchaseRequest', 10000),
    listar('TeamMember', 10000),
  ]);

  const selecionadasIds = new Set(filtroMetaIds.map(String));
  let metasSelecionadas = metasTodas.filter((meta) => {
    const aliases = new Set([...(meta.aliases || []), idCanonicoMeta(meta), meta.meta_id, meta.id, meta.chave_logica].filter(Boolean).map(String));
    return [...aliases].some((id) => selecionadasIds.has(id));
  });
  if (metasSelecionadas.length === 0) metasSelecionadas = metasTodas;

  const selectedKeys = new Set(metasSelecionadas.map((meta) => meta.chave_logica));
  const aliasToKey = new Map();
  for (const meta of metasSelecionadas) {
    for (const alias of [...(meta.aliases || []), idCanonicoMeta(meta), meta.meta_id, meta.id, meta.chave_logica].filter(Boolean)) aliasToKey.set(String(alias), meta.chave_logica);
  }

  const noMuseu = (item) => {
    if (!filtroMuseu || String(filtroMuseu).toLowerCase() === 'todos') return true;
    const origem = normalizarTextoMeta(item?.museu || item?.unidade || item?.centro_custo || item?.local || item?.localizacao || '');
    return origem.includes(normalizarTextoMeta(filtroMuseu));
  };

  const atividades = unico(
    programacoes
      .filter((item) => dentroPeriodo(item, dataInicio, dataFim) && noMuseu(item))
      .map((item) => {
        const rawId = extrairMetaId(item);
        const chave = aliasToKey.get(String(rawId)) || chaveLogicaMeta(extrairMetaNome(item));
        return { ...item, meta_chave: chave || null };
      })
      .filter((item) => !item.meta_chave || selectedKeys.has(item.meta_chave)),
    (item) => item.id || `${dataISO(primeiro(item, CAMPOS_DATA))}|${item.titulo || item.nome || item.descricao}`,
  );

  const atividadeIds = new Set(atividades.map((item) => String(item.id || '')).filter(Boolean));
  const fotosBrutas = [
    ...attachments.map((item) => normalizarFoto(item, 'Attachment')),
    ...reportPhotos.map((item) => normalizarFoto(item, 'ReportPhoto')),
  ];
  const fotos = unico(
    fotosBrutas.filter((foto) => {
      if (!foto.file_url) return false;
      if (atividadeIds.has(String(foto.atividade_id || ''))) return true;
      if (!dentroPeriodo(foto, dataInicio, dataFim)) return false;
      return noMuseu(foto);
    }),
    (foto) => String(foto.file_url).split('?')[0],
  ).slice(0, 120);

  const notas = unico(
    compras
      .filter((compra) => {
        const status = String(compra?.status || '').toUpperCase();
        if (!STATUS_APROVADOS.has(status)) return false;
        const data = dataISO(compra?.nf_data_emissao || compra?.data_nf || compra?.data_emissao_nf || compra?.created_date);
        if (!data || data < dataInicio || data > dataFim) return false;
        const rawId = extrairMetaId(compra);
        const chave = aliasToKey.get(String(rawId)) || chaveLogicaMeta(extrairMetaNome(compra));
        return !chave || selectedKeys.has(chave);
      })
      .map((compra) => {
        const chave = aliasToKey.get(String(extrairMetaId(compra))) || chaveLogicaMeta(extrairMetaNome(compra));
        return documentoNF(compra, chave || 'sem-meta');
      }),
    (nota) => `${nota.numero_nf}|${normalizarTextoMeta(nota.fornecedor)}|${nota.valor}`,
  );

  const publicoRegistros = atividades;
  const publicoTotal = publicoRegistros.reduce((sum, item) => sum + publico(item), 0);
  const publicoPorMes = {};
  const publicoPorMuseu = {};
  for (const item of publicoRegistros) {
    const quantidade = publico(item);
    if (!quantidade) continue;
    const mes = dataISO(primeiro(item, CAMPOS_DATA)).slice(0, 7) || 'não informado';
    const museu = item?.museu || item?.unidade || item?.centro_custo || 'Não informado';
    publicoPorMes[mes] = (publicoPorMes[mes] || 0) + quantidade;
    publicoPorMuseu[museu] = (publicoPorMuseu[museu] || 0) + quantidade;
  }

  const comprasEquipe = compras.filter((item) => STATUS_APROVADOS.has(String(item?.status || '').toUpperCase()) && dentroPeriodo({ ...item, data: item?.nf_data_emissao || item?.data_nf || item?.created_date }, dataInicio, dataFim));
  const equipe = unico(
    [...equipeBruta, ...comprasEquipe]
      .map((item) => ({
        nome: item?.nome || item?.nome_completo || item?.profissional_nome || item?.colaborador_nome || item?.fornecedor_nome || item?.nf_emitente_nome || '',
        cargo: item?.cargo || item?.funcao || item?.papel || item?.descricao_cargo || item?.meta_nome || item?.rubrica_nome || item?.descricao_item || '',
        tipo_contratacao: item?.tipo_contratacao || item?.regime || 'Pessoa Jurídica',
        carga_horaria: item?.carga_horaria || item?.horas || '',
        periodo: `${dataInicio} a ${dataFim}`,
        valor: valor(item),
        editavel: true,
      }))
      .filter((item) => item.nome && normalizarTextoMeta(item.nome) !== 'user' && !/\.pdf$/i.test(item.nome)),
    (item) => `${normalizarTextoMeta(item.nome)}|${normalizarTextoMeta(item.cargo)}`,
  );

  const notasPorMeta = new Map();
  for (const nota of notas) {
    if (!notasPorMeta.has(nota.meta_chave)) notasPorMeta.set(nota.meta_chave, []);
    notasPorMeta.get(nota.meta_chave).push(nota);
  }

  const cronogramaMetas = metasSelecionadas.map((meta) => {
    const atividadesMeta = atividades.filter((item) => item.meta_chave === meta.chave_logica);
    const notasMeta = notasPorMeta.get(meta.chave_logica) || [];
    const prevista = Number(meta.quantidade_prevista || meta.meta_quantidade || meta.valor_meta || 0);
    const realizada = atividadesMeta.length;
    const percentual = prevista > 0 ? Math.min(100, (realizada / prevista) * 100) : null;
    return {
      ...meta,
      meta_id: meta.meta_id || meta.id || meta.chave_logica,
      meta_nome: nomeCanonicoMeta(meta),
      aliases: meta.aliases || [],
      rubricas: meta.rubricas || [],
      resultado_esperado: meta.resultado_esperado || meta.descricao || nomeCanonicoMeta(meta),
      acoes: atividadesMeta.map((item) => item.titulo || item.nome || item.descricao).filter(Boolean).join('; ') || 'Sem atividade vinculada na Agenda para o período selecionado.',
      resultado_alcancado: realizada > 0 ? `${realizada} atividade(s) registrada(s) na Agenda.` : 'Execução física ainda não comprovada por atividade vinculada na Agenda.',
      periodo: `${dataInicio} a ${dataFim}`,
      documentos_verificacao: notasMeta.map((nota) => `NF ${nota.numero_nf} — ${nota.fornecedor}`),
      notas_fiscais: notasMeta,
      percentual_execucao: percentual,
      status_meta: realizada > 0 ? (percentual === 100 ? 'Realizada Integralmente' : 'Em execução') : (notasMeta.length > 0 ? 'Em execução — documentação financeira vinculada' : 'Não iniciada'),
      editavel: true,
    };
  });

  const totalFinanceiro = notas.reduce((sum, nota) => sum + nota.valor, 0);
  const atual = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
  const anexos = fotos.map((foto) => ({
    foto_url: foto.file_url,
    atividade_nome: foto.atividade_nome,
    atividade_data: dataISO(foto.data),
    meta_id: extrairMetaId(foto) || null,
    atividade_id: foto.atividade_id || null,
    origem: foto.source_entity,
  }));

  const dadosBase = {
    data_inicio: dataInicio,
    data_fim: dataFim,
    filtro_museu: filtroMuseu,
    filtro_versao: filtroVersao,
    filtro_meta_ids: filtroMetaIds,
    metas_selecionadas: metasSelecionadas.map((meta) => ({ id: meta.meta_id || meta.id, nome: nomeCanonicoMeta(meta), aliases: meta.aliases || [] })),
    cronograma_metas: cronogramaMetas,
    descricao_acoes: atual?.descricao_acoes?.texto_editado ? atual.descricao_acoes : { texto_ia: atividades.length > 0 ? `No período de ${dataInicio} a ${dataFim}, foram registradas ${atividades.length} atividade(s) na Agenda.` : 'Não foram localizadas atividades no período selecionado.', texto_editado: '', modo: 'ia' },
    publico_alvo: atual?.publico_alvo?.texto_editado ? atual.publico_alvo : { previsto_direto: 50000, previsto_indireto: 150000, realizado_direto: publicoTotal, realizado_indireto: Math.round(publicoTotal * 2.5), texto_interpretativo_ia: publicoTotal > 0 ? `O público registrado no período foi de ${publicoTotal.toLocaleString('pt-BR')} pessoas.` : 'Não foi localizado público consolidado para o período.', texto_interpretativo_editado: '', modo: 'ia' },
    equipe_trabalho: equipe,
    _atividades_periodo: atividades,
    _agenda_periodo: atividades,
    _fotos_atividades: fotos,
    anexos_evidencias: anexos,
    anexos_fotograficos: anexos,
    _notas_fiscais_metas: notas,
    _publico_dashboard: { total: publicoTotal, por_mes: publicoPorMes, por_museu: publicoPorMuseu, registros: publicoRegistros.length },
    _equipe_real: equipe,
    _total_financeiro: totalFinanceiro,
    _total_financeiro_fmt: totalFinanceiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    identificacao_projeto: {
      ...(atual?.identificacao_projeto || {}),
      organizacao: atual?.identificacao_projeto?.organizacao || 'Viaduto das Artes',
      projeto: atual?.identificacao_projeto?.projeto || 'Museus Centro',
      instrumento_juridico: atual?.identificacao_projeto?.instrumento_juridico || 'Termo de Colaboração nº 01-031.069/24-80',
      processo_administrativo: atual?.identificacao_projeto?.processo_administrativo || '01-031.069/24-80',
      responsavel: atual?.identificacao_projeto?.responsavel || 'Daniel Perini',
      email: atual?.identificacao_projeto?.email || 'daniel@periniprojetos.com.br',
    },
    aditivos_considerados: [3, 4],
    metas_anteriores_excluidas: true,
    dados_atualizados_em: new Date().toISOString(),
  };

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, dadosBase);

  const resumo = {
    metas: metasSelecionadas.length,
    notas_fiscais: notas.length,
    atividades: atividades.length,
    fotos: fotos.length,
    publico: publicoTotal,
    equipe: equipe.length,
    total_financeiro: totalFinanceiro,
  };

  return {
    success: true,
    relatorio: await base44.entities.RelatorioExecucaoObjeto.get(relatorioId),
    resumo,
    auditoria: { ...resumo, erros_secoes: [] },
  };
}