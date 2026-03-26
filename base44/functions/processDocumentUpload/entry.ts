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

function maybeDetectProgramacao(fileName: string, categoria: string, mimeType: string) {
  const text = `${safeString(fileName)} ${safeString(categoria)} ${safeString(mimeType)}`.toLowerCase();

  return (
    text.includes('programa') ||
    text.includes('agenda') ||
    text.includes('museu') ||
    text.includes('oficina') ||
    text.includes('atividade') ||
    text.includes('xlsx') ||
    text.includes('excel') ||
    text.includes('csv')
  );
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        {
          ok: false,
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
          error: 'file_name é obrigatório.',
        },
        { status: 400 }
      );
    }

    if (!contentBase64) {
      return Response.json(
        {
          ok: false,
          error: 'content_base64 é obrigatório.',
        },
        { status: 400 }
      );
    }

    // 1. grava no storage
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
          error: 'Falha ao gravar arquivo no storage.',
        },
        { status: 500 }
      );
    }

    // 2. cria KnowledgeDocument
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
          error: 'Arquivo gravado, mas falhou ao criar KnowledgeDocument.',
          storage_file_url: fileUrl,
        },
        { status: 500 }
      );
    }

    let iaProcessed = false;
    let iaError = '';
    let iaResult: any = null;

    // 3. análise automática de IA na sequência
    try {
      const functionCandidates = [
        'analyzeKnowledgeDocument',
        'analyzeUploadedDocument',
        'extractKnowledgeFromDocument',
        'extractDocumentData',
        'processKnowledgeDocument',
      ];

      for (const fnName of functionCandidates) {
        try {
          const result = await base44.functions.invoke(fnName, {
            document_id: knowledgeDoc.id,
            knowledge_document_id: knowledgeDoc.id,
            file_url: fileUrl,
            file_name: fileName,
            mime_type: mimeType,
            categoria,
          });

          iaProcessed = true;
          iaResult = result?.data || result || null;
          break;
        } catch (err) {
          iaError = err instanceof Error ? err.message : 'Falha na análise automática.';
        }
      }

      // 4. se parecer programação, tenta sincronizar Programacao
      if (maybeDetectProgramacao(fileName, categoria, mimeType)) {
        try {
          await base44.functions.invoke('syncProgramacao');
        } catch (err) {
          console.error('Falha no syncProgramacao após upload:', err);
        }
      }

      // 5. atualiza status do KnowledgeDocument após tentativa de IA
      await base44.asServiceRole.entities.KnowledgeDocument.update(knowledgeDoc.id, {
        processing_status: iaProcessed ? 'processado' : 'gravado',
        status: iaProcessed ? 'processado' : 'gravado',
        analysis: iaResult ? JSON.stringify(iaResult) : '',
        summary: iaProcessed
          ? 'Documento gravado e analisado automaticamente por IA.'
          : 'Documento gravado com sucesso. Análise automática não concluída.',
      });
    } catch (err) {
      console.error('Erro ao atualizar pós-processamento:', err);
    }

    return Response.json({
      ok: true,
      saved: true,
      success: true,
      message: iaProcessed
        ? 'Arquivo gravado com sucesso e análise automática concluída.'
        : 'Arquivo gravado com sucesso.',
      knowledge_document_id: knowledgeDoc.id,
      storage_file_url: fileUrl,
      ia_processed: iaProcessed,
      ia_error: iaProcessed ? '' : iaError,
      item: {
        id: knowledgeDoc.id,
        title: knowledgeDoc.title,
        file_name: knowledgeDoc.file_name,
        file_url: fileUrl,
        categoria: knowledgeDoc.categoria,
        processing_status: iaProcessed ? 'processado' : 'gravado',
      },
    });
  } catch (error) {
    console.error('Erro em processDocumentUpload:', error);

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro inesperado ao gravar documento.',
      },
      { status: 500 }
    );
  }
});
