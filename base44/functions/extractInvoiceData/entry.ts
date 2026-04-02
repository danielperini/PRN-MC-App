import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { file_url } = payload;

    if (!file_url) {
      return Response.json({ error: 'file_url é obrigatório' }, { status: 400 });
    }

    const extractedData = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um especialista em extração de dados de documentos fiscais. Analise o documento e extraia TODOS os dados disponíveis em JSON:

{
  "numero_nf": "número da nota fiscal",
  "serie": "série da NF",
  "data_emissao": "YYYY-MM-DD",
  "valor": número,
  "fornecedor_nome": "nome completo da empresa/pessoa",
  "fornecedor_cpf_cnpj": "CPF ou CNPJ (apenas dígitos)",
  "fornecedor_banco": "nome do banco (ex: Itaú, Bradesco, Nubank, etc)",
  "fornecedor_agencia": "número da agência",
  "fornecedor_conta": "número da conta",
  "fornecedor_pix": "chave PIX (email, CPF, CNPJ ou aleatória se encontrada)",
  "fornecedor_email": "email de contato",
  "fornecedor_telefone": "telefone",
  "descricao_servicos": "descrição dos serviços prestados",
  "data_vencimento": "YYYY-MM-DD"
}

Se os dados bancários estiverem descritos dentro do documento fiscal, extraia-os. Retorne APENAS o JSON válido.`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          numero_nf: { type: "string" },
          serie: { type: "string" },
          data_emissao: { type: "string" },
          valor: { type: "number" },
          fornecedor_nome: { type: "string" },
          fornecedor_cpf_cnpj: { type: "string" },
          fornecedor_banco: { type: "string" },
          fornecedor_agencia: { type: "string" },
          fornecedor_conta: { type: "string" },
          fornecedor_pix: { type: "string" },
          fornecedor_email: { type: "string" },
          fornecedor_telefone: { type: "string" },
          descricao_servicos: { type: "string" },
          data_vencimento: { type: "string" }
        }
      },
      model: 'gemini_3_pro'
    });

    try {
      const user = await base44.auth.me();
      if (user?.email) {
        const members = await base44.asServiceRole.entities.TeamMember.filter({ user_email: user.email });
        const member = Array.isArray(members) ? members[0] : null;
        
        if (member?.id && extractedData) {
          const update = {};
          if (extractedData.fornecedor_banco && !member.banco) {
            update.banco = extractedData.fornecedor_banco;
          }
          if (extractedData.fornecedor_agencia && !member.agencia) {
            update.agencia = extractedData.fornecedor_agencia;
          }
          if (extractedData.fornecedor_conta && !member.conta) {
            update.conta = extractedData.fornecedor_conta;
          }
          if (extractedData.fornecedor_pix && !member.pix_key) {
            update.pix_key = extractedData.fornecedor_pix;
          }
          if (extractedData.fornecedor_cpf_cnpj) {
            const digits = String(extractedData.fornecedor_cpf_cnpj).replace(/\D/g, '');
            if (digits.length === 11 && !member.cpf) {
              update.cpf = digits;
            } else if (digits.length === 14 && !member.cnpj) {
              update.cnpj = digits;
            }
          }
          
          if (Object.keys(update).length > 0) {
            await base44.asServiceRole.entities.TeamMember.update(member.id, update);
          }
        }
      }
    } catch (e) {
      console.warn('Falha ao sincronizar dados bancários extraídos:', e);
    }

    return Response.json({
      status: 'success',
      data: extractedData
    });
  } catch (error) {
    console.error('Erro em extractInvoiceData:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});