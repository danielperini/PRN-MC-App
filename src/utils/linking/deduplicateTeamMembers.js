import { getDocumentNumber, getPersonName, normalizeEmail, normalizeText, scoreMemberMatch } from './smartEntityLinker';

function keyFor(member = {}) {
  const doc = getDocumentNumber(member);
  if (doc) return `doc:${doc}`;
  const email = normalizeEmail(member.user_email || member.email_pessoal);
  if (email) return `email:${email}`;
  return `name:${normalizeText(getPersonName(member))}`;
}

export function findDuplicateTeamMembers(teamMembers = [], options = {}) {
  const minScore = options.minScore || 82;
  const groups = new Map();
  (Array.isArray(teamMembers) ? teamMembers : []).forEach((member) => {
    const key = keyFor(member);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(member);
  });

  const duplicates = [];
  groups.forEach((items) => {
    if (items.length > 1) duplicates.push({ reason: 'same_key', key: keyFor(items[0]), items });
  });

  for (let i = 0; i < teamMembers.length; i += 1) {
    for (let j = i + 1; j < teamMembers.length; j += 1) {
      const left = teamMembers[i];
      const right = teamMembers[j];
      if (keyFor(left) === keyFor(right)) continue;
      const score = scoreMemberMatch(left, right);
      if (score >= minScore) duplicates.push({ reason: 'semantic_match', score, items: [left, right] });
    }
  }

  return duplicates;
}

export function chooseCanonicalTeamMember(items = []) {
  return [...items].sort((a, b) => {
    const aScore = Number(Boolean(a.user_id)) + Number(Boolean(a.user_email)) + Number(Boolean(a.cpf_cnpj || a.cpf || a.cnpj)) + Number(Boolean(a.numero_contrato));
    const bScore = Number(Boolean(b.user_id)) + Number(Boolean(b.user_email)) + Number(Boolean(b.cpf_cnpj || b.cpf || b.cnpj)) + Number(Boolean(b.numero_contrato));
    return bScore - aScore;
  })[0] || null;
}

export default findDuplicateTeamMembers;
