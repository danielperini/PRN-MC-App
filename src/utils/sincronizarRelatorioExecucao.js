import { base44 } from '@/api/base44Client';
import {
  idCanonicoMeta,
  metaPertenceAo3ou4Aditivo,
  nomeCanonicoMeta,
  normalizarTextoMeta,
} from '@/utils/metasAditivosPermitidos';

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const CAMPOS_DATA = ['data', 'data_atividade', 'data_inicio', 'start_date', 'created_date'];
const CAMPOS_FOTO = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url'];
const CAMPOS_META_ID = [
  'meta_id', 'project_meta_id', 'meta_projeto_id', 'metaProjetoId', 'projectMetaId',
  'goal_id', 'project_goal_id', 'meta_codigo', 'codigo_meta', 'metaId', 'meta_vinculada_id',
];
const CAMPOS_META_NOME = [
  'meta_nome', 'nome_meta', 'meta_titulo', 'titulo_meta', 'meta_descricao', 'descricao_meta',
  'meta_label', 'meta_texto', 'meta', 'meta_vinculada',
];
const CAMPOS_PUBLICO = [
  'publico_total', 'total_publico', 'publico_realizado', 'publico_presente', 'quantidade_publico',
  'participantes', 'visitantes', 'presentes', 'attendance_count', 'total_participantes',
];
const METAS_ANTIGAS = [
  'presente de iemanja', '60 acoes educativas', '36 acoes culturais',
  '18 mostras de baixa ou media complexidade', '101 diarias de educador',
  'emenda parlamentar', 'meta de comunicacao institucional',
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

function texto(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function objetoMeta(item) {
  return [
    item?.meta, item?.project_meta, item?.meta_projeto, item?.meta_vinculada,
    item?.goal, item?.project_goal, item?.rubrica?.meta, item?.rubrica_objeto?.meta,
  ].find((value) => value && typeof value === 'object') || null;
}

function extrairMetaId(item) {
  const direto = texto(primeiro(item, CAMPOS_META_ID));
  if (direto) return direto;
  const objeto = objetoMeta(item);
  return texto(objeto && (objeto.id || objeto.meta_id || objeto.codigo || objeto.meta_codigo));
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
  const objeto = objetoMeta(item);
  if (objeto) {
    const nome = nomeCanonicoMeta(objeto);
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
  const parsed = Number(
    item?.valor_pago ?? item?.valor_aprovado_admin ?? item?.valor_aprovado ??
    item?.valor_final ?? item?.valor_solicitado ?? item?.valor_total ?? item?.valor ?? item?.nf_valor_total ?? 0,
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function publico(item) {
  for (const campo of CAMPOS_PUBLICO) {
    const value = item?.[campo];
    if (Array.isArray(value)) return value.length;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (Array.isArray(item?.lista_presenca)) return item.lista_presenca.length;
  if (Array.isArray(item?.participantes_lista)) return item.participantes_lista.length;
  return 0;
}

function documentoNF(compra, metaChave) {
  return {
    id: compra.id,
    tipo: 'nota_fiscal',
    numero_nf: compra?.nf_numero || compra?.numero_nf || compra?.numero_nota || 's/n',
    fornecedor: compra?.fornecedor_nome || compra?.nf_emitente_nome || 'Fornecedor não informado',
    valor: valor(compra),
    data_emissao: dataISO(compra?.nf_data_emissao || compra?.data_nf || compra?.data_emissao_nf || compra?.created_date),
    pdf_url: compra?.drive_backup_nf_pdf_link || compra?.nota_fiscal_pdf_url || compra?.nf_pdf_url || compra?.arquivo_original_url || compra?.pdf_url || '',
    xml_url: compra?.drive_backup_nf_xml_link || compra?.nota_fiscal_xml_url || compra?.nf_xml_url || compra?.xml_url || '',
    comprovante_url: compra?.comprovante_pagamento_url || compra?.comprovante_url || '',
    meta_id: extrairMetaId(compra),
    meta_chave: metaChave,
  };
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
      map.set(chave, {
        ...meta,
        chave_logica: chave,
        aliases: alias ? [String(alias)] : [],
        rubricas: texto(meta.rubrica) ? [texto(meta.rubrica)] : [],
      });
      continue;
    }
    if (alias && !atual.aliases.includes(String(alias))) atual.aliases.push(String(alias));
    const rubrica = texto(meta.rubrica);
    if (rubrica && !atual.rubricas.includes(rubrica)) atual.rubricas.push(rubrica);
  }
  return [...map.values()].sort((a, b) => nomeCanonicoMeta(a).localeCompare(nomeCanonicoMeta(b), 'pt-BR'));
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
  const cadastradas = grupos.flat().filter(metaPertenceAo3ou4Aditivo).filter((meta) => !metaBloqueada(meta));
  const metasPorId = new Map();
  for (const meta of cadastradas) {
    const id = idCanonicoMeta(meta);
    if (id) metasPorId.set(String(id), meta);
  }
  const derivadas = compras.map((compra) => metaDerivada(compra, metasPorId)).filter(Boolean);
  return consolidarMetas([...cadastradas, ...derivadas]);
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

  const [metasTodas, atividadesBrutas, fotosBrutas, compras, publicoBruto, equipeBruta] = await Promise.all([
    listarMetasRelatorio(),
    Promise.all(['Programacao', 'Activity', 'Atividade', 'Evento', 'RelatorioAtividade', 'ActivityReport'].map((nome) => listar(nome))).then((r) => r.flat()),
    Promise.all(['ActivityPhoto', 'AtividadeFoto', 'GalleryPhoto', 'GaleriaFoto', 'Photo', 'Foto'].map((nome) => listar(nome))).then((r) => r.flat()),
    listar('PurchaseRequest', 10000),
    Promise.all(['RelatorioAtividade', 'ActivityReport', 'RelatorioMensalAtividade', 'Presenca', 'Attendance', 'ListaPresenca', 'Programacao'].map((nome) => listar(nome))).then((r) => r.flat()),
    Promise.all(['TeamMember', 'Equipe', 'MembroEquipe', 'Collaborator', 'Colaborador'].map((nome) => listar(nome))).then((r) => r.flat()),
  ]);

  const selecionadasIds = new Set(filtroMetaIds.map(String));
  const metasSelecionadas = metasTodas.filter((meta) => {
    const aliases = new Set([...(meta.aliases || []), idCanonicoMeta(meta), meta.meta_id, meta.id].filter(Boolean).map(String));
    return [...aliases].some((id) => selecionadasIds.has(id)) || selecionadasIds.has(meta.chave_logica);
  });
  const selectedKeys = new Set(metasSelecionadas.map((meta) => meta.chave_logica));
  const aliasToKey = new Map();
  for (const meta of metasSelecionadas) {
    for (const alias of [...(meta.aliases || []), idCanonicoMeta(meta), meta.meta_id, meta.id].filter(Boolean)) {
      aliasToKey.set(String(alias), meta.chave_logica);
    }
  }

  const noMuseu = (item) => {
    if (!filtroMuseu || String(filtroMuseu).toLowerCase() === 'todos') return true;
    const origem = normalizarTextoMeta(item?.museu || item?.unidade || item?.centro_custo || item?.local || '');
    return origem.includes(normalizarTextoMeta(filtroMuseu));
  };

  const atividades = unico(
    atividadesBrutas
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
  const fotos = unico(
    fotosBrutas.filter((foto) => {
      const url = primeiro(foto, CAMPOS_FOTO);
      if (!url) return false;
      const atividadeId = String(foto?.activity_id || foto?.atividade_id || foto?.evento_id || foto?.programacao_id || '');
      const rawId = extrairMetaId(foto);
      const chave = aliasToKey.get(String(rawId)) || chaveLogicaMeta(extrairMetaNome(foto));
      return atividadeIds.has(atividadeId) || (dentroPeriodo(foto, dataInicio, dataFim) && (!chave || selectedKeys.has(chave)));
    }),
    (foto) => primeiro(foto, CAMPOS_FOTO),
  ).slice(0, 60);

  const notas = unico(
    compras
      .filter((compra) => {
        const status = String(compra?.status || '').toUpperCase();
        const data = dataISO(compra?.nf_data_emissao || compra?.data_nf || compra?.data_emissao_nf || compra?.created_date);
        const rawId = extrairMetaId(compra);
        const chave = aliasToKey.get(String(rawId)) || chaveLogicaMeta(extrairMetaNome(compra));
        return STATUS_APROVADOS.has(status) && !!chave && selectedKeys.has(chave) && !!data && data >= dataInicio && data <= dataFim;
      })
      .map((compra) => {
        const chave = aliasToKey.get(String(extrairMetaId(compra))) || chaveLogicaMeta(extrairMetaNome(compra));
        return documentoNF(compra, chave);
      }),
    (nota) => `${nota.numero_nf}|${normalizarTextoMeta(nota.fornecedor)}|${nota.valor}|${nota.data_emissao}`,
  );

  const publicoRegistros = unico(
    publicoBruto.filter((item) => dentroPeriodo(item, dataInicio, dataFim) && noMuseu(item)),
    (item) => item.id || `${dataISO(primeiro(item, CAMPOS_DATA))}|${item.titulo || item.nome || item.atividade_id || ''}`,
  );
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

  const comprasEquipe = compras.filter((item) => {
    const status = String(item?.status || '').toUpperCase();
    const data = item?.nf_data_emissao || item?.data_nf || item?.created_date;
    return STATUS_APROVADOS.has(status) && dentroPeriodo({ ...item, data }, dataInicio, dataFim);
  });
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
    const status = realizada > 0
      ? (percentual === 100 ? 'Realizada Integralmente' : 'Em execução')
      : (notasMeta.length > 0 ? 'Em execução — documentação financeira vinculada' : 'Não iniciada');
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
      status_meta: status,
      editavel: true,
    };
  });

  const totalFinanceiro = notas.reduce((sum, nota) => sum + nota.valor, 0);
  const atual = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
  const identificacaoAtual = atual?.identificacao_projeto || {};
  const anexos = fotos.map((foto) => ({
    foto_url: primeiro(foto, CAMPOS_FOTO),
    atividade_nome: foto?.atividade_nome || foto?.legenda || foto?.titulo || foto?.descricao || 'Registro da atividade',
    atividade_data: dataISO(primeiro(foto, CAMPOS_DATA)),
    meta_id: extrairMetaId(foto) || null,
    atividade_id: foto?.activity_id || foto?.atividade_id || foto?.evento_id || null,
  }));

  const descricaoAcoes = atividades.length > 0
    ? `No período de ${dataInicio} a ${dataFim}, foram registradas ${atividades.length} atividade(s) na Agenda, vinculadas às metas selecionadas e aos equipamentos culturais abrangidos pelo projeto.`
    : 'Não foram localizadas atividades vinculadas às metas selecionadas na Agenda para o período. A ausência de vínculo deve ser revisada antes da exportação; as notas fiscais não substituem a comprovação da execução física.';
  const publicoTexto = publicoTotal > 0
    ? `O público geral registrado no período foi de ${publicoTotal.toLocaleString('pt-BR')} pessoas, conforme dados consolidados dos relatórios de atividades, Agenda e registros de presença do app.`
    : 'Não foi localizado público consolidado para o recorte selecionado. O campo permanece editável e deve ser revisado antes da exportação.';

  const dadosBase = {
    data_inicio: dataInicio,
    data_fim: dataFim,
    filtro_museu: filtroMuseu,
    filtro_versao: filtroVersao,
    filtro_meta_ids: filtroMetaIds,
    metas_selecionadas: metasSelecionadas.map((meta) => ({ id: meta.meta_id || meta.id, nome: nomeCanonicoMeta(meta), aliases: meta.aliases || [] })),
    cronograma_metas: cronogramaMetas,
    descricao_acoes: atual?.descricao_acoes?.texto_editado ? atual.descricao_acoes : descricaoAcoes,
    publico_alvo: atual?.publico_alvo?.texto_editado ? atual.publico_alvo : publicoTexto,
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
    dados_atualizados_em: new Date().toISOString(),
  };

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, dadosBase);

  const contextoIA = {
    relatorio_id: relatorioId,
    data_inicio: dataInicio,
    data_fim: dataFim,
    filtro_museu: filtroMuseu,
    filtro_versao: filtroVersao,
    filtro_meta_ids: filtroMetaIds,
    metas_consolidadas: cronogramaMetas,
    atividades_agenda: atividades,
    publico_real: dadosBase._publico_dashboard,
    equipe_real: equipe,
    notas_fiscais: notas,
    fotos: anexos,
    total_financeiro: totalFinanceiro,
    aditivos_permitidos: [3, 4],
    excluir_metas_anteriores: true,
    nao_inventar_dados: true,
    nao_marcar_100_por_nota_fiscal: true,
    preservar_textos_editados: true,
  };

  const erros = [];
  const secoes = [
    'endereco_execucao', 'divulgacao', 'descricao_acoes', 'publico_alvo',
    'pesquisa_satisfacao', 'cronograma_metas', 'equipe_trabalho', 'impactos',
    'sustentabilidade', 'avaliacao', 'assinatura', 'anexos',
  ];
  for (const secao of secoes) {
    try {
      await base44.functions.invoke('gerarSecaoRelatorioExecucao', { ...contextoIA, secao });
    } catch (error) {
      erros.push({ secao, erro: error?.message || String(error) });
    }
  }

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
    cronograma_metas: cronogramaMetas,
    metas_selecionadas: dadosBase.metas_selecionadas,
    filtro_meta_ids: filtroMetaIds,
    _atividades_periodo: atividades,
    _agenda_periodo: atividades,
    _fotos_atividades: fotos,
    anexos_evidencias: anexos,
    anexos_fotograficos: anexos,
    _notas_fiscais_metas: notas,
    _publico_dashboard: dadosBase._publico_dashboard,
    _equipe_real: equipe,
    equipe_trabalho: equipe,
    _total_financeiro: totalFinanceiro,
    _total_financeiro_fmt: dadosBase._total_financeiro_fmt,
    sincronizado_em: new Date().toISOString(),
  });

  const relatorio = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
  return {
    success: erros.length === 0,
    relatorio,
    resumo: {
      metas: metasSelecionadas.length,
      notas_fiscais: notas.length,
      atividades: atividades.length,
      fotos: fotos.length,
      publico: publicoTotal,
      equipe: equipe.length,
      total_financeiro: totalFinanceiro,
    },
    auditoria: { erros_secoes: erros },
  };
}
