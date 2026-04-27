import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

// Security utilities (inline — backend functions don't support imports)
const BLOCKED_EXTENSIONS = ['exe', 'bat', 'cmd', 'js', 'sh', 'php', 'html', 'htm', 'asp', 'aspx', 'jsp'];

function validateFileSize(bytes) {
  if (bytes > MAX_UPLOAD_SIZE_BYTES) {
    return { valid: false, error: 'Arquivo muito grande. O limite máximo permitido é de 25 MB.' };
  }
  return { valid: true };
}

function getFileExtension(fileName) {
  const parts = String(fileName).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function validateFileExtension(fileName) {
  const ext = getFileExtension(fileName);
  if (!ext) return { valid: false, error: 'Arquivo sem extensão confiável.' };
  if (BLOCKED_EXTENSIONS.includes(ext)) return { valid: false, error: 'Arquivo inválido ou não permitido.' };
  return { valid: true, extension: ext };
}

function sanitizeString(value, maxLength = 5000) {
  if (!value) return '';
  return String(value).trim().substring(0, maxLength);
}

function safeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeCategoria(input: string): string {
  const allowed = [
    'Contrato',
    'Plano de Trabalho',
    'Manual',
    'Meta',
    'Relatório',
    'Outro',
  ];

  const value = safeString(input);
  return allowed.includes(value) ? value : 'Outro';
}

function inferCategoria(fileName: string): string {
  const lower = safeString(fileName).toLowerCase();

  if (lower.endsWith('.pdf')) return 'Relatório';
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return 'Manual';
  return 'Outro';
}

function buildTitulo(fileName: string, providedTitle?: string): string {
  const cleanProvided = safeString(providedTitle);
  if (cleanProvided) return cleanProvided;

  const cleanFileName = safeString(fileName);
  return cleanFileName.replace(/\.[^/.]+$/, '') || 'Documento sem título';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function inferMimeType(fileName: string): string {
  const lower = safeString(fileName).toLowerCase();

  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';

  return 'application/octet-stream';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { ok: false, saved: false, error: 'Não autenticado.' },
        { status: 401 }
      );
    }

    const body = req.method === 'POST'
      ? await req.json().catch(() => ({}))
      : {};

    const args = body?.args || body || {};

    const fileName = safeString(args.file_name);
    const contentBase64 = safeString(args.content_base64);
    const titulo = buildTitulo(fileName, args.titulo);
    const descricao = sanitizeString(safeString(args.descricao), 1000);
    const versao = safeString(args.versao);
    const categoria = normalizeCategoria(
      safeString(args.categoria) || inferCategoria(fileName)
    );

    if (!fileName) {
      return Response.json(
        { ok: false, saved: false, error: 'file_name é obrigatório.' },
        { status: 400 }
      );
    }

    if (!contentBase64) {
      return Response.json(
        { ok: false, saved: false, error: 'content_base64 é obrigatório.' },
        { status: 400 }
      );
    }

    const bytes = base64ToUint8Array(contentBase64);
    
    // 1. VALIDAR TAMANHO
    const sizeValidation = validateFileSize(bytes.length);
    if (!sizeValidation.valid) {
      console.warn(`Arquivo rejeitado: ${fileName} (${bytes.length} bytes)`);
      return Response.json(
        { ok: false, saved: false, error: sizeValidation.error },
        { status: 400 }
      );
    }
    
    // 2. VALIDAR EXTENSÃO
    const extValidation = validateFileExtension(fileName);
    if (!extValidation.valid) {
      console.warn(`Extensão bloqueada: ${fileName}`);
      return Response.json(
        { ok: false, saved: false, error: extValidation.error },
        { status: 400 }
      );
    }
    
    const mimeType = inferMimeType(fileName);

    const uploadResponse = await base44.asServiceRole.integrations.Core.UploadFile({
      file: new Blob([bytes], { type: mimeType }),
    });

    const fileUrl = safeString(uploadResponse?.file_url);
    const grupoUploadId = `grupo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (!fileUrl) {
      return Response.json(
        { ok: false, saved: false, error: 'Falha ao gravar arquivo no storage.' },
        { status: 500 }
      );
    }

    // 3. CRIAR REGISTRO NO BANCO
    const created = await base44.asServiceRole.entities.KnowledgeDocument.create({
      titulo,
      descricao: sanitizeString(descricao, 1000),
      categoria,
      conteudo_extraido: '',
      file_url: fileUrl,
      file_name: fileName,
      ativo: true,
      versao,
      created_by_email: user.email,
    });

    // 4. REGISTRAR LOG DE AUDITORIA
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'UPLOAD',
        entity_type: 'KNOWLEDGE_DOCUMENT',
        entity_id: created.id || '',
        actor_email: user.email,
        actor_name: user.full_name || user.name || '',
        details: `Documento salvo: ${fileName} (${bytes.length} bytes)`,
        created_at: new Date().toISOString()
      });
    } catch (logError) {
      console.error('Erro ao registrar log de auditoria:', logError);
      // Não bloquear upload se log falhar
    }

    return Response.json({
      ok: true,
      saved: true,
      item: created,
    });
  } catch (error) {
    console.error('processDocumentUpload error:', error);

    return Response.json(
      {
        ok: false,
        saved: false,
        error: error instanceof Error ? error.message : 'Erro inesperado.',
      },
      { status: 500 }
    );
  }
});