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

function sameDoc(a: unknown, b: unknown) {
  const aa = String(a || '').replace(/[^\d]/g, '');
  const bb = String(b || '').replace(/[^\d]/g, '');
  if (!aa || !bb) return false;
  return aa === bb;
}

function truncateText(value: unknown, max = 500) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function buildErrorMessage(error: any) {
  const parts = [
    error?.message,
    error?.error,
    error?.details,
    error?.cause?.message,
    error?.data?.error,
    error?.data?.details,
  ].filter(Boolean);

  if (parts.length === 0) return 'erro desconhecido';
  return truncateText(parts.join(' | '), 800);
}

function parseMonthYear(value: unknown) {
  const text = String(value || '').trim();

  const numeric = text.match(/\b(0?[1-9]|1[0-2])\/(\d{4})\b/);
  if (numeric) {
    return {
      month: Number(numeric[1]),
      year: Number(numeric[2]),
      raw: numeric[0],
    };
  }

  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const months: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };

  for (const [name, month] of Object.entries(months)) {
    const regex = new RegExp(`\\b${name}\\s*\\/\\s*(\\d{4})\\b`, 'i');
    const match = normalized.match(regex);
    if (match) {
      return {
        month,
        year: Number(match[1]),
        raw: `${name}/${match[1]}`,
      };
    }
  }

  return null;
}

function isPreviousMonthAllowed(descricaoCompetencia: unknown, expectedMes: unknown, expectedAno: unknown) {
  const desc = parseMonthYear(descricaoCompetencia);
  const expected = parseMonthYear(`${expectedMes || ''}/${expectedAno || ''}`);

  if (!desc || !expected) return false;

  let prevMonth = expected.month - 1;
  let prevYear = expected.year;

  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  return desc.month === prevMonth && desc.year === prevYear;
}

async function tryReadContractData(base44: any, member: any) {
  const contractUrl = member?.contrato_url || member?.file_url || null;
  if (!contractUrl) {
    return {
      data: null,
      error: null,
      contract_url: null,
    };
  }

  try {
    const res = await base44.asServiceRole.functions.invoke('extractTeamContractData', {
      file_url: contractUrl,
      contrato_url: contractUrl,
    });

    return {
      data: res?.data?.dados || res?.data || null,
      error: null,
      contract_url: contractUrl,
    };
  } catch {
    return {
      data: null,
      error: null,
      contract_url: contractUrl,
    };
  }
}

Deno.serve(async (req) => {
  const startedAt = new Date().toISOString();
  let base44: any = null;
  let teamPaymentId = '';
  let payloadSnapshot: Record<string, any> = {};

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    teamPaymentId = String(team_payment_id || '').trim();

    payloadSnapshot = {
      file_url: file_url || '',
      xml_url: xml_url || '',
      mes_referencia: mes_referencia || '',
      ano: ano || '',
      numero_nf: numero_nf || '',
      team_payment_id: teamPaymentId || '',
      has_member_snapshot: !!member_snapshot,
      has_descricao_modelo: !!descricao_modelo,
    };

    if (!file_url) {
      return Response.json({ error: 'file_url obrigatório' }, { status: 400 });
    }

    const member = member_snapshot || {};
    const tipoPessoa = String(member?.tipo_pessoa || 'PF').toUpperCase();
    const isPJ = tipoPessoa === 'PJ' || tipoPessoa === 'MEI' || tipoPessoa === 'ME';
    const docLabel = isPJ
      ? `CNPJ: ${member?.cnpj || 'não informado'}`
      : `CPF: ${member?.cpf || 'não informado'}`;

    const contractRead = await tryReadContractData(base44, member);
    const contractData = contractRead?.data || null;

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

Analise a NOTA FISCAL em PDF. O XML pode existir como arquivo de apoio, mas não deve gerar alerta por si só se não for lido diretamente.

Faça também o CRUZAMENTO AUTOMÁTICO entre NF e CONTRATO.

=== REGRA FIXA DAS NOTAS DA EQUIPE ===
Para notas fiscais da equipe deste projeto, a descrição do serviço normalmente menciona o mês ANTERIOR ao mês/competência formal da nota.
Exemplo válido:
- competência formal da nota: abril/2026
- descrição do serviço: março/2026

ISSO É CORRETO E NÃO DEVE SER TRATADO COMO DIVERGÊNCIA CRÍTICA NEM COMO ALERTA.

=== REGRA CRÍTICA DE LEITURA FISCAL ===
Ao analisar competência e número da nota, PRIORIZE os CAMPOS FISCAIS EXPLÍCITOS da NFS-e, como por exemplo:
- Número da NFS-e
- Competência da NFS-e
- Data de emissão da NFS-e
- Número da DPS
- Série da DPS

Se o corpo da descrição do serviço mencionar outro mês, isso NÃO deve prevalecer sobre os campos fiscais formais.
Se houver conflito entre:
1. campos fiscais explícitos da NFS-e
2. descrição livre do serviço

considere os CAMPOS FISCAIS EXPLÍCITOS como verdade principal.

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

=== ARQUIVOS RECEBIDOS ===
PDF da NF: ${file_url || '-'}
XML informado: ${xml_url || 'não enviado'}

=== MODELO DE DESCRIÇÃO ESPERADO ===
${descricao_modelo || 'Não fornecido'}

=== CHECKLIST OBRIGATÓRIO ===
1. O valor encontrado na NF bate com o valor esperado e com o valor do contrato? Tolerância máxima: R$ 1,00.
2. O emitente da NF corresponde ao documento do cadastro/contrato?
3. Priorize a competência formal da NFS-e. NÃO usar texto da descrição do serviço como base principal para bloquear competência.
4. A descrição do serviço pode trazer o mês anterior à competência formal da nota. Isso é válido e não deve gerar crítica.
5. Os dados bancários encontrados na NF são compatíveis com os dados do cadastro/contrato?
6. A NF tem número, data de emissão e código/elementos de verificação?
7. A competência formal da nota está dentro da vigência do contrato?
8. Não trate diferença entre nome completo da pessoa e descrição simplificada do cadastro como erro.
9. Não trate diferença entre número informado e número identificado como erro ou alerta.
10. Não trate XML não lido diretamente como erro ou alerta.
11. Não tratar falha na leitura do contrato como alerta ao usuário final.

=== REGRAS DE DECISÃO ===
- Divergência de valor acima da tolerância = problema crítico
- CPF/CNPJ incompatível = problema crítico
- Competência fora da vigência do contrato = problema crítico SOMENTE se baseada na competência formal da NFS-e
- Competência do mês anterior na descrição do serviço = permitido
- Nome parecido, mas não idêntico = ignorar
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

    let result: any = null;

    try {
      result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        file_urls: [file_url],
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
    } catch (llmError: any) {
      const llmMessage = buildErrorMessage(llmError);

      const fallbackPayload = {
        can_submit: true,
        status: 'ATENCAO',
        summary: 'Não foi possível realizar a análise automática. Revise manualmente.',
        warnings: [
          `Falha na IA: ${llmMessage}`,
        ],
        critical_issues: [],
        valor_encontrado: 0,
        numero_nf_encontrado: '',
        emitente_encontrado: '',
        competencia_encontrada: '',
        comparacao: {
          valor_confere: true,
          documento_confere: true,
          competencia_confere: true,
          vigencia_confere: true,
          dados_bancarios_confere: true,
          objeto_confere: true,
        },
        contract_snapshot: contractData || null,
        debug: {
          source: 'InvokeLLM',
          started_at: startedAt,
          file_urls: [file_url],
          xml_url: xml_url || '',
          payload: payloadSnapshot,
          llm_error: llmMessage,
        },
        ok: false,
      };

      if (teamPaymentId) {
        await base44.asServiceRole.entities.TeamPayment.update(teamPaymentId, {
          resultado_validacao: JSON.stringify(fallbackPayload),
          analysis_status: fallbackPayload.status,
          analysis_summary: fallbackPayload.summary,
          analysis_warnings: fallbackPayload.warnings,
          analysis_critical_issues: fallbackPayload.critical_issues,
        }).catch(() => null);
      }

      return Response.json(fallbackPayload);
    }

    const valorEncontrado = toNumber(result?.valor_encontrado);
    const numeroEncontrado = String(result?.numero_nf_encontrado || '').trim();
    const emitenteEncontrado = String(result?.emitente_encontrado || '').trim();
    const competenciaEncontrada = String(result?.competencia_encontrada || '').trim();

    let warnings = Array.isArray(result?.warnings) ? [...result.warnings] : [];
    let critical = Array.isArray(result?.critical_issues) ? [...result.critical_issues] : [];

    if (contractValor > 0 && valorEncontrado > 0 && Math.abs(contractValor - valorEncontrado) > 1) {
      critical.push(`Valor da NF (${formatBRL(valorEncontrado)}) diferente do contrato (${formatBRL(contractValor)}).`);
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

    const allowedPreviousMonth = isPreviousMonthAllowed(
      competenciaEncontrada,
      mes_referencia,
      ano
    );

    if (allowedPreviousMonth) {
      warnings = warnings.filter((item) => {
        const text = String(item || '').toLowerCase();
        return !text.includes('compet') && !text.includes('março') && !text.includes('marco');
      });

      critical = critical.filter((item) => {
        const text = String(item || '').toLowerCase();
        return !text.includes('compet') && !text.includes('março') && !text.includes('marco');
      });
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
        competencia_confere: true,
        vigencia_confere: contractValido !== false,
        dados_bancarios_confere: true,
        objeto_confere: true,
      },
      contract_snapshot: contractData || null,
      debug: {
        source: 'InvokeLLM_OK',
        started_at: startedAt,
        file_urls: [file_url],
        xml_url: xml_url || '',
        payload: payloadSnapshot,
        allowed_previous_month_rule_applied: allowedPreviousMonth,
      },
      ok: true,
    };

    if (teamPaymentId) {
      await base44.asServiceRole.entities.TeamPayment.update(teamPaymentId, {
        resultado_validacao: JSON.stringify(finalPayload),
        analysis_status: finalPayload.status,
        analysis_summary: finalPayload.summary,
        analysis_warnings: finalPayload.warnings,
        analysis_critical_issues: finalPayload.critical_issues,
      }).catch(() => null);
    }

    return Response.json(finalPayload);
  } catch (error: any) {
    const errorMessage = buildErrorMessage(error);

    const fallbackPayload = {
      can_submit: true,
      status: 'ATENCAO',
      summary: 'Não foi possível realizar a análise automática. Revise manualmente.',
      warnings: [`Falha geral na análise automática: ${errorMessage}`],
      critical_issues: [],
      valor_encontrado: 0,
      numero_nf_encontrado: '',
      emitente_encontrado: '',
      competencia_encontrada: '',
      comparacao: {
        valor_confere: true,
        documento_confere: true,
        competencia_confere: true,
        vigencia_confere: true,
        dados_bancarios_confere: true,
        objeto_confere: true,
      },
      debug: {
        source: 'GENERAL_CATCH',
        started_at: startedAt,
        payload: payloadSnapshot,
        error: errorMessage,
      },
      ok: false,
    };

    if (base44 && teamPaymentId) {
      await base44.asServiceRole.entities.TeamPayment.update(teamPaymentId, {
        resultado_validacao: JSON.stringify(fallbackPayload),
        analysis_status: fallbackPayload.status,
        analysis_summary: fallbackPayload.summary,
        analysis_warnings: fallbackPayload.warnings,
        analysis_critical_issues: fallbackPayload.critical_issues,
      }).catch(() => null);
    }

    return Response.json(fallbackPayload);
  }
});
