import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileBase64, mimeType, fileName } = await req.json();

    if (!fileBase64) {
      return Response.json({ error: 'fileBase64 é obrigatório' }, { status: 400 });
    }

    // Converter base64 para Blob e fazer upload para obter file_url
    const byteCharacters = atob(fileBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType || 'application/pdf' });

    const uploadResponse = await base44.integrations.Core.UploadFile({ file: blob });
    const file_url = uploadResponse.file_url;

    if (!file_url) {
      return Response.json({ error: 'Falha ao fazer upload do arquivo' }, { status: 500 });
    }

    const prompt = `Você é um especialista em extração de dados de documentos financeiros. 
Analise este orçamento/proposta e extraia os dados estruturados.
Se um campo não estiver disponível, use null.`;

    const extractedData = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [file_url],
      model: 'gemini_3_pro',
      response_json_schema: {
        type: 'object',
        properties: {
          fornecedor_nome: { type: 'string' },
          fornecedor_cnpj: { type: 'string' },
          fornecedor_contato: { type: 'string' },
          fornecedor_cidade: { type: 'string' },
          descricao_item: { type: 'string' },
          valor_solicitado: { type: 'number' },
          prazo_entrega: { type: 'string' },
          garantia: { type: 'string' },
          condicoes_pagamento: { type: 'string' },
          meios_pagamento: { type: 'string' },
          data_validade: { type: 'string' },
          observacoes: { type: 'string' },
          confianca: { type: 'string' }
        }
      }
    });

    return Response.json({
      success: true,
      data: extractedData,
      fileName,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});