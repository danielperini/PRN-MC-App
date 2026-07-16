const MARCADORES_3_ADITIVO = [
  '3 aditivo',
  '3o aditivo',
  '3º aditivo',
  'terceiro aditivo',
  'mes 19 ao 28',
  'meses 19 ao 28',
  'mês 19 ao 28',
  'mes 19-28',
  'mc3a',
];

const MARCADORES_4_ADITIVO = [
  '4 aditivo',
  '4o aditivo',
  '4º aditivo',
  'quarto aditivo',
  'noturno 2026',
  'noturno nos museus 2026',
  'noturno pampulha',
  'ed. 2026',
  'edicao 2026',
  'edição 2026',
  'mc4a',
];

const CAMPOS_TEXTO_META = [
  'aditivo',
  'termo_aditivo',
  'numero_aditivo',
  'aditivo_numero',
  'origem',
  'versao',
  'grupo',
  'codigo',
  'meta_codigo',
  'nome',
  'meta_nome',
  'titulo',
  'descricao',
  'resultado_esperado',
  'rubrica_nome',
  'centro_custo_nome',
];

export function normalizarTextoMeta(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function textoCompletoMeta(meta) {
  return normalizarTextoMeta(
    CAMPOS_TEXTO_META
      .map((campo) => meta?.[campo])
      .filter(Boolean)
      .join(' ')
  );
}

export function metaPertenceAo3ou4Aditivo(meta) {
  if (!meta) return false;

  const numero = Number(meta?.numero_aditivo || meta?.aditivo_numero || meta?.aditivo);
  if (numero === 3 || numero === 4) return true;

  const texto = textoCompletoMeta(meta);
  if (!texto) return false;

  return [...MARCADORES_3_ADITIVO, ...MARCADORES_4_ADITIVO]
    .map(normalizarTextoMeta)
    .some((marcador) => texto.includes(marcador));
}

export function filtrarMetas3e4Aditivos(metas) {
  return (Array.isArray(metas) ? metas : []).filter(metaPertenceAo3ou4Aditivo);
}

export function idCanonicoMeta(meta) {
  return String(
    meta?.meta_id ||
      meta?.project_meta_id ||
      meta?.id ||
      meta?.meta_codigo ||
      meta?.codigo ||
      ''
  );
}

export function nomeCanonicoMeta(meta) {
  return (
    meta?.meta_nome ||
    meta?.nome ||
    meta?.titulo ||
    meta?.descricao ||
    meta?.meta_codigo ||
    meta?.codigo ||
    'Meta'
  );
}
