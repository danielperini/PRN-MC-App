import { base44 } from '@/api/base44Client';

const SECOES_DEPENDENTES_DOS_DADOS = [
  'descricao_acoes',
  'publico_alvo',
  'pesquisa_satisfacao',
  'cronograma_metas',
  'equipe_trabalho',
  'impactos',
  'avaliacao',
  'anexos',
];

const CAMPOS_DATA = ['data', 'data_atividade', 'data_inicio', 'start_date', 'created_date'];
const CAMPOS_FOTO = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url'];
const CAMPOS_META = ['meta_id', 'project_meta_id', 'meta', 'meta_codigo'];

function numero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tamanho(value) {
  return Array.isArray(value) ? value.length : 0;
}

function dataISO(value) {
  if (!value) return '';
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function primeiroCampo(item, campos) {
  for (const campo of campos) {
    if (item?.[campo]) return item[campo];
  }
  return null;
}

function dentroPeriodo(item, inicio, fim) {
  const data = dataISO(primeiroCampo(item, CAMPOS_DATA));
  return !!data && data >= inicio && data <= fim;
}

function unicoPor(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key && !map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

async function listarEntidade(nome, limite = 500) {
  try {
    const entidade = base44?.entities?.[nome];
    if (!entidade?.list) return [];
    const lista = await entidade.list('-created_date', limite);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

async function buscarDadosComplementares({ dataInicio, dataFim, filtroMuseu }) {
  const [atividadesBrutas, fotosBrutas, metasBrutas] = await Promise.all([
    Promise.all(['Activity', 'Atividade', 'Programacao', 'Evento'].map((nome) => listarEntidade(nome))),
    Promise.all(['ActivityPhoto', 'AtividadeFoto', 'GalleryPhoto', 'GaleriaFoto', 'Photo', 'Foto'].map((nome) => listarEntidade(nome))),
    Promise.all(['ProjectMeta', 'MetaProjeto', 'Meta'].map((nome) => listarEntidade(nome))),
  ]);

  const atividades = unicoPor(atividadesBrutas.flat().filter((item) => dentroPeriodo(item, dataInicio, dataFim)), (item) => item.id);
  const atividadeIds = new Set(atividades.map((item) => item.id));
  const metasPorId = new Map(unicoPor(metasBrutas.flat(), (item) => item.id).map((item) => [item.id, item]));

  const fotos = unicoPor(
    fotosBrutas.flat().filter((foto) => {
      const atividadeId = foto?.activity_id || foto?.atividade_id || foto?.evento_id;
      const temVinculo = atividadeId && atividadeIds.has(atividadeId);
      const noPeriodo = dentroPeriodo(foto, dataInicio, dataFim);
      const url = primeiroCampo(foto, CAMPOS_FOTO);
      return !!url && (temVinculo || noPeriodo);
    }),
    (foto) => primeiroCampo(foto, CAMPOS_FOTO),
  ).slice(0, 24);

  const atividadesNormalizadas = atividades.map((atividade) => {
    const metaId = primeiroCampo(atividade, CAMPOS_META);
    const meta = metasPorId.get(metaId);
    const fotosAtividade = fotos.filter((foto) => {
      const atividadeId = foto?.activity_id || foto?.atividade_id || foto?.evento_id;
      return atividadeId === atividade.id;
    });

    return {
      ...atividade,
      meta_id: metaId || atividade.meta_id || null,
      meta_nome: meta?.nome || meta?.titulo || meta?.descricao || atividade.meta_nome || '',
      fotos: fotosAtividade.map((foto) => ({
        id: foto.id,
        url: primeiroCampo(foto, CAMPOS_FOTO),
        descricao: foto.descricao || foto.legenda || atividade.titulo || atividade.nome || 'Registro da atividade',
        data: dataISO(primeiroCampo(foto, CAMPOS_DATA) || primeiroCampo(atividade, CAMPOS_DATA)),
        atividade_id: atividade.id,
        meta_id: metaId || null,
      })),
    };
  });

  const metasVinculadas = unicoPor(
    atividadesNormalizadas
      .map((atividade) => atividade.meta_id && (metasPorId.get(atividade.meta_id) || { id: atividade.meta_id, nome: atividade.meta_nome }))
      .filter(Boolean),
    (meta) => meta.id,
  );

  return {
    atividades: atividadesNormalizadas,
    fotos: atividadesNormalizadas.flatMap((atividade) => atividade.fotos),
    metas: metasVinculadas,
    filtro_museu: filtroMuseu,
  };
}

export function validarPeriodoRelatorio(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return { valido: false, erro: 'Informe as datas inicial e final.' };
  const inicio = new Date(`${dataInicio}T12:00:00`);
  const fim = new Date(`${dataFim}T12:00:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return { valido: false, erro: 'O período informado é inválido.' };
  if (inicio > fim) return { valido: false, erro: 'A data inicial não pode ser posterior à data final.' };
  return { valido: true, inicio, fim };
}

export async function sincronizarRelatorioExecucao({
  relatorioId,
  dataInicio,
  dataFim,
  filtroMuseu = 'todos',
  filtroVersao = 'consolidado',
}) {
  const periodo = validarPeriodoRelatorio(dataInicio, dataFim);
  if (!periodo.valido) throw new Error(periodo.erro);
  if (!relatorioId) throw new Error('Relatório não identificado. Gere o relatório novamente.');

  const preenchimentoResponse = await base44.functions.invoke('preencherRelatorioComDados', {
    relatorio_id: relatorioId,
    data_inicio: dataInicio,
    data_fim: dataFim,
    filtro_museu: filtroMuseu,
    filtro_versao: filtroVersao,
  });

  const preenchimento = preenchimentoResponse?.data || preenchimentoResponse;
  if (!preenchimento?.success) throw new Error(preenchimento?.error || 'Não foi possível importar os dados do período.');

  const complementares = await buscarDadosComplementares({ dataInicio, dataFim, filtroMuseu });
  const relatorioAntes = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);

  const atividadesExistentes = relatorioAntes?._atividades_periodo || relatorioAntes?.atividades_periodo || [];
  const fotosExistentes = relatorioAntes?._fotos_atividades || relatorioAntes?.anexos?.fotos || relatorioAntes?.anexos_fotograficos || [];
  const metasExistentes = relatorioAntes?.cronograma_metas || [];

  const atividadesFinal = unicoPor([...atividadesExistentes, ...complementares.atividades], (item) => item.id || `${item.nome || item.titulo}-${dataISO(primeiroCampo(item, CAMPOS_DATA))}`);
  const fotosFinal = unicoPor([...fotosExistentes, ...complementares.fotos], (item) => item.url || primeiroCampo(item, CAMPOS_FOTO));
  const metasFinal = metasExistentes.length > 0 ? metasExistentes : complementares.metas;

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
    data_inicio: dataInicio,
    data_fim: dataFim,
    filtro_museu: filtroMuseu,
    filtro_versao: filtroVersao,
    _atividades_periodo: atividadesFinal,
    _fotos_atividades: fotosFinal,
    cronograma_metas: metasFinal,
    modelo_preenchimento: 'relatorio-de-execucao-do-objeto-minuta-padrao',
    modelo_regras: {
      descricao_acoes_max_caracteres: 1500,
      licoes_aprendidas_max_caracteres: 1500,
      impactos_max_caracteres: 2000,
      fotos_com_descricao_e_data: true,
      metas_com_resultado_status_justificativa: true,
    },
    sincronizado_em: new Date().toISOString(),
  });

  const errosSecoes = [];
  for (const secao of SECOES_DEPENDENTES_DOS_DADOS) {
    try {
      await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
        relatorio_id: relatorioId,
        secao,
        data_inicio: dataInicio,
        data_fim: dataFim,
        filtro_museu: filtroMuseu,
        filtro_versao: filtroVersao,
        usar_modelo_word: true,
        vincular_metas: true,
        incluir_fotos: true,
      });
    } catch (error) {
      errosSecoes.push({ secao, erro: error?.message || String(error) });
    }
  }

  for (const secao of ['auditoria', 'finalizar']) {
    try {
      await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
        relatorio_id: relatorioId,
        secao,
        data_inicio: dataInicio,
        data_fim: dataFim,
        filtro_museu: filtroMuseu,
        filtro_versao: filtroVersao,
        usar_modelo_word: true,
        vincular_metas: true,
        incluir_fotos: true,
      });
    } catch (error) {
      errosSecoes.push({ secao, erro: error?.message || String(error) });
    }
  }

  const relatorio = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
  const resumo = preenchimento.resumo || {};
  const atividadesRelatorio = relatorio?._atividades_periodo || relatorio?.atividades_periodo || [];
  const fotos = relatorio?._fotos_atividades || relatorio?.anexos?.fotos || relatorio?.anexos_fotograficos || [];
  const metas = relatorio?.cronograma_metas || [];
  const totalAtividades = Math.max(numero(resumo.total_atividades), tamanho(atividadesRelatorio));
  const totalMetas = Math.max(numero(resumo.total_metas_identificadas), tamanho(metas));
  const totalEquipe = numero(resumo.total_equipe);
  const publicoTotal = numero(resumo.publico_total);
  const totalDocumentos = numero(resumo.total_links_documentos);

  const inconsistencias = [];
  if (totalMetas > 0 && tamanho(metas) === 0) inconsistencias.push('As metas foram localizadas, mas não foram gravadas no cronograma.');
  if (totalEquipe > 0 && tamanho(relatorio?.equipe_trabalho) === 0) inconsistencias.push('A equipe foi localizada, mas não foi gravada na seção de equipe.');
  if (publicoTotal > 0 && numero(relatorio?.publico_alvo?.realizado_direto) === 0) inconsistencias.push('Há público no período, mas o realizado direto permaneceu zerado.');
  if (totalAtividades > 0 && tamanho(atividadesRelatorio) === 0 && !relatorio?.descricao_acoes?.texto_ia) inconsistencias.push('Há atividades no período, mas elas não foram vinculadas ao relatório.');
  if (totalAtividades > 0 && tamanho(fotos) === 0) inconsistencias.push('Há atividades no período sem evidências fotográficas vinculadas ao relatório.');
  if (totalDocumentos > 0 && totalAtividades === 0 && totalMetas === 0 && publicoTotal === 0) inconsistencias.push('Foram encontrados documentos financeiros, mas nenhum dado operacional. Verifique datas, campos de vínculo e centro/museu das atividades.');
  if (errosSecoes.length > 0) inconsistencias.push(`${errosSecoes.length} seção(ões) não foram recalculadas após a sincronização.`);

  return {
    success: inconsistencias.length === 0,
    resumo,
    relatorio,
    auditoria: {
      periodo: { data_inicio: dataInicio, data_fim: dataFim },
      totais: {
        atividades: totalAtividades,
        metas: totalMetas,
        participantes: publicoTotal,
        equipe: totalEquipe,
        documentos: totalDocumentos,
        fotos: tamanho(fotos),
      },
      inconsistencias,
      erros_secoes: errosSecoes,
      auditado_em: new Date().toISOString(),
    },
  };
}
