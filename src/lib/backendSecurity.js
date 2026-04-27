// ============================================================================
// BACKEND SECURITY HELPERS — Validações robustas sem quebrar UI
// ============================================================================

export function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

export function toNumber(v) {
  return Number(v) || 0;
}

export function isDuplicate(current, existing) {
  if (!current || !existing) return false;
  
  // TeamPayment duplicate: user_email + mes + ano + nf_numero
  if (current.user_email && existing.user_email) {
    const sameUser = normalizeString(current.user_email) === normalizeString(existing.user_email);
    const sameMes = normalizeString(current.mes_referencia) === normalizeString(existing.mes_referencia);
    const sameAno = toNumber(current.ano) === toNumber(existing.ano);
    
    if (sameUser && sameMes && sameAno) {
      // Se tem NF, deve bater também
      if (current.nf_numero && existing.nf_numero) {
        return normalizeString(current.nf_numero) === normalizeString(existing.nf_numero);
      }
      return true; // Sem NF, considera duplicado
    }
  }
  
  return false;
}

export function validateStatusTransition(oldStatus, newStatus, entityType) {
  const validTransitions = {
    TeamPayment: {
      'RASCUNHO': ['AGUARDANDO_APROVACAO', 'RASCUNHO'],
      'AGUARDANDO_APROVACAO': ['RASCUNHO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO'],
      'APROVADO_COORD': ['PAGO', 'AGUARDANDO_APROVACAO', 'APROVADO_COORD'],
      'PAGO': ['PAGO'],
      'REJEITADO': ['RASCUNHO']
    },
    PurchaseRequest: {
      'RASCUNHO': ['ENVIADO', 'RASCUNHO'],
      'ENVIADO': ['RASCUNHO', 'APROVADO', 'ENVIADO'],
      'APROVADO': ['PAGAMENTO_FEITO', 'APROVADO'],
      'PAGAMENTO_FEITO': ['PAGAMENTO_FEITO'],
      'REJEITADO': ['RASCUNHO']
    },
    DocumentIntake: {
      'ENVIADO': ['ANALISANDO_IA', 'ENVIADO'],
      'ANALISANDO_IA': ['AGUARDANDO_REVISAO', 'RASCUNHO', 'ERRO_PROCESSAMENTO'],
      'AGUARDANDO_REVISAO': ['ENVIADO_APROVACAO', 'RASCUNHO', 'AGUARDANDO_REVISAO'],
      'ENVIADO_APROVACAO': ['APROVADO', 'RASCUNHO'],
      'APROVADO': ['APROVADO'],
      'REJEITADO': ['RASCUNHO'],
      'ERRO_PROCESSAMENTO': ['RASCUNHO']
    }
  };

  const transitions = validTransitions[entityType];
  if (!transitions) return true; // Entidade desconhecida, permite

  const allowed = transitions[oldStatus] || [];
  return allowed.includes(newStatus);
}

export function removeDuplicates(arr, keyFn) {
  if (!Array.isArray(arr)) return [];
  
  const seen = new Set();
  const result = [];

  arr.forEach((item) => {
    const key = keyFn ? keyFn(item) : JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  });

  return result;
}

export function validatePermission(user, action, resource) {
  if (!user) return false;

  // Admin sempre pode
  if (user.role === 'admin') return true;

  // Coordenador pode revisar relatórios/compras
  if (user.role === 'coordenador' && ['review_report', 'approve_purchase'].includes(action)) {
    return true;
  }

  // Profissional pode editar seu próprio relatório
  if (user.role === 'profissional' && action === 'edit_own_report') {
    return resource?.created_by === user.email || resource?.author_email === user.email;
  }

  return false;
}

export function sanitizePayload(payload) {
  const sanitized = { ...payload };

  // Remove campos sensíveis
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  delete sanitized.api_key;

  return sanitized;
}

export function validateRequiredFields(data, requiredFields) {
  const missing = [];

  requiredFields.forEach((field) => {
    if (data[field] === undefined || data[field] === null || String(data[field]).trim() === '') {
      missing.push(field);
    }
  });

  return missing.length === 0 ? null : missing;
}

export function lockStatusFromAI(entity) {
  // Impede que IA deixe status travado em ANALISANDO_IA
  if (entity?.status === 'ANALISANDO_IA') {
    // Se passou 10 minutos, força erro
    const created = new Date(entity.created_date);
    const now = new Date();
    const diffMinutes = (now - created) / 1000 / 60;

    if (diffMinutes > 10) {
      return {
        blocked: true,
        newStatus: 'ERRO_PROCESSAMENTO',
        reason: 'IA timeout - não completou análise em 10 minutos'
      };
    }
  }

  return { blocked: false };
}

export function calculateRubricaBalance(rubrica) {
  if (!rubrica) return null;

  const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
  const utilizado = toNumber(rubrica.valor_utilizado);
  const comprometido = toNumber(rubrica.saldo_comprometido || 0);

  const saldo = total - utilizado - comprometido;

  return {
    total,
    utilizado,
    comprometido,
    saldo,
    isNegative: saldo < -0.01,
    isOverused: utilizado > total
  };
}

export function softDeleteEntity(entity) {
  // Marca como deletado sem remover fisicamente
  return {
    ...entity,
    status_registro: 'REMOVIDO',
    deleted_at: new Date().toISOString(),
    deleted_by_email: null // Será preenchido pela função que chama
  };
}