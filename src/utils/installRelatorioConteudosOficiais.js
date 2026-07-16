import { base44 } from '@/api/base44Client';

const TEXTO_DIVULGACAO = 'A divulgação da parceria foi realizada de forma integrada, com a publicização das ações e o fortalecimento do vínculo entre o projeto, os equipamentos culturais e seus públicos. Foram adotadas estratégias de comunicação em redes sociais, produção de materiais gráficos, desenvolvimento de identidades visuais, diagramação de peças e conteúdos institucionais. Também foi realizado trabalho contínuo de assessoria de imprensa, com elaboração e distribuição de releases, acompanhamento de clipping e relacionamento com veículos de comunicação. Todas as ações específicas de divulgação, seus registros, peças, resultados e evidências estão detalhadas no Relatório de Comunicação anexo a este Relatório de Execução do Objeto.';

const TEXTO_PESQUISA = 'Não foram realizadas pesquisas específicas de satisfação sobre o projeto. Foram coletadas, entretanto, percepções qualitativas da equipe educativa, da equipe de produção e dos demais profissionais envolvidos na execução, registradas nos relatórios elaborados pela equipe do projeto. O plano de trabalho não estabeleceu meta nem rubrica específica para a realização de pesquisa formal de satisfação.';

function texto(value) {
  return String(value ?? '').trim();
}

function textoNested(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  return texto(value.texto_editado || value.texto_ia || value.texto || value.conteudo);
}

function nested(value, modo = 'ia') {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {
    texto_ia: texto(value),
    texto_editado: '',
    modo,
    editavel: true,
  };
}

function publicoDashboard(relatorio = {}) {
  const dashboard = relatorio._publico_dashboard || relatorio.publico_dashboard || {};
  const total = Number(dashboard.total || relatorio._total_publico || 0);
  const porMuseu = dashboard.por_museu && typeof dashboard.por_museu === 'object'
    ? Object.entries(dashboard.por_museu)
      .filter(([, quantidade]) => Number(quantidade) > 0)
      .map(([museu, quantidade]) => `${museu}: ${Number(quantidade).toLocaleString('pt-BR')} pessoas`)
      .join('; ')
    : '';

  const base = 'O público-alvo do projeto compreende a população de Belo Horizonte de forma geral, incluindo visitantes dos equipamentos culturais, moradores de diferentes territórios da cidade, estudantes, educadores, pesquisadores, famílias, turistas e públicos específicos mobilizados por determinadas atividades educativas, culturais e de formação.';
  if (!total) return `${base} A caracterização quantitativa deve considerar prioritariamente os dados consolidados no dashboard do projeto e os registros de presença das atividades.`;

  return `${base} No período selecionado, o dashboard registra público direto de ${total.toLocaleString('pt-BR')} pessoas${porMuseu ? `, distribuído da seguinte forma: ${porMuseu}` : ''}. Esses dados devem prevalecer sobre estimativas genéricas e ser complementados pelos relatórios de atividades e listas de presença disponíveis.`;
}

function vazioOuGenerico(value) {
  const atual = textoNested(value).toLowerCase();
  return !atual || atual.includes('não foi localizado') || atual.includes('nao foi localizado') || atual.includes('sem dados');
}

function aplicarPadroes(relatorio = {}) {
  const next = { ...relatorio };

  if (vazioOuGenerico(next.divulgacao_parceria)) {
    next.divulgacao_parceria = nested(TEXTO_DIVULGACAO, 'ia');
  }
  if (vazioOuGenerico(next.publico_alvo)) {
    next.publico_alvo = nested(publicoDashboard(next), 'ia');
  }
  if (vazioOuGenerico(next.pesquisa_satisfacao)) {
    next.pesquisa_satisfacao = nested(TEXTO_PESQUISA, 'ia');
  }

  return next;
}

function instrucoesSecao(functionName, payload = {}) {
  if (functionName !== 'gerarSecaoRelatorioExecucao') return payload;
  const secao = payload?.secao;

  if (secao === 'divulgacao' || secao === 'divulgacao_parceria') {
    return {
      ...payload,
      texto_base_obrigatorio: TEXTO_DIVULGACAO,
      instrucao_usuario: `${payload.instrucao_usuario || ''} Use o texto-base fornecido. Não invente métricas de alcance. Informe que as evidências completas estão no Relatório de Comunicação anexo.`,
    };
  }

  if (secao === 'descricao_acoes') {
    return {
      ...payload,
      usar_agenda_app: true,
      usar_relatorios_atividades_aprovados: true,
      priorizar_relatorios_profissionais_projeto: true,
      limite_caracteres: 3000,
      maximo_fotos_por_atividade: 3,
      incluir_link_galeria: true,
      nao_inventar_dados: true,
      instrucao_usuario: `${payload.instrucao_usuario || ''} Pesquise primeiro os relatórios de atividades aprovados produzidos pelos profissionais do projeto e, em seguida, a Agenda do app. Descreva apenas atividades efetivamente realizadas no período, agrupadas por museu e em ordem cronológica. Inclua data, local, público, responsáveis e resultados quando disponíveis. Não use notas fiscais como comprovação de execução física. Limite a 3000 caracteres, use no máximo 3 fotos por atividade e preserve o link para a galeria de fotos do app.`,
    };
  }

  if (secao === 'publico_alvo') {
    return {
      ...payload,
      usar_dashboard_publico: true,
      priorizar_publico_direto_registrado: true,
      texto_base_obrigatorio: publicoDashboard(payload.relatorio || payload),
      instrucao_usuario: `${payload.instrucao_usuario || ''} Caracterize como público-alvo a população de Belo Horizonte de forma geral e os públicos específicos das atividades educativas. Use prioritariamente os dados reais consolidados no dashboard, relatórios de atividades e listas de presença. Não invente público indireto.`,
    };
  }

  if (secao === 'pesquisa_satisfacao') {
    return {
      ...payload,
      texto_base_obrigatorio: TEXTO_PESQUISA,
      instrucao_usuario: `${payload.instrucao_usuario || ''} Informe expressamente que não houve pesquisa formal de satisfação, que existem percepções qualitativas das equipes nos relatórios e que não havia meta ou rubrica específica para essa pesquisa.`,
    };
  }

  return payload;
}

export function installRelatorioConteudosOficiais() {
  if (typeof window === 'undefined' || window.__relatorioConteudosOficiaisInstalled) return;
  window.__relatorioConteudosOficiaisInstalled = true;

  const entidade = base44?.entities?.RelatorioExecucaoObjeto;
  if (entidade?.get && !entidade.__conteudosOficiaisGetWrapped) {
    const originalGet = entidade.get.bind(entidade);
    entidade.get = async (id, ...args) => {
      const relatorio = aplicarPadroes(await originalGet(id, ...args));
      window.__relatorioExecucaoAtual = relatorio;
      return relatorio;
    };
    entidade.__conteudosOficiaisGetWrapped = true;
  }

  if (entidade?.update && !entidade.__conteudosOficiaisUpdateWrapped) {
    const originalUpdate = entidade.update.bind(entidade);
    entidade.update = (id, payload = {}) => {
      const next = { ...payload };
      for (const campo of ['divulgacao_parceria', 'publico_alvo', 'pesquisa_satisfacao', 'descricao_acoes']) {
        if (Object.prototype.hasOwnProperty.call(next, campo)) next[campo] = nested(next[campo]);
      }
      return originalUpdate(id, next);
    };
    entidade.__conteudosOficiaisUpdateWrapped = true;
  }

  const functions = base44?.functions;
  if (functions?.invoke && !functions.__conteudosOficiaisInvokeWrapped) {
    const originalInvoke = functions.invoke.bind(functions);
    functions.invoke = (functionName, payload = {}) => originalInvoke(functionName, instrucoesSecao(functionName, payload));
    functions.__conteudosOficiaisInvokeWrapped = true;
  }
}
