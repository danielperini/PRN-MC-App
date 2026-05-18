import { normalizeText, normalizeEmail, onlyDigits } from '@/utils/linking/smartEntityLinker';

export function normalizeParticipantName(value) {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

export function splitParticipantName(nomeCompleto = '') {
  const parts = String(nomeCompleto || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return {
    primeiro_nome: parts[0] || '',
    sobrenome: parts.slice(1).join(' '),
  };
}

export function participantIdentityKey(participant = {}) {
  const doc = onlyDigits(participant.cpf || participant.passaporte || participant.documento);
  if (doc) return `doc:${doc}`;
  const email = normalizeEmail(participant.email);
  if (email) return `email:${email}`;
  const phone = onlyDigits(participant.telefone);
  if (phone.length >= 8) return `tel:${phone}`;
  return `nome:${normalizeParticipantName(participant.nome_completo || participant.nome || participant.name)}`;
}

export function presenceIdentityKey(presence = {}) {
  const participant = presence.participant_id || participantIdentityKey(presence);
  const activity = presence.activity_id || presence.atividade_id || presence.oficina_id || normalizeText(presence.atividade_nome || presence.oficina_nome || 'sem-atividade');
  const date = String(presence.data || presence.data_presenca || '').slice(0, 10);
  return `${participant}|${activity}|${date}`;
}

export function findDuplicateParticipants(candidate = {}, participants = []) {
  const candidateKey = participantIdentityKey(candidate);
  return (Array.isArray(participants) ? participants : [])
    .map((participant) => {
      const sameKey = participantIdentityKey(participant) === candidateKey;
      const sameName = normalizeParticipantName(participant.nome_completo || participant.nome) === normalizeParticipantName(candidate.nome_completo || candidate.nome);
      const samePhone = onlyDigits(participant.telefone).length >= 8 && onlyDigits(participant.telefone) === onlyDigits(candidate.telefone);
      return { participant, score: sameKey ? 100 : sameName && samePhone ? 85 : sameName ? 65 : 0 };
    })
    .filter((item) => item.score >= 65)
    .sort((a, b) => b.score - a.score);
}

export function deduplicateParticipants(participants = []) {
  const map = new Map();
  (Array.isArray(participants) ? participants : []).forEach((participant) => {
    const key = participantIdentityKey(participant);
    const current = map.get(key);
    if (!current) {
      map.set(key, participant);
      return;
    }
    const currentScore = Number(Boolean(current.cpf || current.passaporte)) + Number(Boolean(current.email)) + Number(Boolean(current.telefone));
    const nextScore = Number(Boolean(participant.cpf || participant.passaporte)) + Number(Boolean(participant.email)) + Number(Boolean(participant.telefone));
    if (nextScore > currentScore) map.set(key, participant);
  });
  return Array.from(map.values());
}

export function deduplicatePresenceRecords(records = []) {
  const map = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const key = presenceIdentityKey(record);
    if (!map.has(key)) map.set(key, record);
  });
  return Array.from(map.values());
}

export default deduplicateParticipants;
