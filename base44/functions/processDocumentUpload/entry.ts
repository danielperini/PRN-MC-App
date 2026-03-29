import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function s(value: unknown): string {
  return String(value ?? '').trim();
}

function categoriaValida(input: string): string {
  const permitidas = [
    'Contrato',
    'Plano de Trabalho',
    'Manual',
    'Meta',
    'Relatório',
    'Outro',
  ];

  return permitidas.includes(input) ? input : 'Outro';
}

function inferirCategoria(fileName: string): string {
  const nome = s(fileName).toLowerCase();

  if (nome.endsWith('.pdf')) return 'Relatório';
  if (nome.endsWith('.doc') || nome.endsWith('.docx')) return 'Manual';
  return 'Outro';
}

function montarTitulo(fileName: string, tituloInformado?: string): string {
  const titulo = s(tituloInformado);
  if (titulo) return titulo;

  const nome = s(fileName);
  return nome.replace(/\.[^/.]+$/, '') || 'Documento sem título';
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
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

    const fileName = s(args.file_name);
    const contentBase64 = s(args.content_base64);
    const titulo = montarTitulo(fileName, args.titulo);
    const descricao = s(args.descricao);
    const versao = s(args.versao);
    const categoria = categoriaValida(s(args.categoria) || inferirCategoria(fileName));

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