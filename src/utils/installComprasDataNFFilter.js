import { base44 } from '@/api/base44Client';

const NF_DATE_FIELDS = [
  'nf_data_emissao',
  'data_nf',
  'data_emissao_nf',
  'nota_fiscal_data_emissao',
  'nf_emissao',
];

function isComprasRoute() {
  return /^\/Compras(?:\/|$)/i.test(window.location.pathname);
}

function getNFDate(purchase) {
  for (const field of NF_DATE_FIELDS) {
    const value = purchase?.[field];
    if (value) return value;
  }
  return null;
}

/**
 * Mantém a página Compras compatível com o filtro legado, que compara
 * `created_date`, mas faz essa comparação pela data de emissão da NF.
 * Fora da rota /Compras, os registros permanecem inalterados.
 */
export function installComprasDataNFFilter() {
  const entity = base44?.entities?.PurchaseRequest;
  if (!entity?.list || entity.__dataNFFilterInstalled) return;

  const originalList = entity.list.bind(entity);

  entity.list = async (...args) => {
    const records = await originalList(...args);
    if (!isComprasRoute() || !Array.isArray(records)) return records;

    return records.map((purchase) => ({
      ...purchase,
      __created_date_original: purchase?.created_date || null,
      created_date: getNFDate(purchase),
    }));
  };

  entity.__dataNFFilterInstalled = true;
}
