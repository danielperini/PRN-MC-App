import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(
    String(value)
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')
  );
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const file_url = body?.file_url;

    if (!file_url) {
      return Response.json({ success: false, error: 'file_url é obrigatório' }, { status: 400 });
    }

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Você está lendo um contrato de prestação de serviços ou documento equivalente.

Extraia apenas o que estiver claramente presente no documento.

Retorne em JSON os campos:
- nome
- cargo
- cpf
- cnpj
- tipo_pessoa (PF ou PJ)
- empresa_nome
- representante_legal_nome
- representante_legal_cpf
- valor_parcela
- numero_parcelas
- vigencia_inicio
- vigencia_fim
- data_assinatura
- objeto_resumo
- banco
- agencia
- conta
- pix_key
- contrato_valido
- campos_com_baixa_confianca
- trechos_base

Regras:
- não inventar
- se não achar, retornar string vazia, 0 ou false
- tipo_pessoa deve ser PF ou PJ
- valor_parcela deve ser numérico
- numero_parcelas deve ser numérico
- contrato_valido deve considerar a vigência final, se estiver clara
- campos_com_baixa_confianca deve listar nomes dos campos duvidosos
- trechos_base deve trazer pequenos trechos que sustentam cada campo encontrado
- responder em português do Brasil`,
      file_urls: [file_url],
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          cargo: { type: 'string' },
          cpf: { type: 'string' },
          cnpj: { type: 'string' },
          tipo_pessoa: { type: 'string' },
          empresa_nome: { type: 'string' },
          representante_legal_nome: { type: 'string' },
          representante_legal_cpf: { type: 'string' },
          valor_parcela: { type: 'number' },
          numero_parcelas: { type: 'number' },
          vigencia_inicio: { type: 'string' },
          vigencia_fim: { type: 'string' },
          data_assinatura: { type: 'string' },
          objeto_resumo: { type: 'string' },
          banco: { type: 'string' },
          agencia: { type: 'string' },
          conta: { type: 'string' },
          pix_key: { type: 'string' },
          contrato_valido: { type: 'boolean' },
          campos_com_baixa_confianca: { type: 'array', items: { type: 'string' } },
          trechos_base: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    });

    const vigenciaFim = String(result?.vigencia_fim || '').trim();
    let contratoValido = Boolean(result?.contrato_valido);

    if (vigenciaFim) {
      const d = new Date(vigenciaFim);
      if (!Number.isNaN(d.getTime())) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        d.setHours(0, 0, 0, 0);
        contratoValido = d >= hoje;
      }
    }

    const payload = {
      nome: String(result?.nome || '').trim(),
      cargo: String(result?.cargo || '').trim(),
      cpf: String(result?.cpf || '').trim(),
      cnpj: String(result?.cnpj || '').trim(),
      tipo_pessoa: String(result?.tipo_pessoa || '').trim() === 'PJ' ? 'PJ' : 'PF',
      empresa_nome: String(result?.empresa_nome || '').trim(),
      representante_legal_nome: String(result?.representante_legal_nome || '').trim(),
      representante_legal_cpf: String(result?.representante_legal_cpf || '').trim(),
      valor_parcela: toNumber(result?.valor_parcela),
      numero_parcelas: toNumber(result?.numero_parcelas),
      vigencia_inicio: String(result?.vigencia_inicio || '').trim(),
      vigencia_fim: vigenciaFim,
      data_assinatura: String(result?.data_assinatura || '').trim(),
      objeto_resumo: String(result?.objeto_resumo || '').trim(),
      banco: String(result?.banco || '').trim(),
      agencia: String(result?.agencia || '').trim(),
      conta: String(result?.conta || '').trim(),
      pix_key: String(result?.pix_key || '').trim(),
      contrato_valido: contratoValido,
      campos_com_baixa_confianca: Array.isArray(result?.campos_com_baixa_confianca)
        ? result.campos_com_baixa_confianca.map(v => String(v || '').trim()).filter(Boolean)
        : [],
      trechos_base:
        result?.trechos_base && typeof result.trechos_base === 'object'
          ? result.trechos_base
          : {},
    };

    return Response.json({ success: true, ...payload });
  } catch (error) {
    console.error('extractTeamContractData error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Erro interno ao processar contrato' },
      { status: 500 }
    );
  }
});