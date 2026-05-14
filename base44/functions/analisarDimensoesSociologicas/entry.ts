import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SOCIOLOGICAL_PATTERNS = {
  participacao: {
    keywords: ['grupo', 'coletivo', 'participantes', 'comunidade', 'público', 'encontro', 'roda', 'diálogo', 'assembléia', 'construção conjunta', 'envolvimento', 'engagement'],
    indicators: ['quantas_repeticoes', 'publico_total', 'acessibilidade'],
  },
  mediacao_cultural: {
    keywords: ['mediação', 'educativo', 'formação', 'oficina', 'palestra', 'bate-papo', 'diálogo', 'conversa', 'workshop', 'aprendizado'],
    indicators: ['tipo_atividade', 'equipe_responsavel', 'parceria'],
  },
  territorio: {
    keywords: ['território', 'bairro', 'localidade', 'comunidade', 'entorno', 'vizinhança', 'região', 'mapeamento', 'diagnóstico territorial', 'escuta territorial', 'leitura do espaço'],
    indicators: ['local', 'parceiro_nome', 'eh_mobilizacao'],
  },
  escuta: {
    keywords: ['escuta', 'feedback', 'percepção', 'voz', 'testemunho', 'relato', 'depoimento', 'observação', 'avaliação', 'diagnóstico'],
    indicators: ['observacoes', 'comentarios_gerais', 'acessibilidade'],
  },
  memoria: {
    keywords: ['memória', 'história', 'patrimônio', 'preservação', 'registra', 'documento', 'arquivo', 'acervo', 'legado', 'ancestralidade'],
    indicators: ['fotos', 'documentos', 'titulo'],
  },
  construcao_coletiva: {
    keywords: ['coletivo', 'colaborativo', 'conjunto', 'compartilhado', 'integração', 'articulação', 'rede', 'parcerias', 'co-criação', 'produção compartilhada'],
    indicators: ['houve_contratacoes', 'parceria', 'numero_empresas'],
  },
  apropriacao_espacos: {
    keywords: ['ocupação', 'apropriação', 'circulação', 'uso', 'vivência', 'frequência', 'acesso', 'permanência'],
    indicators: ['local', 'capacidade_local', 'taxa_ocupacao'],
  },
  educacao_patrimonial: {
    keywords: ['patrimônio', 'educação patrimonial', 'acervo', 'coleção', 'conservação', 'musealização', 'conhecimento histórico'],
    indicators: ['titulo', 'meta_id', 'classificacao'],
  },
};

const DIMENSOES_ESPERADAS = {
  cultural: {
    keywords: ['arte', 'cultura', 'criação', 'expressão', 'linguagem', 'identidade', 'experiência estética'],
  },
  social: {
    keywords: ['comunidade', 'sociedade', 'equidade', 'inclusão', 'direitos', 'bem-estar', 'justiça social'],
  },
  territorial: {
    keywords: ['território', 'local', 'espaço', 'bairro', 'região', 'vizinhança', 'pertencimento'],
  },
};

async function detectarPadroesAntropologicos(atividades, releases, programacao) {
  if (!Array.isArray(atividades)) atividades = [];

  const patterns = {
    participacao: 0,
    mediacao_cultural: 0,
    territorio: 0,
    escuta: 0,
    memoria: 0,
    construcao_coletiva: 0,
    apropriacao_espacos: 0,
    educacao_patrimonial: 0,
  };

  const evidences = {
    participacao: [],
    mediacao_cultural: [],
    territorio: [],
    escuta: [],
    memoria: [],
    construcao_coletiva: [],
    apropriacao_espacos: [],
    educacao_patrimonial: [],
  };

  // Analisar atividades
  for (const activity of atividades) {
    const fullText = `${activity.titulo || ''} ${activity.descricao || ''} ${activity.equipe_responsavel || ''} ${activity.observacoes || ''}`.toLowerCase();

    // Participação
    if (activity.publico_total > 0 || activity.quantas_repeticoes > 1 || activity.parceria === 'Sim') {
      patterns.participacao++;
      evidences.participacao.push({
        tipo: 'atividade',
        titulo: activity.titulo,
        publico: activity.publico_total,
        repeticoes: activity.quantas_repeticoes,
      });
    }

    // Mediação cultural
    if (['Oficina', 'Palestra', 'Workshop', 'Encontro', 'Roda de Conversa'].includes(activity.tipo_atividade || '')) {
      patterns.mediacao_cultural++;
      evidences.mediacao_cultural.push({
        tipo: 'atividade_mediativa',
        titulo: activity.titulo,
        categoria: activity.tipo_atividade,
      });
    }

    // Construção coletiva
    if (activity.houve_contratacoes || activity.numero_empresas > 0 || activity.parceria === 'Sim') {
      patterns.construcao_coletiva++;
      evidences.construcao_coletiva.push({
        tipo: 'atividade_colaborativa',
        titulo: activity.titulo,
        parcerias: activity.numero_empresas || 0,
      });
    }

    // Apropriação de espaços
    if (activity.local || activity.taxa_ocupacao > 0) {
      patterns.apropriacao_espacos++;
      evidences.apropriacao_espacos.push({
        tipo: 'uso_espacial',
        titulo: activity.titulo,
        local: activity.local,
      });
    }

    // Escuta
    if (activity.observacoes || activity.comentarios_gerais) {
      patterns.escuta++;
      evidences.escuta.push({
        tipo: 'relato_observacional',
        titulo: activity.titulo,
      });
    }

    // Memória
    if (Array.isArray(activity.fotos) && activity.fotos.length > 0) {
      patterns.memoria++;
      evidences.memoria.push({
        tipo: 'registro_visual',
        titulo: activity.titulo,
        fotos: activity.fotos.length,
      });
    }

    // Educação patrimonial
    if (activity.meta_id && activity.classificacao === 'META') {
      patterns.educacao_patrimonial++;
      evidences.educacao_patrimonial.push({
        tipo: 'atividade_meta',
        titulo: activity.titulo,
        meta: activity.meta_id,
      });
    }
  }

  return {
    patterns,
    evidences,
    intensidade: Object.values(patterns).reduce((a, b) => a + b, 0) / Object.keys(patterns).length,
  };
}

async function gerarIntroducaoSociologica(analise, mes, ano, museu) {
  const { patterns, evidences, intensidade } = analise;

  let introducao = `No período de ${mes} de ${ano}, as ações desenvolvidas ${museu ? `no/a ${museu}` : ''} refletiram processos de encontro, aprendizagem e participação cultural. `;

  // Construir narrativa baseada em padrões encontrados
  const aspectos = [];

  if (patterns.participacao > 0) {
    aspectos.push('abertura para participação e construção coletiva dos públicos');
  }

  if (patterns.mediacao_cultural > 0) {
    aspectos.push('processos educativos de mediação cultural e formação');
  }

  if (patterns.territorio > 0 || patterns.apropriacao_espacos > 0) {
    aspectos.push('dimensão territorial e apropriação dos espaços culturais');
  }

  if (patterns.escuta > 0) {
    aspectos.push('escuta ativa das percepções e experiências compartilhadas');
  }

  if (patterns.memoria > 0) {
    aspectos.push('produção de memória através de registros e documentação');
  }

  if (patterns.construcao_coletiva > 0) {
    aspectos.push('articulação institucional e trabalho colaborativo entre equipes');
  }

  if (aspectos.length > 0) {
    introducao += `Destacaram-se: ${aspectos.join(', ')}. `;
  }

  introducao += `Este relatório expressa a dimensão social, cultural e territorial do trabalho realizado, sinalizando o compromisso institucional com a participação, escuta e fortalecimento comunitário.`;

  return introducao;
}

async function gerarObservacoesSociologicas(analise, equipe) {
  const { evidences } = analise;
  const observacoes = [];

  // Síntese de participação
  if (evidences.participacao.length > 0) {
    const publicoTotal = evidences.participacao.reduce((sum, e) => sum + (e.publico || 0), 0);
    observacoes.push(
      `A participação social evidenciou-se através de ${evidences.participacao.length} atividade(s) ` +
      `que reuniram aproximadamente ${publicoTotal} pessoas, fortalecendo a dimensão coletiva ` +
      `do trabalho cultural e educativo.`
    );
  }

  // Síntese de mediação
  if (evidences.mediacao_cultural.length > 0) {
    observacoes.push(
      `Os processos educativos de mediação cultural contaram com ${evidences.mediacao_cultural.length} iniciativa(s), ` +
      `consolidando práticas de escuta, interação e construção compartilhada do conhecimento com os públicos.`
    );
  }

  // Síntese de coletividade
  if (evidences.construcao_coletiva.length > 0) {
    observacoes.push(
      `O trabalho colaborativo ${equipe ? `da equipe de ${equipe}` : 'das equipes'} evidenciou articulação institucional ` +
      `e parcerias que ampliaram o alcance e a significância das ações realizadas.`
    );
  }

  return observacoes;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId, atividades, mes, ano, museu, equipe } = await req.json();

    if (!reportId) {
      return Response.json({ error: 'reportId is required' }, { status: 400 });
    }

    // Executar análise
    const analise = await detectarPadroesAntropologicos(
      atividades || [],
      [], // releases não passadas neste contexto
      []  // programacao não passada neste contexto
    );

    // Gerar introdução e observações
    const introducao = await gerarIntroducaoSociologica(analise, mes, ano, museu);
    const observacoes = await gerarObservacoesSociologicas(analise, equipe);

    return Response.json({
      success: true,
      analise,
      introducao,
      observacoes,
      intensidade: analise.intensidade,
      dimensoes_detectadas: Object.keys(analise.patterns).filter(k => analise.patterns[k] > 0),
    });
  } catch (error) {
    console.error('Erro ao analisar dimensões sociológicas:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});