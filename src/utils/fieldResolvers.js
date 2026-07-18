/**
 * fieldResolvers.js
 * Módulo canônico de resolução de campos com múltiplos aliases.
 * Extraído de sincronizarRelatorioExecucao.js para ser compartilhado por todos os módulos.
 * NÃO contém chamadas de API — funções puras.
 */

export const CAMPOS_PUBLICO = [
  'publico_total',
  'total_publico',
  'publico_realizado',
  'publico_presente',
  'quantidade_publico',
  'participantes',
  'visitantes',
  'presentes',
  'attendance_count',
  'total_participantes',
];

export const CAMPOS_DATA = [
  'data',
  'data_atividade',
  'data_inicio',
  'start_date',
  'created_date',
];

export const CAMPOS_META_ID = [
  'meta_id',
  'project_meta_id',
  'meta_projeto_id',
  'metaProjetoId',
  'projectMetaId',
  'goal_id',
  'project_goal_id',
  'meta_codigo',
  'codigo_meta',
  'metaId',
  'meta_vinculada_id',
];

export const CAMPOS_META_NOME = [
  'meta_nome',
  'nome_meta',
  'meta_titulo',
  'titulo_meta',
  'meta_descricao',
  'descricao_meta',
  'meta_label',
  'meta_texto',
  'meta',
  'meta_vinculada',
];

export const CAMPOS_FOTO = [
  'file_url',
  'foto_url',
  'image_url',
  'url',
  'arquivo_url',
  'photo_url',
  'media_url',
];

export const CAMPOS_VALOR = [
  'valor_pago',
  'valor_aprovado_admin',
  'valor_aprovado',
  'valor_final',
  'valor_solicitado',
  'valor_total',
  'valor',
  'nf_valor_total',
];

/**
 * Retorna o primeiro campo não-nulo/vazio de um objeto dentre a lista dada.
 */
export function primeiroCampo(item, campos) {
  for (const campo of campos) {
    const value = item?.[campo];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

/**
 * Resolve o público de uma atividade/registro, varrendo CAMPOS_PUBLICO + listas de presença.
 */
export function resolvePublico(item) {
  for (const campo of CAMPOS_PUBLICO) {
    const value = item?.[campo];
    if (Array.isArray(value)) return value.length;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (Array.isArray(item?.lista_presenca)) return item.lista_presenca.length;
  if (Array.isArray(item?.participantes_lista)) return item.participantes_lista.length;
  return 0;
}

/**
 * Resolve o valor financeiro de uma compra/rubrica, varrendo CAMPOS_VALOR.
 */
export function resolveValor(item) {
  const raw = primeiroCampo(item, CAMPOS_VALOR) ?? 0;
  if (typeof raw === 'string') {
    const parsed = Number(raw.replace(/[R$\s.]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Resolve o ID de meta de um item, varrendo CAMPOS_META_ID e objetos aninhados.
 */
export function resolveMetaId(item) {
  const direto = primeiroCampo(item, CAMPOS_META_ID);
  if (direto != null && direto !== '') return String(direto).trim();
  const meta = _resolveMetaObjeto(item);
  const id = meta && (meta.id || meta.meta_id || meta.codigo || meta.meta_codigo);
  return id ? String(id).trim() : '';
}

/**
 * Resolve o nome de meta de um item, varrendo CAMPOS_META_NOME e objetos aninhados.
 */
export function resolveMetaNome(item) {
  for (const campo of CAMPOS_META_NOME) {
    const value = item?.[campo];
    if (typeof value === 'string' || typeof value === 'number') {
      const s = String(value).trim();
      if (s) return s;
    }
  }
  const meta = _resolveMetaObjeto(item);
  if (meta?.nome) return String(meta.nome).trim();
  return String(item?.rubrica_nome || item?.item_despesa || item?.descricao_meta || item?.natureza_despesa_nome || '').trim();
}

/**
 * Resolve a data ISO (YYYY-MM-DD) de um item, varrendo CAMPOS_DATA.
 */
export function resolveData(item) {
  const value = primeiroCampo(item, CAMPOS_DATA);
  if (!value) return '';
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/**
 * Resolve a URL de foto/imagem de um item, varrendo CAMPOS_FOTO.
 */
export function resolveFotoUrl(item) {
  return primeiroCampo(item, CAMPOS_FOTO) || '';
}

// --- interno ---
function _resolveMetaObjeto(item) {
  return [
    item?.meta,
    item?.project_meta,
    item?.meta_projeto,
    item?.meta_vinculada,
    item?.goal,
    item?.project_goal,
    item?.rubrica?.meta,
    item?.rubrica_objeto?.meta,
  ].find((v) => v && typeof v === 'object') || null;
}