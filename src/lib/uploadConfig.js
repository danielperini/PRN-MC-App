/**
 * Configuração global para limites de upload
 * Único ponto de verdade para validações em frontend e backend
 */

export const UPLOAD_CONFIG = {
  MAX_SIZE_MB: 25,
  MAX_SIZE_BYTES: 25 * 1024 * 1024,
  
  // Mensagens padronizadas
  MESSAGES: {
    FILE_TOO_LARGE: 'Arquivo muito grande. O limite máximo permitido é de 25 MB.',
    FILE_UPLOAD_SUCCESS: 'Arquivo enviado com sucesso.',
    FILES_UPLOAD_SUCCESS: 'Arquivos enviados com sucesso.',
    FILE_SAVED_AI_FAILED: 'Arquivo salvo com sucesso, mas a análise automática não foi concluída.',
    FILE_SAVED_BACKUP_FAILED: 'Arquivo salvo no sistema, mas houve falha no backup externo.',
  },

  // Tipos MIME aceitos
  ACCEPTED_TYPES: {
    pdf: 'application/pdf',
    xml: ['text/xml', 'application/xml'],
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    docx: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ],
    excel: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },

  // Extensões aceitas
  ACCEPTED_EXTENSIONS: ['.pdf', '.xml', '.jpg', '.jpeg', '.png', '.webp', '.xls', '.xlsx', '.doc', '.docx'],
};

/**
 * Validar tamanho de arquivo em bytes
 */
export function isFileSizeValid(sizeBytes) {
  return sizeBytes <= UPLOAD_CONFIG.MAX_SIZE_BYTES;
}

/**
 * Formatar tamanho de arquivo para leitura humana
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validar arquivo individual
 */
export function validateFile(file) {
  const errors = [];

  if (!file) {
    errors.push('Arquivo inválido.');
    return { valid: false, errors };
  }

  // Validar tamanho
  if (!isFileSizeValid(file.size)) {
    errors.push(UPLOAD_CONFIG.MESSAGES.FILE_TOO_LARGE);
  }

  // Validar extensão (mais confiável que MIME type, que pode vir como octet-stream no Windows)
  const nameLower = file.name.toLowerCase();
  const hasValidExtension = UPLOAD_CONFIG.ACCEPTED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
  if (!hasValidExtension) {
    errors.push(`Tipo de arquivo não suportado. Use: ${UPLOAD_CONFIG.ACCEPTED_EXTENSIONS.join(', ')}`);
  }

  return { 
    valid: errors.length === 0, 
    errors,
    size: formatFileSize(file.size)
  };
}

/**
 * Validar múltiplos arquivos
 * Retorna lista de arquivos válidos e mensagens de erro
 */
export function validateFiles(files) {
  const valid = [];
  const invalid = [];

  Array.from(files).forEach((file) => {
    const validation = validateFile(file);
    if (validation.valid) {
      valid.push(file);
    } else {
      invalid.push({
        name: file.name,
        errors: validation.errors,
      });
    }
  });

  return { valid, invalid };
}