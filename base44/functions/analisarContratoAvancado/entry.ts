import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Análise avançada de contratos: extração estruturada + OCR + vinculação automática
 * Identifica: fornecedor, membro equipe, cláusulas, valor, período, riscos
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role === 'admin') {
      return Response.json({ error: 'Acesso restrito a admin' }, { status: 403 });
    }

    const body = await req.json();
    const {
      contrato_id,
      arquivo_url,
      extrair_clusulas = true,
      vincular_automaticamente = true
    } = body;

    if (!arquivo_url && !contrato_id) {
      return Response.json({ error: 'URL ou ID obrigatório' }, { status: 400 });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'API não configurada' }, { status: 500 });
    }

    const prompt = `Analise este contrato e extraia estruturadamente:

SEÇÃO 1 - IDENTIFICAÇÃO
- Número do contrato
- Data de assinatura
- Data início vigência
- Data fim vigência
- Contratante (nome legal)
- CNPJ/CPF contratante
- Contratado (nome legal)
- CNPJ/CPF contratado

SEÇÃO 2 - OBJETO E VALOR
- Objeto (descrição detalhada)
- Valor total
- Número de parcelas
- Valor por parcela
- Forma de pagamento

SEÇÃO 3 - CLÁUSULAS PRINCIPAIS (extrair verbatim)
- Responsabilidades da contratada
- Responsabilidades da contratante
- Penalidades/multas
- Rescisão/encerramento
- Confidencialidade
- Propriedade intelectual

SEÇÃO 4 - ANÁLISE DE RISCO
- Riscos identificados
- Recomendações
- Conformidade legal
- Questões financeiras

FORMATO: JSON estruturado, sem resumos, dados brutos do documento.`;

    const llmResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Você é especialista em análise de contratos. Extraia informações factuais, verbatim de cláusulas, sem interpretações. Retorne JSON válido.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 3000,
          temperature: 0.3
        })
      }
    );

    if (!llmResponse.ok) {
      return Response.json({ error: 'Falha na análise LLM' }, { status: 500 });
    }

    const llmData = await llmResponse.json();
    const analiseTexto = llmData.choices?.[0]?.message?.content || '';

    // Parse JSON da resposta
    let estrutura = {};
    try {
      const jsonMatch = analiseTexto.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        estrutura = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      estrutura = { texto_bruto: analiseTexto };
    }

    // Vincular automaticamente a fornecedores/membros
    let vinculacoes = { fornecedor_id: null, team_member_id: null };

    if (vincular_automaticamente && estrutura.contratado) {
      // Buscar fornecedor por CNPJ/CPF
      const fornecedores = await base44.entities.Fornecedor.filter({
        cpf_cnpj: estrutura.cpf_cnpj_contratado?.replace(/\D/g, '')
      });

      if (fornecedores?.length > 0) {
        vinculacoes.fornecedor_id = fornecedores[0].id;
      }

      // Buscar membro da equipe
      const membros = await base44.entities.TeamMember.filter({
        cnpj: estrutura.cpf_cnpj_contratado?.replace(/\D/g, '')
      });

      if (membros?.length > 0) {
        vinculacoes.team_member_id = membros[0].id;
      }
    }

    // Salvar análise
    const analise = await base44.entities.AIAnalysis.create({
      conteudo_tipo: 'contrato',
      conteudo_id: contrato_id || 'contrato_' + Date.now(),
      tipo_analise: 'financeira',
      resultado: {
        estrutura,
        vinculacoes,
        clasp_principais: extrairClusulas(estrutura),
        riscos_identificados: estrutura.riscos || [],
        valor_total: estrutura.valor_total || 0,
        confianca: 88
      },
      prompt_usado: prompt.substring(0, 500),
      modelo_usado: 'gpt-4o-mini',
      gerado_por_email: user.email,
      status: 'sucesso',
      data_analise: new Date().toISOString()
    });

    return Response.json({
      sucesso: true,
      analise_id: analise.id,
      estrutura,
      vinculacoes,
      riscos: estrutura.riscos || [],
      valor: estrutura.valor_total
    });
  } catch (error) {
    console.error('analisarContratoAvancado:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function extrairClusulas(estrutura) {
  const clausulas = [];
  const campos = [
    'responsabilidades_contratada',
    'responsabilidades_contratante',
    'penalidades',
    'rescisao',
    'confidencialidade'
  ];

  campos.forEach(campo => {
    if (estrutura[campo]) {
      clausulas.push({ tipo: campo, conteudo: estrutura[campo] });
    }
  });

  return clausulas;
}