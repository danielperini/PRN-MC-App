import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function safeStr(v) {
  return String(v || '').trim();
}

function parseValor(v) {
  if (!v && v !== 0) return 0;
  const s = String(v).trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(',', '.')) || 0;
}

function buildRenamedNF(params) {
  const numero = safeStr(params.nf_numero) || 'SEM-NUM';
  const fornecedor = safeStr(params.nf_emitente_nome || params.fornecedor).substring(0, 40).toUpperCase() || 'FORNECEDOR';
  const valorNum = parseValor(params.nf_valor_total);
  const valor = valorNum > 0 ? valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00';
  const ext = safeStr(params.extension) || 'pdf';
  return `${numero} - ${fornecedor} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

// ====== PROCESSAMENTO COM CLAUDE ======
async function processarComClaude(base44, fileUrl, orientacoes) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    
    const claudeResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6', // Claude Sonnet 4.6 — modelo mais poderoso
      prompt: `VOCÊ É UM ESPECIALISTA EM NOTAS FISCAIS BRASILEIRAS.

Analise este documento PDF/imagem de nota fiscal com MÁXIMA PRECISÃO:

## TAREFA CRÍTICA:
1. **Determine se é uma NOTA FISCAL válida** (NF, NF-e, RPA, Fatura)
2. **Extraia dados ESTRUTURADOS** da NF
3. **Identifique INCONSISTÊNCIAS REAIS** (não sinalize datas passadas/presentes como futuras)
4. **Sugira RUBRICA ORÇAMENTÁRIA** baseada em tipo de serviço/produto
5. **Avalie RISCO DE DUPLICAÇÃO** comparando padrões

## DATA ATUAL: ${hoje}
Datas até ${hoje} são VÁLIDAS e NÃO devem ser sinalizadas como "futura".

## ORIENTAÇÕES DO USUÁRIO:
${orientacoes || 'Nenhuma orientação adicional.'}

## RESPONDA EM JSON VÁLIDO:
{
  "eh_nota_fiscal": boolean,
  "nf_numero": "string",
  "nf_valor_total": "string (ex: 1234.56)",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_emitente_nome": "string",
  "nf_emitente_cpf_cnpj": "string (apenas dígitos)",
  "nf_destinatario_nome": "string",
  "descricao_servico": "string",
  "municipio": "string",
  "competencia": "string (ex: Março/2026)",
  "tipo_servico": "Serviço|Produto|Manutenção|Consultoria|Comunicação|Logística|Alimentação|Outro",
  "categoria_sugerida": "string (ex: Serviços de comunicação)",
  "inconsistencias": ["array de problemas reais"],
  "avisos": ["array de avisos não-críticos"],
  "risco_duplicacao": "baixo|médio|alto",
  "score_confiabilidade": 0-100,
  "justificativa_rubrica": "string explicando sugestão"
}`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: "object",
        properties: {
          eh_nota_fiscal: { type: "boolean" },
          nf_numero: { type: "string" },
          nf_valor_total: { type: "string" },
          nf_data_emissao: { type: "string" },
          nf_emitente_nome: { type: "string" },
          nf_emitente_cpf_cnpj: { type: "string" },
          nf_destinatario_nome: { type: "string" },
          descricao_servico: { type: "string" },
          municipio: { type: "string" },
          competencia: { type: "string" },
          tipo_servico: { type: "string" },
          categoria_sugerida: { type: "string" },
          inconsistencias: { type: "array", items: { type: "string" } },
          avisos: { type: "array", items: { type: "string" } },
          risco_duplicacao: { type: "string" },
          score_confiabilidade: { type: "number" },
          justificativa_rubrica: { type: "string" }
        }
      }
    });

    return { success: true, data: claudeResp, model: 'claude_sonnet_4_6' };
  } catch (e) {
    console.error('Erro ao processar com Claude:', e.message);
    return { success: false, error: e.message, model: 'claude_sonnet_4_6' };
  }
}

// ====== FALLBACK: GEMINI (alternativa mais rápida) ======
async function processarComGemini(base44, fileUrl, orientacoes) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    
    const geminiResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_1_pro', // Gemini 3.1 Pro — rápido e preciso
      prompt: `Analise esta nota fiscal com precisão. Data atual: ${hoje}.

${orientacoes ? `Orientações: ${orientacoes}` : ''}

Responda em JSON:
{
  "eh_nota_fiscal": boolean,
  "nf_numero": "string",
  "nf_valor_total": "string",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_emitente_nome": "string",
  "nf_emitente_cpf_cnpj": "string",
  "nf_destinatario_nome": "string",
  "descricao_servico": "string",
  "municipio": "string",
  "competencia": "string",
  "tipo_servico": "string",
  "categoria_sugerida": "string",
  "inconsistencias": [],
  "avisos": [],
  "risco_duplicacao": "baixo|médio|alto",
  "score_confiabilidade": 0-100,
  "justificativa_rubrica": "string"
}`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: "object",
        properties: {
          eh_nota_fiscal: { type: "boolean" },
          nf_numero: { type: "string" },
          nf_valor_total: { type: "string" },
          nf_data_emissao: { type: "string" },
          nf_emitente_nome: { type: "string" },
          nf_emitente_cpf_cnpj: { type: "string" },
          nf_destinatario_nome: { type: "string" },
          descricao_servico: { type: "string" },
          municipio: { type: "string" },
          competencia: { type: "string" },
          tipo_servico: { type: "string" },
          categoria_sugerida: { type: "string" },
          inconsistencias: { type: "array", items: { type: "string" } },
          avisos: { type: "array", items: { type: "string" } },
          risco_duplicacao: { type: "string" },
          score_confiabilidade: { type: "number" },
          justificativa_rubrica: { type: "string" }
        }
      }
    });

    return { success: true, data: geminiResp, model: 'gemini_3_1_pro' };
  } catch (e) {
    console.error('Erro ao processar com Gemini:', e.message);
    return { success: false, error: e.message, model: 'gemini_3_1_pro' };
  }
}

// ====== FALLBACK: GPT-4o (compatibilidade) ======
async function processarComGPT(base44, fileUrl, orientacoes) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    
    const gptResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gpt_5_4', // GPT 4 Turbo — modelo rápido
      prompt: `Analise esta nota fiscal. Data: ${hoje}.

${orientacoes ? `Orientações: ${orientacoes}` : ''}

JSON:
{
  "eh_nota_fiscal": boolean,
  "nf_numero": "string",
  "nf_valor_total": "string",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_emitente_nome": "string",
  "nf_emitente_cpf_cnpj": "string",
  "nf_destinatario_nome": "string",
  "descricao_servico": "string",
  "municipio": "string",
  "competencia": "string",
  "tipo_servico": "string",
  "categoria_sugerida": "string",
  "inconsistencias": [],
  "avisos": [],
  "risco_duplicacao": "baixo|médio|alto",
  "score_confiabilidade": 0-100,
  "justificativa_rubrica": "string"
}`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: "object",
        properties: {
          eh_nota_fiscal: { type: "boolean" },
          nf_numero: { type: "string" },
          nf_valor_total: { type: "string" },
          nf_data_emissao: { type: "string" },
          nf_emitente_nome: { type: "string" },
          nf_emitente_cpf_cnpj: { type: "string" },
          nf_destinatario_nome: { type: "string" },
          descricao_servico: { type: "string" },
          municipio: { type: "string" },
          competencia: { type: "string" },
          tipo_servico: { type: "string" },
          categoria_sugerida: { type: "string" },
          inconsistencias: { type: "array", items: { type: "string" } },
          avisos: { type: "array", items: { type: "string" } },
          risco_duplicacao: { type: "string" },
          score_confiabilidade: { type: "number" },
          justificativa_rubrica: { type: "string" }
        }
      }
    });

    return { success: true, data: gptResp, model: 'gpt_5_4' };
  } catch (e) {
    console.error('Erro ao processar com GPT:', e.message);
    return { success: false, error: e.message, model: 'gpt_5_4' };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const intakeId = safeStr(body.intake_id);
    const fileUrl = safeStr(body.file_url);
    const orientacoes = safeStr(body.orientacoes_usuario);
    const modeloPreferido = safeStr(body.modelo || 'claude').toLowerCase(); // claude, gemini, gpt

    if (!intakeId || !fileUrl) {
      return Response.json({ 
        ok: false, 
        error: 'intake_id e file_url obrigatórios' 
      }, { status: 400 });
    }

    // ====== MARCAR COMO PROCESSANDO ======
    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ANALISANDO_IA'
    });

    // ====== TENTAR MODELOS NA ORDEM: Claude → Gemini → GPT ======
    let resultado = null;
    let modeloUsado = 'nenhum';
    let tentativas = [];

    // Primeira tentativa: modelo preferido
    if (modeloPreferido === 'claude') {
      tentativas.push(() => processarComClaude(base44, fileUrl, orientacoes));
      tentativas.push(() => processarComGemini(base44, fileUrl, orientacoes));
      tentativas.push(() => processarComGPT(base44, fileUrl, orientacoes));
    } else if (modeloPreferido === 'gemini') {
      tentativas.push(() => processarComGemini(base44, fileUrl, orientacoes));
      tentativas.push(() => processarComClaude(base44, fileUrl, orientacoes));
      tentativas.push(() => processarComGPT(base44, fileUrl, orientacoes));
    } else if (modeloPreferido === 'gpt') {
      tentativas.push(() => processarComGPT(base44, fileUrl, orientacoes));
      tentativas.push(() => processarComClaude(base44, fileUrl, orientacoes));
      tentativas.push(() => processarComGemini(base44, fileUrl, orientacoes));
    } else {
      // Padrão: Claude → Gemini → GPT
      tentativas.push(() => processarComClaude(base44, fileUrl, orientacoes));
      tentativas.push(() => processarComGemini(base44, fileUrl, orientacoes));
      tentativas.push(() => processarComGPT(base44, fileUrl, orientacoes));
    }

    for (const tentativa of tentativas) {
      resultado = await tentativa();
      if (resultado.success) {
        modeloUsado = resultado.model;
        console.log(`✅ Processamento com sucesso usando ${modeloUsado}`);
        break;
      } else {
        console.warn(`⚠️ Falha com ${resultado.model}: ${resultado.error}`);
      }
    }

    // Se todos falharem
    if (!resultado || !resultado.success) {
      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'ERRO_PROCESSAMENTO',
        erros_validacao: ['Falha ao analisar com nenhum modelo de IA disponível.']
      });
      return Response.json({ 
        ok: false, 
        error: 'Nenhum modelo de IA conseguiu processar o documento' 
      }, { status: 500 });
    }

    // ====== PROCESSAR RESULTADO ======
    const ia = resultado.data || {};
    const erros = [];
    
    if (ia.inconsistencias && Array.isArray(ia.inconsistencias)) {
      erros.push(...ia.inconsistencias);
    }
    if (ia.avisos && Array.isArray(ia.avisos)) {
      erros.push(...ia.avisos);
    }

    // Atribuir risco de duplicação se alto
    if (ia.risco_duplicacao === 'alto') {
      erros.push('⚠️ RISCO ALTO DE DUPLICAÇÃO: Verifique se já existe NF similar no sistema.');
    }

    const tipoDetectado = ia.eh_nota_fiscal ? 
      (body.file_url?.includes('.xml') ? 'NOTA_FISCAL_XML' : 'NOTA_FISCAL_PDF') 
      : 'DOCUMENTO_ADMINISTRATIVO';

    let nomeFinal = '';
    if (ia.eh_nota_fiscal) {
      nomeFinal = buildRenamedNF({
        nf_numero: ia.nf_numero,
        nf_emitente_nome: ia.nf_emitente_nome,
        nf_valor_total: ia.nf_valor_total,
        extension: body.file_url?.includes('.xml') ? 'xml' : 'pdf'
      });
    }

    // ====== SALVAR RESULTADO ======
    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      tipo_detectado: tipoDetectado,
      status_processamento: 'AGUARDANDO_REVISAO',
      resultado_ia: {
        ...ia,
        modelo_ia_utilizado: modeloUsado,
        score_confiabilidade: ia.score_confiabilidade || 0
      },
      file_name_final: nomeFinal || body.file_name,
      rubrica_justificativa: ia.justificativa_rubrica || '',
      categoria_sugerida: ia.categoria_sugerida || '',
      erros_validacao: erros,
      revisado_pelo_usuario: false
    });

    // ====== LOG DE AUDITORIA ======
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'UPDATE',
        entity_type: 'DOCUMENT_INTAKE',
        entity_id: intakeId,
        actor_email: user.email,
        actor_name: user.full_name || user.name || '',
        details: `Documento processado com IA: ${modeloUsado}. Tipo: ${tipoDetectado}. Score confiabilidade: ${ia.score_confiabilidade || 0}%`,
        created_at: new Date().toISOString()
      });
    } catch (logErr) {
      console.warn('Erro ao registrar auditoria:', logErr);
    }

    return Response.json({
      ok: true,
      intake_id: intakeId,
      tipo_detectado: tipoDetectado,
      modelo_utilizado: modeloUsado,
      score_confiabilidade: ia.score_confiabilidade || 0,
      resultado_ia: ia,
      file_name_final: nomeFinal,
      erros_encontrados: erros
    });

  } catch (error) {
    return Response.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
});