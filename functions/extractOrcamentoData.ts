import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

async function callClaude(prompt, fileBase64, mimeType) {
  const imageData = {
    type: 'base64',
    media_type: mimeType === 'application/pdf' ? 'application/pdf' : 'image/jpeg',
    data: fileBase64,
  };

  const response = await fetch('https://api.anthropic.com/v1/messages/create', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-1',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: imageData,
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  return data.content[0].text;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileBase64, mimeType, fileName } = await req.json();

    const prompt = `Você é um especialista em extração de dados de documentos financeiros. 
Analise este orçamento/proposta e extraia os seguintes dados em formato JSON:

{
  "fornecedor_nome": "nome da empresa",
  "fornecedor_cnpj": "CNPJ se disponível",
  "fornecedor_contato": "email ou telefone",
  "fornecedor_cidade": "cidade do fornecedor",
  "descricao_item": "descrição do que está sendo orçado",
  "valor_solicitado": número (valor total),
  "prazo_entrega": "prazo em dias ou data",
  "garantia": "período de garantia se mencionado",
  "condicoes_pagamento": "condições mencionadas",
  "meios_pagamento": "meios aceitos",
  "data_validade": "data de validade da proposta se mencionada",
  "observacoes": "outras informações relevantes",
  "confianca": "high/medium/low - seu nível de confiança na extração"
}

Retorne APENAS o JSON, sem explicações. Se um campo não estiver disponível, use null.`;

    const extractedText = await callClaude(prompt, fileBase64, mimeType);
    
    let extractedData = {};
    try {
      extractedData = JSON.parse(extractedText);
    } catch {
      extractedData = { erro: 'Não foi possível extrair dados', confianca: 'low' };
    }

    return Response.json({
      success: true,
      data: extractedData,
      fileName,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});