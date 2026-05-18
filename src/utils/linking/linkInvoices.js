import { applyEntityLinks, buildLinkPatch, suggestEntityLinks } from './smartEntityLinker';
import { normalizeInvoiceSource } from './semanticInvoiceMatcher';

export function suggestInvoiceLinks(invoice, datasets = {}, options = {}) {
  return suggestEntityLinks(normalizeInvoiceSource(invoice), datasets, options);
}

export async function applyInvoiceLinks({ invoice, sourceType = 'Attachment', sourceId, datasets, selected, patchExtra } = {}) {
  const source = normalizeInvoiceSource(invoice);
  const suggestions = suggestInvoiceLinks(source, datasets, { minScore: 55 });
  if (!sourceType || !sourceId) return buildLinkPatch(suggestions, selected);
  return applyEntityLinks({ sourceType, sourceId, suggestions, selected, patchExtra });
}

export default suggestInvoiceLinks;
