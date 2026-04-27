/**
 * Backend Security & Validation Utilities
 * Centralized security validations for all backend functions
 */

// ============ CONSTANTS ============
export const SECURITY = {
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024, // 25 MB
  MAX_STRING_LENGTH: 5000,
  MAX_FIELD_LENGTH: 255,
  
  BLOCKED_EXTENSIONS: [
    'exe', 'bat', 'cmd', 'js', 'sh', 'php', 'html', 'htm',
    'asp', 'aspx', 'jsp', 'py', 'rb', 'pl', 'cgi', 'bin',
    'app', 'scr', 'vbs', 'jar', 'dll', 'sys', 'msi', 'dmg'
  ],
  
  ALLOWED_EXTENSIONS: [
    'pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv',
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
    'xml', 'json', 'txt', 'zip', 'rar', '7z'
  ],
  
  SENSITIVE_PATTERNS: {
    cpf: /\d{3}\.\d{3}\.\d{3}-\d{2}/g,
    cnpj: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g,
    bankAccount: /\d{4}-\d{1,2}\s*\d{6,8}-\d{1,2}/g,
    pix: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[\w\.\+\-]+@[\w\.\+\-]+/g,
  }
};

// ============ FILE VALIDATION ============
export function validateFileSize(bytes) {
  if (!bytes || typeof bytes !== 'number') return { valid: false, error: 'Tamanho inválido' };
  if (bytes > SECURITY.MAX_UPLOAD_BYTES) {
    return { valid: false, error: 'Arquivo muito grande. O limite máximo permitido é de 25 MB.' };
  }
  return { valid: true };
}

export function getFileExtension(fileName) {
  if (!fileName) return '';
  const parts = String(fileName).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function validateFileExtension(fileName) {
  const ext = getFileExtension(fileName);
  if (!ext) return { valid: false, error: 'Arquivo sem extensão confiável.' };
  
  if (SECURITY.BLOCKED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: 'Arquivo inválido ou não permitido.' };
  }
  
  // Se temos lista de permitidos, validar contra ela
  if (SECURITY.ALLOWED_EXTENSIONS.length > 0) {
    if (!SECURITY.ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: 'Tipo de arquivo não permitido.' };
    }
  }
  
  return { valid: true, extension: ext };
}

export function sanitizeFileName(fileName) {
  if (!fileName) return 'arquivo_sem_nome';
  
  return String(fileName)
    .replace(/[^\w\s\.\-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/\.$/, '')
    .substring(0, 255)
    .trim() || 'arquivo_sem_nome';
}

// ============ STRING SANITIZATION ============
export function sanitizeString(value, maxLength = SECURITY.MAX_STRING_LENGTH) {
  if (!value) return '';
  const str = String(value).trim();
  return str.substring(0, maxLength);
}

export function sanitizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function sanitizeHTML(text) {
  if (!text) return '';
  return String(text)
    .replace(/[<>\"\'`]/g, (char) => {
      const map = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' };
      return map[char];
    });
}

// ============ DATA PROTECTION ============
export function maskSensitiveData(text) {
  if (!text) return '';
  let result = String(text);
  
  // Mask CPF
  result = result.replace(SECURITY.SENSITIVE_PATTERNS.cpf, 'XXX.XXX.XXX-XX');
  
  // Mask CNPJ
  result = result.replace(SECURITY.SENSITIVE_PATTERNS.cnpj, 'XX.XXX.XXX/XXXX-XX');
  
  // Mask bank account
  result = result.replace(SECURITY.SENSITIVE_PATTERNS.bankAccount, 'XXXX-X XXXXXX-X');
  
  return result;
}

export function stripSensitiveFromLogs(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result = { ...obj };
  const sensitiveKeys = ['cpf', 'cnpj', 'conta_bancaria', 'chave_pix', 'token', 'password', 'api_key'];
  
  sensitiveKeys.forEach(key => {
    if (result[key]) {
      result[key] = '[MASKED]';
    }
  });
  
  return result;
}

// ============ PERMISSION VALIDATION ============
export async function validateUserAuth(base44) {
  try {
    const user = await base44.auth.me();
    if (!user || !user.email) {
      return { valid: false, error: 'Não autenticado.' };
    }
    return { valid: true, user };
  } catch (error) {
    return { valid: false, error: 'Erro ao validar autenticação.' };
  }
}

export function validateUserRole(user, requiredRoles = []) {
  if (!user) return { valid: false, error: 'Usuário não encontrado.' };
  
  const userRole = String(user.role || '').toUpperCase();
  
  if (requiredRoles.length === 0) {
    // Se não há restrição, qualquer user autenticado é válido
    return { valid: true, user };
  }
  
  const normalizedRoles = requiredRoles.map(r => String(r).toUpperCase());
  
  if (!normalizedRoles.includes(userRole)) {
    return { valid: false, error: `Permissão insuficiente. Requer: ${requiredRoles.join(', ')}` };
  }
  
  return { valid: true, user };
}

export function validateOwnership(resourceOwnerId, userId) {
  if (!resourceOwnerId || !userId) {
    return { valid: false, error: 'Dados de propriedade inválidos.' };
  }
  
  if (String(resourceOwnerId).toLowerCase() !== String(userId).toLowerCase()) {
    return { valid: false, error: 'Acesso negado: você não é o proprietário deste recurso.' };
  }
  
  return { valid: true };
}

// ============ AUDIT LOG ============
export async function createAuditLog(base44, data) {
  try {
    if (!base44?.asServiceRole?.entities?.AuditLog) {
      console.warn('AuditLog entity não disponível');
      return null;
    }
    
    const logData = {
      action: sanitizeString(data.action, 50),
      entity_type: sanitizeString(data.entity_type, 50),
      entity_id: sanitizeString(data.entity_id, 50),
      actor_email: sanitizeEmail(data.actor_email),
      actor_name: sanitizeString(data.actor_name, 255),
      previous_status: sanitizeString(data.previous_status, 50),
      new_status: sanitizeString(data.new_status, 50),
      details: sanitizeString(stripSensitiveFromLogs(data.details), 1000),
      created_at: new Date().toISOString()
    };
    
    return await base44.asServiceRole.entities.AuditLog.create(logData);
  } catch (error) {
    console.error('Erro ao criar log de auditoria:', error);
    return null;
  }
}

// ============ IDEMPOTENCY ============
export async function checkIdempotency(base44, key, value) {
  try {
    if (!key || !value) return { executed: false };
    
    // Procurar por chave de idempotência (não implementado ainda)
    // Por enquanto, retornar false para permitir execução
    return { executed: false };
  } catch (error) {
    console.warn('Erro ao verificar idempotência:', error);
    return { executed: false };
  }
}

// ============ RESPONSE FORMAT ============
export function successResponse(data, message = 'Operação realizada com sucesso.') {
  return {
    ok: true,
    message,
    data
  };
}

export function errorResponse(error, code = 'ERROR') {
  return {
    ok: false,
    error: typeof error === 'string' ? error : error?.message || 'Erro desconhecido',
    code
  };
}

// ============ TIMEOUT WRAPPER ============
export async function withTimeout(promise, timeoutMs = 30000) {
  let timeoutHandle;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error('Operação excedeu tempo limite'));
    }, timeoutMs);
  });
  
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ============ DUPLICATE DETECTION (Hash-based) ============
export async function calculateFileHash(content) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Erro ao calcular hash:', error);
    return null;
  }
}

export async function checkDuplicateFile(base44, hash, entityName = 'Attachment') {
  try {
    if (!hash) return { isDuplicate: false };
    
    const entity = base44?.asServiceRole?.entities?.[entityName];
    if (!entity) return { isDuplicate: false };
    
    const results = await entity.filter({ file_hash: hash }, '-created_date', 10);
    
    if (Array.isArray(results) && results.length > 0) {
      return {
        isDuplicate: true,
        existingRecord: results[0],
        message: 'Arquivo duplicado detectado.'
      };
    }
    
    return { isDuplicate: false };
  } catch (error) {
    console.warn('Erro ao verificar duplicatas:', error);
    return { isDuplicate: false };
  }
}

// ============ EXPORT ALL ============
export default {
  SECURITY,
  validateFileSize,
  getFileExtension,
  validateFileExtension,
  sanitizeFileName,
  sanitizeString,
  sanitizeEmail,
  sanitizeHTML,
  maskSensitiveData,
  stripSensitiveFromLogs,
  validateUserAuth,
  validateUserRole,
  validateOwnership,
  createAuditLog,
  checkIdempotency,
  successResponse,
  errorResponse,
  withTimeout,
  calculateFileHash,
  checkDuplicateFile
};