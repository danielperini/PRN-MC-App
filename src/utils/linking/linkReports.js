import { applyEntityLinks, buildLinkPatch, suggestEntityLinks } from './smartEntityLinker';
import { resolveParticipants } from './participantResolver';

export function suggestReportLinks(report, datasets = {}, options = {}) {
  const participants = resolveParticipants(report?.participantes || report?.participants || report?.equipe_atividade || [], datasets, options);
  const suggestions = suggestEntityLinks(report, datasets, { minScore: options.minScore || 50 });
  return { ...suggestions, participants };
}

export async function applyReportLinks({ report, sourceType = 'Report', sourceId, datasets, selected, patchExtra } = {}) {
  const suggestions = suggestReportLinks(report, datasets);
  const participants = suggestions.participants || [];
  const extra = {
    participantes_resolvidos: participants,
    team_member_ids: participants.map(p => p.team_member_id).filter(Boolean),
    linked_user_ids: participants.map(p => p.user_id).filter(Boolean),
    ...patchExtra,
  };
  if (!sourceType || !sourceId) return { ...buildLinkPatch(suggestions, selected), ...extra };
  return applyEntityLinks({ sourceType, sourceId, suggestions, selected, patchExtra: extra });
}

export default suggestReportLinks;
