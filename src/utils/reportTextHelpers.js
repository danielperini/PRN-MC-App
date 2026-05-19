export function fixSpacingBeforePunctuation(value = '') {
  return String(value || '')
    .replace(/\s+([,:;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function fixCommonTypos(value = '') {
  return String(value || '')
    .replace(/claraassumpcaoctt/gi, 'Clara Braga Assumpção')
    .replace(/clara\s*assumpcao\s*ctt/gi, 'Clara Braga Assumpção')
    .replace(/clara\s*assump[cç][aã]o\s*ctt/gi, 'Clara Braga Assumpção')
    .replace(/Clara Braga Assump[cç][aã]o/gi, 'Clara Braga Assumpção')
    .replace(/\bLenado\b/g, 'Leandro Gabriel')
    .replace(/Clara Braga Assumpção\s*Educativo\s*·\s*MUMO/gi, 'Clara Braga Assumpção Educadora · Museus Centro')
    .replace(/\bReunão\b/gi, 'Reunião')
    .replace(/\bEstudio\b/gi, 'Estúdio')
    .replace(/\bmanutençãe\b/gi, 'manutenção')
    .replace(/\bartisticas\b/gi, 'artísticas')
    .replace(/\bas 16h\b/gi, 'às 16h')
    .replace(/destina a apresentação/gi, 'destinada à apresentação')
    .replace(/para a sediar reunião/gi, 'para sediar reunião')
    .replace(/Museus Centro\s+,/gi, 'Museus Centro,')
    .replace(/MUMO\s+,/gi, 'MUMO,')
    .replace(/Viaduto das Artes\s+,/gi, 'Viaduto das Artes –')
    .replace(/CEP 30640-010\s+,/gi, 'CEP 30640-010 –');
}

export function normalizeOfficialTerms(value = '') {
  return fixCommonTypos(value)
    .replace(/\b3o Aditivo\b/gi, '3º Aditivo')
    .replace(/\b3º aditivo\b/gi, '3º Aditivo')
    .replace(/\bnoturno nos museus\b/gi, 'Noturno nos Museus')
    .replace(/\bviaduto das artes\b/gi, 'Viaduto das Artes')
    .replace(/\bmuseus centro\b/gi, 'Museus Centro')
    .replace(/\bmuseu centro app\b/gi, 'Museu Centro APP')
    .replace(/\bexecução financeira\b/gi, 'Execução financeira')
    .replace(/\bprestação de contas\b/gi, 'Prestação de contas')
    .replace(/\bgovernança documental\b/gi, 'Governança documental');
}

export function normalizeTextForReport(value = '') {
  return fixSpacingBeforePunctuation(normalizeOfficialTerms(value));
}

export function normalizeHtmlForReport(value = '') {
  return normalizeOfficialTerms(String(value || ''))
    .replace(/Clara Braga Assumpção\s*(?:<[^>]+>\s*)*Educativo\s*·\s*MUMO/gi, 'Clara Braga Assumpção<br />Educadora · Museus Centro')
    .replace(/claraassumpcaoctt/gi, 'Clara Braga Assumpção');
}

export function normalizeTextForComparison(value = '') {
  return normalizeTextForReport(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"'🎥📸]/g, '')
    .replace(/[:;,.!?()[\]{}\-–—_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
