/**
 * Mapa de Aliases para Rubricas e Centros de Custo
 * 
 * Este arquivo centraliza todos os aliases para normalização e prevenção de duplicidades.
 * Usado para:
 * - Migração de dados antigos
 * - Importação de planilhas
 * - Compatibilidade com registros históricos
 * - Prevenção de novas duplicidades
 */

// ============================================================================
// ALIASES DE CENTROS DE CUSTO / MUSEUS
// ============================================================================

export const CENTRO_CUSTO_ALIASES = {
  // MHAB
  'mab': 'MHAB',
  'mhab': 'MHAB',
  'museu historico abilio barreto': 'MHAB',
  'museu histórico abílio barreto': 'MHAB',
  'abh': 'MHAB',
  'abílio': 'MHAB',
  
  // MIS
  'mis': 'MIS',
  'museu da imagem e do som': 'MIS',
  'imagem e som': 'MIS',
  
  // MUMO
  'mumu': 'MUMO',
  'mumo': 'MUMO',
  'museu da moda': 'MUMO',
  'moda': 'MUMO',
  
  // Noturno
  'noturno nos museus': 'Noturno 2026',
  'noturno 2026': 'Noturno 2026',
  'noturno': 'Noturno 2026',
  
  // Pampulha
  'pampulha': 'Noturno Pampulha',
  'noturno pampulha': 'Noturno Pampulha',
  'casa do baile': 'Noturno Pampulha',
  'kubitschek': 'Noturno Pampulha'
};

// ============================================================================
// ALIASES DE RUBRICAS (evitar duplicidades)
// ============================================================================

export const RUBRICA_ALIASES = {
  // Diárias - usar sempre a rubrica oficial unificada
  'diarias mis': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diárias mis': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diaria mis': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diária mis': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  
  'diarias mhab': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diárias mhab': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diarias mab': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diárias mab': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  
  'diarias mumo': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diárias mumo': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diarias mumu': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diárias mumu': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  
  'diarias mis mab mumo': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diárias mis mab mumo': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diarias mis mhab mumo': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diárias mis mhab mumo': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  
  'diarias dos educadores': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diárias dos educadores': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diarios educadores': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diários educadores': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diaria educador': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diária educador': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diarias de educadores': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS',
  'diárias de educadores': 'RUBRICA_OFICIAL_DIARIAS_UNIFICADAS'
};

// ============================================================================
// FUNÇÕES DE NORMALIZAÇÃO
// ============================================================================

/**
 * Normaliza texto para comparação (remove acentos, maiúsculas, espaços extras)
 */
export function normalizeForComparison(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve alias de centro de custo
 * @param {string} valor - Valor a ser normalizado
 * @returns {string} Centro de custo oficial ou o valor original se não houver alias
 */
export function resolveCentroCustoAlias(valor) {
  const normalized = normalizeForComparison(valor);
  return CENTRO_CUSTO_ALIASES[normalized] || valor;
}

/**
 * Resolve alias de rubrica
 * @param {string} valor - Valor a ser normalizado
 * @returns {string} ID da rubrica oficial ou null se não houver alias
 */
export function resolveRubricaAlias(valor) {
  const normalized = normalizeForComparison(valor);
  return RUBRICA_ALIASES[normalized] || null;
}

/**
 * Verifica se uma rubrica é duplicada baseada em aliases
 * @param {string} rubricaNome - Nome da rubrica
 * @returns {boolean} True se for um alias conhecido
 */
export function isRubricaDuplicada(rubricaNome) {
  const normalized = normalizeForComparison(rubricaNome);
  return RUBRICA_ALIASES.hasOwnProperty(normalized);
}

/**
 * Verifica se um centro de custo é um alias
 * @param {string} centroCusto - Nome do centro de custo
 * @returns {boolean} True se for um alias conhecido
 */
export function isCentroCustoAlias(centroCusto) {
  const normalized = normalizeForComparison(centroCusto);
  return CENTRO_CUSTO_ALIASES.hasOwnProperty(normalized);
}