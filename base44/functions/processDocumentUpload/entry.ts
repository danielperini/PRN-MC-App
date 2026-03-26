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
    'analyzeUploadedDocument',
    'extractKnowledgeFromDocument',
    'extractDocumentData',
    'processKnowledgeDocument',
  ];

  for (const fnName of functionCandidates) {
    try {
      const result = await base44.functions.invoke(fnName, payload);
      return {
        processed: true,
        result: result?.data || result || null,
        error: '',
        function_name: fnName,
      };
    } catch (_) {
      // tenta a próxima
    }
  }

  return {
    processed: false,
    result: null,
    error: 'Nenhuma function de análise automática disponível ou bem-sucedida.',
    function_name: '',
  };
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

    const body =
      req.method === 'POST'
        ? await req.json().catch(() => ({}))
        : {};

    const args = body?.args || body || {};

    const fileName = safeString(args?.file_name);
    const mimeType = safeString(args?.mime_type);
    const contentBase64 = safeString(args?.content_base64);
    const titulo =
      safeString(args?.titulo) ||
      fileName.replace(/\.[^/.]+$/, '');
    const categoria =
      safeString(args?.categoria) ||
      inferCategoria(fileName, mimeType);

    const descricao = safeString(args?.descricao);
    const tags = uniqueStrings(args?.tags || []);
    const sizeBytes = Number(args?.size_bytes || 0);

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

    const uploaded = await base44.storage.upload({
      file_name: fileName,
      content_base64: contentBase64,
    });

    const fileUrl =
      uploaded?.file_url ||
      uploaded?.url ||
      '';

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

    const knowledgePayload = {
      title: titulo,
      name: titulo,
      file_name: fileName,
      file_url: fileUrl,
      mime_type: mimeType,
      categoria,
      descricao,
      tags,
      size_bytes: sizeBytes,
      uploaded_by_email: safeString(user?.email),
      created_by_email: safeString(user?.email),
      uploaded_by_id: safeString(user?.id),
      created_by_id: safeString(user?.id),
      status: 'gravado',
      processing_status: 'gravado',
      summary: '',
      extracted_text: '',
      analysis: '',
    };

    const knowledgeDoc =
      await base44.asServiceRole.entities.KnowledgeDocument.create(knowledgePayload);

    if (!knowledgeDoc?.id) {
      return Response.json(
        {
          ok: false,
          saved: false,
          error: 'Arquivo gravado no storage, mas falhou ao criar KnowledgeDocument.',
          storage_file_url: fileUrl,
        },
        { status: 500 }
      );
    }

    const persisted = await base44.asServiceRole.entities.KnowledgeDocument.get(knowledgeDoc.id);

    if (!persisted?.id) {
      return Response.json(
        {
          ok: false,
          saved: false,
          error: 'KnowledgeDocument não pôde ser confirmado após a gravação.',
          storage_file_url: fileUrl,
        },
        { status: 500 }
      );
    }

    const analysisPayload = {
      document_id: knowledgeDoc.id,
      knowledge_document_id: knowledgeDoc.id,
      file_url: fileUrl,
      file_name: fileName,
      mime_type: mimeType,
      categoria,
    };

    const ia = await tryAutoAnalysis(base44, analysisPayload);

    const finalStatus = ia.processed ? 'processado' : 'gravado';
    const finalSummary = ia.processed
      ? 'Documento gravado e analisado automaticamente por IA.'
      : 'Documento gravado com sucesso. A análise automática não foi concluída.';

    await base44.asServiceRole.entities.KnowledgeDocument.update(knowledgeDoc.id, {
      processing_status: finalStatus,
      status: finalStatus,
      analysis: ia.result ? JSON.stringify(ia.result) : '',
      summary: finalSummary,
    });

    return Response.json({
      ok: true,
      saved: true,
      success: true,
      message: ia.processed
        ? 'Arquivo gravado com sucesso e análise automática concluída.'
        : 'Arquivo gravado com sucesso.',
      knowledge_document_id: knowledgeDoc.id,
      storage_file_url: fileUrl,
      ia_processed: ia.processed,
      ia_error: ia.processed ? '' : ia.error,
      analysis_function: ia.function_name,
      item: {
        id: knowledgeDoc.id,
        title: titulo,
        file_name: fileName,
        file_url: fileUrl,
        categoria,
        processing_status: finalStatus,
      },
    });
  } catch (error) {
    console.error('Erro em processDocumentUpload:', error);

    return Response.json(
      {
        ok: false,
        saved: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro inesperado ao gravar documento.',
      },
      { status: 500 }
    );
  }
});
