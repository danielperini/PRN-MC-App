import { base44 } from '@/api/base44Client';
import { normalizeEmail, scoreUserMatch } from './smartEntityLinker';

async function audit(payload) {
  try {
    if (base44.entities.EntityLinkAuditLog?.create) {
      await base44.entities.EntityLinkAuditLog.create(payload);
      return;
    }
    await base44.entities.AuditLog?.create?.({
      action: payload.action,
      entity_type: 'TeamMember',
      entity_id: payload.team_member_id,
      details: payload.details,
      metadata: payload,
    });
  } catch (error) {
    console.warn('Falha ao auditar vínculo de usuário e membro:', error);
  }
}

export function findUserForTeamMember(member = {}, users = []) {
  return (Array.isArray(users) ? users : [])
    .map((user) => ({ user, score: scoreUserMatch(member, user) }))
    .filter((item) => item.score >= 60)
    .sort((a, b) => b.score - a.score)[0] || null;
}

export async function linkTeamMemberToUser(member, user, actor = null) {
  if (!member?.id || !user?.id) return null;
  const patch = {
    possui_usuario: true,
    user_id: user.id,
    user_email: normalizeEmail(user.email || user.user_email),
    managed_by_user_id: member.managed_by_user_id || user.id,
    managed_by_user_email: normalizeEmail(member.managed_by_user_email || user.email || user.user_email),
    entity_linked_at: new Date().toISOString(),
  };
  await base44.entities.TeamMember.update(member.id, patch);
  await audit({
    action: 'TEAM_MEMBER_USER_LINKED',
    team_member_id: member.id,
    user_id: user.id,
    actor_email: normalizeEmail(actor?.email),
    details: `Membro ${member.user_name || member.nome || member.id} vinculado ao usuário ${patch.user_email}`,
    patch,
    created_at: new Date().toISOString(),
  });
  return patch;
}

export default linkTeamMemberToUser;
