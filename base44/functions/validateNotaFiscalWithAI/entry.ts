import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { intake_id, resultado_ia, tipo_detectado, arquivo_url } = await req.json();

    if (!intake_id || !resultado_ia) {
      return Response.json({ error: 'intake_id e resultado_ia obrigatórios' }, { status: 400 });
    }

    const inconsistencias = [];
    const avisos = [];

    // 1. Validar se XML é obrigatório para NF-e
    if (tipo_detectado === 'NOTA_FISCAL_PDF') {
      avisos.push('⚠️ Apenas PDF de NF foi enviado. Para auditoria correta e validação fiscal, é recomendado enviar também o arquivo XML da NF-e (obrigatório legalmente).');
    }

    // 2. Analisar com IA se há problemas comuns
    const ia_analysis = await base44.integrations.Core.InvokeLLM({
      prompt: `Analise esta nota fiscal para detectar problemas comuns. Responda em JSON com os campos: 
      {
        "requer_xml": boolean,
        "inconsistencias_detectadas": string[],
        "avisos": string[],
        "duplicada_suspeita": boolean,
        "motivo_suspeita": string,
        "compatibilidade_ok": boolean,
        "recomendacoes": string[]
      }

      Dados da NF recebida:
      - Número: ${resultado_ia.nf_numero || 'não informado'}
      - Emitente: ${resultado_ia.nf_emitente_nome || 'não informado'}
      - CNPJ Emitente: ${resultado_ia.nf_emitente_cpf_cnpj || 'não informado'}
      - Valor: ${resultado_ia.nf_valor_total || 'não informado'}
      - Data Emissão: ${resultado_ia.nf_data_emissao || 'não informado'}
      - Descrição: ${resultado_ia.descricao_servico || 'não informado'}
      - Tipo detectado: ${tipo_detectado}

      Procure por:
      1. Divergências entre DANFE (PDF) e dados esperados do XML
      2. Valores arredondados ou inconsistentes
      3. Datas futuras ou muito antigas (>5 anos)
      4. CNPJ/CPF inválido ou suspeito
      5. Descrição genérica ou sem detalhes
      6. Evidências de duplicação (mesmo fornecedor, valor similar, data próxima)
      7. Incompatibilidade de categoria vs. descrição`,
      response_json_schema: {
        type: 'object',
        properties: {
          requer_xml: { type: 'boolean' },
          inconsistencias_detectadas: {
            type: 'array',
            items: { type: 'string' }
          },
          avisos: {
            type: 'array',
            items: { type: 'string' }
          },
          duplicada_suspeita: { type: 'boolean' },
          motivo_suspeita: { type: 'string' },
          compatibilidade_ok: { type: 'boolean' },
          recomendacoes: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['requer_xml', 'inconsistencias_detectadas', 'avisos', 'compatibilidade_ok']
      }
    });

    // 3. Compilar todos os problemas
    if (ia_analysis.requer_xml && tipo_detectado !== 'NOTA_FISCAL_XML') {
      inconsistencias.push('❌ OBRIGATÓRIO: Esta NF-e requer o arquivo XML para validação fiscal completa. PDF sozinho é insuficiente legalmente.');
    }

    if (ia_analysis.inconsistencias_detectadas?.length > 0) {
      inconsistencias.push(...ia_analysis.inconsistencias_detectadas);
    }

    if (ia_analysis.avisos?.length > 0) {
      avisos.push(...ia_analysis.avisos);
    }

    if (ia_analysis.duplicada_suspeita) {
      inconsistencias.push(`⚠️ SUSPEITA DE DUPLICAÇÃO: ${ia_analysis.motivo_suspeita || 'Padrão similar a NF anterior detectado'}`);
    }

    if (!ia_analysis.compatibilidade_ok) {
      inconsistencias.push('⚠️ Incompatibilidade entre tipo de serviço e descrição fornecida.');
    }

    // 4. Atualizar DocumentIntake com análise
    await base44.entities.DocumentIntake.update(intake_id, {
      erros_validacao: inconsistencias,
      resultado_ia: {
        ...resultado_ia,
        validacao_ia: ia_analysis,
        analise_data: new Date().toISOString(),
        recomendacoes: ia_analysis.recomendacoes || []
      }
    });

    return Response.json({
      success: true,
      inconsistencias,
      avisos,
      analise: ia_analysis,
      requer_acao: inconsistencias.length > 0
    });

  } catch (error) {
    console.error('Erro na validação com IA:', error);
    return Response.json(
      { error: error.message || 'Erro ao validar com IA' },
      { status: 500 }
    );
  }
});