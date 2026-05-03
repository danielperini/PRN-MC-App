import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { file_url } = payload;

    if (!file_url) {
      return Response.json({ error: 'file_url é obrigatório' }, { status: 400 });
    }

    // Usar Claude para extrair dados da nota fiscal
    const extractedData = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um especialista em leitura de documentos fiscais. Analise a nota fiscal enviada e extraia os seguintes dados em formato JSON:

{
  "numero_nota": "número da NF",
  "serie": "série",
  "data_emissao": "YYYY-MM-DD",
  "fornecedor_nome": "nome da empresa/pessoa",
  "fornecedor_cpf_cnpj": "CPF ou CNPJ",
  "fornecedor_email": "email se houver",
  "fornecedor_telefone": "telefone se houver",
  "fornecedor_banco": "banco para transferência",
  "fornecedor_agencia": "agência",
  "fornecedor_conta": "conta",
  "fornecedor_pix": "chave PIX se houver",
  "valor_total": número,
  "descricao_servicos": "descrição dos serviços/produtos",
  "categoria_servico": "categoria (audiovisual, design, consultoria, etc)",
  "data_vencimento": "YYYY-MM-DD"
}

Retorne APENAS o JSON válido, sem explicações adicionais.`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          numero_nota: { type: "string" },
          serie: { type: "string" },
          data_emissao: { type: "string" },
          fornecedor_nome: { type: "string" },
          fornecedor_cpf_cnpj: { type: "string" },
          fornecedor_email: { type: "string" },
          fornecedor_telefone: { type: "string" },
          fornecedor_banco: { type: "string" },
          fornecedor_agencia: { type: "string" },
          fornecedor_conta: { type: "string" },
          fornecedor_pix: { type: "string" },
          valor_total: { type: "number" },
          descricao_servicos: { type: "string" },
          categoria_servico: { type: "string" },
          data_vencimento: { type: "string" }
        }
      },
      model: 'gemini_3_1_pro'
    });

    return Response.json({
      status: 'success',
      data: extractedData
    });
  } catch (error) {
    console.error('Erro em extractInvoiceData:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});