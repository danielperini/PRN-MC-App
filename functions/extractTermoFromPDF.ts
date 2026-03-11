import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_url } = await req.json();

    if (!file_url) {
      return Response.json({ error: 'file_url é obrigatório' }, { status: 400 });
    }

    // Schema para extração de dados do PDF
    const schema = {
      type: 'object',
      properties: {
        contratado_nome: { type: 'string' },
        contratado_cpf: { type: 'string' },
        contratado_cnpj: { type: 'string' },
        contratado_email: { type: 'string' },
        contratado_telefone: { type: 'string' },
        contratado_endereco: { type: 'string' },
        contratado_banco: { type: 'string' },
        contratado_agencia: { type: 'string' },
        contratado_conta: { type: 'string' },
        tipo_conta: { type: 'string' },
        pix_key: { type: 'string' },
        objeto: { type: 'string' },
        escopo: { type: 'string' },
        data_inicio: { type: 'string' },
        data_fim: { type: 'string' },
        valor_total: { type: 'number' },
        numero_parcelas: { type: 'number' },
        valor_parcela: { type: 'number' },
        forma_pagamento: { type: 'string' },
        nota_fiscal_numero: { type: 'string' },
        nota_fiscal_data: { type: 'string' },
        local_execucao: { type: 'string' },
        representante_legal_nome: { type: 'string' },
        representante_legal_cpf: { type: 'string' }
      }
    };

    // Extrair dados do PDF
    const extractResponse = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: schema
    });

    if (extractResponse.status === 'error') {
      return Response.json({
        status: 'error',
        message: extractResponse.details || 'Erro ao extrair dados do PDF',
        output: null
      });
    }

    return Response.json({
      status: 'success',
      output: extractResponse.output || {},
      file_url
    });
  } catch (error) {
    console.error('Erro na extração:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});