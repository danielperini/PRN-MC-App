import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function formatBRL(v) {
  const n = Number(v) || 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const {
      file_url, mes_referencia, ano, numero_nf,
      valor_esperado, member_snapshot, descricao_modelo,
    } = payload || {};

    if (!file_url) return Response.json({ error: 'file_url obrigatório' }, { status: 400 });

    const member = member_snapshot || {};
    const isPJ = String(member.tipo_pessoa || 'PF').toUpperCase() === 'PJ';
    const docLabel = isPJ ? `CNPJ: ${member.cnpj || 'não informado'}` : `CPF: ${member.cpf || 'não informado'}`;

    const prompt = `Você é um auditor especializado em conformidade de notas fiscais de projetos culturais públicos.

Analise a nota fiscal (PDF) e verifique se está em conformidade com os dados abaixo:

=== DADOS DO PROJETO ===
Projeto: Museus Centro — Termo de Colaboração 01-031.069/24-80
Contratante (OSC): Viaduto das Artes — CNPJ 23.843.648/0001-25
Competência esperada: ${mes_referencia || '-'}/${ano || '-'}
Valor esperado da parcela: ${formatBRL(valor_esperado)}
Número da NF informado: ${numero_nf || 'Não informado'}

=== DADOS DO PRESTADOR ===
Nome: ${member.user_name || 'Não informado'}
Função: ${member.funcao || 'Não informado'}
${docLabel}
Banco: ${member.banco || '-'} | Agência: ${member.agencia || '-'} | Conta: ${member.conta || '-'}
PIX: ${member.pix_key || '-'}

=== MODELO DE DESCRIÇÃO ESPERADO ===
${descricao_modelo || 'Não fornecido'}

=== CHECKLIST DE VERIFICAÇÃO ===
1. O valor da nota bate com o valor esperado da parcela? (tolerância de R$ 1,00)
2. O emitente (nome/CNPJ/CPF) corresponde ao prestador cadastrado?
3. A competência (mês/ano) da nota bate com ${mes_referencia}/${ano}?
4. A descrição menciona "Museus Centro" e/ou o Termo de Colaboração 01-031.069/24-80?
5. Os dados bancários (banco, agência, conta, PIX) estão presentes e coerentes?
6. A nota tem número, data de emissão e código de verificação?
7. Há algum dado incoerente que impeça o pagamento?

Seja objetivo e direto. Use linguagem simples para um gestor cultural não contábil.
Se houver problemas críticos (valor errado, emitente errado, competência errada), sinalize can_submit=false.
Se forem apenas alertas menores, can_submit=true com warnings.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          can_submit: { type: 'boolean', description: 'true se pode prosseguir com envio, false se há problemas críticos' },
          status: { type: 'string', enum: ['OK', 'ATENCAO', 'CRITICO'] },
          summary: { type: 'string', description: 'Resumo em 1-2 frases' },
          warnings: { type: 'array', items: { type: 'string' }, description: 'Alertas não bloqueantes' },
          critical_issues: { type: 'array', items: { type: 'string' }, description: 'Problemas que impedem o envio' },
          valor_encontrado: { type: 'number' },
          numero_nf_encontrado: { type: 'string' },
          emitente_encontrado: { type: 'string' },
          competencia_encontrada: { type: 'string' },
        },
      },
    });

    return Response.json({ ...result, ok: true });
  } catch (error) {
    // Em caso de erro na IA, não bloqueia o envio
    return Response.json({
      can_submit: true,
      status: 'ATENCAO',
      summary: 'Não foi possível realizar a análise automática. Revise manualmente.',
      warnings: ['Análise automática indisponível: ' + error.message],
      critical_issues: [],
      ok: false,
    });
  }
});