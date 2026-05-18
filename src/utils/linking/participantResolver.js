import { getPersonName, normalizeEmail, normalizeText, scoreMemberMatch, scoreUserMatch } from './smartEntityLinker';

export function normalizeParticipant(participant = {}) {
  if (typeof participant === 'string') {
    return { name: participant, type: 'external', source: participant };
  }
  return {
    ...participant,
    name: participant.name || participant.nome || participant.user_name || participant.full_name || participant.email || '',
    email: normalizeEmail(participant.email || participant.user_email),
    type: participant.type || participant.tipo || 'participant',
  };
}

export function resolveParticipant(participant, datasets = {}, options = {}) {
  const normalized = normalizeParticipant(participant);
  const minScore = options.minScore || 50;
  const member = (datasets.teamMembers || [])
    .map((candidate) => ({ entity: candidate, score: scoreMemberMatch(normalized, candidate) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)[0];
  const user = (datasets.users || [])
    .map((candidate) => ({ entity: candidate, score: scoreUserMatch(normalized, candidate) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)[0];

  if (member && (!user || member.score >= user.score)) {
    return {
      ...normalized,
      type: 'team_member',
      team_member_id: member.entity.id,
      team_member_name: getPersonName(member.entity),
      user_id: member.entity.user_id || '',
      user_email: normalizeEmail(member.entity.user_email),
      confidence: member.score,
    };
  }

  if (user) {
    return {
      ...normalized,
      type: 'user',
      user_id: user.entity.id,
      user_email: normalizeEmail(user.entity.email || user.entity.user_email),
      confidence: user.score,
    };
  }

  return {
    ...normalized,
    type: normalized.type === 'participant' ? 'external' : normalized.type,
    normalized_name: normalizeText(normalized.name),
    confidence: 0,
  };
}

export function resolveParticipants(participants = [], datasets = {}, options = {}) {
  return (Array.isArray(participants) ? participants : []).map((participant) => resolveParticipant(participant, datasets, options));
}

export default resolveParticipants;
