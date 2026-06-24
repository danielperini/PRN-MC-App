/**
 * Centros de custo disponíveis para rubricas.
 */
export const CENTROS_CUSTO = [
  'MHAB',
  'MIS BH',
  'MUMO',
  'Geral/Transversal',
  'Coordenação',
  'Comunicação',
  'Educação',
  'Produção',
  'Administrativo-financeiro',
  'Noturno 2026',
  'Noturno Pampulha',
  'Noturno nos Museus',
  'Publicações',
  'Consultorias',
  'Despesas Gerais',
];

/**
 * Sugere automaticamente o centro de custo com base no nome da rubrica.
 * @param {string} nomeRubrica
 * @returns {string}
 */
export function sugerirCentroCusto(nomeRubrica) {
  const n = String(nomeRubrica || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/\bmis\b/.test(n)) return 'MIS BH';
  if (/\bmumo\b/.test(n)) return 'MUMO';
  if (/\bmhab\b/.test(n)) return 'MHAB';

  if (/coordenad|assistente|consultoria de programacao/.test(n)) return 'Coordenação';

  if (/comunicacao|assessoria de imprensa|rede social|marketing|designer|fotografo|fotografia/.test(n)) return 'Comunicação';

  if (/educador|acoes educativas|material|lanche/.test(n)) return 'Educação';

  if (/\bproducao\b/.test(n)) return 'Produção';

  if (/\bnoturno\b.*\bpampulha\b|\b4[º°]?\s*(aditivo)/.test(n)) return 'Noturno Pampulha';
  if (/noturno|ed\. 2026|ed 2026|edicao 2026|apresentacao|infraestrutura|vans|seguranca|limpeza|iluminacao/.test(n)) return 'Noturno 2026';

  if (/publicacao|impressao|revisao|traducao|pesquisa e texto/.test(n)) return 'Publicações';

  if (/consultoria|formacao/.test(n)) return 'Consultorias';

  if (/transporte|material de escritorio|juridic|energia|contador/.test(n)) return 'Despesas Gerais';

  return 'Geral/Transversal';
}