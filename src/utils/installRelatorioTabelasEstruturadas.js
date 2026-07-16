import { base44 } from '@/api/base44Client';

function texto(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function celulas(objeto, campos) {
  return campos.reduce((acc, campo) => {
    acc[campo] = texto(objeto?.[campo]);
    return acc;
  }, {});
}

function linha(id, objeto, campos) {
  return {
    id: texto(id),
    celulas: celulas(objeto, campos),
  };
}

function tabela(nome, titulo, colunas, registros, idFn) {
  const lista = Array.isArray(registros) ? registros : [];
  return {
    nome,
    titulo,
    colunas,
    linhas: lista.map((registro, index) => linha(idFn?.(registro, index) || registro?.id || `${nome}-${index + 1}`, registro, colunas)),
    total_linhas: lista.length,
  };
}

function secaoTexto(relatorio, chave) {
  const valor = relatorio?.[chave];
  if (!valor) return '';
  if (typeof valor === 'string') return valor;
  return valor.texto_editado || valor.texto_ia || valor.texto_interpretativo_editado || valor.texto_interpretativo_ia || valor.justificativa_editada || valor.justificativa_ia || '';
}

function construirTabelas(relatorio = {}) {
  const identificacao = relatorio.identificacao_projeto || {};
  const metas = relatorio.cronograma_metas || [];
  const atividades = relatorio._atividades_periodo || relatorio._agenda_periodo || [];
  const notas = relatorio._notas_fiscais_metas || [];
  const equipe = relatorio.equipe_trabalho || relatorio._equipe_real || [];
  const fotos = relatorio.anexos_evidencias || relatorio.anexos_fotograficos || relatorio._fotos_atividades || [];
  const publico = relatorio._publico_dashboard || {};

  const secoes = [
    ['endereco_execucao', 'Endereço de execução'],
    ['divulgacao_parceria', 'Divulgação da parceria'],
    ['descricao_acoes', 'Descrição das ações'],
    ['publico_alvo', 'Público-alvo'],
    ['pesquisa_satisfacao', 'Pesquisa de satisfação'],
    ['impactos_economicos_sociais', 'Impactos econômicos e sociais'],
    ['sustentabilidade', 'Sustentabilidade'],
    ['avaliacao_parceria', 'Avaliação da parceria'],
    ['assinatura', 'Assinatura'],
  ].map(([campo, titulo]) => ({ campo, titulo, conteudo: secaoTexto(relatorio, campo) }));

  return {
    versao: 1,
    relatorio_id: texto(relatorio.id),
    atualizado_em: new Date().toISOString(),
    identificacao: tabela(
      'identificacao',
      'Identificação do projeto',
      ['organizacao', 'projeto', 'instrumento_juridico', 'processo_administrativo', 'responsavel', 'email', 'data_inicio', 'data_fim'],
      [{ ...identificacao, data_inicio: relatorio.data_inicio, data_fim: relatorio.data_fim }],
      () => relatorio.id || 'identificacao',
    ),
    metas: tabela(
      'metas',
      'Cronograma de metas',
      ['meta_id', 'meta_nome', 'resultado_esperado', 'acoes', 'resultado_alcancado', 'periodo', 'status_meta', 'percentual_execucao', 'documentos_verificacao'],
      metas,
      (item, index) => item?.meta_id || item?.id || `meta-${index + 1}`,
    ),
    atividades: tabela(
      'atividades',
      'Atividades executadas',
      ['titulo', 'nome', 'descricao', 'data', 'data_atividade', 'museu', 'local', 'meta_chave', 'publico_total'],
      atividades,
      (item, index) => item?.id || `atividade-${index + 1}`,
    ),
    notas_fiscais: tabela(
      'notas_fiscais',
      'Notas fiscais vinculadas',
      ['numero_nf', 'fornecedor', 'valor', 'data_emissao', 'meta_id', 'meta_chave', 'pdf_url', 'xml_url', 'comprovante_url'],
      notas,
      (item, index) => item?.id || `${item?.numero_nf || 'nf'}-${index + 1}`,
    ),
    equipe: tabela(
      'equipe',
      'Equipe de trabalho',
      ['nome', 'cargo', 'tipo_contratacao', 'carga_horaria', 'periodo', 'valor'],
      equipe,
      (item, index) => item?.id || `${item?.nome || 'equipe'}-${index + 1}`,
    ),
    fotos: tabela(
      'fotos',
      'Evidências fotográficas',
      ['foto_url', 'atividade_nome', 'atividade_data', 'meta_id', 'atividade_id', 'legenda_ia', 'secao'],
      fotos,
      (item, index) => item?.id || item?.foto_url || `foto-${index + 1}`,
    ),
    publico: tabela(
      'publico',
      'Público registrado',
      ['total', 'registros', 'por_mes', 'por_museu'],
      [{
        total: publico.total || 0,
        registros: publico.registros || 0,
        por_mes: publico.por_mes || {},
        por_museu: publico.por_museu || {},
      }],
      () => relatorio.id || 'publico',
    ),
    secoes: tabela(
      'secoes',
      'Conteúdo das seções do relatório',
      ['campo', 'titulo', 'conteudo'],
      secoes,
      (item) => item.campo,
    ),
  };
}

function deveReestruturar(payload = {}) {
  return [
    'cronograma_metas',
    '_atividades_periodo',
    '_agenda_periodo',
    '_notas_fiscais_metas',
    'equipe_trabalho',
    '_equipe_real',
    'anexos_evidencias',
    'anexos_fotograficos',
    '_fotos_atividades',
    '_publico_dashboard',
    'identificacao_projeto',
    'data_inicio',
    'data_fim',
  ].some((campo) => Object.prototype.hasOwnProperty.call(payload, campo));
}

export function installRelatorioTabelasEstruturadas() {
  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entity?.update || entity.__tabelasEstruturadasInstalled) return;

  const originalUpdate = entity.update.bind(entity);
  const originalGet = entity.get?.bind(entity);
  const originalList = entity.list?.bind(entity);

  entity.update = async (id, payload = {}) => {
    if (!deveReestruturar(payload)) return originalUpdate(id, payload);

    let atual = {};
    if (originalGet) {
      try {
        atual = await originalGet(id) || {};
      } catch {
        atual = {};
      }
    }

    const consolidado = { ...atual, ...payload, id: id || atual.id };
    const tabelas = construirTabelas(consolidado);

    return originalUpdate(id, {
      ...payload,
      tabelas_estruturadas: tabelas,
      tabelas_estruturadas_atualizadas_em: tabelas.atualizado_em,
    });
  };

  if (originalGet) {
    entity.get = async (id) => {
      const registro = await originalGet(id);
      if (!registro || registro.tabelas_estruturadas) return registro;
      const tabelas = construirTabelas(registro);
      try {
        await originalUpdate(id, {
          tabelas_estruturadas: tabelas,
          tabelas_estruturadas_atualizadas_em: tabelas.atualizado_em,
        });
      } catch (error) {
        console.warn('[Relatório] Não foi possível persistir as tabelas estruturadas.', error);
      }
      return { ...registro, tabelas_estruturadas: tabelas };
    };
  }

  if (originalList) {
    entity.list = async (...args) => {
      const registros = await originalList(...args);
      if (!Array.isArray(registros)) return registros;
      return registros.map((registro) => ({
        ...registro,
        tabelas_estruturadas: registro.tabelas_estruturadas || construirTabelas(registro),
      }));
    };
  }

  entity.__tabelasEstruturadasInstalled = true;
}
