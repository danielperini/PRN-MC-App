import { applyEntityLinks, buildLinkPatch, suggestEntityLinks } from './smartEntityLinker';

export function suggestPaymentLinks(payment, datasets = {}, options = {}) {
  return suggestEntityLinks(payment, datasets, { minScore: options.minScore || 55 });
}

export async function applyPaymentLinks({ payment, sourceType = 'TeamPayment', sourceId, datasets, selected, patchExtra } = {}) {
  const suggestions = suggestPaymentLinks(payment, datasets);
  if (!sourceType || !sourceId) return buildLinkPatch(suggestions, selected);
  return applyEntityLinks({ sourceType, sourceId, suggestions, selected, patchExtra });
}

export default suggestPaymentLinks;
