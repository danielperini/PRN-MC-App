import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function safeString(value: any) {
  return String(value || '').trim();
}

function uniqueStrings(values: any[]) {
  return Array.from(
    new Set(
      (values || [])
        .map((v) => safeString(v))
        .filter(Boolean)
    )
  );
}

function inferCategoria(fileName: string, mimeType: string) {
  const lowerName = safeString(fileName).toLowerCase();
  const lowerMime = safeString(mimeType).toLowerCase();

  if (
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.csv') ||
    lowerMime.includes('spreadsheet') ||
    lowerMime.includes('excel') ||
    lowerMime.includes('csv')
  ) {
    return 'Programação';
  }

  if (lowerMime.includes('pdf')) return 'Documento';
  if (lowerMime.includes('image')) return 'Imagem';

  return 'Biblioteca do Conhecimento';
}

async function tryAutoAnalysis(base44: any, payload: any) {
  const functionCandidates = [
    'analyzeKnowledgeDocument',
    'extractDocumentData',
  ];

  for (const fnName of functionCandidates) {
    try {
      const result = await base44.functions.invoke(fnName, payload);
      return {
        processed: true,
        result: result?.data || result || null,
        function_name: fnName,
      };
    } catch (err) {}
  }

  return {
    processed: false,
    result: null,
    function_name: '',
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const args = body?.args || body || {};

    const fileName = safeString(args?.file_name);
    const mimeType = safeString(args?.mime_type);
    const contentBase64 = safeString(args?.content_base64);

    if (!fileName || !contentBase64) {
      return Response.json({ ok: false, error: 'Arquivo inválido' }, { status: 400 });
    }

    const categoria = inferCategoria(fileName, mimeType);

    // 1. upload storage
    const uploaded = await base44.storage.upload({
      file_name: fileName,
      content_base64: contentBase64,
    });

    const fileUrl = uploaded?.file_url || uploaded?.url;

    if (!fileUrl) {
      throw new Error('Erro ao subir arquivo');
    }

    // 2. salvar na biblioteca
    const doc = await base44.asServiceRole.entities.KnowledgeDocument.create({
      title: fileName,
      file_name: fileName,
      file_url: fileUrl,
      mime_type: mimeType,
      categoria,
      uploaded_by_email: safeString(user.email),
      uploaded_by_id: safeString(user.id),
      status: 'gravado',
      processing_status: 'gravado',
      tags: uniqueStrings(args?.tags || []),
    });

    // 3. IA (opcional)
    const ia = await tryAutoAnalysis(base44, {
      document_id: doc.id,
      file_url: fileUrl,
      file_name: fileName,
    });

    if (ia.processed) {
      await base44.asServiceRole.entities.KnowledgeDocument.update(doc.id, {
        processing_status: 'processado',
        analysis: JSON.stringify(ia.result || {}),
      });
    }

    return Response.json({
      ok: true,
      saved: true,
      id: doc.id,
      file_url: fileUrl,
    });

  } catch (err) {
    console.error(err);

    return Response.json(
      {
        ok: false,
        error: err?.message || 'Erro inesperado',
      },
      { status: 500 }
    );
  }
});
