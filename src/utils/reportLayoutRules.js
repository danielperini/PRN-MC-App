export const REPORT_LAYOUT_RULES = {
  rootClass: 'premium-report',
  exportClass: 'report-export',
  summaryClass: 'catalog-toc',
  sectionClass: 'premium-section',
  methodGridClass: 'premium-method-grid',
  methodCardClass: 'premium-method-card',
  activityCardClass: 'premium-month-card',
  tableClass: 'premium-table',
  documentsTableClass: 'documents-table',
  galleryClass: 'premium-photo-index',
};

function countOccurrences(value = '', term = '') {
  if (!value || !term) return 0;
  return (String(value).match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
}

export function validateReportLayoutHtml(html = '') {
  const warnings = [];
  const errors = [];
  const source = String(html || '');

  if (!source.includes('catalog-toc')) warnings.push('Sumário sem classe editorial catalog-toc.');
  if (source.includes('Capítulos organizados para leitura institucional')) errors.push('Texto introdutório antigo do sumário ainda aparece.');
  if (source.includes('catálogo-livro')) errors.push('Texto antigo de catálogo-livro ainda aparece.');
  if (source.includes('claraassumpcaoctt')) errors.push('Nome incorreto claraassumpcaoctt ainda aparece.');
  if (source.includes('Lenado')) errors.push('Nome incorreto Lenado ainda aparece.');
  if (countOccurrences(source, 'Registro recuperado da programação ou dos relatórios aprovados no app') > 1) {
    warnings.push('Frase metodológica repetida em cards.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
