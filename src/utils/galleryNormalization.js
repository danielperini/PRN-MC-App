/**
 * Normalização de chaves de museu e período para a Galeria de Fotos.
 * Mapeia variações técnicas (ex: Mis14072026, NoturnoNosMuseusMis26062026)
 * para chaves canônicas oficiais do projeto Museus Centro.
 */

// Ordem oficial dos museus para exibição dos chips
export const MUSEU_OFFICIAL_ORDER = [
  'MHAB',
  'MIS',
  'MUMO',
  'MAP',
  'CasaKubitschek',
  'CasaDoBaile',
  'Noturno',
  'MuseuEscolaArquitetura',
  'GaleriaArteUnimed',
  'CasaRosadaGasmig',
  'MemorialDireitosHumanos',
  'MemorialLegislativoMineiro',
  'CentroMemoria',
  'MuseuCabral',
  'SEM_IDENTIFICACAO',
];

// Labels canônicas incluindo Noturno
export const CANONICAL_SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som de Belo Horizonte',
  MUMO: 'MUMO — Museu da Moda de Belo Horizonte',
  MAP: 'MAP — Museu de Arte da Pampulha',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBaile: 'Casa do Baíle',
  Noturno: 'Noturno nos Museus',
  MuseuEscolaArquitetura: 'Museu da Escola de Arquitetura',
  GaleriaArteUnimed: 'Galeria de Arte Centro Cultural Unimed',
  CasaRosadaGasmig: 'Casa Rosada Gasmig Minas',
  MemorialDireitosHumanos: 'Memorial dos Direitos Humanos',
  MemorialLegislativoMineiro: 'Memorial do Legislativo Mineiro',
  CentroMemoria: 'Centro de Memória',
  MuseuCabral: 'Museu Cabral',
  SEM_IDENTIFICACAO: 'Sem identificação de museu',
};

/**
 * Mapeia qualquer variação de chave de seção para a chave canônica do museu.
 * Funciona por palavras-chave case-insensitive.
 * @param {string} sectionKey - Chave técnica original (ex: Mis14072026)
 * @returns {string} Chave canônica (ex: MIS)
 */
export function normalizeMuseuKey(sectionKey) {
  const text = String(sectionKey || '').toLowerCase();
  if (!text) return 'SEM_IDENTIFICACAO';

  // Ordem importa: checar mais específicos antes dos genéricos
  if (text.includes('mhab') || text.includes('barreto')) return 'MHAB';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';
  if (text.includes('kubitschek')) return 'CasaKubitschek';
  if (text.includes('baile') || text.includes('baíle')) return 'CasaDoBaile';
  if (text.includes('memorial') && text.includes('legislativo')) return 'MemorialLegislativoMineiro';
  if (text.includes('memorial') && text.includes('direitos')) return 'MemorialDireitosHumanos';
  if (text.includes('escola') && text.includes('arquitetura')) return 'MuseuEscolaArquitetura';
  if (text.includes('unimed')) return 'GaleriaArteUnimed';
  if (text.includes('rosada') || text.includes('gasmig')) return 'CasaRosadaGasmig';
  if (text.includes('centro') && text.includes('memoria')) return 'CentroMemoria';
  if (text.includes('cabral')) return 'MuseuCabral';
  // Noturno deve vir antes de MIS/MAP pois pode conter ambos (ex: NoturnoNosMuseusMis)
  if (text.includes('noturno')) return 'Noturno';
  // MIS: checar 'mis' como palavra isolada ou no início
  if (text === 'mis' || text.startsWith('mis') || text.includes('imagem') || text.includes('som')) return 'MIS';
  if (text.includes('map') || text.includes('pampulha') || text.includes('arte da pampulha')) return 'MAP';

  return 'SEM_IDENTIFICACAO';
}

/**
 * Normaliza a lista de períodos (reportMes) removendo duplicatas.
 * Quando há 'Mês' e 'Mês/Ano', mantém apenas a versão com ano.
 * @param {string[]} periodos - Lista de strings de período
 * @returns {string[]} Lista única ordenada cronologicamente
 */
export function normalizePeriodoKeys(periodos) {
  const seen = new Map(); // base (mês lowercase) -> versão com ano (preferida)
  const raw = new Set();

  periodos.forEach((p) => {
    if (!p) return;
    const value = String(p).trim();
    if (!value) return;
    raw.add(value);
    // Tenta extrair mês base (sem ano) para detectar duplicatas
    const withoutYear = value.replace(/\/\d{4}$/, '').trim();
    const hasYear = /\/\d{4}$/.test(value);
    const existing = seen.get(withoutYear.toLowerCase());
    if (!existing) {
      seen.set(withoutYear.toLowerCase(), { value, hasYear });
    } else if (hasYear && !existing.hasYear) {
      // Substitui a versão sem ano pela versão com ano
      seen.set(withoutYear.toLowerCase(), { value, hasYear });
    }
  });

  const unique = Array.from(seen.values()).map((entry) => entry.value);

  // Ordena cronologicamente: tenta extrair mês e ano
  const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_ACENTUADOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  unique.sort((a, b) => {
    const parsePeriodo = (str) => {
      const lower = String(str).toLowerCase();
      const anoMatch = str.match(/\/(\d{4})$/);
      const ano = anoMatch ? parseInt(anoMatch[1], 10) : 0;
      let mesIdx = -1;
      for (let i = 0; i < MESES.length; i++) {
        if (lower.includes(MESES[i]) || lower.includes(MESES_ACENTUADOS[i])) {
          mesIdx = i;
          break;
        }
      }
      return { ano, mes: mesIdx };
    };
    const pa = parsePeriodo(a);
    const pb = parsePeriodo(b);
    if (pa.ano !== pb.ano) return pa.ano - pb.ano;
    return pa.mes - pb.mes;
  });

  return unique;
}

/**
 * Detecta se uma string parece ser um nome de arquivo técnico.
 * @param {string} value
 * @returns {boolean}
 */
export function isTechnicalFileName(value) {
  const str = String(value || '').trim();
  if (!str) return false;
  // Tem extensão de imagem
  if (/\.(jpg|jpeg|png|webp|gif|bmp|avif|heic)$/i.test(str)) return true;
  // CamelCase longo sem espaços (típico de nome técnico gerado automaticamente)
  if (str.length > 20 && !/\s/.test(str) && /[a-z][A-Z]/.test(str)) return true;
  // Snake_case longo sem espaços
  if (str.length > 20 && !/\s/.test(str) && /_/.test(str) && /^[a-z0-9_]+$/i.test(str)) return true;
  return false;
}

/**
 * Normaliza um período para comparação de filtro (remove ano, lowercase).
 * 'Abril/2026' → 'abril', 'Abril' → 'abril'
 */
export function normalizePeriodoForComparison(periodo) {
  return String(periodo || '').replace(/\/\d{4}$/, '').trim().toLowerCase();
}

/**
 * Retorna a legenda de exibição para uma foto, nunca exibindo nomes de arquivo técnicos.
 * @param {object} image
 * @returns {string}
 */
export function resolvePhotoCaption(image) {
  if (!image) return '';
  // Legenda baseada APENAS em metadados estruturados: atividade → local → período.
  // Ignora campos de texto livre (legenda/caption) que podem guardar descrição inventada pela IA.
  const atividade = String(image.activityTitulo || '').trim();
  const localRaw = String(image.localizacao || image.local || '').trim();
  // Evita usar "museu" como local quando localizacao caiu para o nome do museu
  const museuRaw = String(image.museu || image.sectionTitle || '').trim();
  const local = localRaw && localRaw !== museuRaw ? localRaw : '';
  const periodo = String(image.reportMes || '').trim();
  const partes = [
    atividade && !isTechnicalFileName(atividade) && !isInventedCaption(atividade) ? atividade : '',
    local,
    periodo,
  ].filter(Boolean);
  return partes.join(' — ');
}

// Textos genéricos/inventados que não representam dado real do relatório
const INVENTED_CAPTION_PATTERNS = [
  'foto da galeria',
  'foto de registro',
  'registro fotografico',
  'instalacao noturna',
  'instalacao noturno',
  'noturno nos museus 20',
  'sem legenda',
];

/**
 * Detecta legendas genéricas/inventadas (aplicadas em lote), que devem ser
 * tratadas como ausentes para forçar a cascata de dados reais.
 * @param {string} text
 * @returns {boolean}
 */
export function isInventedCaption(text) {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  return INVENTED_CAPTION_PATTERNS.some((pattern) => normalized.startsWith(pattern) || normalized.includes(pattern));
}