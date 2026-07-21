import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function invokeOpenAI({ prompt, fileUrls = [], jsonSchema = null, model = 'gpt-4o' }: any): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const userContent: any[] = [{ type: 'text', text: prompt }];
  for (const url of fileUrls) { if (url) userContent.push({ type: 'image_url', image_url: { url, detail: 'high' } }); }
  const body: any = { model, messages: [{ role: 'user', content: userContent.length === 1 ? userContent[0].text : userContent }], max_tokens: 4096, temperature: 0.2 };
  if (jsonSchema) body.response_format = { type: 'json_object' };
  let lastErr: any;
  for (let i = 0; i < 2; i++) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
      if (!resp.ok) { const t = await resp.text().catch(() => resp.statusText); throw new Error(`OpenAI ${resp.status}: ${t}`); }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      const usage = data?.usage; if (usage) console.log(`[OpenAI] model=${model} in=${usage.prompt_tokens} out=${usage.completion_tokens}`);
      if (jsonSchema) { try { return JSON.parse(content); } catch { const m = content.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; } }
      return content;
    } catch (e: any) { lastErr = e; if (i === 0) { console.warn('[OpenAI] retry:', e.message); await new Promise(r => setTimeout(r, 2000)); } }
  }
  throw lastErr;
}

// ======================================================================
// CONSTANTES DO TOMADOR ESPERADO
// ======================================================================
const TOMADOR_ESPERADO = {
  nome: 'VIADUTO DAS ARTES',
  cnpj: '23843648000125',
  endereco: 'AV. OLINTO MEIRELES, 45 - BARREIRO, BELO HORIZONTE - MG, 30640-010',
  email: 'VIADUTODASARTES@VIADUTODASARTES.ORG.BR',
};

const MUSEUS_VALIDOS = ['MIS', 'MUMO', 'MHAB'];

const FUNCOES_QUE_EXIGEM_MUSEU = [
  'educador', 'educadora', 'produtor', 'produtora', 'produtor cultural',
  'produtora cultural', 'educação', 'educativo', 'producao', 'produção'
];

function safeStr(v) { return String(v || '').trim(); }
function onlyDigits(v) { return safeStr(v).replace(/\D/g, ''); }

function parseValor(v) {
  if (!v && v !== 0) return 0;
  const s = String(v).trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(String(s).replace(',', '.')) || 0;
}

function formatValorBR(v) {
  const num = parseValor(v);
  return num > 0 ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00';
}

function normalizeText(v) {
  return safeStr(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function normalizeDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;
  const iso2 = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (iso2) return `${iso2[1]}-${iso2[2]}-${iso2[3]}`;
  const MESES = {
    janeiro:'01',fevereiro:'02',marco:'03','março':'03',abril:'04',maio:'05',junho:'06',
    julho:'07',agosto:'08',setembro:'09',outubro:'10',novembro:'11',dezembro:'12',
    jan:'01',fev:'02',mar:'03',abr:'04',jun:'06',jul:'07',ago:'08',set:'09',out:'10',nov:'11',dez:'12',
  };
  const textual = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .match(/(\d{1,2})\s*(?:de\s*)?([a-zA-Z]+)\s*(?:de\s*)?(\d{4})/);
  if (textual) { const mes = MESES[textual[2]]; if (mes) return `${textual[3]}-${mes}-${textual[1].padStart(2,'0')}`; }
  const mesAno = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/^([a-zA-Z]+)[\/\s]+(\d{4})$/);
  if (mesAno) { const mes = MESES[mesAno[1]]; if (mes) return `${mesAno[2]}-${mes}-01`; }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

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
// PROCESSAMENTO COM OPENAI GPT-4o (visão de documentos)
// ======================================================================
async function processarComOpenAI(fileUrl, orientacoes) {
  const hoje = new Date().toISOString().slice(0, 10);

  const prompt = `VOCÊ É UM ESPECIALISTA EM DOCUMENTOS FISCAIS BRASILEIROS para o projeto MUSEUS CENTRO.

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
1. Leia o documento integralmente — TODOS os campos visíveis devem ser extraídos
2. IDENTIFIQUE O TIPO: pode ser Nota Fiscal, Recibo, Comprovante de Pagamento, Comprovante PIX/TED, Boleto ou outro documento complementar de NF
3. Se for Nota Fiscal: extraia TODOS os dados fiscais sem omitir nenhum campo
4. Se for Recibo, Comprovante ou documento complementar de uma NF: identifique a qual NF se refere e extraia os dados de correspondência
5. Verifique se o tomador bate com o Viaduto das Artes (CNPJ 23.843.648/0001-25)
6. Verifique se a descrição segue o padrão esperado
7. Extraia DADOS DE PAGAMENTO: banco, agência, conta, CPF/CNPJ do prestador, PIX
8. Identifique o NOME DO PROFISSIONAL (pessoa física por trás do CNPJ/MEI, se disponível)
9. Identifique o MUSEU DE ATUAÇÃO se mencionado: MIS, MUMO ou MHAB
10. Identifique a FUNÇÃO exercida no projeto
11. Marque PENDÊNCIAS não bloqueantes (nunca bloqueie o envio, apenas registre)

## REGRAS CRÍTICAS DE EXTRAÇÃO:
- **nf_data_emissao**: OBRIGATÓRIO. Leia a data exata do documento e retorne SEMPRE no formato YYYY-MM-DD. NUNCA deixe em branco se houver qualquer data no documento.
- **nf_emitente_cpf_cnpj**: OBRIGATÓRIO. Retorne APENAS dígitos, sem pontos, barras ou hífens (ex: "12345678000195").
- **nf_valor_total**: OBRIGATÓRIO. Retorne o valor decimal com ponto (ex: "2600.00").
- **nf_emitente_nome**: OBRIGATÓRIO. Razão social completa do emitente/prestador.
- **nf_numero**: Número da nota fiscal.
- **municipio**: Município de emissão da nota.
- Campos de dados_pagamento: extraia TODOS os dados bancários visíveis.

## ORIENTAÇÕES DO USUÁRIO:
${orientacoes || 'Nenhuma orientação adicional.'}

## RESPONDA EM JSON VÁLIDO com os campos: eh_nota_fiscal, eh_documento_complementar, tipo_documento_complementar, nf_numero_referenciado, nf_numero, nf_valor_total, nf_data_emissao, nf_emitente_nome, nf_emitente_cpf_cnpj, nome_profissional, funcao_exercida, museu_atuacao, descricao_servico, competencia, tipo_servico, municipio, tomador_correto, tomador_cnpj_encontrado, descricao_conforme_padrao, dados_pagamento (objeto com banco/agencia/conta/cpf_cnpj/pix), inconsistencias (array), pendencias (array), avisos (array), risco_duplicacao, score_confiabilidade, categoria_sugerida, justificativa_rubrica`;

  const result = await invokeOpenAI({
    prompt,
    fileUrls: [fileUrl],
    jsonSchema: { type: 'object' },
    model: 'gpt-4o',
  });

  return { success: true, data: result, model: 'gpt-4o' };
}

// ======================================================================
// VINCULAÇÃO DE DOCUMENTO COMPLEMENTAR
// ======================================================================
async function vincularDocumentoComplementar(base44, ia, intakeId) {
  const ehComplementar = ia.eh_documento_complementar === true && !ia.eh_nota_fiscal;
  if (!ehComplementar) return null;

  const cnpj = onlyDigits(ia.nf_emitente_cpf_cnpj || ia.dados_pagamento?.cpf_cnpj || '');
  const valor = parseValor(ia.nf_valor_total);
  const nfRefNum = safeStr(ia.nf_numero_referenciado || ia.nf_numero);
  const nomeEmitente = normalizeText(ia.nf_emitente_nome || '');

  const [intakesPorNum, purchasesPorNum, intakesPorCnpj, purchasesPorCnpj] = await Promise.all([
    nfRefNum ? base44.asServiceRole.entities.DocumentIntake.filter({ nf_numero: nfRefNum }, '-created_date', 20).catch(() => []) : Promise.resolve([]),
    nfRefNum ? base44.asServiceRole.entities.PurchaseRequest.filter({ nf_numero: nfRefNum }, '-created_date', 20).catch(() => []) : Promise.resolve([]),
    cnpj ? base44.asServiceRole.entities.DocumentIntake.filter({ nf_emitente_cpf_cnpj: cnpj }, '-created_date', 100).catch(() => []) : Promise.resolve([]),
    cnpj ? base44.asServiceRole.entities.PurchaseRequest.filter({ fornecedor_cnpj: cnpj }, '-created_date', 100).catch(() => []) : Promise.resolve([]),
  ]);

  const candidatos = new Map();
  for (const r of [...(intakesPorNum || []), ...(intakesPorCnpj || [])]) {
    if (r?.id && r.id !== intakeId) candidatos.set(`intake:${r.id}`, { ...r, _tipo: 'intake' });
  }
  for (const r of [...(purchasesPorNum || []), ...(purchasesPorCnpj || [])]) {
    if (r?.id) candidatos.set(`purchase:${r.id}`, { ...r, _tipo: 'purchase' });
  }

  let melhorCandidato = null;
  let melhorScore = 0;

  for (const candidato of candidatos.values()) {
    const cNum = safeStr(candidato.nf_numero || '');
    const cCnpj = onlyDigits(candidato.nf_emitente_cpf_cnpj || candidato.fornecedor_cnpj || '');
    const cValor = parseValor(candidato.nf_valor_total || candidato.valor_solicitado || 0);
    const cNome = normalizeText(candidato.nf_emitente_nome || candidato.fornecedor_nome || '');
    let score = 0;
    if (nfRefNum && cNum && nfRefNum === cNum) score += 40;
    if (cnpj && cCnpj && cnpj === cCnpj) score += 30;
    if (valor > 0 && cValor > 0 && Math.abs(valor - cValor) < 0.02) score += 20;
    if (nomeEmitente.length >= 5 && cNome.length >= 5 && (cNome.startsWith(nomeEmitente.slice(0, 8)) || nomeEmitente.startsWith(cNome.slice(0, 8)))) score += 10;
    if (score >= 50 && score > melhorScore) { melhorScore = score; melhorCandidato = candidato; }
  }

  return melhorCandidato
    ? { candidato: melhorCandidato, score: melhorScore, divergencia_valor: melhorCandidato && valor > 0 && Math.abs(valor - parseValor(melhorCandidato.nf_valor_total || melhorCandidato.valor_solicitado || 0)) >= 0.02 }
    : null;
}

function buildComplementarFileName(ia, tipoDoc) {
  const numero = safeStr(ia.nf_numero_referenciado || ia.nf_numero);
  const emitente = normalizeText(ia.nf_emitente_nome || 'FORNECEDOR').substring(0, 50);
  const profissional = normalizeText(ia.nome_profissional || '').substring(0, 50);
  const museuRaw = safeStr(ia.museu_atuacao).toUpperCase();
  const museu = MUSEUS_VALIDOS.includes(museuRaw) ? museuRaw : '';
  const valor = formatValorBR(ia.nf_valor_total);
  const sufixo = tipoDoc === 'RECIBO' ? 'RECIBO' : tipoDoc === 'COMPROVANTE_PAGAMENTO' ? 'COMPROVANTE' : 'DOCUMENTO COMPLEMENTAR';
  const profissionalPart = profissional && profissional !== emitente ? ` - ${profissional}` : '';
  const museuPart = museu ? ` - ${museu}` : '';
  const prefixo = numero ? `NF ${numero}` : 'DOC COMPLEMENTAR';
  return `${prefixo} - ${emitente}${profissionalPart} - MUSEUS CENTRO${museuPart} - R$ ${valor} - ${sufixo}.pdf`;
}

// ======================================================================
// VERIFICAÇÃO DE DUPLICIDADE NO BANCO
// ======================================================================
async function verificarDuplicidadeNF(base44, ia, intakeId) {
  const nfNumero = safeStr(ia.nf_numero);
  const cnpjEmitente = onlyDigits(ia.nf_emitente_cpf_cnpj || '');
  const nomeEmitente = normalizeText(ia.nf_emitente_nome || '');
  const dataEmissao = safeStr(ia.nf_data_emissao);
  const valor = parseValor(ia.nf_valor_total);

  if (!nfNumero && !cnpjEmitente) return [];

  const alertas = [];

  try {
    const [intakesCnpj, purchasesCnpj, intakesNum, purchasesNum] = await Promise.all([
      cnpjEmitente ? base44.asServiceRole.entities.DocumentIntake.filter({ nf_emitente_cpf_cnpj: cnpjEmitente }, '-created_date', 200).catch(() => []) : Promise.resolve([]),
      cnpjEmitente ? base44.asServiceRole.entities.PurchaseRequest.filter({ fornecedor_cnpj: cnpjEmitente }, '-created_date', 200).catch(() => []) : Promise.resolve([]),
      nfNumero ? base44.asServiceRole.entities.DocumentIntake.filter({ nf_numero: nfNumero }, '-created_date', 50).catch(() => []) : Promise.resolve([]),
      nfNumero ? base44.asServiceRole.entities.PurchaseRequest.filter({ nf_numero: nfNumero }, '-created_date', 50).catch(() => []) : Promise.resolve([]),
    ]);

    const candidatosMap = new Map();
    for (const r of [...(intakesCnpj || []), ...(intakesNum || [])]) {
      if (r?.id && r.id !== intakeId) candidatosMap.set(`intake:${r.id}`, { ...r, _tipo: 'intake' });
    }
    for (const r of [...(purchasesCnpj || []), ...(purchasesNum || [])]) {
      if (r?.id) candidatosMap.set(`purchase:${r.id}`, { ...r, _tipo: 'purchase' });
    }

    for (const candidato of candidatosMap.values()) {
      const cNum = safeStr(candidato.nf_numero || '');
      const cCnpj = onlyDigits(candidato.nf_emitente_cpf_cnpj || candidato.fornecedor_cnpj || '');
      const cNome = normalizeText(candidato.nf_emitente_nome || candidato.fornecedor_nome || '');
      const cData = safeStr(candidato.nf_data_emissao || '');
      const cValor = parseValor(candidato.nf_valor_total || candidato.valor_solicitado || 0);
      const refLabel = candidato._tipo === 'intake' ? `DocumentIntake #${candidato.id.slice(-6)}` : `Solicitação ${candidato.numero_processamento || ('#' + candidato.id.slice(-6))}`;
      const emissorLabel = candidato.nf_emitente_nome || candidato.fornecedor_nome || '';

      if (nfNumero && cNum && nfNumero === cNum && cnpjEmitente && cCnpj && cnpjEmitente === cCnpj) {
        alertas.push({ tipo: 'duplicidade_provavel', nivel: 'critico', mensagem: `⛔ DUPLICIDADE PROVÁVEL: NF ${nfNumero} do emissor CNPJ ${cnpjEmitente} já existe no sistema (${refLabel}${emissorLabel ? ' — ' + emissorLabel : ''}). Verifique antes de aprovar.`, referencia_id: candidato.id, referencia_tipo: candidato._tipo, referencia_label: refLabel });
        continue;
      }
      if (nfNumero && cNum && nfNumero === cNum && cnpjEmitente && cCnpj && cnpjEmitente !== cCnpj) {
        alertas.push({ tipo: 'inconsistencia_numero', nivel: 'atencao', mensagem: `⚠️ INCONSISTÊNCIA: NF ${nfNumero} já existe no sistema com CNPJ diferente (${refLabel}${emissorLabel ? ' — ' + emissorLabel : ''}). Confira se não é erro de digitação.`, referencia_id: candidato.id, referencia_tipo: candidato._tipo, referencia_label: refLabel });
        continue;
      }
      const cnpjIgual = cnpjEmitente && cCnpj && cnpjEmitente === cCnpj;
      const nomeIgual = nomeEmitente.length >= 5 && cNome.length >= 5 && (cNome.startsWith(nomeEmitente.slice(0, 8)) || nomeEmitente.startsWith(cNome.slice(0, 8)));
      const dataIgual = dataEmissao && cData && dataEmissao === cData;
      const valorIgual = valor > 0 && cValor > 0 && Math.abs(valor - cValor) < 0.02;
      if (cnpjIgual && nomeIgual && dataIgual && valorIgual) {
        const valorFmt = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        alertas.push({ tipo: 'possivel_duplicidade', nivel: 'atencao', mensagem: `⚠️ POSSÍVEL DUPLICIDADE: Emissor ${ia.nf_emitente_nome}, data ${dataEmissao} e valor R$ ${valorFmt} já encontrados no sistema (${refLabel}). Verifique antes de aprovar.`, referencia_id: candidato.id, referencia_tipo: candidato._tipo, referencia_label: refLabel });
      }
    }
  } catch (err) {
    console.warn('Erro ao verificar duplicidade:', err.message);
  }

  return alertas;
}

// ======================================================================
// VALIDAÇÕES PÓS-EXTRAÇÃO
// ======================================================================
function gerarPendenciasEValidacoes(ia, body) {
  const inconsistencias = Array.isArray(ia.inconsistencias) ? [...ia.inconsistencias] : [];
  const pendencias = Array.isArray(ia.pendencias) ? [...ia.pendencias] : [];
  const avisos = Array.isArray(ia.avisos) ? [...ia.avisos] : [];

  if (ia.tomador_correto === false) {
    const cnpjEncontrado = safeStr(ia.tomador_cnpj_encontrado);
    if (cnpjEncontrado && onlyDigits(cnpjEncontrado) !== TOMADOR_ESPERADO.cnpj) {
      inconsistencias.push(`⚠️ TOMADOR DIVERGENTE: CNPJ encontrado na NF (${cnpjEncontrado}) difere do Viaduto das Artes (23.843.648/0001-25). Verifique antes de aprovar.`);
    } else if (!cnpjEncontrado) {
      pendencias.push('Campo Tomador não localizado na NF. Verifique se o documento está completo.');
    }
  }
  if (ia.descricao_conforme_padrao === false) pendencias.push('Descrição do serviço não segue o padrão esperado: "Prestação de serviço de [função] ao Projeto Museus Centro - Termo de Colaboração 01-031.069/24-80..."');

  const funcao = safeStr(ia.funcao_exercida);
  const museu = safeStr(ia.museu_atuacao).toUpperCase();
  if (funcaoExigeMuseu(funcao) && !MUSEUS_VALIDOS.includes(museu)) pendencias.push(`⚠️ Função "${funcao}" exige identificação do museu de atuação (MIS, MUMO ou MHAB). Não identificado na NF.`);

  const pag = ia.dados_pagamento || {};
  if (!pag.banco) pendencias.push('Dados de pagamento: Banco não identificado.');
  if (!pag.conta) pendencias.push('Dados de pagamento: Conta não identificada.');
  if (!pag.cpf_cnpj && !pag.pix) pendencias.push('Dados de pagamento: CPF/CNPJ e PIX não identificados.');
  if (ia.risco_duplicacao === 'alto') pendencias.push('⚠️ RISCO ALTO DE DUPLICAÇÃO: Verifique se já existe NF similar no sistema.');
  if (!safeStr(ia.nome_profissional)) pendencias.push('Nome do profissional/prestador não identificado na NF.');

  return { inconsistencias, pendencias, avisos };
}

// ======================================================================
// HANDLER PRINCIPAL
// ======================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const intakeId = safeStr(body.intake_id);
    const fileUrl = safeStr(body.file_url);
    const orientacoes = safeStr(body.orientacoes_usuario);

    if (!intakeId || !fileUrl) return Response.json({ ok: false, error: 'intake_id e file_url obrigatórios' }, { status: 400 });

    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, { status_processamento: 'ANALISANDO_IA' });

    let resultado;
    try {
      resultado = await processarComOpenAI(fileUrl, orientacoes);
    } catch (e) {
      console.error('Erro OpenAI:', e.message);
      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'ERRO_PROCESSAMENTO',
        erros_validacao: ['Falha ao analisar com IA: ' + e.message],
      });
      return Response.json({ ok: false, error: e.message }, { status: 500 });
    }

    const ia = resultado.data || {};
    const modeloUsado = resultado.model;

    if (ia.nf_data_emissao) ia.nf_data_emissao = normalizeDate(ia.nf_data_emissao);
    if (ia.nf_emitente_cpf_cnpj) ia.nf_emitente_cpf_cnpj = onlyDigits(ia.nf_emitente_cpf_cnpj);
    if (ia.dados_pagamento?.cpf_cnpj) ia.dados_pagamento.cpf_cnpj = onlyDigits(ia.dados_pagamento.cpf_cnpj);
    if (ia.tomador_cnpj_encontrado) ia.tomador_cnpj_encontrado = onlyDigits(ia.tomador_cnpj_encontrado);
    console.log(`📋 Campos extraídos — data: "${ia.nf_data_emissao}", CNPJ: "${ia.nf_emitente_cpf_cnpj}", valor: "${ia.nf_valor_total}", num: "${ia.nf_numero}"`);

    const { inconsistencias, pendencias, avisos } = gerarPendenciasEValidacoes(ia, body);
    const alertasDuplicidade = await verificarDuplicidadeNF(base44, ia, intakeId);
    for (const alerta of alertasDuplicidade) {
      if (alerta.nivel === 'critico') inconsistencias.unshift(alerta.mensagem);
      else pendencias.unshift(alerta.mensagem);
    }

    const vinculoComplementar = await vincularDocumentoComplementar(base44, ia, intakeId);
    let nfVinculadaId = null;
    let nfVinculadaTipo = null;

    if (vinculoComplementar) {
      const { candidato, score, divergencia_valor } = vinculoComplementar;
      nfVinculadaId = candidato.id;
      nfVinculadaTipo = candidato._tipo;
      if (divergencia_valor) {
        pendencias.unshift(`⚠️ DOCUMENTO COMPLEMENTAR vinculado à NF ${candidato.nf_numero || nfVinculadaId} com DIVERGÊNCIA DE VALOR. Revisão manual necessária.`);
      } else {
        avisos.unshift(`ℹ️ Documento complementar vinculado à NF ${candidato.nf_numero || nfVinculadaId} com score ${score}%.`);
      }
      if (candidato._tipo === 'purchase' && !candidato.comprovante_url && fileUrl) {
        base44.asServiceRole.entities.PurchaseRequest.update(candidato.id, { comprovante_url: fileUrl }).catch(() => {});
      }
    }

    const ehDocComplementar = ia.eh_documento_complementar === true && !ia.eh_nota_fiscal;
    let tipoDetectado = 'DOCUMENTO_ADMINISTRATIVO';
    if (ia.eh_nota_fiscal) tipoDetectado = fileUrl.includes('.xml') ? 'NOTA_FISCAL_XML' : 'NOTA_FISCAL_PDF';

    let nomeFinal = '';
    if (ia.eh_nota_fiscal) {
      nomeFinal = buildRenamedNF({ nf_numero: ia.nf_numero, nf_emitente_nome: ia.nf_emitente_nome, nome_profissional: ia.nome_profissional, museu_atuacao: ia.museu_atuacao, nf_valor_total: ia.nf_valor_total, extension: fileUrl.includes('.xml') ? 'xml' : 'pdf' });
    } else if (ehDocComplementar) {
      nomeFinal = buildComplementarFileName(ia, safeStr(ia.tipo_documento_complementar) || 'DOCUMENTO_COMPLEMENTAR');
    }

    const dataNormalizada = normalizeDate(ia.nf_data_emissao);
    const cnpjNormalizado = onlyDigits(ia.nf_emitente_cpf_cnpj || '');
    const todasPendencias = [...inconsistencias, ...pendencias, ...avisos];

    const resultadoIaCompleto = {
      ...ia,
      modelo_ia_utilizado: modeloUsado,
      score_confiabilidade: ia.score_confiabilidade || 0,
      dados_pagamento: ia.dados_pagamento || {},
      tomador_correto: ia.tomador_correto ?? null,
      tomador_cnpj_encontrado: ia.tomador_cnpj_encontrado || '',
      descricao_conforme_padrao: ia.descricao_conforme_padrao ?? null,
      nome_profissional: ia.nome_profissional || '',
      funcao_exercida: ia.funcao_exercida || '',
      museu_atuacao: ia.museu_atuacao || '',
      alertas_duplicidade: alertasDuplicidade,
      tem_duplicidade: alertasDuplicidade.length > 0,
      eh_documento_complementar: ia.eh_documento_complementar || false,
      tipo_documento_complementar: ia.tipo_documento_complementar || null,
      nf_numero_referenciado: ia.nf_numero_referenciado || '',
      nf_vinculada_id: nfVinculadaId,
      nf_vinculada_tipo: nfVinculadaTipo,
    };

    const intakeAtual = await base44.asServiceRole.entities.DocumentIntake.get(intakeId).catch(() => null);
    const jaAprovado = ['APROVADO', 'PAGO'].includes(safeStr(intakeAtual?.status_processamento));

    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      tipo_detectado: tipoDetectado,
      status_processamento: jaAprovado ? intakeAtual.status_processamento : 'AGUARDANDO_REVISAO',
      resultado_ia: resultadoIaCompleto,
      file_name_final: nomeFinal || body.file_name || '',
      rubrica_justificativa: ia.justificativa_rubrica || '',
      erros_validacao: todasPendencias,
      revisado_pelo_usuario: false,
      fornecedor_nome: ia.nf_emitente_nome || intakeAtual?.fornecedor_nome || '',
      nf_emitente_nome: ia.nf_emitente_nome || '',
      nf_numero: ia.nf_numero || '',
      nf_valor_total: parseValor(ia.nf_valor_total) || null,
      nf_data_emissao: dataNormalizada || undefined,
      municipio: ia.municipio || '',
      nf_emitente_cpf_cnpj: cnpjNormalizado || '',
      fornecedor_cpf_cnpj: cnpjNormalizado || '',
    });

    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'UPDATE', entity_type: 'DOCUMENT_INTAKE', entity_id: intakeId, actor_email: user.email, actor_name: user.full_name || '',
        details: `NF processada com ${modeloUsado}. Tipo: ${tipoDetectado}. Score: ${ia.score_confiabilidade || 0}%. Pendências: ${todasPendencias.length}.`,
      });
    } catch {}

    return Response.json({ ok: true, intake_id: intakeId, tipo_detectado: tipoDetectado, modelo_utilizado: modeloUsado, score_confiabilidade: ia.score_confiabilidade || 0, resultado_ia: resultadoIaCompleto, file_name_final: nomeFinal, pendencias: todasPendencias, requer_revisao: todasPendencias.length > 0, alertas_duplicidade: alertasDuplicidade, tem_duplicidade: alertasDuplicidade.length > 0, eh_documento_complementar: ehDocComplementar, tipo_documento_complementar: ia.tipo_documento_complementar || null, nf_vinculada_id: nfVinculadaId, nf_vinculada_tipo: nfVinculadaTipo });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});