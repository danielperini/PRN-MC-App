import { applyEntityLinks, buildLinkPatch, suggestEntityLinks } from './smartEntityLinker';

export function normalizeContractSource(contract = {}) {
  return {
    ...contract,
    fornecedor_nome: contract.contratado_nome || contract.user_name || contract.nome || contract.fornecedor_nome || '',
    fornecedor_cpf_cnpj: contract.cpf_cnpj || contract.cpf || contract.cnpj || contract.fornecedor_cpf_cnpj || '',
    descricao_item: contract.objeto_contrato || contract.escopo_descricao || contract.escopo_trabalho || contract.descricao || '',
    numero_contrato: contract.numero_contrato || contract.contract_number || '',
  };
}

export function suggestContractLinks(contract, datasets = {}, options = {}) {
  return suggestEntityLinks(normalizeContractSource(contract), datasets, { minScore: options.minScore || 55 });
}

export async function applyContractLinks({ contract, sourceType = 'TeamMember', sourceId, datasets, selected, patchExtra } = {}) {
  const suggestions = suggestContractLinks(contract, datasets);
  if (!sourceType || !sourceId) return buildLinkPatch(suggestions, selected);
  return applyEntityLinks({ sourceType, sourceId, suggestions, selected, patchExtra });
}

export default suggestContractLinks;
