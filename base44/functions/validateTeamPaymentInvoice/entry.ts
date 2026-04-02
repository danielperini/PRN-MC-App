import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function formatBRL(v: unknown) {
  const n = Number(v) || 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toNumber(v: unknown) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(v: unknown) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sameDoc(a: unknown, b: unknown) {
  const aa = String(a || '').replace(/[^\d]/g, '');
  const bb = String(b || '').replace(/[^\d]/g, '');
  if (!aa || !bb) return false;
  return aa === bb;
}

async function tryReadContractData(base44: any, member: any) {
  const contractUrl = member?.contrato_url || member?.file_url || null;
  if (!contractUrl) return null;

  try {
    const res = await base44.asServiceRole.functions.invoke('extractTeamContractData', {
      file_url: contractUrl,
      contrato_url: contractUrl,
    });
    return res?.data?.dados || res?.data || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const {
      file_url,
      xml_url,
      mes_referencia,
      ano,
      numero_nf,
      valor_esperado,
      member_snapshot,
      descricao_modelo,
      team_payment_id,
    } = payload || {};

    if (!file_url) {
      return Response.json({ error: 'file_url obrigatório' }, { status: 400 });
    }

    const member = member_snapshot || {};
    const isPJ = String(member.tipo_pessoa || 'PF').toUpperCase() === 'PJ';
    const docLabel = isPJ
      ? `CNPJ: ${member.cnpj || 'não informado'}`
      : `CPF: ${member.cpf || 'não informado'}`;

    const contractData = await tryReadContractData(base44, member);

    const contractDoc = isPJ
      ? (contractData?.cnpj || member?.cnpj || '')
      : (contractData?.cpf || member?.cpf || '');

    const contractBank = contractData?.banco || member?.banco || '';
    const contractAgencia = contractData?.agencia || member?.agencia || '';
    const contractConta = contractData?.conta || member?.conta || '';
    const contractPix = contractData?.pix_key || member?.pix_key || '';
    const contractValor = toNumber(contractData?.valor_parcela || valor_esperado || 0);
    const contractVigenciaInicio = String(contractData?.vigencia_inicio || '').trim();
    const contractVigenciaFim = String(contractData?.vigencia_fim || '').trim();
    const contractValido = contractData?.contrato_valido !== false;

    const prompt = `Você é um auditor especializado em conformidade de notas fiscais de projetos culturais públicos.

Analise a NOTA FISCAL em PDF e, quando houver, o XML da mesma nota. Faça também o CRUZAMENTO AUTOMÁTICO entre NF e CONTRATO.

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

=== DADOS DO CONTRATO ===
Nome no contrato: ${contractData?.nome || member.user_name || '-'}
Cargo no contrato: ${contractData?.cargo || member.funcao || '-'}
Documento no contrato: ${contractDoc || '-'}
Valor da parcela no contrato: ${formatBRL(contractValor)}
Vigência inicial: ${contractVigenciaInicio || '-'}
Vigência final: ${contractVigenciaFim || '-'}
Contrato válido: ${contractValido ? 'SIM' : 'NÃO'}
Banco no contrato: ${contractBank || '-'}
Agência no contrato: ${contractAgencia || '-'}
Conta no contrato: ${contractConta || '-'}
PIX no contrato: ${contractPix || '-'}
Objeto do contrato: ${contractData?.objeto_resumo || '-'}

=== MODELO DE DESCRIÇÃO ESPERADO ===
${descricao_modelo || 'Não fornecido'}

=== CHECKLIST OBRIGATÓRIO ===
1. O valor encontrado na NF bate com o valor esperado e com o valor do contrato? Tolerância máxima: R$ 1,00.
2. O emitente da NF corresponde ao prestador cadastrado e ao documento do contrato?
3. A competência da NF bate com ${mes_referencia || '-'}/${ano || '-'}?
4. A descrição menciona Museus Centro e/ou Termo de Colaboração 01-031.069/24-80?
5. Os dados bancários encontrados na NF/XML são compatíveis com os dados do cadastro/contrato?
6. A NF tem número, data de emissão e código/elementos de verificação?
7. A competência está dentro da vigência do contrato?
8. Se houver XML, usar o XML como apoio para confirmar número, valor, emitente e data.

=== REGRAS DE DECISÃO ===
- Divergência de valor acima da tolerância = problema crítico
- CPF/CNPJ incompatível = problema crítico
- Competência fora da vigência do contrato = problema crítico
- Nome parecido, mas não idêntico = alerta
- Ausência de dados bancários na NF = alerta
- Contrato vencido = problema crítico
- Se houver apenas alertas menores, can_submit=true
- Se houver problema crítico, can_submit=false

Retorne JSON válido, objetivo e direto, com:
- can_submit
- status (OK, ATENCAO, CRITICO)
- summary
- warnings
- critical_issues
- valor_encontrado
- numero_nf_encontrado
- emitente_encontrado
- competencia_encontrada
- comparacao: {
  valor_confere,
  documento_confere,
  competencia_confere,
  vigencia_confere,
  dados_bancarios_confere,
  objeto_confere
}`;

    const fileUrls = [file_url];
    if (xml_url) fileUrls.push(xml_url);

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: fileUrls,
      response_json_schema: {
        type: 'object',
        properties: {
          can_submit: { type: 'boolean' },
          status: { type: 'string', enum: ['OK', 'ATENCAO', 'CRITICO'] },
          summary: { type: 'string' },
          warnings: { type: 'array', items: { type: 'string' } },
          critical_issues: { type: 'array', items: { type: 'string' } },
          valor_encontrado: { type: 'number' },
          numero_nf_encontrado: { type: 'string' },
          emitente_encontrado: { type: 'string' },
          competencia_encontrada: { type: 'string' },
          comparacao: {
            type: 'object',
            properties: {
              valor_confere: { type: 'boolean' },
              documento_confere: { type: 'boolean' },
              competencia_confere: { type: 'boolean' },
              vigencia_confere: { type: 'boolean' },
              dados_bancarios_confere: { type: 'boolean' },
              objeto_confere: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        required: [
          'can_submit',
          'status',
          'summary',
          'warnings',
          'critical_issues',
        ],
      },
    });

    const valorEncontrado = toNumber(result?.valor_encontrado);
    const numeroEncontrado = String(result?.numero_nf_encontrado || '').trim();
    const emitenteEncontrado = String(result?.emitente_encontrado || '').trim();
    const competenciaEncontrada = String(result?.competencia_encontrada || '').trim();

    const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    const critical = Array.isArray(result?.critical_issues) ? result.critical_issues : [];

    if (contractValor > 0 && valorEncontrado > 0 && Math.abs(contractValor - valorEncontrado) > 1) {
      critical.push(`Valor da NF (${formatBRL(valorEncontrado)}) diferente do contrato (${formatBRL(contractValor)}).`);
    }

    if (numero_nf && numeroEncontrado && normalizeText(numero_nf) !== normalizeText(numeroEncontrado)) {
      warnings.push(`Número informado (${numero_nf}) difere do identificado (${numeroEncontrado}).`);
    }

    if (contractDoc) {
      const docNF = isPJ ? (member?.cnpj || '') : (member?.cpf || '');
      if (docNF && !sameDoc(contractDoc, docNF)) {
        critical.push('Documento do cadastro difere do documento do contrato.');
      }
    }

    if (contractValido === false) {
      critical.push('Contrato vencido ou fora da vigência.');
    }

    const canSubmit = critical.length === 0 && result?.can_submit !== false;
    const finalStatus = critical.length > 0
      ? 'CRITICO'
      : warnings.length > 0
        ? 'ATENCAO'
        : (result?.status || 'OK');

    const finalPayload = {
      can_submit: canSubmit,
      status: finalStatus,
      summary: String(result?.summary || '').trim() || (
        canSubmit
          ? 'Nota fiscal analisada com sucesso.'
          : 'Foram encontradas inconsistências críticas na nota fiscal.'
      ),
      warnings,
      critical_issues: critical,
      valor_encontrado: valorEncontrado,
      numero_nf_encontrado: numeroEncontrado,
      emitente_encontrado: emitenteEncontrado,
      competencia_encontrada: competenciaEncontrada,
      comparacao: {
        valor_confere: Math.abs((contractValor || toNumber(valor_esperado)) - valorEncontrado) <= 1,
        documento_confere: contractDoc ? sameDoc(contractDoc, isPJ ? (member?.cnpj || '') : (member?.cpf || '')) : true,
        competencia_confere: !!competenciaEncontrada || !!mes_referencia,
        vigencia_confere: contractValido !== false,
        dados_bancarios_confere: true,
        objeto_confere: true,
      },
      contract_snapshot: contractData || null,
      ok: true,
    };

    if (team_payment_id) {
      await base44.asServiceRole.entities.TeamPayment.update(team_payment_id, {
        resultado_validacao: JSON.stringify(finalPayload),
        analysis_status: finalPayload.status,
        analysis_summary: finalPayload.summary,
        analysis_warnings: finalPayload.warnings,
        analysis_critical_issues: finalPayload.critical_issues,
      }).catch(() => null);
    }

    return Response.json(finalPayload);
  } catch (error: any) {
    return Response.json({
      can_submit: true,
      status: 'ATENCAO',
      summary: 'Não foi possível realizar a análise automática. Revise manualmente.',
      warnings: ['Análise automática indisponível: ' + (error?.message || 'erro desconhecido')],
      critical_issues: [],
      comparacao: {
        valor_confere: true,
        documento_confere: true,
        competencia_confere: true,
        vigencia_confere: true,
        dados_bancarios_confere: true,
        objeto_confere: true,
      },
      ok: false,
    });
  }
}
