import {
  bestMatches,
  getAmount,
  getDocumentNumber,
  getInvoiceNumber,
  getPersonName,
  normalizeText,
  scoreMemberMatch,
  scorePaymentMatch,
} from './smartEntityLinker';

export function normalizeInvoiceSource(source = {}) {
  const ia = source.resultado_ia || source.ia || {};
  return {
    ...source,
    fornecedor_nome: source.fornecedor_nome || ia.nf_emitente_nome || ia.emitente_nome || ia.fornecedor_nome || '',
    fornecedor_cpf_cnpj: source.fornecedor_cpf_cnpj || ia.nf_emitente_cpf_cnpj || ia.emitente_cpf_cnpj || ia.cnpj || '',
    nf_numero: source.nf_numero || ia.nf_numero || ia.numero_nf || '',
    valor_total: source.valor_total || source.valor_solicitado || ia.nf_valor_total || ia.valor_total || ia.valor || 0,
    descricao_item: source.descricao_item || ia.descricao_servico || ia.discriminacao || source.file_name_original || '',
  };
}

export function matchInvoiceToEntities(invoice, datasets = {}, options = {}) {
  const source = normalizeInvoiceSource(invoice);
  const minScore = options.minScore || 55;
  return {
    source,
    invoiceNumber: getInvoiceNumber(source),
    documentNumber: getDocumentNumber(source),
    amount: getAmount(source),
    supplierName: getPersonName(source),
    normalizedDescription: normalizeText(source.descricao_item),
    teamMembers: bestMatches(source, datasets.teamMembers || [], scoreMemberMatch, minScore),
    payments: bestMatches(source, datasets.teamPayments || [], scorePaymentMatch, minScore),
    purchases: bestMatches(source, datasets.purchaseRequests || [], scorePaymentMatch, minScore),
    attachments: bestMatches(source, datasets.attachments || [], scorePaymentMatch, minScore),
  };
}

export default matchInvoiceToEntities;
