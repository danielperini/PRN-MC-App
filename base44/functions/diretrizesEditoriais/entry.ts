// ====================================================================
// DIRETRIZES EDITORIAIS OBRIGATÓRIAS
// Relatório Físico-Financeiro Museus Centro
// ====================================================================

export const DIRETRIZES_EDITORIAIS = {
  // Tamanho mínimo de seções
  MINIMO_PARAGRAFOS_SECAO: 3,
  MINIMO_SENTENCAS_PARAGRAFO: 4,
  MINIMO_PALAVRAS_PARAGRAFO: 80,
  
  // Validação de densidade
  validarDensidade: (texto) => {
    if (!texto) return { valido: false, erro: 'Texto vazio' };
    
    const paragrafos = texto.split('\n\n').filter(p => p.trim());
    if (paragrafos.length < 3) {
      return { 
        valido: false, 
        erro: `Mínimo 3 parágrafos requerido (${paragrafos.length} fornecidos)` 
      };
    }
    
    for (let i = 0; i < paragrafos.length; i++) {
      const palavras = paragrafos[i].trim().split(/\s+/).length;
      if (palavras < 80) {
        return { 
          valido: false, 
          erro: `Parágrafo ${i+1} muito curto (${palavras} palavras, mínimo 80)` 
        };
      }
    }
    
    return { valido: true };
  },
  
  // Detector de textos automáticos
  detectarTextoAutomatico: (texto) => {
    const frases_genericas = [
      /^foi realizado/i,
      /^a atividade/i,
      /^durante o período/i,
      /^neste mês/i,
      /^conforme planejado/i,
      /foi executada/i,
      'foi realizado um',
      'foi efetuado um',
      'ocorreu a realização'
    ];
    
    const patterns = frases_genericas.filter(p => {
      if (typeof p === 'string') {
        return texto.toLowerCase().includes(p.toLowerCase());
      }
      return p.test(texto);
    });
    
    return patterns.length;
  },
  
  // Validador de fontes
  validarFontes: (blocoTexto, fontes) => {
    // Blocos de texto devem referenciar múltiplas fontes
    const fontesUsadas = {
      relatorios: false,
      atividades: false,
      agenda: false,
      programacao: false,
      releases: false,
      comunicacao: false,
      imagens: false,
      documentos: false,
      financeiro: false
    };
    
    // Contar referências no texto
    if (fontes.relatorios && fontes.relatorios.length > 0) fontesUsadas.relatorios = true;
    if (fontes.atividades && fontes.atividades.length > 0) fontesUsadas.atividades = true;
    if (fontes.agenda && fontes.agenda.length > 0) fontesUsadas.agenda = true;
    if (fontes.programacao && fontes.programacao.length > 0) fontesUsadas.programacao = true;
    if (fontes.releases && fontes.releases.length > 0) fontesUsadas.releases = true;
    if (fontes.comunicacao && fontes.comunicacao.length > 0) fontesUsadas.comunicacao = true;
    if (fontes.imagens && fontes.imagens.length > 0) fontesUsadas.imagens = true;
    if (fontes.documentos && fontes.documentos.length > 0) fontesUsadas.documentos = true;
    if (fontes.financeiro && fontes.financeiro.length > 0) fontesUsadas.financeiro = true;
    
    const fontesIntegradas = Object.values(fontesUsadas).filter(v => v).length;
    
    return {
      valido: fontesIntegradas >= 2,
      fontesIntegradas,
      totalDisponiveis: Object.keys(fontesUsadas).length,
      detalhes: fontesUsadas
    };
  },
  
  // Detector de repetição
  detectarRepetacao: (texto) => {
    const palavras = texto.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const frequencia = {};
    
    palavras.forEach(p => {
      frequencia[p] = (frequencia[p] || 0) + 1;
    });
    
    const palavrasRepetidas = Object.entries(frequencia)
      .filter(([_, count]) => count > 5)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count);
    
    return {
      temRepetacao: palavrasRepetidas.length > 0,
      palavrasRepetidas: palavrasRepetidas.slice(0, 5)
    };
  },
  
  // Estrutura obrigatória de parágrafo editorial
  estruturaParagrafo: {
    primeiro: "Contextualização institucional, síntese do período, leitura geral das ações",
    segundo: "Descrição das atividades, cruzamento com agenda/programação/releases, contextualização cultural",
    terceiro: "Interpretação dos resultados, participação, continuidade, integração, impacto institucional"
  },
  
  // Palavras a evitar em excesso
  palavrasProibidas: [
    'atividade',
    'foi realizado',
    'foi feito',
    'durante',
    'neste mês',
    'conforme',
    'realizado'
  ],
  
  // Estilos obrigatórios
  estilos: [
    'institucional',
    'elegante',
    'editorial',
    'técnico',
    'curatorial',
    'objetivo',
    'sofisticado'
  ],
  
  // Validar nenhum dado fictício
  validarDadosReais: (dadosUsados) => {
    const requeridos = [
      'fonteMarcado',
      'dataAprovacao',
      'refAuditoriaCompleta'
    ];
    
    return {
      completo: requeridos.every(r => r in dadosUsados),
      status: dadosUsados
    };
  }
};

// ====================================================================
// HELPER PARA REDAÇÃO EDITORIAL DENSA
// ====================================================================

export async function gerarBlocoEditorialDenso(
  tema,
  fontesReais,
  imagens = [],
  dadosContexto = {}
) {
  const {
    relatorios = [],
    atividades = [],
    agenda = [],
    programacao = [],
    releases = [],
    comunicacao = [],
    dashboard = {},
    financeiro = {}
  } = fontesReais;

  const validacao = DIRETRIZES_EDITORIAIS.validarFontes(null, fontesReais);
  
  if (!validacao.valido) {
    throw new Error(`Insuficiente integração de fontes. Requerido mínimo 2 fontes, obtido ${validacao.fontesIntegradas}`);
  }

  // Estrutura: 3 parágrafos obrigatórios
  const blocos = {
    contextual: [],
    descritivo: [],
    interpretativo: []
  };

  // PARÁGRAFO 1: Contextualização
  if (relatorios.length > 0) {
    const titulosRels = relatorios.slice(0, 2).map(r => r.titulo || r.author_name).join(', ');
    blocos.contextual.push(
      `No período analisado, os relatórios aprovados — ${titulosRels} — consolidam a atuação institucional em múltiplas frentes. ` +
      `As ações registradas refletem a integração contínua entre educação, comunicação, produção e gestão financeira, ` +
      `demonstrando a capacidade operacional dos Museus Centro em manter coerência narrativa e execução consistente.`
    );
  }

  // PARÁGRAFO 2: Descrição integrada
  if (atividades.length > 0 && programacao.length > 0) {
    const atividadesCount = atividades.length;
    const progCount = programacao.length;
    const releasesMencao = releases.length > 0 ? `replicadas em ${releases.length} releases institucionais` : '';
    
    blocos.descritivo.push(
      `A calendário operacional compreende ${atividadesCount} atividades executadas, ` +
      `distribuídas entre ${progCount} momentos de programação curada. ` +
      `Cada ação foi mapeada em relação às dimensões de participação, mediação e território, ${releasesMencao}. ` +
      `Os registros visuais (${imagens.length} fotografias contextualizadas) revelam públicos diversos, espaços de interação, ` +
      `e dinâmicas de apropriação cultural que transcendem os dados quantitativos, enriquecendo a narrativa institucional.`
    );
  }

  // PARÁGRAFO 3: Interpretação
  if (Object.keys(dashboard).length > 0 || Object.keys(financeiro).length > 0) {
    const publicoTotal = dashboard.publico_total || 0;
    const percentualExecucao = financeiro.percentual || 0;
    
    blocos.interpretativo.push(
      `Os resultados consolidados revelam um padrão de ativação contínua: ${publicoTotal.toLocaleString('pt-BR')} participantes ` +
      `engajados em experiências de mediação cultural, com execução financeira em ${percentualExecucao}% da capacidade orçamentária alocada. ` +
      `A integração entre planejamento estratégico (agenda + programação), execução operacional (atividades) e documentação ` +
      `(relatórios + releases) evidencia maturidade institucional. A continuidade observada sugere sustentabilidade da atuação ` +
      `e consolidação de identidade cultural própria dos Museus Centro.`
    );
  }

  const textoCombinado = [
    blocos.contextual[0],
    blocos.descritivo[0],
    blocos.interpretativo[0]
  ]
    .filter(t => t)
    .join('\n\n');

  // Validação final
  const validacaoDensidade = DIRETRIZES_EDITORIAIS.validarDensidade(textoCombinado);
  const validacaoRepetacao = DIRETRIZES_EDITORIAIS.detectarRepetacao(textoCombinado);

  return {
    texto: textoCombinado,
    validacoes: {
      densidade: validacaoDensidade,
      repetacao: validacaoRepetacao,
      fontes: validacao
    },
    fontesIntegradas: {
      relatorios: relatorios.length,
      atividades: atividades.length,
      agenda: agenda.length,
      programacao: programacao.length,
      releases: releases.length,
      imagens: imagens.length
    }
  };
}

// ====================================================================
// INDEXADOR EDITORIAL PARA REUTILIZAÇÃO
// ====================================================================

export function indexarConteudoEditorial(dados) {
  const indice = {
    frasesClave: new Set(),
    citacoes: new Map(),
    releaseExtraidos: [],
    imagensComContexto: [],
    conclusoesPorMuseu: {}
  };

  // Extrair frases-chave dos releases
  if (dados.releases) {
    dados.releases.forEach(r => {
      const frases = (r.conteudo_resumido || r.titulo || '').split('.').slice(0, 2);
      frases.forEach(f => {
        if (f.trim().length > 30) {
          indice.frasesClave.add(f.trim());
        }
      });
      indice.releaseExtraidos.push({
        id: r.id,
        titulo: r.titulo,
        resumo: r.conteudo_resumido || r.titulo,
        mes: r.mes,
        ano: r.ano
      });
    });
  }

  // Mapear imagens com contexto de atividade
  if (dados.atividades && dados.fotos) {
    dados.fotos.forEach(foto => {
      const atividadeRelacionada = dados.atividades.find(
        a => a.id === foto.activity_id
      );
      if (atividadeRelacionada) {
        indice.imagensComContexto.push({
          url: foto.file_url,
          legenda: foto.description,
          atividade: atividadeRelacionada.titulo,
          tipo: atividadeRelacionada.tipo_equipe,
          data: atividadeRelacionada.data_realizacao
        });
      }
    });
  }

  // Consolidar conclusões por museu
  if (dados.relatorios) {
    const porMuseu = {};
    dados.relatorios.forEach(r => {
      const museu = r.museu || 'Geral';
      if (!porMuseu[museu]) porMuseu[museu] = [];
      porMuseu[museu].push({
        autor: r.author_name,
        resumo: r.resumo_executivo || r.avaliacao_desafios,
        periodo: `${r.mes_referencia}/${r.ano}`,
        pontos_positivos: r.avaliacao_pontos_positivos
      });
    });
    indice.conclusoesPorMuseu = porMuseu;
  }

  return indice;
}