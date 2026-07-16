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

function numero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tamanho(value) {
  return Array.isArray(value) ? value.length : 0;
}

export function validarPeriodoRelatorio(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) {
    return { valido: false, erro: 'Informe as datas inicial e final.' };
  }

  const inicio = new Date(`${dataInicio}T00:00:00`);
  const fim = new Date(`${dataFim}T23:59:59`);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return { valido: false, erro: 'O período informado é inválido.' };
  }

  if (inicio > fim) {
    return { valido: false, erro: 'A data inicial não pode ser posterior à data final.' };
  }

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
  if (!preenchimento?.success) {
    throw new Error(preenchimento?.error || 'Não foi possível importar os dados do período.');
  }

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
      });
    } catch (error) {
      errosSecoes.push({ secao, erro: error?.message || String(error) });
    }
  }

  try {
    await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
      relatorio_id: relatorioId,
      secao: 'auditoria',
      data_inicio: dataInicio,
      data_fim: dataFim,
      filtro_museu: filtroMuseu,
      filtro_versao: filtroVersao,
    });
    await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
      relatorio_id: relatorioId,
      secao: 'finalizar',
      data_inicio: dataInicio,
      data_fim: dataFim,
      filtro_museu: filtroMuseu,
      filtro_versao: filtroVersao,
    });
  } catch (error) {
    errosSecoes.push({ secao: 'auditoria/finalização', erro: error?.message || String(error) });
  }

  const relatorio = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
  const resumo = preenchimento.resumo || {};

  const totalAtividades = numero(resumo.total_atividades);
  const totalMetas = numero(resumo.total_metas_identificadas);
  const totalEquipe = numero(resumo.total_equipe);
  const publicoTotal = numero(resumo.publico_total);
  const totalDocumentos = numero(resumo.total_links_documentos);
  const fotos = relatorio?._fotos_atividades || relatorio?.anexos?.fotos || relatorio?.anexos_fotograficos || [];
  const atividadesRelatorio = relatorio?._atividades_periodo || relatorio?.atividades_periodo || [];

  const inconsistencias = [];
  if (totalMetas > 0 && tamanho(relatorio?.cronograma_metas) === 0) {
    inconsistencias.push('As metas foram localizadas, mas não foram gravadas no cronograma.');
  }
  if (totalEquipe > 0 && tamanho(relatorio?.equipe_trabalho) === 0) {
    inconsistencias.push('A equipe foi localizada, mas não foi gravada na seção de equipe.');
  }
  if (publicoTotal > 0 && numero(relatorio?.publico_alvo?.realizado_direto) === 0) {
    inconsistencias.push('Há público no período, mas o realizado direto permaneceu zerado.');
  }
  if (totalAtividades > 0 && tamanho(atividadesRelatorio) === 0 && !relatorio?.descricao_acoes?.texto_ia) {
    inconsistencias.push('Há atividades no período, mas elas não foram vinculadas ao relatório.');
  }
  if (totalAtividades > 0 && tamanho(fotos) === 0) {
    inconsistencias.push('Há atividades no período sem evidências fotográficas vinculadas ao relatório.');
  }
  if (totalDocumentos > 0 && totalAtividades === 0 && totalMetas === 0 && publicoTotal === 0) {
    inconsistencias.push('Foram encontrados documentos financeiros, mas nenhum dado operacional. Verifique datas, campos de vínculo e centro/museu das atividades.');
  }
  if (errosSecoes.length > 0) {
    inconsistencias.push(`${errosSecoes.length} seção(ões) não foram recalculadas após a sincronização.`);
  }

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
