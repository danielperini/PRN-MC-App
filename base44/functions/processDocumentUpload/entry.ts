import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    const uploaded = await base44.storage.upload({
      file_name: fileName,
      content_base64: contentBase64,
    });

    const fileUrl = safeString(uploaded?.file_url);

    if (!fileUrl) {
      return Response.json(
        { ok: false, saved: false, error: 'Falha ao gravar arquivo no storage.' },
        { status: 500 }
      );
    }

    const created = await base44.entities.KnowledgeDocument.create({
      titulo,
      descricao,
      categoria,
      conteudo_extraido: '',
      file_url: fileUrl,
      file_name: fileName,
      ativo: true,
      versao,
    });

    return Response.json({
      ok: true,
      saved: true,
      item: created,
    });
  } catch (error) {
    console.error('Erro em processDocumentUpload:', error);

    return Response.json(
      {
        ok: false,
        saved: false,
        error: error instanceof Error ? error.message : 'Erro inesperado.',
      },
      { status: 500 }
    );
  }
});      return Response.json(
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

    const uploaded = await base44.storage.upload({
      file_name: fileName,
      content_base64: contentBase64,
    });

    const fileUrl = s(uploaded?.file_url || uploaded?.url);

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
    });

    if (!created?.id) {
      return Response.json(
        {
          ok: false,
          saved: false,
          error: 'Falha ao criar registro em KnowledgeDocument.',
        },
        { status: 500 }
      );
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
