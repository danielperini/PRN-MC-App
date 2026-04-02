import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import pdfParse from 'npm:pdf-parse@1.1.1';

function normalizeText(value: string) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

async function extractPdfText(file_url: string) {
  const res = await fetch(file_url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar PDF: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const data = await pdfParse(buffer);
  return normalizeText(data.text || '');
}

function toNumber(value: unknown) {
  if (!value) return 0;
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

    // 🔥 ACEITA AMBOS (FRONT NOVO + ANTIGO)
    const file_url = body?.file_url || body?.contrato_url;

    if (!file_url) {
      return Response.json(
        { success: false, error: 'file_url ou contrato_url é obrigatório' },
        { status: 400 }
      );
    }

    const texto = await extractPdfText(file_url);

    if (!texto) {
      return Response.json(
        { success: false, error: 'Não foi possível extrair texto do contrato' },
        { status: 400 }
      );
    }

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `
Você está lendo um contrato.

Extraia os dados abaixo em JSON.

Regras:
- não inventar
- se não achar: vazio ou 0
- valores numéricos reais

Campos:
nome, cargo, cpf, cnpj, tipo_pessoa,
empresa_nome, representante_legal_nome, representante_legal_cpf,
valor_parcela, numero_parcelas,
vigencia_inicio, vigencia_fim,
data_assinatura,
objeto_resumo,
banco, agencia, conta, pix_key,
contrato_valido,
campos_com_baixa_confianca
`,
      input: texto,
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
          campos_com_baixa_confianca: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    });

    // 🔥 VALIDAÇÃO DE VIGÊNCIA
    let contratoValido = Boolean(result?.contrato_valido);
    const vigenciaFim = String(result?.vigencia_fim || '');

    if (vigenciaFim) {
      const d = new Date(vigenciaFim);
      if (!Number.isNaN(d.getTime())) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        d.setHours(0, 0, 0, 0);
        contratoValido = d >= hoje;
      }
    }

    // 🔥 PADRÃO COMPATÍVEL COM FRONT
    const dados = {
      nome: result?.nome || '',
      cargo: result?.cargo || '',
      cpf: result?.cpf || '',
      cnpj: result?.cnpj || '',
      tipo_pessoa: result?.tipo_pessoa === 'PJ' ? 'PJ' : 'PF',
      empresa_nome: result?.empresa_nome || '',
      representante_legal_nome: result?.representante_legal_nome || '',
      representante_legal_cpf: result?.representante_legal_cpf || '',
      valor_parcela: toNumber(result?.valor_parcela),
      numero_parcelas: toNumber(result?.numero_parcelas),
      vigencia_inicio: result?.vigencia_inicio || '',
      vigencia_fim: vigenciaFim,
      data_assinatura: result?.data_assinatura || '',
      objeto_resumo: result?.objeto_resumo || '',
      banco: result?.banco || '',
      agencia: result?.agencia || '',
      conta: result?.conta || '',
      pix_key: result?.pix_key || '',
      contrato_valido: contratoValido,
      campos_com_baixa_confianca: result?.campos_com_baixa_confianca || [],
    };

    return Response.json({
      success: true,
      dados, // 🔥 IMPORTANTE (FRONT USA ISSO)
    });

  } catch (error: any) {
    console.error('extractTeamContractData error:', error);

    return Response.json(
      {
        success: false,
        error: error?.message || 'Erro ao processar contrato',
      },
      { status: 500 }
    );
  }
});
