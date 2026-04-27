import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

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
    const descricao = safeString(args.descricao);
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
    
    // Validar tamanho do arquivo
    if (bytes.length > MAX_UPLOAD_SIZE_BYTES) {
      console.warn(`Arquivo rejeitado por exceder tamanho máximo: ${fileName} (${bytes.length} bytes)`);
      return Response.json(
        { ok: false, saved: false, error: 'Arquivo muito grande. O limite máximo permitido é de 25 MB.' },
        { status: 400 }
      );
    }
    
    const mimeType = inferMimeType(fileName);

    const uploadResponse = await base44.asServiceRole.integrations.Core.UploadFile({
      file: new Blob([bytes], { type: mimeType }),
    });

    const fileUrl = safeString(uploadResponse?.file_url);

    if (!fileUrl) {
      return Response.json(
        { ok: false, saved: false, error: 'Falha ao gravar arquivo no storage.' },
        { status: 500 }
      );
    }

    const created = await base44.asServiceRole.entities.KnowledgeDocument.create({
      titulo,
      descricao,
      categoria,
      conteudo_extraido: '',
      file_url: fileUrl,
      file_name: fileName,
      ativo: true,
      versao,
      created_by_email: user.email,
    });

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