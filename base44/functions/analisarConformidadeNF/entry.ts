import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { teamPaymentId, file_url, memberId } = await req.json();

  // Buscar dados do membro e do projeto para contexto
  let member = null;
  try {
    if (memberId) {
      member = await base44.asServiceRole.entities.TeamMember.get(memberId);
    }
  } catch {}

  // Dados fixos do projeto Museus Centro / Viaduto das Artes
  const dadosProjeto = {
    cnpj_osc: '23.843.648/0001-25',
    razao_social: 'Viaduto das Artes',
    endereco: 'Avenida Olinto Meireles, 45, Barreiro, Belo Horizonte/MG, CEP 30640-010',
    projeto: 'Museus Centro — Chamamento FMC 001/2024',
    tomador_cnpj: '07.252.975/0001-56',
    tomador_nome: 'Fundação Municipal de Cultura',
  };

  const prompt = `Você é um auditor especializado em compliance de projetos culturais financiados com recursos públicos.

Analise a nota fiscal/documento fornecido e verifique sua conformidade com os dados do projeto abaixo:

=== DADOS DO PROJETO ===
OSC Parceira: ${dadosProjeto.razao_social}
CNPJ OSC: ${dadosProjeto.cnpj_osc}
Endereço OSC: ${dadosProjeto.endereco}
Projeto: ${dadosProjeto.projeto}
Tomador/Contratante: ${dadosProjeto.tomador_nome} — CNPJ ${dadosProjeto.tomador_cnpj}

=== DADOS DO PROFISSIONAL (se pessoa física/jurídica da equipe) ===
Nome: ${member?.nome_completo || member?.nome || 'Não informado'}
Função: ${member?.funcao || 'Não informado'}
CNPJ/CPF: ${member?.cnpj || member?.cpf || 'Não informado'}
Valor mensal previsto: R$ ${member ? (parseFloat(member.valor_total || 0) / Math.max(parseFloat(member.numero_parcelas || 1), 1)).toFixed(2) : 'Não informado'}

=== INSTRUÇÕES ===
Analise os seguintes pontos:
1. TOMADOR: O documento indica corretamente a OSC (Viaduto das Artes / ${dadosProjeto.cnpj_osc}) ou o projeto Museus Centro como contratante/tomador do serviço?
2. VALOR: O valor da nota corresponde ao valor previsto no contrato do profissional?
3. CNPJ/CPF EMITENTE: O CNPJ/CPF do emitente bate com o cadastro do profissional?
4. COMPETÊNCIA: O mês/período de competência está claro e coerente?
5. DESCRIÇÃO DO SERVIÇO: A descrição é compatível com atividades culturais/museológicas e com a função do profissional?
6. DADOS FISCAIS: Há número de NF, data de emissão e código de verificação/autenticação?
7. ENDEREÇO: Se constar endereço do prestador, está coerente?

Para cada ponto verificado, atribua: OK, ATENÇÃO ou CRÍTICO.
Calcule o percentual de conformidade: 100% se todos OK, deduzindo 15% para cada ATENÇÃO e 30% para cada CRÍTICO.

Seja objetivo, específico e use linguagem simples para um coordenador de projeto cultural.`;

  let resultado;
  try {
    resultado = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          percentual_conformidade: { type: 'number', description: '0 a 100' },
          status_geral: { type: 'string', enum: ['CONFORME', 'ATENCAO', 'CRITICO'] },
          resumo: { type: 'string', description: 'Resumo em 1-2 frases para o aprovador' },
          checklist: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ponto: { type: 'string' },
                status: { type: 'string', enum: ['OK', 'ATENCAO', 'CRITICO'] },
                observacao: { type: 'string' },
              },
            },
          },
          duvidas: {
            type: 'array',
            description: 'Lista de dúvidas/problemas que o aprovador deve verificar manualmente',
            items: { type: 'string' },
          },
          valor_extraido: { type: 'number' },
          cnpj_emitente: { type: 'string' },
          razao_social_emitente: { type: 'string' },
          numero_nf: { type: 'string' },
          data_emissao: { type: 'string' },
          competencia: { type: 'string' },
        },
      },
    });
  } catch (e) {
    return Response.json({ error: 'Erro na análise IA: ' + e.message }, { status: 500 });
  }

  // Salvar resultado no TeamPayment se fornecido
  if (teamPaymentId && resultado) {
    try {
      await base44.asServiceRole.entities.TeamPayment.update(teamPaymentId, {
        conformidade_percentual: resultado.percentual_conformidade,
        conformidade_status: resultado.status_geral,
        conformidade_resumo: resultado.resumo,
        conformidade_checklist: JSON.stringify(resultado.checklist || []),
        conformidade_duvidas: JSON.stringify(resultado.duvidas || []),
        nf_numero_extraido: resultado.numero_nf,
        nf_valor_extraido: resultado.valor_extraido,
        nf_cnpj_emitente: resultado.cnpj_emitente,
        nf_razao_social: resultado.razao_social_emitente,
        nf_data_emissao: resultado.data_emissao,
        nf_competencia: resultado.competencia,
      });
    } catch (e) {
      console.error('Erro ao salvar análise:', e.message);
    }
  }

  return Response.json({ ...resultado, ok: true });
});