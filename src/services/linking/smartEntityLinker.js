export * from '@/utils/linking/smartEntityLinker';
export * from '@/utils/linking/linkTeamMemberToUser';
export * from '@/utils/linking/linkPayments';
export * from '@/utils/linking/linkInvoices';
export * from '@/utils/linking/linkContracts';
export * from '@/utils/linking/linkReports';
export * from '@/utils/linking/linkActivities';
export * from '@/utils/linking/semanticInvoiceMatcher';
export * from '@/utils/linking/participantResolver';
export * from '@/utils/linking/deduplicateTeamMembers';

import { applyEntityLinks, loadLinkingDatasets, suggestEntityLinks } from '@/utils/linking/smartEntityLinker';

export async function runSmartEntityLinking({ source, sourceType, sourceId, selected, patchExtra, minScore = 55 } = {}) {
  const datasets = await loadLinkingDatasets();
  const suggestions = suggestEntityLinks(source, datasets, { minScore });
  if (!sourceType || !sourceId) return { suggestions, datasets, patch: null };
  const patch = await applyEntityLinks({ sourceType, sourceId, suggestions, selected, patchExtra });
  return { suggestions, datasets, patch };
}

export default runSmartEntityLinking;
