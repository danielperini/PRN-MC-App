import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role !== 'admin') {
      return Response.json({ error: 'Apenas admins podem atualizar contratos.' }, { status: 403 });
    }

    const { teamMemberId, contractUrl } = await req.json();

    if (!teamMemberId || !contractUrl) {
      return Response.json({ error: 'teamMemberId e contractUrl são obrigatórios.' }, { status: 400 });
    }

    // Buscar membro da equipe
    const member = await base44.asServiceRole.entities.TeamMember.get(teamMemberId);
    if (!member) {
      return Response.json({ error: 'Membro da equipe não encontrado.' }, { status: 404 });
    }

    // Extrair dados do contrato com IA
    const extractResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Leia o contrato PDF anexado e extraia as seguintes informações:
- objeto_contrato (escopo/objetivo do trabalho)
- data_inicio_contrato (formato YYYY-MM-DD)
- data_fim_contrato (formato YYYY-MM-DD)
- numero_parcelas (inteiro)
- valor_parcela (número)
- valor_total (número)
- descricao_contrato (resumo breve do contrato)
- cronograma_parcelas (array com {numero, vencimento (YYYY-MM-DD), valor, descricao})

Se não encontrar algum campo, retorne null.`,
      file_urls: [contractUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          objeto_contrato: { type: 'string' },
          data_inicio_contrato: { type: 'string' },
          data_fim_contrato: { type: 'string' },
          numero_parcelas: { type: 'number' },
          valor_parcela: { type: 'number' },
          valor_total: { type: 'number' },
          descricao_contrato: { type: 'string' },
          cronograma_parcelas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                numero: { type: 'number' },
                vencimento: { type: 'string' },
                valor: { type: 'number' },
                descricao: { type: 'string' },
              },
            },
          },
          observacao: { type: 'string' },
        },
      },
    });

    // Preparar dados para atualização
    const updateData = {
      contrato_url: contractUrl,
      descricao_contrato: extractResult?.descricao_contrato || member.descricao_contrato,
      objeto_contrato: extractResult?.objeto_contrato || member.objeto_contrato,
    };

    if (extractResult?.data_inicio_contrato) {
      updateData.data_inicio_contrato = extractResult.data_inicio_contrato;
    }
    if (extractResult?.data_fim_contrato) {
      updateData.data_fim_contrato = extractResult.data_fim_contrato;
    }
    if (extractResult?.numero_parcelas) {
      updateData.numero_parcelas = extractResult.numero_parcelas;
    }
    if (extractResult?.valor_parcela) {
      updateData.valor_parcela = extractResult.valor_parcela;
    }
    if (extractResult?.valor_total) {
      updateData.valor_total = extractResult.valor_total;
    }
    if (extractResult?.cronograma_parcelas) {
      updateData.cronograma_parcelas = extractResult.cronograma_parcelas;
    }

    // Atualizar membro
    await base44.asServiceRole.entities.TeamMember.update(teamMemberId, updateData);

    return Response.json({
      success: true,
      message: 'Contrato relido e dados atualizados com sucesso.',
      extractedData: extractResult,
      updatedMember: {
        id: member.id,
        user_name: member.user_name,
        ...updateData,
      },
    });
  } catch (error) {
    console.error('Erro ao reler contrato:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});