export const PROGRAMACAO_STATUS = [
  'PLANEJADA',
  'CONFIRMADA',
  'EM_ANDAMENTO',
  'REALIZADA',
  'CANCELADA',
];

export const PROGRAMACAO_MUSEUS = [
  'MHAB',
  'MIS',
  'MUMO',
  'Externo',
  'Atuação Geral',
  'OUTRO',
];

export const programacaoSchema = {
  entity: 'Programacao',

  fields: {
    // identidade
    nome_acao: { type: 'text', required: false },
    titulo: { type: 'text', required: false },

    // datas
    data: { type: 'text', required: false }, // legado dd/mm/yyyy
    data_inicio: { type: 'datetime', required: false },
    data_fim: { type: 'datetime', required: false },
    horario: { type: 'text', required: false },

    // local / museu
    museu: { type: 'text', required: false, enum: PROGRAMACAO_MUSEUS },
    equipamento: { type: 'text', required: false, enum: PROGRAMACAO_MUSEUS },
    local: { type: 'text', required: false },
    endereco: { type: 'text', required: false },

    // conteúdo
    descricao: { type: 'long_text', required: false },
    sinopse: { type: 'long_text', required: false },
    tipo: { type: 'text', required: false },
    tipo_atividade: { type: 'text', required: false },
    formato: { type: 'text', required: false },
    classificacao: { type: 'text', required: false },
    publico: { type: 'text', required: false },
    publico_esperado: { type: 'number', required: false },
    vagas: { type: 'text', required: false },
    acessibilidade: { type: 'text', required: false },

    // links / inscrição
    inscricao: { type: 'text', required: false },
    link_inscricao: { type: 'text', required: false },
    link_imagens: { type: 'text', required: false },

    // organização
    responsavel: { type: 'text', required: false },
    equipe: { type: 'text', required: false },
    activity_id: { type: 'text', required: false },

    // status / sync
    status: { type: 'text', required: false, enum: PROGRAMACAO_STATUS },
    origem: { type: 'text', required: false },
    ativo: { type: 'boolean', required: false },
    sync_source_url: { type: 'text', required: false },
    sync_hash: { type: 'text', required: false },
    knowledge_document_id: { type: 'text', required: false },
    storage_file_url: { type: 'text', required: false },

    // estruturados
    material_divulgacao: { type: 'json', required: false },
    contatos_importantes: { type: 'json', required: false },
    observacoes: { type: 'long_text', required: false },
    minibios: { type: 'long_text', required: false },
  },

  uniqueHints: [
    ['nome_acao', 'data'],
    ['titulo', 'data_inicio'],
  ],
};

export function getProgramacaoTitulo(item = {}) {
  return item.titulo || item.nome_acao || '';
}

export function getProgramacaoMuseu(item = {}) {
  return item.museu || item.equipamento || 'Externo';
}

export function getProgramacaoInscricao(item = {}) {
  return item.link_inscricao || item.inscricao || '';
}

export function normalizeProgramacaoForEntity(item = {}) {
  const titulo = item.titulo || item.nome_acao || '';
  const museu = item.museu || item.equipamento || 'Externo';
  const inscricao = item.link_inscricao || item.inscricao || '';

  return {
    nome_acao: titulo,
    titulo,
    data: item.data || '',
    data_inicio: item.data_inicio || null,
    data_fim: item.data_fim || null,
    horario: item.horario || '',
    museu,
    equipamento: museu,
    local: item.local || '',
    endereco: item.endereco || '',
    descricao: item.descricao || item.sinopse || '',
    sinopse: item.sinopse || item.descricao || '',
    tipo: item.tipo || item.tipo_atividade || '',
    tipo_atividade: item.tipo_atividade || item.tipo || '',
    formato: item.formato || '',
    classificacao: item.classificacao || '',
    publico: item.publico || '',
    publico_esperado: item.publico_esperado || null,
    vagas: item.vagas || '',
    acessibilidade: item.acessibilidade || '',
    inscricao,
    link_inscricao: inscricao,
    link_imagens: item.link_imagens || '',
    responsavel: item.responsavel || '',
    equipe: item.equipe || '',
    activity_id: item.activity_id || '',
    status: item.status || 'CONFIRMADA',
    origem: item.origem || 'planilha_publica',
    ativo: item.ativo ?? true,
    sync_source_url: item.sync_source_url || '',
    sync_hash: item.sync_hash || '',
    knowledge_document_id: item.knowledge_document_id || '',
    storage_file_url: item.storage_file_url || '',
    material_divulgacao: item.material_divulgacao || [],
    contatos_importantes: item.contatos_importantes || [],
    observacoes: item.observacoes || '',
    minibios: item.minibios || '',
  };
}
