import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { invokeLLM } from '../_shared/gatewayIA.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { file_url, projeto_config } = await req.json();
    if (!file_url) return Response.json({ error: 'file_url obrigatório' }, { status: 400 });

    const prompt = `Você é um assistente jurídico especializado em contratos de prestação de serviços culturais brasileiros.

Analise o documento em anexo e extraia TODAS as informações relevantes para preencher um Termo de Compromisso de Prestação de Serviço.

Contexto institucional (para verificar divergências):
- Contratante padrão: OSC Viaduto das Artes, CNPJ 16.911.508/0001-81
- Termo de Colaboração padrão: 01-031.069/24-80
- Projeto: ${projeto_config?.nome_projeto || 'Projeto Museus Centro'}

Extraia os seguintes campos e retorne um JSON estruturado:

1. contratado_nome: nome completo ou razão social do contratado/prestador
2. contratado_cpf_cnpj: CPF ou CNPJ do contratado
3. contratado_representante: nome do representante legal (se PJ)
4. contratado_cpf_representante: CPF do representante legal
5. contratado_endereco: endereço completo
6. contratado_telefone: telefone
7. contratado_email: e-mail
8. funcao_projeto: função exercida no projeto (ex: Educadora, Designer, Fotógrafo)
9. objeto: objeto resumido do serviço (1-2 frases)
10. escopo: escopo detalhado das atividades (pode ser texto longo com itens a, b, c...)
11. valor_total: valor total em número (apenas dígitos e ponto/vírgula)
12. detalhamento_valores: detalhamento das parcelas (ex: "2 parcelas de R$ 1.000,00")
13. numero_parcelas: quantidade de parcelas (número inteiro)
14. valor_parcela: valor de cada parcela (número)
15. datas_vencimento: datas de vencimento das parcelas (lista de strings)
16. periodo_execucao: período/vigência do contrato (ex: "janeiro a dezembro/2025" ou "01/01/2025 a 31/12/2025")
17. data_inicio: data de início (formato YYYY-MM-DD se possível)
18. data_fim: data de término (formato YYYY-MM-DD se possível)
19. museu_local: local/museu de execução (MUMO, MIS, MHAB, etc.)
20. banco: nome do banco para pagamento
21. agencia: agência bancária
22. conta: número da conta
23. tipo_conta: tipo de conta (Corrente ou Poupança)
24. pix: chave PIX
25. forma_pagamento: forma de pagamento descrita no documento
26. testemunha1_nome: nome da primeira testemunha
27. testemunha1_cpf: CPF da primeira testemunha
28. testemunha2_nome: nome da segunda testemunha
29. testemunha2_cpf: CPF da segunda testemunha
30. data_assinatura: data de assinatura (formato YYYY-MM-DD se possível)
31. cidade_assinatura: cidade da assinatura
32. clausulas_especiais: objeto com campos booleanos: {direitos_autorais, vinculo_trabalhista, sigilo, lgpd, multa, rescisao, foro} - true se cláusula existe no documento
33. foro: cidade/comarca do foro
34. numero_termo_colaboracao: número do Termo de Colaboração mencionado no documento
35. nome_projeto_documento: nome do projeto mencionado no documento

DIVERGÊNCIAS - verifique e liste:
36. divergencias: array de objetos {campo, valor_documento, valor_padrao, descricao} para cada campo que diverge dos padrões institucionais

Se um campo não for encontrado no documento, retorne null para esse campo.
Retorne APENAS o JSON, sem explicações adicionais.`;

    const resultado = await invokeLLM(base44,{
      prompt,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          contratado_nome: { type: 'string' },
          contratado_cpf_cnpj: { type: 'string' },
          contratado_representante: { type: 'string' },
          contratado_cpf_representante: { type: 'string' },
          contratado_endereco: { type: 'string' },
          contratado_telefone: { type: 'string' },
          contratado_email: { type: 'string' },
          funcao_projeto: { type: 'string' },
          objeto: { type: 'string' },
          escopo: { type: 'string' },
          valor_total: { type: 'string' },
          detalhamento_valores: { type: 'string' },
          numero_parcelas: { type: 'number' },
          valor_parcela: { type: 'number' },
          datas_vencimento: { type: 'array', items: { type: 'string' } },
          periodo_execucao: { type: 'string' },
          data_inicio: { type: 'string' },
          data_fim: { type: 'string' },
          museu_local: { type: 'string' },
          banco: { type: 'string' },
          agencia: { type: 'string' },
          conta: { type: 'string' },
          tipo_conta: { type: 'string' },
          pix: { type: 'string' },
          forma_pagamento: { type: 'string' },
          testemunha1_nome: { type: 'string' },
          testemunha1_cpf: { type: 'string' },
          testemunha2_nome: { type: 'string' },
          testemunha2_cpf: { type: 'string' },
          data_assinatura: { type: 'string' },
          cidade_assinatura: { type: 'string' },
          clausulas_especiais: { type: 'object' },
          foro: { type: 'string' },
          numero_termo_colaboracao: { type: 'string' },
          nome_projeto_documento: { type: 'string' },
          divergencias: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                campo: { type: 'string' },
                valor_documento: { type: 'string' },
                valor_padrao: { type: 'string' },
                descricao: { type: 'string' },
              },
            },
          },
        },
      },
    });

    return Response.json({ success: true, dados: resultado });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});