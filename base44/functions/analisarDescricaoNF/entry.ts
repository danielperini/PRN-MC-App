import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * analisarDescricaoNF
 *
 * Análise determinística da descrição de uma Nota Fiscal.
 * Não depende da ordem dos termos — valida por PRESENÇA de componentes.
 * Nunca inventa informações ausentes.
 *
 * Params: {
 *   descricao_nf: string,         // texto da descrição da NF
 *   data_emissao_nf?: string,     // YYYY-MM-DD — para validar competência
 *   pix_texto?: string,            // campo texto onde pode haver chave pix
 *   solicitacao?: {                // dados já cadastrados na solicitação (para comparar)
 *     museu?: string,
 *     pix?: string,
 *     pix_tipo?: string,
 *     competencia?: string,
 *     funcao?: string,
 *   }
 * }
 */

// ────────────────────────────────────────────────────────────────────────────
// NORMALIZAÇÃO
// ────────────────────────────────────────────────────────────────────────────
function norm(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// COMPONENTES OBRIGATÓRIOS DO PROJETO
// ────────────────────────────────────────────────────────────────────────────
const PROJETO_PATTERNS = [
  /museus\s+centro/i,
  /museu\s+centro/i,
];

const TERMO_PATTERNS = [
  /termo\s+de\s+colabo[rg]a[cç][aã]o/i,
  /termo\s+colabo/i,
];

const NUMERO_TERMO_PATTERNS = [
  /01[\s\-]?031[\s\.]?069[\s\/]?24[\s\-]?80/,
  /01\.031\.069\/24[\-\s]?80/,
  /01031069 ?24 ?80/,
];

const PARCERIA_PATTERNS = [
  /smc\s*[\/,e&]\s*fmc/i,
  /fmc\s*[\/,e&]\s*smc/i,
  /parceria\s+com\s+smc/i,
  /smc\/fmc/i,
];

// ────────────────────────────────────────────────────────────────────────────
// MUSEUS — tabela de aliases
// ────────────────────────────────────────────────────────────────────────────
const MUSEU_ALIASES = [
  { sigla: 'MIS',  patterns: [/\bMIS\b/i, /museu\s+da\s+imagem\s+e\s+do\s+som/i, /imagem\s+e\s+som/i] },
  { sigla: 'MUMO', patterns: [/\bMUMO\b/i, /museu\s+da\s+moda/i, /museu\s+moda/i] },
  { sigla: 'MHAB', patterns: [/\bMHAB\b/i, /museu\s+hist[oó]rico/i, /ab[ií]lio\s+barreto/i, /\bMAB\b/i] },
  { sigla: 'NOTURNO PAMPULHA', patterns: [/noturno\s+pampulha/i, /pampulha/i] },
  { sigla: 'NOTURNO', patterns: [/noturno\s+nos\s+museus/i, /\bnoturno\b/i] },
];

function extrairMuseu(texto) {
  for (const m of MUSEU_ALIASES) {
    if (m.patterns.some(p => p.test(texto))) return m.sigla;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// FUNÇÕES / COLABORADORES
// ────────────────────────────────────────────────────────────────────────────
const FUNCAO_ALIASES = [
  { funcao: 'EDUCADOR',               patterns: [/\beducador[ae]?\b/i] },
  { funcao: 'COORDENADOR GERAL',      patterns: [/coordenador[ae]?\s+geral/i] },
  { funcao: 'COORDENADOR PRODUCAO',   patterns: [/coordenador[ae]?\s+de\s+produ[cç][aã]o/i, /coordenador[ae]?\s+produ[cç][aã]o/i] },
  { funcao: 'COORDENADOR COMUNICACAO',patterns: [/coordenador[ae]?\s+de\s+comunica[cç][aã]o/i, /coordenador[ae]?\s+comunica[cç][aã]o/i] },
  { funcao: 'COORDENADOR PROGRAMACAO',patterns: [/coordenador[ae]?\s+de\s+programa[cç][aã]o/i, /coordenador[ae]?\s+programa[cç][aã]o/i] },
  { funcao: 'ANALISTA ADM FINANCEIRO',patterns: [/analista\s+adm/i, /analista\s+administrativo\s+financeiro/i] },
  { funcao: 'GESTOR ADM FINANCEIRO',  patterns: [/gestor[ae]?\s+adm/i, /gestor[ae]?\s+administrativo/i] },
  { funcao: 'ASSISTENTE COORDENACAO', patterns: [/assistente\s+de\s+coordena[cç][aã]o/i] },
  { funcao: 'ASSISTENTE PRODUCAO',    patterns: [/assistente\s+de\s+produ[cç][aã]o/i] },
  { funcao: 'MOBILIZADOR',            patterns: [/mobilizador[ae]?\b/i] },
  { funcao: 'MONITOR',                patterns: [/monitor[ae]?s?\b/i] },
  { funcao: 'PRODUCAO',               patterns: [/produ[cç][aã]o\s+(mis|mumo|mhab|noturno)/i] },
  { funcao: 'FOTOGRAFO',              patterns: [/fotograf[ao]\b/i, /fotografo\b/i] },
  { funcao: 'DESIGNER',               patterns: [/\bdesigner\b/i] },
  { funcao: 'ASSESSOR IMPRENSA',      patterns: [/assessor[ae]?\s+de\s+imprensa/i, /assessoria\s+de\s+imprensa/i] },
  { funcao: 'REDATOR',                patterns: [/redator[ae]?\b/i] },
  { funcao: 'CONTADOR',               patterns: [/\bcontador[ae]?\b/i] },
  { funcao: 'ASSESSOR JURIDICO',      patterns: [/assessor[ae]?\s+jur[ií]dico/i, /advogado/i] },
];

function extrairFuncao(texto) {
  for (const f of FUNCAO_ALIASES) {
    if (f.patterns.some(p => p.test(texto))) return f.funcao;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// TIPO DE DESPESA
// ────────────────────────────────────────────────────────────────────────────
function classificarTipoDespesa(texto) {
  const n = norm(texto);

  // MANUTENCAO_ROTINA
  if (/manutencao|manutecao|reparo|pintura|conserto/i.test(texto)) return 'MANUTENCAO_ROTINA';

  // Colaboradores por presença de função
  const funcao = extrairFuncao(texto);
  if (funcao) return 'COLABORADOR_MENSAL';

  // Material
  if (/\bmaterial\b|\baquisicao\s+de\b|\bcompra\s+de\b|\bfornecimento\s+de\b/i.test(texto)) return 'MATERIAL';

  return 'OUTRO_CONFIGURADO';
}

// ────────────────────────────────────────────────────────────────────────────
// COMPETÊNCIA
// ────────────────────────────────────────────────────────────────────────────
const MESES_PT = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function extrairCompetencia(texto) {
  // mm/yyyy ou mm-yyyy
  let m = texto.match(/\b(0?[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (m) return `${m[1].padStart(2,'0')}/${m[2]}`;

  // "julho de 2026" / "julho/2026"
  const mesNome = MESES_PT.find(mes => norm(texto).includes(mes));
  if (mesNome) {
    const anoM = texto.match(/20\d{2}/);
    if (anoM) {
      const numMes = String(MESES_PT.indexOf(mesNome) + 1).padStart(2, '0');
      return `${numMes}/${anoM[0]}`;
    }
  }

  // "referente ao mes 07-2026"
  m = texto.match(/referente\s+(?:ao|a)\s+m[eê]s\s+(0?[1-9]|1[0-2])[\-\/](20\d{2})/i);
  if (m) return `${m[1].padStart(2,'0')}/${m[2]}`;

  return null;
}

function competenciaEsperada(dataEmissao) {
  if (!dataEmissao) return null;
  try {
    const d = new Date(dataEmissao + 'T12:00:00Z');
    if (isNaN(d.getTime())) return null;
    const mesAnt = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const mm = String(mesAnt.getMonth() + 1).padStart(2, '0');
    const yyyy = mesAnt.getFullYear();
    return `${mm}/${yyyy}`;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DE DATAS
// ────────────────────────────────────────────────────────────────────────────
function extrairDatas(texto) {
  const resultados = [];
  const regex = /\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/g;
  let m;
  while ((m = regex.exec(texto)) !== null) {
    resultados.push(`${m[1]}/${m[2]}/${m[3]}`);
  }

  // "20 de julho de 2026"
  const mesNomePorExtenso = MESES_PT.find(mes => norm(texto).includes(mes));
  if (mesNomePorExtenso) {
    const diaM = texto.match(/\b(\d{1,2})\s+de\s+/i);
    const anoM = texto.match(/20\d{2}/);
    if (diaM && anoM) {
      const numMes = String(MESES_PT.indexOf(mesNomePorExtenso) + 1).padStart(2, '0');
      resultados.push(`${diaM[1].padStart(2,'0')}/${numMes}/${anoM[0]}`);
    }
  }

  return [...new Set(resultados)];
}

function extrairDataContextual(texto, contextos) {
  // Tenta encontrar data próxima de palavras de contexto
  for (const ctx of contextos) {
    const regex = new RegExp(`${ctx}[^\\d]{0,30}(\\d{2})[\/\\-](\\d{2})[\/\\-](\\d{4})`, 'i');
    const m = texto.match(regex);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DE SERVIÇO (manutenção)
// ────────────────────────────────────────────────────────────────────────────
function extrairServico(texto) {
  // Núcleo descritivo após marcador de manutenção
  const padrao = /(?:manutencao(?:\s+de\s+rotina)?|manutecao|reparo|pintura|conserto)\s*[:\-–]?\s*([^\.;,\n]{3,60})/i;
  const m = norm(texto).match(padrao);
  if (m) return m[1].trim();

  // Tenta extrair antes de "no" + museu
  const padrao2 = /(?:servico\s+de\s+|realizado\s+(?:servico\s+de\s+)?)([a-z\s]{3,40})(?:\s+(?:no|na|em)\s+(?:mis|mumo|mhab|museu))/i;
  const m2 = norm(texto).match(padrao2);
  if (m2) return m2[1].trim();

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DE MATERIAL
// ────────────────────────────────────────────────────────────────────────────
const MATERIAL_GENERICO = ['materiais', 'materiais diversos', 'material geral', 'insumos diversos', 'material'];

function extrairMaterial(texto) {
  const marcadores = [
    /aquisicao\s+de\s+([^\.;,\n]{5,80})/i,
    /compra\s+de\s+([^\.;,\n]{5,80})/i,
    /fornecimento\s+de\s+([^\.;,\n]{5,80})/i,
    /material\s*[:\-–]\s*([^\.;,\n]{5,80})/i,
  ];

  for (const regex of marcadores) {
    const m = norm(texto).match(regex);
    if (m) {
      const mat = m[1].trim();
      // Checar se é genérico
      if (MATERIAL_GENERICO.some(g => norm(mat) === g || norm(mat).startsWith(g))) {
        return { material: null, especificado: false };
      }
      return { material: mat, especificado: true };
    }
  }

  return { material: null, especificado: false };
}

// ────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DE EVENTO/AÇÃO
// ────────────────────────────────────────────────────────────────────────────
function extrairEvento(texto) {
  const marcadores = [
    /para\s+o\s+evento\s+([^\.;,\n\-–]{3,60})/i,
    /referente\s+ao\s+evento\s+([^\.;,\n\-–]{3,60})/i,
    /utilizado\s+no\s+evento\s+([^\.;,\n\-–]{3,60})/i,
    /para\s+a\s+oficina\s+([^\.;,\n\-–]{3,60})/i,
    /para\s+a\s+exposi[cç][aã]o\s+([^\.;,\n\-–]{3,60})/i,
    /para\s+o\s+noturno\s+([^\.;,\n\-–]{3,60})/i,
    /destinado\s+[aà]\s+([^\.;,\n\-–]{3,60})/i,
    /realizado\s+(?:no\s+evento\s+)?([^\.;,\n\-–]{3,60})/i,
  ];

  for (const regex of marcadores) {
    const m = texto.match(regex);
    if (m) return m[1].trim().replace(/\s+dia\s+.*/i, '').trim();
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DE PIX
// ────────────────────────────────────────────────────────────────────────────
function normalizarPix(raw) {
  return raw.replace(/[\.\-\/\s]/g, '');
}

function extrairPix(texto) {
  if (!texto) return { pix_encontrado: false };

  // CNPJ (14 dígitos com ou sem formatação)
  const cnpjFormatado = texto.match(/\b\d{2}[\.\-]?\d{3}[\.\-]?\d{3}[\/\-]?\d{4}[\-]?\d{2}\b/);
  if (cnpjFormatado) {
    const limpo = normalizarPix(cnpjFormatado[0]);
    if (limpo.length === 14) return { pix_encontrado: true, pix_tipo: 'CNPJ', pix_chave: limpo, pix_chave_original: cnpjFormatado[0], pix_valido_para_preenchimento: true };
  }

  // CPF (11 dígitos)
  const cpfFormatado = texto.match(/\b\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\-]?\d{2}\b/);
  if (cpfFormatado) {
    const limpo = normalizarPix(cpfFormatado[0]);
    if (limpo.length === 11) return { pix_encontrado: true, pix_tipo: 'CPF', pix_chave: limpo, pix_chave_original: cpfFormatado[0], pix_valido_para_preenchimento: true };
  }

  // E-mail
  const emailM = texto.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailM) return { pix_encontrado: true, pix_tipo: 'EMAIL', pix_chave: emailM[0].toLowerCase(), pix_chave_original: emailM[0], pix_valido_para_preenchimento: true };

  // Telefone (com DDD)
  const telM = texto.match(/(?:pix\s*[:\-]?\s*)?\(?\d{2}\)?\s*9?\d{4}[\-\s]?\d{4}/i);
  if (telM) {
    const limpo = telM[0].replace(/\D/g, '');
    return { pix_encontrado: true, pix_tipo: 'TELEFONE', pix_chave: limpo, pix_chave_original: telM[0], pix_valido_para_preenchimento: limpo.length >= 10 };
  }

  // Chave após "Pix:" ou "Chave:"
  const chaveM = texto.match(/(?:chave\s+pix|pix)\s*[:\-]?\s*([a-zA-Z0-9\-\.\_\@\+]{8,})/i);
  if (chaveM) {
    const val = chaveM[1].trim();
    // Checar se é mascarada (xxx...)
    const mascarada = /x{3,}|\.{3,}/i.test(val);
    return {
      pix_encontrado: true,
      pix_tipo: 'NAO_IDENTIFICADO',
      pix_chave: val,
      pix_chave_original: val,
      pix_valido_para_preenchimento: !mascarada,
      motivo: mascarada ? 'Chave PIX mascarada ou incompleta.' : undefined,
    };
  }

  return { pix_encontrado: false };
}

// ────────────────────────────────────────────────────────────────────────────
// COMPARAR COM SOLICITAÇÃO EXISTENTE
// ────────────────────────────────────────────────────────────────────────────
function compararCampo(valorSolicitacao, valorExtraido, campo) {
  if (!valorSolicitacao && valorExtraido) return { status: 'VAZIO_PREENCHIVEL', valor_sugerido: valorExtraido, origem: 'DESCRICAO_NF', preencher_automaticamente: true };
  if (!valorSolicitacao && !valorExtraido) return { status: 'AUSENTE' };
  if (valorSolicitacao && !valorExtraido) return { status: 'NAO_ENCONTRADO_NA_NF', valor_atual: valorSolicitacao };

  const nS = norm(String(valorSolicitacao));
  const nE = norm(String(valorExtraido));
  if (nS === nE || nS.includes(nE) || nE.includes(nS)) {
    return { status: 'CONFERE', valor: valorSolicitacao };
  }
  return { status: 'DIVERGENTE', valor_solicitacao: valorSolicitacao, valor_nf: valorExtraido, acao: 'REVISAR' };
}

// ────────────────────────────────────────────────────────────────────────────
// GERAR DESCRIÇÃO SUGERIDA POR TEMPLATE
// ────────────────────────────────────────────────────────────────────────────
function gerarDescricaoSugerida(tipo, extraido) {
  const base = `Projeto Museus Centro - Termo de Colaboração 01-031.069/24-80, parceria SMC/FMC`;

  if (tipo === 'MANUTENCAO_ROTINA') {
    const serv = extraido.servico || '[ESPECIFICAR SERVIÇO]';
    const museu = extraido.museu || '[MUSEU]';
    const data = extraido.data_execucao || '[DATA]';
    return `${base}: MANUTENÇÃO DE ROTINA - ${serv} - ${museu} - ${data}`;
  }

  if (tipo === 'COLABORADOR_MENSAL') {
    const funcao = extraido.funcao || '[FUNÇÃO]';
    const museu = extraido.museu || '[MUSEU]';
    const comp = extraido.competencia || '[MM/YYYY]';
    return `${base}: ${funcao} ${museu} - referente ao mês ${comp}`;
  }

  if (tipo === 'MATERIAL') {
    const mat = extraido.material || '[ESPECIFICAR MATERIAL]';
    const museu = extraido.museu || '[MUSEU]';
    const evento = extraido.evento_acao ? ` - para o evento ${extraido.evento_acao}` : '';
    return `${base}: MATERIAL ${museu} - ${mat}${evento}`;
  }

  return `${base}: [DESCREVER SERVIÇO/MATERIAL]`;
}

// ────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const descricao = String(body.descricao_nf || '');
    const dataEmissao = String(body.data_emissao_nf || '');
    const pixTexto = String(body.pix_texto || '') + ' ' + descricao;
    const solicitacao = body.solicitacao || {};

    if (!descricao.trim()) {
      return Response.json({ ok: false, error: 'descricao_nf é obrigatória' }, { status: 400 });
    }

    // ── 1. VERIFICAR COMPONENTES OBRIGATÓRIOS ──────────────────────────────
    const projeto_museus_centro = PROJETO_PATTERNS.some(p => p.test(descricao));
    const termo_colaboracao_ok  = TERMO_PATTERNS.some(p => p.test(descricao));
    const numero_termo_ok       = NUMERO_TERMO_PATTERNS.some(p => p.test(descricao));
    const parceria_smc_fmc_ok   = PARCERIA_PATTERNS.some(p => p.test(descricao));
    const descricao_projeto_ok  = projeto_museus_centro && termo_colaboracao_ok && numero_termo_ok && parceria_smc_fmc_ok;

    const componentes_faltantes = [];
    if (!projeto_museus_centro) componentes_faltantes.push('Projeto Museus Centro');
    if (!termo_colaboracao_ok)  componentes_faltantes.push('Termo de Colaboração');
    if (!numero_termo_ok)       componentes_faltantes.push('Número do Termo (01-031.069/24-80)');
    if (!parceria_smc_fmc_ok)   componentes_faltantes.push('Parceria SMC/FMC');

    // ── 2. CLASSIFICAR TIPO DE DESPESA ────────────────────────────────────
    const tipo_despesa = classificarTipoDespesa(descricao);

    // ── 3. EXTRAIR ENTIDADES ──────────────────────────────────────────────
    const museu          = extrairMuseu(descricao);
    const funcao         = extrairFuncao(descricao);
    const competencia    = extrairCompetencia(descricao);
    const datas          = extrairDatas(descricao);
    const data_execucao  = extrairDataContextual(descricao, ['realizado', 'executado', 'dia', 'em']);
    const data_evento    = extrairDataContextual(descricao, ['evento', 'oficina', 'exposi']);
    const servico        = tipo_despesa === 'MANUTENCAO_ROTINA' ? extrairServico(descricao) : null;
    const { material, especificado: material_especificado } = tipo_despesa === 'MATERIAL' ? extrairMaterial(descricao) : { material: null, especificado: false };
    const evento_acao    = extrairEvento(descricao);
    const pixResult      = extrairPix(pixTexto);

    // ── 4. VALIDAR COMPETÊNCIA (colaboradores) ────────────────────────────
    let competencia_ok = null;
    let competencia_esperada_val = null;
    if (tipo_despesa === 'COLABORADOR_MENSAL' && competencia && dataEmissao) {
      competencia_esperada_val = competenciaEsperada(dataEmissao);
      competencia_ok = competencia === competencia_esperada_val;
    }

    // ── 5. CAMPOS OBRIGATÓRIOS POR TIPO ──────────────────────────────────
    let campos_faltantes = [];
    let status_final = 'CONFORME';

    if (!descricao_projeto_ok) {
      status_final = 'AJUSTE_NECESSARIO';
    }

    if (tipo_despesa === 'MANUTENCAO_ROTINA') {
      if (!servico)       campos_faltantes.push('servico');
      if (!museu)         campos_faltantes.push('museu_local');
      if (!data_execucao && datas.length === 0) campos_faltantes.push('data_execucao');
      if (campos_faltantes.length > 0) status_final = 'AJUSTE_NECESSARIO';
    }

    if (tipo_despesa === 'COLABORADOR_MENSAL') {
      if (!funcao)      campos_faltantes.push('funcao');
      if (!competencia) campos_faltantes.push('competencia');
      if (competencia_ok === false) { campos_faltantes.push('competencia_incorreta'); status_final = 'REVISAR'; }
      if (campos_faltantes.length > 0 && status_final === 'CONFORME') status_final = 'AJUSTE_NECESSARIO';
    }

    if (tipo_despesa === 'MATERIAL') {
      if (!material_especificado) { campos_faltantes.push('material_nao_especificado'); status_final = 'AJUSTE_NECESSARIO'; }
    }

    // ── 6. COMPARAR COM SOLICITAÇÃO ────────────────────────────────────────
    const comparacoes = {};
    comparacoes.museu    = compararCampo(solicitacao.museu, museu, 'museu');
    comparacoes.funcao   = compararCampo(solicitacao.funcao, funcao, 'funcao');
    comparacoes.pix      = solicitacao.pix && pixResult.pix_encontrado
      ? { status: norm(solicitacao.pix) === norm(pixResult.pix_chave) ? 'CONFERE' : 'DIVERGENTE', valor_solicitacao: solicitacao.pix, valor_nf: pixResult.pix_chave }
      : null;

    if (comparacoes.museu.status === 'DIVERGENTE' || comparacoes.pix?.status === 'DIVERGENTE') {
      status_final = 'REVISAR';
    }

    // ── 7. PREENCHIMENTO AUTOMÁTICO (somente campos vazios e inequívocos) ──
    const preenchimento_automatico = {};
    if (comparacoes.museu?.status === 'VAZIO_PREENCHIVEL') {
      preenchimento_automatico.museu_local = { valor: museu, origem: 'DESCRICAO_NF', regra: 'alias_museu' };
    }
    if (!solicitacao.pix && pixResult.pix_encontrado && pixResult.pix_valido_para_preenchimento) {
      preenchimento_automatico.pix = { valor: pixResult.pix_chave, tipo: pixResult.pix_tipo, origem: 'DOCUMENTO', preenchimento_automatico_pix: true };
    }
    if (!solicitacao.funcao && funcao) {
      preenchimento_automatico.funcao = { valor: funcao, origem: 'DESCRICAO_NF', regra: 'alias_funcao' };
    }
    if (!solicitacao.competencia && competencia) {
      preenchimento_automatico.competencia = { valor: competencia, origem: 'DESCRICAO_NF' };
    }

    // ── 8. DESCRIÇÃO SUGERIDA ─────────────────────────────────────────────
    const descricao_sugerida = gerarDescricaoSugerida(tipo_despesa, {
      servico, museu, data_execucao: data_execucao || datas[0],
      funcao, competencia, material, evento_acao,
    });

    // ── RESULTADO FINAL ───────────────────────────────────────────────────
    return Response.json({
      ok: true,
      status: status_final,   // CONFORME | AJUSTE_NECESSARIO | REVISAR

      // Componentes obrigatórios do projeto
      componentes: {
        projeto_museus_centro,
        termo_colaboracao_ok,
        numero_termo_ok,
        parceria_smc_fmc_ok,
        descricao_projeto_ok,
        faltantes: componentes_faltantes,
      },

      // Classificação
      tipo_despesa,

      // Dados extraídos
      extraido: {
        museu_local: museu,
        funcao,
        competencia,
        competencia_esperada: competencia_esperada_val,
        competencia_ok,
        servico,
        material: material || null,
        material_especificado,
        evento_acao,
        data_execucao,
        data_evento,
        datas_encontradas: datas,
      },

      // PIX
      pix: pixResult,

      // Comparações com solicitação
      comparacoes,

      // Campos faltantes
      campos_faltantes,

      // Preenchimento automático sugerido (somente campos vazios e inequívocos)
      preenchimento_automatico,

      // Descrição sugerida por template
      descricao_sugerida,

      // Data análise
      analisado_em: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[analisarDescricaoNF]', err);
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
});