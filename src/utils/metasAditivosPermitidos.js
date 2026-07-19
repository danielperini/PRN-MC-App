const MARCADORES_3_ADITIVO = [
  '3 aditivo', '3o aditivo', '3º aditivo', 'terceiro aditivo',
  'mes 19 ao 28', 'meses 19 ao 28', 'mês 19 ao 28', 'mes 19-28', 'mc3a',
];

const MARCADORES_4_ADITIVO = [
  '4 aditivo', '4o aditivo', '4º aditivo', 'quarto aditivo',
  'noturno 2026', 'noturno nos museus 2026', 'noturno pampulha',
  'ed. 2026', 'edicao 2026', 'edição 2026', 'mc4a',
];

const CAMPOS_TEXTO_META = [
  'aditivo', 'termo_aditivo', 'numero_aditivo', 'aditivo_numero',
  'origem', 'versao', 'grupo', 'codigo', 'meta_codigo',
  'nome', 'meta_nome', 'titulo', 'descricao', 'resultado_esperado',
  'projeto', 'projeto_nome', 'project_name', 'centro_custo', 'centro_custo_nome',
  'rubrica', 'rubrica_nome', 'natureza_despesa',
];

const METAS_OCULTAS_TERCEIRO_ADITIVO = new Set(['2', '4', '7', '8', '15']);
const IDS_METAS_OCULTAS = new Set([
  '6a3b21389ab6f3e9188adf38', '6a3b21382970537f3937612e', '6a32aead6201158ef021b36a',
  '6a3b2139874c41bb0af83e42', '6a3b213aa726b33a60de42fd',
]);

export function metaOcultaNoTerceiroAditivo(meta) {
  const identificador = String(meta?.id || meta?.meta_id || meta?.project_meta_id || '').trim();
  if (IDS_METAS_OCULTAS.has(identificador)) return true;
  const ordem = String(meta?.ordem ?? meta?.numero ?? '').replace(/\D/g, '');
  if (METAS_OCULTAS_TERCEIRO_ADITIVO.has(ordem)) return true;
  const titulo = normalizarTextoMeta(meta?.nome || meta?.label || meta?.meta_nome || meta?.meta_codigo || meta?.titulo || meta?.descricao || '');
  const numeroNoTitulo = titulo.match(/^(?:meta\s*)?0*(\d{1,2})\b/)?.[1] || '';
  return METAS_OCULTAS_TERCEIRO_ADITIVO.has(numeroNoTitulo);
}

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
    CAMPOS_TEXTO_META.map((campo) => meta?.[campo]).filter(Boolean).join(' ')
  );
}

// Metas explicitamente do 1º/2º aditivo a excluir (não pertencem ao relatório atual)
const METAS_EXCLUIDAS_LEGADO = [
  // adicionar aqui apenas se houver marcadores claros de aditivos anteriores
];

export function metaPertenceAo3ou4Aditivo(meta) {
  if (!meta) return false;

  // Verificação por campo numérico explícito
  const numero = Number(meta?.numero_aditivo || meta?.aditivo_numero || meta?.aditivo);
  if (numero === 1 || numero === 2) return false; // excluir explicitamente 1º e 2º
  if (numero === 3 || numero === 4) return true;

  const texto = textoCompletoMeta(meta);

  // Excluir se texto indica 1º ou 2º aditivo explicitamente
  const marcadores1e2 = ['1 aditivo', '1o aditivo', '1º aditivo', 'primeiro aditivo', '2 aditivo', '2o aditivo', '2º aditivo', 'segundo aditivo'];
  if (marcadores1e2.map(normalizarTextoMeta).some(m => texto.includes(m))) return false;

  // Incluir se texto indica 3º ou 4º aditivo
  if ([...MARCADORES_3_ADITIVO, ...MARCADORES_4_ADITIVO].map(normalizarTextoMeta).some(m => texto.includes(m))) return true;

  // Por padrão: todas as metas sem marcador de aditivo anterior são válidas (pertencem ao 3º/4º por convenção do projeto)
  return true;
}

export function filtrarMetas3e4Aditivos(metas) {
  return (Array.isArray(metas) ? metas : [])
    .filter(metaPertenceAo3ou4Aditivo)
    .filter((meta) => !metaOcultaNoTerceiroAditivo(meta));
}

export function idCanonicoMeta(meta) {
  return String(meta?.meta_id || meta?.project_meta_id || meta?.id || meta?.meta_codigo || meta?.codigo || '');
}

export function nomeCanonicoMeta(meta) {
  return meta?.meta_nome || meta?.nome || meta?.titulo || meta?.descricao || meta?.meta_codigo || meta?.codigo || 'Meta';
}