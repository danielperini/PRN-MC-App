import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ======================================================================
// CONSTANTES DO TOMADOR ESPERADO
// ======================================================================
const TOMADOR_ESPERADO = {
  nome: 'VIADUTO DAS ARTES',
  cnpj: '23843648000125', // apenas dígitos
  endereco: 'AV. OLINTO MEIRELES, 45 - BARREIRO, BELO HORIZONTE - MG, 30640-010',
  email: 'VIADUTODASARTES@VIADUTODASARTES.ORG.BR',
};

const MUSEUS_VALIDOS = ['MIS', 'MUMO', 'MHAB'];

// Funções que exigem identificação do museu
const FUNCOES_QUE_EXIGEM_MUSEU = [
  'educador', 'educadora', 'produtor', 'produtora', 'produtor cultural',
  'produtora cultural', 'educação', 'educativo', 'producao', 'produção'
];

function safeStr(v) {
  return String(v || '').trim();
}

function onlyDigits(v) {
  return safeStr(v).replace(/\D/g, '');
}

function parseValor(v) {
  if (!v && v !== 0) return 0;
  const s = String(v).trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(String(s).replace(',', '.')) || 0;
}

function formatValorBR(v) {
  const num = parseValor(v);
  return num > 0
    ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0,00';
}

function normalizeText(v) {
  return safeStr(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Constrói o nome padronizado do arquivo conforme o padrão:
 * NF [número] - [razão social/emitente] - [nome profissional] - MUSEUS CENTRO - [museu, se houver] - R$ [valor]
 * Exemplo: NF 123 - ENGENHARIA E DESIGN LTDA - CAROLINE ABASSE - MUSEUS CENTRO - MIS - R$ 2.600,00
 */
function buildRenamedNF(params) {
  const numero = safeStr(params.nf_numero) || 'SEM-NUM';
  const emitente = normalizeText(params.nf_emitente_nome || params.fornecedor || 'FORNECEDOR').substring(0, 50);
  const profissional = normalizeText(params.nome_profissional || params.nf_emitente_nome || '').substring(0, 50);
  const museu = safeStr(params.museu_atuacao).toUpperCase();
  const valor = formatValorBR(params.nf_valor_total);
  const ext = safeStr(params.extension) || 'pdf';

  const museuPart = MUSEUS_VALIDOS.includes(museu) ? ` - ${museu}` : '';
  const profissionalPart = profissional && profissional !== emitente ? ` - ${profissional}` : '';

  return `NF ${numero} - ${emitente}${profissionalPart} - MUSEUS CENTRO${museuPart} - R$ ${valor}.${ext}`;
}

function funcaoExigeMuseu(funcao) {
  const f = normalizeText(funcao);
  return FUNCOES_QUE_EXIGEM_MUSEU.some(k => f.includes(normalizeText(k)));
}

// ======================================================================
// PROCESSAMENTO COM CLAUDE (principal)
// ======================================================================
async function processarComClaude(base44, fileUrl, orientacoes) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);

    const resp = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: `VOCÊ É UM ESPECIALISTA EM NOTAS FISCAIS BRASILEIRAS para o projeto MUSEUS CENTRO.

## DATA ATUAL: ${hoje}
Datas até ${hoje} são VÁLIDAS e NÃO devem ser sinalizadas como futuras.

## TOMADOR ESPERADO NA NOTA FISCAL:
- Nome: Viaduto das Artes
- CNPJ: 23.843.648/0001-25
- Endereço: Av. Olinto Meireles, 45 - Barreiro, Belo Horizonte - MG, 30640-010
- E-mail: viadutodasartes@viadutodasartes.org.br

## DESCRIÇÃO DO SERVIÇO ESPERADA (padrão):
"Prestação de serviço de [função exercida] ao Projeto Museus Centro - Termo de Colaboração 01-031.069/24-80, parceria com SMC/FMC: [MÊS/ANO]."

## TAREFA:
1. Leia o documento integralmente
2. Extraia TODOS os dados estruturados
3. Verifique se o tomador bate com o Viaduto das Artes (CNPJ 23.843.648/0001-25)
4. Verifique se a descrição segue o padrão esperado
5. Extraia DADOS DE PAGAMENTO: banco, agência, conta, CPF/CNPJ do prestador, PIX
6. Identifique o NOME DO PROFISSIONAL (pessoa física por trás do CNPJ/MEI, se disponível)
7. Identifique o MUSEU DE ATUAÇÃO se mencionado: MIS, MUMO ou MHAB
8. Identifique a FUNÇÃO exercida no projeto
9. Marque PENDÊNCIAS não bloqueantes (nunca bloqueie o envio, apenas registre)

## ORIENTAÇÕES DO USUÁRIO:
${orientacoes || 'Nenhuma orientação adicional.'}

## RESPONDA EM JSON VÁLIDO:
{
  "eh_nota_fiscal": boolean,
  "nf_numero": "número da NF",
  "nf_valor_total": "valor decimal ex: 2600.00",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_emitente_nome": "razão social do emitente",
  "nf_emitente_cpf_cnpj": "apenas dígitos",
  "nome_profissional": "nome da pessoa física prestadora, se identificável",
  "funcao_exercida": "função descrita no serviço ex: Educadora",
  "museu_atuacao": "MIS | MUMO | MHAB | (vazio se não mencionado)",
  "descricao_servico": "descrição completa do serviço",
  "competencia": "ex: Fevereiro/2026",
  "tipo_servico": "Serviço|Produto|Consultoria|Comunicação|Logística|Alimentação|Outro",
  "municipio": "município de emissão",
  "tomador_correto": boolean (true se CNPJ do tomador = 23843648000125),
  "tomador_cnpj_encontrado": "CNPJ do tomador na NF (só dígitos)",
  "descricao_conforme_padrao": boolean,
  "dados_pagamento": {
    "banco": "nome do banco",
    "agencia": "número da agência",
    "conta": "número da conta",
    "cpf_cnpj": "CPF ou CNPJ do prestador (só dígitos)",
    "pix": "chave PIX se houver"
  },
  "inconsistencias": ["problemas críticos — ex: tomador errado, CNPJ divergente"],
  "pendencias": ["campos ausentes ou divergentes, sem bloquear envio"],
  "avisos": ["avisos não críticos"],
  "risco_duplicacao": "baixo|médio|alto",
  "score_confiabilidade": 0-100,
  "categoria_sugerida": "categoria orçamentária sugerida",
  "justificativa_rubrica": "explicação da sugestão de rubrica"
}`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          eh_nota_fiscal: { type: 'boolean' },
          nf_numero: { type: 'string' },
          nf_valor_total: { type: 'string' },
          nf_data_emissao: { type: 'string' },
          nf_emitente_nome: { type: 'string' },
          nf_emitente_cpf_cnpj: { type: 'string' },
          nome_profissional: { type: 'string' },
          funcao_exercida: { type: 'string' },
          museu_atuacao: { type: 'string' },
          descricao_servico: { type: 'string' },
          competencia: { type: 'string' },
          tipo_servico: { type: 'string' },
          municipio: { type: 'string' },
          tomador_correto: { type: 'boolean' },
          tomador_cnpj_encontrado: { type: 'string' },
          descricao_conforme_padrao: { type: 'boolean' },
          dados_pagamento: {
            type: 'object',
            properties: {
              banco: { type: 'string' },
              agencia: { type: 'string' },
              conta: { type: 'string' },
              cpf_cnpj: { type: 'string' },
              pix: { type: 'string' },
            },
          },
          inconsistencias: { type: 'array', items: { type: 'string' } },
          pendencias: { type: 'array', items: { type: 'string' } },
          avisos: { type: 'array', items: { type: 'string' } },
          risco_duplicacao: { type: 'string' },
          score_confiabilidade: { type: 'number' },
          categoria_sugerida: { type: 'string' },
          justificativa_rubrica: { type: 'string' },
        },
      },
    });

    return { success: true, data: resp, model: 'claude_sonnet_4_6' };
  } catch (e) {
    console.error('Erro ao processar com Claude:', e.message);
    return { success: false, error: e.message, model: 'claude_sonnet_4_6' };
  }
}

// ======================================================================
// FALLBACK: GEMINI
// ======================================================================
async function processarComGemini(base44, fileUrl, orientacoes) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);

    const resp = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_1_pro',
      prompt: `Analise esta nota fiscal do projeto Museus Centro. Data atual: ${hoje}.
Tomador esperado: Viaduto das Artes, CNPJ 23.843.648/0001-25.
Descrição esperada: "Prestação de serviço de [função] ao Projeto Museus Centro - Termo de Colaboração 01-031.069/24-80..."
${orientacoes ? `Orientações: ${orientacoes}` : ''}

JSON:
{
  "eh_nota_fiscal": boolean,
  "nf_numero": "string",
  "nf_valor_total": "string",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_emitente_nome": "string",
  "nf_emitente_cpf_cnpj": "string",
  "nome_profissional": "string",
  "funcao_exercida": "string",
  "museu_atuacao": "MIS|MUMO|MHAB ou vazio",
  "descricao_servico": "string",
  "competencia": "string",
  "tipo_servico": "string",
  "municipio": "string",
  "tomador_correto": boolean,
  "tomador_cnpj_encontrado": "string",
  "descricao_conforme_padrao": boolean,
  "dados_pagamento": { "banco": "", "agencia": "", "conta": "", "cpf_cnpj": "", "pix": "" },
  "inconsistencias": [],
  "pendencias": [],
  "avisos": [],
  "risco_duplicacao": "baixo|médio|alto",
  "score_confiabilidade": 0-100,
  "categoria_sugerida": "string",
  "justificativa_rubrica": "string"
}`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          eh_nota_fiscal: { type: 'boolean' },
          nf_numero: { type: 'string' },
          nf_valor_total: { type: 'string' },
          nf_data_emissao: { type: 'string' },
          nf_emitente_nome: { type: 'string' },
          nf_emitente_cpf_cnpj: { type: 'string' },
          nome_profissional: { type: 'string' },
          funcao_exercida: { type: 'string' },
          museu_atuacao: { type: 'string' },
          descricao_servico: { type: 'string' },
          competencia: { type: 'string' },
          tipo_servico: { type: 'string' },
          municipio: { type: 'string' },
          tomador_correto: { type: 'boolean' },
          tomador_cnpj_encontrado: { type: 'string' },
          descricao_conforme_padrao: { type: 'boolean' },
          dados_pagamento: {
            type: 'object',
            properties: {
              banco: { type: 'string' },
              agencia: { type: 'string' },
              conta: { type: 'string' },
              cpf_cnpj: { type: 'string' },
              pix: { type: 'string' },
            },
          },
          inconsistencias: { type: 'array', items: { type: 'string' } },
          pendencias: { type: 'array', items: { type: 'string' } },
          avisos: { type: 'array', items: { type: 'string' } },
          risco_duplicacao: { type: 'string' },
          score_confiabilidade: { type: 'number' },
          categoria_sugerida: { type: 'string' },
          justificativa_rubrica: { type: 'string' },
        },
      },
    });

    return { success: true, data: resp, model: 'gemini_3_1_pro' };
  } catch (e) {
    console.error('Erro ao processar com Gemini:', e.message);
    return { success: false, error: e.message, model: 'gemini_3_1_pro' };
  }
}

// ======================================================================
// FALLBACK: GPT
// ======================================================================
async function processarComGPT(base44, fileUrl, orientacoes) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);

    const resp = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gpt_5_4',
      prompt: `Analise esta nota fiscal do projeto Museus Centro. Data: ${hoje}.
Tomador esperado: Viaduto das Artes, CNPJ 23.843.648/0001-25.
${orientacoes ? `Orientações: ${orientacoes}` : ''}

JSON:
{
  "eh_nota_fiscal": boolean,
  "nf_numero": "string",
  "nf_valor_total": "string",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_emitente_nome": "string",
  "nf_emitente_cpf_cnpj": "string",
  "nome_profissional": "string",
  "funcao_exercida": "string",
  "museu_atuacao": "MIS|MUMO|MHAB ou vazio",
  "descricao_servico": "string",
  "competencia": "string",
  "tipo_servico": "string",
  "municipio": "string",
  "tomador_correto": boolean,
  "tomador_cnpj_encontrado": "string",
  "descricao_conforme_padrao": boolean,
  "dados_pagamento": { "banco": "", "agencia": "", "conta": "", "cpf_cnpj": "", "pix": "" },
  "inconsistencias": [],
  "pendencias": [],
  "avisos": [],
  "risco_duplicacao": "baixo|médio|alto",
  "score_confiabilidade": 0-100,
  "categoria_sugerida": "string",
  "justificativa_rubrica": "string"
}`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          eh_nota_fiscal: { type: 'boolean' },
          nf_numero: { type: 'string' },
          nf_valor_total: { type: 'string' },
          nf_data_emissao: { type: 'string' },
          nf_emitente_nome: { type: 'string' },
          nf_emitente_cpf_cnpj: { type: 'string' },
          nome_profissional: { type: 'string' },
          funcao_exercida: { type: 'string' },
          museu_atuacao: { type: 'string' },
          descricao_servico: { type: 'string' },
          competencia: { type: 'string' },
          tipo_servico: { type: 'string' },
          municipio: { type: 'string' },
          tomador_correto: { type: 'boolean' },
          tomador_cnpj_encontrado: { type: 'string' },
          descricao_conforme_padrao: { type: 'boolean' },
          dados_pagamento: {
            type: 'object',
            properties: {
              banco: { type: 'string' },
              agencia: { type: 'string' },
              conta: { type: 'string' },
              cpf_cnpj: { type: 'string' },
              pix: { type: 'string' },
            },
          },
          inconsistencias: { type: 'array', items: { type: 'string' } },
          pendencias: { type: 'array', items: { type: 'string' } },
          avisos: { type: 'array', items: { type: 'string' } },
          risco_duplicacao: { type: 'string' },
          score_confiabilidade: { type: 'number' },
          categoria_sugerida: { type: 'string' },
          justificativa_rubrica: { type: 'string' },
        },
      },
    });

    return { success: true, data: resp, model: 'gpt_5_4' };
  } catch (e) {
    console.error('Erro ao processar com GPT:', e.message);
    return { success: false, error: e.message, model: 'gpt_5_4' };
  }
}

// ======================================================================
// VALIDAÇÕES PÓS-EXTRAÇÃO (não bloqueantes)
// ======================================================================
function gerarPendenciasEValidacoes(ia, body) {
  const inconsistencias = Array.isArray(ia.inconsistencias) ? [...ia.inconsistencias] : [];
  const pendencias = Array.isArray(ia.pendencias) ? [...ia.pendencias] : [];
  const avisos = Array.isArray(ia.avisos) ? [...ia.avisos] : [];

  // 1. Verificar tomador
  if (ia.tomador_correto === false) {
    const cnpjEncontrado = safeStr(ia.tomador_cnpj_encontrado);
    if (cnpjEncontrado && onlyDigits(cnpjEncontrado) !== TOMADOR_ESPERADO.cnpj) {
      inconsistencias.push(`⚠️ TOMADOR DIVERGENTE: CNPJ encontrado na NF (${cnpjEncontrado}) difere do Viaduto das Artes (23.843.648/0001-25). Verifique antes de aprovar.`);
    } else if (!cnpjEncontrado) {
      pendencias.push('Campo Tomador não localizado na NF. Verifique se o documento está completo.');
    }
  }

  // 2. Verificar descrição do serviço
  if (ia.descricao_conforme_padrao === false) {
    pendencias.push('Descrição do serviço não segue o padrão esperado: "Prestação de serviço de [função] ao Projeto Museus Centro - Termo de Colaboração 01-031.069/24-80..."');
  }

  // 3. Museu obrigatório para educadores e produtores
  const funcao = safeStr(ia.funcao_exercida);
  const museu = safeStr(ia.museu_atuacao).toUpperCase();
  if (funcaoExigeMuseu(funcao) && !MUSEUS_VALIDOS.includes(museu)) {
    pendencias.push(`⚠️ Função "${funcao}" exige identificação do museu de atuação (MIS, MUMO ou MHAB). Não identificado na NF.`);
  }

  // 4. Campos de pagamento ausentes
  const pag = ia.dados_pagamento || {};
  if (!pag.banco) pendencias.push('Dados de pagamento: Banco não identificado.');
  if (!pag.conta) pendencias.push('Dados de pagamento: Conta não identificada.');
  if (!pag.cpf_cnpj && !pag.pix) pendencias.push('Dados de pagamento: CPF/CNPJ e PIX não identificados.');

  // 5. Risco de duplicação
  if (ia.risco_duplicacao === 'alto') {
    pendencias.push('⚠️ RISCO ALTO DE DUPLICAÇÃO: Verifique se já existe NF similar no sistema.');
  }

  // 6. Nome do profissional ausente
  if (!safeStr(ia.nome_profissional)) {
    pendencias.push('Nome do profissional/prestador não identificado na NF.');
  }

  return { inconsistencias, pendencias, avisos };
}

// ======================================================================
// HANDLER PRINCIPAL
// ======================================================================
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
    const modeloPreferido = safeStr(body.modelo || 'claude').toLowerCase();

    if (!intakeId || !fileUrl) {
      return Response.json({ ok: false, error: 'intake_id e file_url obrigatórios' }, { status: 400 });
    }

    // Marcar como processando
    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ANALISANDO_IA',
    });

    // Ordem de tentativas
    let tentativas = [];
    if (modeloPreferido === 'gemini') {
      tentativas = [
        () => processarComGemini(base44, fileUrl, orientacoes),
        () => processarComClaude(base44, fileUrl, orientacoes),
        () => processarComGPT(base44, fileUrl, orientacoes),
      ];
    } else if (modeloPreferido === 'gpt') {
      tentativas = [
        () => processarComGPT(base44, fileUrl, orientacoes),
        () => processarComClaude(base44, fileUrl, orientacoes),
        () => processarComGemini(base44, fileUrl, orientacoes),
      ];
    } else {
      // padrão: Claude → Gemini → GPT
      tentativas = [
        () => processarComClaude(base44, fileUrl, orientacoes),
        () => processarComGemini(base44, fileUrl, orientacoes),
        () => processarComGPT(base44, fileUrl, orientacoes),
      ];
    }

    let resultado = null;
    let modeloUsado = 'nenhum';

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

    if (!resultado || !resultado.success) {
      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'ERRO_PROCESSAMENTO',
        erros_validacao: ['Falha ao analisar com nenhum modelo de IA disponível.'],
      });
      return Response.json({ ok: false, error: 'Nenhum modelo de IA conseguiu processar o documento' }, { status: 500 });
    }

    const ia = resultado.data || {};

    // Gerar pendências e validações pós-extração
    const { inconsistencias, pendencias, avisos } = gerarPendenciasEValidacoes(ia, body);

    // Tipo detectado
    const tipoDetectado = ia.eh_nota_fiscal
      ? (fileUrl.includes('.xml') ? 'NOTA_FISCAL_XML' : 'NOTA_FISCAL_PDF')
      : 'DOCUMENTO_ADMINISTRATIVO';

    // Nome do arquivo com novo padrão
    let nomeFinal = '';
    if (ia.eh_nota_fiscal) {
      nomeFinal = buildRenamedNF({
        nf_numero: ia.nf_numero,
        nf_emitente_nome: ia.nf_emitente_nome,
        nome_profissional: ia.nome_profissional,
        museu_atuacao: ia.museu_atuacao,
        nf_valor_total: ia.nf_valor_total,
        extension: fileUrl.includes('.xml') ? 'xml' : 'pdf',
      });
    }

    // Montar resultado_ia enriquecido
    const resultadoIaCompleto = {
      ...ia,
      modelo_ia_utilizado: modeloUsado,
      score_confiabilidade: ia.score_confiabilidade || 0,
      // Dados de pagamento extraídos
      dados_pagamento: ia.dados_pagamento || {},
      // Validações do tomador
      tomador_correto: ia.tomador_correto ?? null,
      tomador_cnpj_encontrado: ia.tomador_cnpj_encontrado || '',
      descricao_conforme_padrao: ia.descricao_conforme_padrao ?? null,
      // Vínculo
      nome_profissional: ia.nome_profissional || '',
      funcao_exercida: ia.funcao_exercida || '',
      museu_atuacao: ia.museu_atuacao || '',
    };

    // Todas as pendências juntas (não bloqueam o envio)
    const todasPendencias = [
      ...inconsistencias,
      ...pendencias,
      ...avisos,
    ];

    // Salvar resultado — NÃO alterar aprovações existentes
    const intakeAtual = await base44.asServiceRole.entities.DocumentIntake.get(intakeId).catch(() => null);

    // Campos que NÃO devem ser sobrescritos se já houver aprovação
    const jaAprovado = ['APROVADO', 'PAGO'].includes(safeStr(intakeAtual?.status_processamento));

    const updatePayload = {
      tipo_detectado: tipoDetectado,
      status_processamento: jaAprovado ? intakeAtual.status_processamento : 'AGUARDANDO_REVISAO',
      resultado_ia: resultadoIaCompleto,
      file_name_final: nomeFinal || body.file_name || '',
      rubrica_justificativa: ia.justificativa_rubrica || '',
      erros_validacao: todasPendencias,
      revisado_pelo_usuario: false,
      // Dados de pagamento no nível raiz para acesso fácil nos modais
      fornecedor_nome: ia.nf_emitente_nome || intakeAtual?.fornecedor_nome || '',
      nf_emitente_nome: ia.nf_emitente_nome || '',
      nf_numero: ia.nf_numero || '',
      nf_valor_total: parseValor(ia.nf_valor_total) || null,
      municipio: ia.municipio || '',
      nf_emitente_cpf_cnpj: onlyDigits(ia.nf_emitente_cpf_cnpj || ''),
    };

    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, updatePayload);

    // Log de auditoria
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'UPDATE',
        entity_type: 'DOCUMENT_INTAKE',
        entity_id: intakeId,
        actor_email: user.email,
        actor_name: user.full_name || user.name || '',
        details: `NF processada com ${modeloUsado}. Tipo: ${tipoDetectado}. Score: ${ia.score_confiabilidade || 0}%. Tomador correto: ${ia.tomador_correto}. Museu: ${ia.museu_atuacao || 'N/A'}. Pendências: ${todasPendencias.length}.`,
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
      resultado_ia: resultadoIaCompleto,
      file_name_final: nomeFinal,
      pendencias: todasPendencias,
      requer_revisao: todasPendencias.length > 0,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});