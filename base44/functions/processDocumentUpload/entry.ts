import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function safeString(value: unknown): string {
  return String(value ?? '').trim();
}

function inferCategoria(fileName: string): string {
  const lower = safeString(fileName).toLowerCase();

  if (lower.endsWith('.pdf')) return 'Relatório';
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return 'Manual';
  if (lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.csv')) return 'Outro';

  return 'Outro';
}

function buildTitulo(fileName: string, providedTitle?: string): string {
  const cleanProvided = safeString(providedTitle);
  if (cleanProvided) return cleanProvided;

  const cleanFileName = safeString(fileName);
  return cleanFileName.replace(/\.[^/.]+$/, '') || 'Documento sem título';
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        {
          ok: false,
          saved: false,
          error: 'Não autenticado.',
        },
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
    const categoriaInformada = safeString(args.categoria);
    const versao = safeString(args.versao);

    if (!fileName) {
      return Response.json(
        {
          ok: false,
          saved: false,
          error: 'file_name é obrigatório.',
        },
        { status: 400 }
      );
    }

    if (!contentBase64) {
      return Response.json(
        {
          ok: false,
          saved: false,
          error: 'content_base64 é obrigatório.',
        },
        { status: 400 }
      );
    }

    const categoria = categoriaInformada || inferCategoria(fileName);

    const uploaded = await base44.storage.upload({
      file_name: fileName,
      content_base64: contentBase64,
    });

    const fileUrl = safeString(uploaded?.file_url || uploaded?.url);

    if (!fileUrl) {
      return Response.json(
        {
          ok: false,
          saved: false,
          error: 'Falha ao gravar arquivo no storage.',
        },
        { status: 500 }
      );
    }

    const payload = {
      titulo,
      descricao,
      categoria,
      conteudo_extraido: '',
      file_url: fileUrl,
      file_name: fileName,
      ativo: true,
      versao,
    };

    const created = await base44.asServiceRole.entities.KnowledgeDocument.create(payload);

    if (!created?.id) {
      return Response.json(
        {
          ok: false,
          saved: false,
          error: 'Arquivo enviado ao storage, mas falhou ao gravar registro no banco.',
          storage_file_url: fileUrl,
        },
        { status: 500 }
      );
    }

    const persisted = await base44.asServiceRole.entities.KnowledgeDocument.get(created.id);

    if (!persisted?.id) {
      return Response.json(
        {
          ok: false,
          saved: false,
          error: 'Registro não pôde ser confirmado após a gravação no banco.',
          storage_file_url: fileUrl,
        },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      saved: true,
      success: true,
      message: 'Arquivo gravado com sucesso no storage e no banco de dados.',
      item: persisted,
    });
  } catch (error) {
    console.error('Erro em processDocumentUpload:', error);

    return Response.json(
      {
        ok: false,
        saved: false,
        error: error instanceof Error
          ? error.message
          : 'Erro inesperado ao gravar documento.',
      },
      { status: 500 }
    );
  }
});
