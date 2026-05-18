import { base44 } from '@/api/base44Client';

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s@.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEmail(value) {
  return String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, '').trim().toLowerCase();
}

export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function toMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || '').trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(cleaned.replace(',', '.')) || 0;
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length > 2));
}

function tokenScore(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  left.forEach((token) => {
    if (right.has(token)) common += 1;
  });
  return common / Math.max(left.size, right.size);
}

export function getPersonName(entity = {}) {
  return entity.user_name || entity.full_name || entity.nome || entity.name || entity.fornecedor_nome || entity.nf_emitente_nome || entity.linked_emitente || '';
}

export function getDocumentNumber(entity = {}) {
  return onlyDigits(
    entity.cpf_cnpj ||
      entity.cpf ||
      entity.cnpj ||
      entity.fornecedor_cpf_cnpj ||
      entity.fornecedor_cnpj ||
      entity.nf_emitente_cpf_cnpj ||
      entity.linked_cpf_cnpj ||
      entity.resultado_ia?.nf_emitente_cpf_cnpj ||
      entity.resultado_ia?.fornecedor_cpf_cnpj
  );
}

export function getInvoiceNumber(entity = {}) {
  return onlyDigits(entity.nf_numero || entity.numero_nf || entity.linked_nf_numero || entity.resultado_ia?.nf_numero || '');
}

export function getAmount(entity = {}) {
  return toMoney(
    entity.valor_nf ||
      entity.valor_total ||
      entity.valor ||
      entity.valor_solicitado ||
      entity.nf_valor_total ||
      entity.resultado_ia?.nf_valor_total ||
      entity.resultado_ia?.valor_total ||
      entity.resultado_ia?.valor
  );
}

export function scoreMemberMatch(source = {}, member = {}) {
  let score = 0;
  const sourceDoc = getDocumentNumber(source);
  const memberDoc = getDocumentNumber(member);
  if (sourceDoc && memberDoc && sourceDoc === memberDoc) score += 70;

  const sourceName = getPersonName(source) || source.resultado_ia?.nf_emitente_nome || source.file_name_original;
  const memberName = getPersonName(member);
  const nameScore = tokenScore(sourceName, memberName);
  score += Math.round(nameScore * 35);

  const sourceEmail = normalizeEmail(source.user_email || source.created_by || source.solicitante_email || source.responsavel_email);
  const memberEmail = normalizeEmail(member.user_email || member.email_pessoal);
  if (sourceEmail && memberEmail && sourceEmail === memberEmail) score += 25;

  const sourceCost = normalizeText(source.centro_custo || source.museu || source.museu_projeto);
  const memberCost = normalizeText(member.centro_custo || member.museu || member.museu_projeto);
  if (sourceCost && memberCost && (sourceCost.includes(memberCost) || memberCost.includes(sourceCost))) score += 8;

  return Math.min(score, 100);
}

export function scoreUserMatch(source = {}, user = {}) {
  let score = 0;
  const sourceEmail = normalizeEmail(source.user_email || source.created_by || source.solicitante_email || source.responsavel_email || source.email);
  const userEmail = normalizeEmail(user.email || user.user_email);
  if (sourceEmail && userEmail && sourceEmail === userEmail) score += 85;
  score += Math.round(tokenScore(getPersonName(source), getPersonName(user)) * 25);
  return Math.min(score, 100);
}

export function scorePaymentMatch(source = {}, payment = {}) {
  let score = 0;
  const sourceMember = source.team_member_id || source.member_id;
  const paymentMember = payment.team_member_id || payment.member_id;
  if (sourceMember && paymentMember && sourceMember === paymentMember) score += 60;

  const sourceNF = getInvoiceNumber(source);
  const paymentNF = getInvoiceNumber(payment);
  if (sourceNF && paymentNF && sourceNF === paymentNF) score += 55;

  const sourceAmount = getAmount(source);
  const paymentAmount = getAmount(payment);
  if (sourceAmount > 0 && paymentAmount > 0 && Math.abs(sourceAmount - paymentAmount) < 0.02) score += 25;

  score += Math.round(tokenScore(getPersonName(source), getPersonName(payment)) * 20);
  return Math.min(score, 100);
}

export function bestMatches(source, candidates = [], scorer, minScore = 55, limit = 5) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({ entity: candidate, score: scorer(source, candidate) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function suggestEntityLinks(source = {}, datasets = {}, options = {}) {
  const minScore = options.minScore || 55;
  const teamMembers = bestMatches(source, datasets.teamMembers || [], scoreMemberMatch, minScore);
  const users = bestMatches(source, datasets.users || [], scoreUserMatch, minScore);
  const teamPayments = bestMatches(source, datasets.teamPayments || [], scorePaymentMatch, minScore);
  const purchaseRequests = bestMatches(source, datasets.purchaseRequests || [], scorePaymentMatch, minScore);
  const attachments = bestMatches(source, datasets.attachments || [], scorePaymentMatch, minScore);
  const reports = bestMatches(source, datasets.reports || [], (a, b) => Math.round(tokenScore(getPersonName(a), [b.author_name, b.created_by, b.user_email, b.equipe].filter(Boolean).join(' ')) * 100), minScore);

  return {
    source,
    confidence: Math.max(
      teamMembers[0]?.score || 0,
      users[0]?.score || 0,
      teamPayments[0]?.score || 0,
      purchaseRequests[0]?.score || 0,
      attachments[0]?.score || 0,
      reports[0]?.score || 0
    ),
    teamMembers,
    users,
    teamPayments,
    purchaseRequests,
    attachments,
    reports,
  };
}

async function auditLink(payload) {
  try {
    if (base44.entities.EntityLinkAuditLog?.create) {
      await base44.entities.EntityLinkAuditLog.create(payload);
      return;
    }
    await base44.entities.AuditLog?.create?.({
      action: payload.action || 'ENTITY_LINK',
      entity_type: payload.source_type || 'EntityLink',
      entity_id: payload.source_id || payload.target_id || '',
      details: payload.details || 'Vínculo automático de entidades',
      metadata: payload,
    });
  } catch (error) {
    console.warn('Auditoria de vínculo não registrada:', error);
  }
}

export function buildLinkPatch(suggestions = {}, selected = {}) {
  const member = selected.teamMember || suggestions.teamMembers?.[0]?.entity || null;
  const user = selected.user || suggestions.users?.[0]?.entity || null;
  const payment = selected.teamPayment || suggestions.teamPayments?.[0]?.entity || null;
  const purchase = selected.purchaseRequest || suggestions.purchaseRequests?.[0]?.entity || null;
  const attachment = selected.attachment || suggestions.attachments?.[0]?.entity || null;

  return {
    team_member_id: member?.id || '',
    team_member_name: getPersonName(member),
    membro_equipe_id: member?.id || '',
    membro_equipe_nome: getPersonName(member),
    linked_user_id: user?.id || member?.user_id || '',
    linked_user_email: normalizeEmail(user?.email || member?.user_email || ''),
    managed_by_user_id: member?.managed_by_user_id || '',
    team_payment_id: payment?.id || '',
    purchase_request_id: purchase?.id || '',
    source_attachment_id: attachment?.id || '',
    linked_nf_numero: getInvoiceNumber(suggestions.source || attachment || purchase || payment),
    linked_cpf_cnpj: getDocumentNumber(suggestions.source || member || purchase || payment),
    entity_link_confidence: suggestions.confidence || 0,
    entity_linked_at: new Date().toISOString(),
  };
}

export async function applyEntityLinks({ sourceType, sourceId, suggestions, selected = {}, patchExtra = {} } = {}) {
  if (!sourceType || !sourceId || !suggestions) return null;
  const patch = { ...buildLinkPatch(suggestions, selected), ...patchExtra };
  const entity = base44.entities?.[sourceType];
  if (!entity?.update) return patch;
  await entity.update(sourceId, patch);
  await auditLink({
    action: 'ENTITY_LINK_APPLIED',
    source_type: sourceType,
    source_id: sourceId,
    target_id: patch.team_member_id || patch.purchase_request_id || patch.team_payment_id || '',
    confidence: patch.entity_link_confidence,
    patch,
    details: `Vínculo aplicado em ${sourceType}`,
    created_at: new Date().toISOString(),
  });
  return patch;
}

export async function createTeamMemberFromSource(source = {}, currentUser = null) {
  const name = getPersonName(source) || source.resultado_ia?.nf_emitente_nome || source.file_name_original || 'Membro sem nome';
  const cpfCnpj = getDocumentNumber(source);
  const tipoPessoa = cpfCnpj.length > 11 ? 'MEI' : 'PF';
  const payload = {
    user_name: name,
    possui_usuario: false,
    user_email: '',
    user_id: '',
    managed_by_user_id: currentUser?.id || '',
    managed_by_user_email: normalizeEmail(currentUser?.email),
    funcao: source.funcao || source.role || 'Prestador(a) de Serviço',
    role: source.funcao || source.role || 'Prestador(a) de Serviço',
    cpf: tipoPessoa === 'PF' ? cpfCnpj : '',
    cnpj: tipoPessoa !== 'PF' ? cpfCnpj : '',
    cpf_cnpj: cpfCnpj,
    tipo_pessoa: tipoPessoa,
    museu_projeto: source.museu || source.centro_custo || 'Geral',
    centro_custo: source.centro_custo || source.museu || 'Geral',
    status: 'ATIVO',
    origem: 'entity_link_dialog',
    created_from_document_id: source.id || '',
  };

  const created = await base44.entities.TeamMember.create(payload);
  await auditLink({
    action: 'TEAM_MEMBER_CREATED_FROM_SOURCE',
    source_type: source.__entityType || 'Source',
    source_id: source.id || '',
    target_id: created?.id || '',
    details: `Membro criado a partir de ${source.__entityType || 'documento'}`,
    payload,
    created_at: new Date().toISOString(),
  });
  return created;
}

export async function loadLinkingDatasets() {
  const safe = async (entityName, order = '-updated_date', limit = 1000) => {
    try {
      const entity = base44.entities?.[entityName];
      if (!entity?.list) return [];
      const data = await entity.list(order, limit);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const [teamMembers, users, teamPayments, purchaseRequests, attachments, reports] = await Promise.all([
    safe('TeamMember', '-updated_date', 1000),
    safe('User', '-updated_date', 1000),
    safe('TeamPayment', '-created_date', 1000),
    safe('PurchaseRequest', '-created_date', 1000),
    safe('Attachment', '-created_date', 1500),
    safe('Report', '-created_date', 1000),
  ]);

  return { teamMembers, users, teamPayments, purchaseRequests, attachments, reports };
}
