import { base44 } from '@/api/base44Client';

const MAX_RELATORIOS_CONTEXTO = 20;
const MAX_CONSULTAS_CUMULATIVAS = 500;

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
    linhas: lista.map((registro, index) => linha(
      idFn?.(registro, index) || registro?.id || `${nome}-${index + 1}`,
      registro,
      colunas,
    )),
    total_linhas: lista.length,
  };
}

function secaoTexto(relatorio, chave) {
  const valor = relatorio?.[chave];
  if (!valor) return '';
  if (typeof valor === 'string') return valor;
  return valor.texto_editado
    || valor.texto_ia
    || valor.texto_interpretativo_editado
    || valor.texto_interpretativo_ia
    || valor.justificativa_editada
    || valor.justificativa_ia
    || '';
}

export function construirTabelasRelatorio(relatorio = {}) {
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
    versao: 2,
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

function resumoRelatorio(registro = {}) {
  const tabelas = registro.tabelas_estruturadas || construirTabelasRelatorio(registro);
  return {
    relatorio_id: registro.id || tabelas.relatorio_id,
    data_inicio: registro.data_inicio || '',
    data_fim: registro.data_fim || '',
    projeto: registro?.identificacao_projeto?.projeto || '',
    filtro_museu: registro.filtro_museu || 'todos',
    totais: {
      metas: tabelas?.metas?.total_linhas || 0,
      atividades: tabelas?.atividades?.total_linhas || 0,
      notas_fiscais: tabelas?.notas_fiscais?.total_linhas || 0,
      equipe: tabelas?.equipe?.total_linhas || 0,
      fotos: tabelas?.fotos?.total_linhas || 0,
    },
    secoes: tabelas?.secoes?.linhas || [],
    atualizado_em: tabelas?.atualizado_em || registro.updated_date || registro.created_date || '',
  };
}

export async function construirContextoCumulativoRelatorios(relatorioAtual = null) {
  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entity?.list) {
    return {
      relatorio_atual: relatorioAtual?.tabelas_estruturadas || construirTabelasRelatorio(relatorioAtual || {}),
      relatorios_anteriores: [],
    };
  }

  let registros = [];
  try {
    registros = await entity.list('-created_date', MAX_RELATORIOS_CONTEXTO);
  } catch {
    registros = [];
  }

  const atualId = String(relatorioAtual?.id || '');
  const anteriores = (Array.isArray(registros) ? registros : [])
    .filter((item) => String(item?.id || '') !== atualId)
    .map(resumoRelatorio);

  return {
    regra_consulta: 'Consultar primeiro as tabelas estruturadas. Usar somente dados reais. Não inventar informações ausentes.',
    relatorio_atual: relatorioAtual?.tabelas_estruturadas || construirTabelasRelatorio(relatorioAtual || {}),
    relatorios_anteriores: anteriores,
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
    'endereco_execucao',
    'divulgacao_parceria',
    'descricao_acoes',
    'publico_alvo',
    'pesquisa_satisfacao',
    'impactos_economicos_sociais',
    'sustentabilidade',
    'avaliacao_parceria',
    'assinatura',
  ].some((campo) => Object.prototype.hasOwnProperty.call(payload, campo));
}

function consultaCumulativa(atual, payload, functionName) {
  const anteriores = Array.isArray(atual?.tabela_cumulativa_consultas)
    ? atual.tabela_cumulativa_consultas
    : [];
  const entrada = {
    id: `${Date.now()}-${functionName}`,
    data_hora: new Date().toISOString(),
    funcao: functionName,
    secao: payload?.secao || '',
    pedido: payload?.instrucao_usuario || payload?.prompt || '',
    data_inicio: payload?.data_inicio || atual?.data_inicio || '',
    data_fim: payload?.data_fim || atual?.data_fim || '',
    filtro_museu: payload?.filtro_museu || atual?.filtro_museu || 'todos',
    status: 'consultado_com_tabelas',
  };
  return [...anteriores, entrada].slice(-MAX_CONSULTAS_CUMULATIVAS);
}

export function installRelatorioTabelasEstruturadas() {
  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entity?.update || entity.__tabelasEstruturadasInstalled) return;

  const originalUpdate = entity.update.bind(entity);
  const originalGet = entity.get?.bind(entity);
  const originalList = entity.list?.bind(entity);
  const originalInvoke = base44?.functions?.invoke?.bind(base44.functions);

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
    const tabelas = construirTabelasRelatorio(consolidado);

    return originalUpdate(id, {
      ...payload,
      tabelas_estruturadas: tabelas,
      tabelas_estruturadas_atualizadas_em: tabelas.atualizado_em,
    });
  };

  if (originalGet) {
    entity.get = async (id) => {
      const registro = await originalGet(id);
      if (!registro) return registro;
      if (registro.tabelas_estruturadas?.versao === 2) return registro;

      const tabelas = construirTabelasRelatorio(registro);
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
        tabelas_estruturadas: registro.tabelas_estruturadas?.versao === 2
          ? registro.tabelas_estruturadas
          : construirTabelasRelatorio(registro),
      }));
    };
  }

  if (originalInvoke) {
    base44.functions.invoke = async (functionName, payload = {}) => {
      const usaRelatorio = functionName === 'gerarSecaoRelatorioExecucao'
        || functionName === 'iniciarRelatorioExecucao';

      if (!usaRelatorio) return originalInvoke(functionName, payload);

      const relatorioId = payload?.relatorio_id || payload?.relatorioId;
      let atual = null;
      if (relatorioId && originalGet) {
        try {
          atual = await originalGet(relatorioId);
        } catch {
          atual = null;
        }
      }

      const contexto = await construirContextoCumulativoRelatorios(atual);
      const payloadComTabelas = {
        ...payload,
        consultar_tabelas_primeiro: true,
        contexto_tabelas_relatorios: contexto,
        instrucao_sistema_tabelas: 'Pesquise primeiro nas tabelas estruturadas e cumulativas dos relatórios. Gere o conteúdo solicitado com IA apenas a partir dos dados encontrados. Não invente dados. Salve o resultado no relatório atual e preserve o histórico cumulativo.',
      };

      const resposta = await originalInvoke(functionName, payloadComTabelas);

      if (relatorioId && atual) {
        try {
          await originalUpdate(relatorioId, {
            tabela_cumulativa_consultas: consultaCumulativa(atual, payloadComTabelas, functionName),
            ultima_consulta_tabelas_em: new Date().toISOString(),
          });
        } catch (error) {
          console.warn('[Relatório] Não foi possível registrar a consulta cumulativa.', error);
        }
      }

      return resposta;
    };
  }

  entity.__tabelasEstruturadasInstalled = true;
}
