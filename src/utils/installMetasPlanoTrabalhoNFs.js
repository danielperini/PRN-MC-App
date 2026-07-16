import { base44 } from '@/api/base44Client';
import { METAS_PROJETO_FALLBACK } from '@/lib/metasProjeto';

const META_ID_FIELDS = [
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

const META_NAME_FIELDS = [
  'meta_nome',
  'nome_meta',
  'meta_titulo',
  'titulo_meta',
  'meta_descricao',
  'descricao_meta',
  'meta_label',
  'meta_texto',
];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function firstValue(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function nestedMeta(item) {
  return [item?.meta, item?.project_meta, item?.meta_projeto, item?.meta_vinculada, item?.goal]
    .find((value) => value && typeof value === 'object') || null;
}

function purchaseMetaId(item) {
  const direct = firstValue(item, META_ID_FIELDS);
  if (direct) return direct;
  const meta = nestedMeta(item);
  return String(meta?.id || meta?.meta_id || meta?.codigo || meta?.meta_codigo || '').trim();
}

function purchaseMetaName(item) {
  const direct = firstValue(item, META_NAME_FIELDS);
  if (direct) return direct;
  const meta = nestedMeta(item);
  return String(meta?.nome || meta?.meta_nome || meta?.titulo || meta?.descricao || meta?.label || '').trim();
}

function projectMetaId(meta) {
  return String(meta?.id || meta?.meta_id || meta?.codigo || meta?.meta_codigo || '').trim();
}

function projectMetaName(meta) {
  return String(meta?.nome || meta?.meta_nome || meta?.titulo || meta?.descricao || meta?.label || '').trim();
}

function hasFiscalDocument(item) {
  return Boolean(
    item?.nf_numero ||
    item?.numero_nf ||
    item?.nota_fiscal_url ||
    item?.nota_fiscal_pdf_url ||
    item?.nf_pdf_url ||
    item?.pdf_url ||
    item?.nota_fiscal_xml_url ||
    item?.nf_xml_url ||
    item?.xml_url ||
    item?.arquivo_original_url ||
    item?.documento_intake_id ||
    item?.intake_id
  );
}

export function installMetasPlanoTrabalhoNFs() {
  const entity = base44.entities?.ProjectMeta;
  const purchaseEntity = base44.entities?.PurchaseRequest;
  if (!entity?.list || !purchaseEntity?.list || entity.__metasPlanoNFsInstalled) return;

  // Impede que metas antigas/genéricas voltem ao seletor quando não vierem do banco.
  if (Array.isArray(METAS_PROJETO_FALLBACK)) METAS_PROJETO_FALLBACK.splice(0, METAS_PROJETO_FALLBACK.length);

  const originalMetaList = entity.list.bind(entity);
  const originalPurchaseList = purchaseEntity.list.bind(purchaseEntity);

  entity.list = async (...args) => {
    const metas = await originalMetaList(...args);
    if (!Array.isArray(metas) || metas.length === 0) return [];

    let purchases = [];
    try {
      purchases = await originalPurchaseList('-created_date', 10000);
    } catch {
      return metas;
    }

    const fiscalPurchases = (Array.isArray(purchases) ? purchases : []).filter(hasFiscalDocument);
    const usedIds = new Set(fiscalPurchases.map(purchaseMetaId).filter(Boolean));
    const usedNames = new Set(fiscalPurchases.map((item) => normalize(purchaseMetaName(item))).filter(Boolean));

    if (usedIds.size === 0 && usedNames.size === 0) return metas;

    const filtered = metas.filter((meta) => {
      const id = projectMetaId(meta);
      const name = normalize(projectMetaName(meta));
      return (id && usedIds.has(id)) || (name && usedNames.has(name));
    });

    return filtered.length > 0 ? filtered : metas;
  };

  entity.__metasPlanoNFsInstalled = true;
}
