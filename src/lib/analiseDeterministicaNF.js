/**
 * analiseDeterministicaNF.js
 * Análise determinística de NF por presença de componentes (não por ordem).
 * Extrai entidades, valida componentes obrigatórios, detecta PIX,
 * preenche campos vazios e marca divergências.
 * Nunca inventa informações ausentes.
 */

// ─── Normalização ─────────────────────────────────────────────────────────────
function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Aliases de museu ─────────────────────────────────────────────────────────
const MUSEU_ALIASES = {
  MIS: ['mis', 'museu da imagem e do som', 'imagem e som'],
  MUMO: ['mumo', 'museu da moda', 'museu do moderno', 'moda'],
  MHAB: ['mhab', 'museu historico abilio barreto', 'abilio barreto', 'historico municipal'],
};

function extrairMuseu(texto) {
  const t = norm(texto);
  for (const [codigo, aliases] of Object.entries(MUSEU_ALIASES)) {
    if (aliases.some((a) => t.includes(norm(a)))) return codigo;
  }
  return null;
}

// ─── Componentes obrigatórios ─────────────────────────────────────────────────
const NUMERO_TERMO = '01-031.069/24-80';
const NUMERO_TERMO_NORM = '01 031 069 24 80';

function checkComponentes(t) {
  return {
    projeto_museus_centro: t.includes('museus centro'),
    termo_colaboracao_ok: t.includes('termo de colaboracao') || t.includes('termo colaboracao'),
    numero_termo_ok: norm(t).includes(NUMERO_TERMO_NORM) || t.replace(/\D/g, '').includes('01031069'),
    parceria_smc_fmc_ok: (t.includes('smc') && t.includes('fmc')) || t.includes('smc fmc') || t.includes('parceria com smc'),
  };
}

// ─── Datas ────────────────────────────────────────────────────────────────────
const MESES_PT = {
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};

function normalizarData(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // dd/mm/aaaa ou dd-mm-aaaa
  const br = s.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/);
  if (br) return { iso: `${br[3]}-${br[2]}-${br[1]}`, display: `${br[1]}/${br[2]}/${br[3]}`, mm: br[2], yyyy: br[3] };
  // "20 de julho de 2026"
  const ext = s.match(/(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i);
  if (ext) {
    const mm = MESES_PT[norm(ext[2])];
    if (mm) return { iso: `${ext[3]}-${mm}-${String(ext[1]).padStart(2, '0')}`, display: `${String(ext[1]).padStart(2, '0')}/${mm}/${ext[3]}`, mm, yyyy: ext[3] };
  }
  // MM/AAAA ou MM-AAAA
  const my = s.match(/^(0?[1-9]|1[0-2])[-\/](20\d{2})$/);
  if (my) return { iso: null, display: `${String(my[1]).padStart(2, '0')}/${my[2]}`, mm: String(my[1]).padStart(2, '0'), yyyy: my[2], somenteCompetencia: true };
  // "julho de 2026" ou "julho/2026"
  const mnome = s.match(/([a-zçã]+)[\s\/](?:de\s)?(\d{4})/i);
  if (mnome) {
    const mm = MESES_PT[norm(mnome[1])];
    if (mm) return { iso: null, display: `${mm}/${mnome[2]}`, mm, yyyy: mnome[2], somenteCompetencia: true };
  }
  return null;
}

function extrairDatasContexto(texto) {
  const resultados = [];
  // Busca todos padrões de data no texto
  const padroes = [
    /(\d{2})[-\/](\d{2})[-\/](\d{4})/g,
    /(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/gi,
  ];
  for (const re of padroes) {
    let m;
    while ((m = re.exec(texto)) !== null) {
      // Determinar contexto pela palavra antes da data
      const inicio = Math.max(0, m.index - 40);
      const contexto = norm(texto.slice(inicio, m.index));
      const tipo = contexto.match(/realiz|execut|event|ocorr/) ? 'data_evento'
        : contexto.match(/emitid|emissao|data da nota/) ? 'data_emissao'
        : 'data_generica';
      const parsed = normalizarData(m[0]);
      if (parsed) resultados.push({ ...parsed, tipo, raw: m[0] });
    }
  }
  return resultados;
}

// ─── Competência ──────────────────────────────────────────────────────────────
function competenciaEsperada(dataEmissaoISO) {
  if (!dataEmissaoISO) return null;
  const d = new Date(dataEmissaoISO + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() - 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return { mm, yyyy, display: `${mm}/${yyyy}` };
}

function extrairCompetenciaTexto(texto) {
  const t = norm(texto);
  // Padrão: "referente ao mes 07/2026" ou "referente a julho/2026"
  const ref = t.match(/referente\s+(?:a[o]?\s+)?(?:mes\s+)?([\w\/\-]+\s*\/?\s*20\d{2})/i);
  if (ref) { const r = normalizarData(ref[1].trim()); if (r) return r; }
  // MM-AAAA ou MM/AAAA soltos
  const my = t.match(/\b(0?[1-9]|1[0-2])[-\/](20\d{2})\b/);
  if (my) return normalizarData(`${my[1]}/${my[2]}`);
  // nome do mês
  for (const [nome, mm] of Object.entries(MESES_PT)) {
    const re = new RegExp(`\\b${nome}\\s*(?:de\\s*|\\/)?(20\\d{2})`, 'i');
    const m = t.match(re);
    if (m) return normalizarData(`${mm}/${m[1]}`);
  }
  return null;
}

// ─── PIX ──────────────────────────────────────────────────────────────────────
function normalizarChavePix(chave) {
  const s = String(chave || '').trim();
  // CNPJ (14 dígitos)
  const cnpj = s.replace(/\D/g, '');
  if (cnpj.length === 14) return { tipo: 'CNPJ', chave: cnpj, valido: true };
  // CPF (11 dígitos)
  if (cnpj.length === 11) return { tipo: 'CPF', chave: cnpj, valido: true };
  // E-mail
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { tipo: 'EMAIL', chave: s.toLowerCase(), valido: true };
  // Telefone
  const tel = s.replace(/\D/g, '');
  if (tel.length >= 10 && tel.length <= 13) return { tipo: 'TELEFONE', chave: tel, valido: true };
  // Mascarada (xxxxxxxxx)
  if (/^[x*]+$/i.test(s.replace(/\s/g, ''))) return { tipo: 'NAO_IDENTIFICADO', chave: s, valido: false, motivo: 'Chave PIX mascarada ou incompleta.' };
  // Aleatória (UUID-like)
  if (s.length > 20) return { tipo: 'ALEATORIA', chave: s, valido: true };
  return { tipo: 'NAO_IDENTIFICADO', chave: s, valido: false };
}

function extrairPix(texto) {
  const t = String(texto || '');
  // Padrões: "Pix 01160573000145", "PIX: email@x.com", "Chave Pix: xxx"
  const padroes = [
    /(?:chave\s+pix|pix\s+chave|pix)[:\s]+([^\s,\n]+(?:@[^\s,\n]+)?)/gi,
    /(?:pagamento\s+via\s+pix)[:\s]+([^\s,\n]+)/gi,
  ];
  for (const re of padroes) {
    let m;
    while ((m = re.exec(t)) !== null) {
      const candidato = m[1].trim();
      if (candidato.length < 5) continue;
      const parsed = normalizarChavePix(candidato);
      if (parsed.tipo !== 'NAO_IDENTIFICADO' || candidato.length > 5) {
        return { pix_encontrado: true, pix_chave_original: candidato, ...parsed };
      }
    }
  }
  return { pix_encontrado: false };
}

// ─── Tipo de despesa ──────────────────────────────────────────────────────────
const MANUTENCAO_TERMOS = ['manutencao', 'manutecao', 'reparo', 'pintura', 'conserto', 'reforma'];
const FUNCOES_COLABORADOR = [
  'educador', 'educadora', 'monitor', 'monitores', 'produtor', 'produtora',
  'coordenador', 'coordenadora', 'analista', 'mobilizador', 'mobilizadora',
  'assessor', 'assessora', 'fotografo', 'fotografa', 'designer', 'redator',
  'contador', 'contadora', 'assistente',
];
const MATERIAL_MARCADORES = ['aquisicao de', 'compra de', 'fornecimento de', 'material '];

function classificarTipo(t) {
  if (MANUTENCAO_TERMOS.some((k) => t.includes(k))) return 'MANUTENCAO_ROTINA';
  if (FUNCOES_COLABORADOR.some((k) => t.includes(k))) return 'COLABORADOR_MENSAL';
  if (MATERIAL_MARCADORES.some((k) => t.includes(k))) return 'MATERIAL';
  return 'OUTRO';
}

// ─── Extração de função ───────────────────────────────────────────────────────
function extrairFuncao(texto) {
  const t = norm(texto);
  for (const f of FUNCOES_COLABORADOR) {
    if (t.includes(f)) {
      // Extrai "EDUCADOR MIS" ou "EDUCADOR"
      const re = new RegExp(`(${f}(?:\\s+[a-z]+)?)`, 'i');
      const m = t.match(re);
      return m ? m[1].trim().toUpperCase() : f.toUpperCase();
    }
  }
  return null;
}

// ─── Extração de serviço (manutenção) ────────────────────────────────────────
function extrairServico(texto) {
  const t = norm(texto);
  // Pega o núcleo entre marcadores de manutenção
  for (const k of MANUTENCAO_TERMOS) {
    const re = new RegExp(`(?:${k}(?:\\s+de\\s+)?(?:rotina[:\\s-]*)?)([^,.;\\n]{3,60})`, 'i');
    const m = t.match(re);
    if (m) {
      const servico = m[1].trim().replace(/^[\s-]+/, '').trim();
      if (servico.length > 2) return servico;
    }
  }
  return null;
}

// ─── Extração de material ─────────────────────────────────────────────────────
const MATERIAL_GENERICO = ['materiais', 'materiais diversos', 'material geral', 'insumos diversos', 'material', 'insumos'];

function extrairMaterial(texto) {
  const t = norm(texto);
  for (const marcador of MATERIAL_MARCADORES) {
    const idx = t.indexOf(marcador);
    if (idx >= 0) {
      const trecho = t.slice(idx + marcador.length, idx + marcador.length + 100).split(/[,.;\n]/)[0].trim();
      if (trecho && !MATERIAL_GENERICO.includes(trecho)) return trecho;
      if (trecho && MATERIAL_GENERICO.includes(trecho)) return null; // genérico
    }
  }
  return null;
}

function materialEspecificado(materialExtraido) {
  if (!materialExtraido) return false;
  return !MATERIAL_GENERICO.includes(norm(materialExtraido));
}

// ─── Extração de evento/ação ──────────────────────────────────────────────────
function extrairEvento(texto) {
  const t = norm(texto);
  const marcadores = [
    'para o evento', 'referente ao evento', 'utilizado no evento', 'destinado a',
    'para a oficina', 'para a exposicao', 'para o noturno', 'realizado em',
    'para a acao', 'para acao',
  ];
  for (const m of marcadores) {
    const idx = t.indexOf(m);
    if (idx >= 0) {
      const trecho = t.slice(idx + m.length, idx + m.length + 80).split(/[,.;\n]/)[0].trim();
      if (trecho.length > 2) return trecho;
    }
  }
  return null;
}

// ─── Função principal ─────────────────────────────────────────────────────────
export function analisarNFDeterministico({ intake, purchase = null }) {
  const ia = intake?.resultado_ia || {};

  // Coleta todo o texto disponível
  const textoBruto = [
    intake?.raw_text,
    ia?.raw_text,
    ia?.texto_extraido,
    ia?.descricao_servico,
    ia?.full_text,
    ia?.markdown,
    intake?.file_name_original,
    intake?.file_name_final,
    purchase?.descricao_item,
    purchase?.observacoes,
    // PIX pode estar em campo separado
    ia?.nf_emitente_pix,
    purchase?.detalhe_pagamento,
  ].filter(Boolean).join('\n');

  const t = norm(textoBruto);

  // 1. Componentes obrigatórios
  const componentes = checkComponentes(t);
  const descricao_projeto_ok = Object.values(componentes).every(Boolean);

  // 2. Museu
  const museu = extrairMuseu(t);

  // 3. Tipo
  const tipo_despesa = classificarTipo(t);

  // 4. Entidades específicas por tipo
  const funcao = extrairFuncao(t);
  const servico = extrairServico(t);
  const materialBruto = extrairMaterial(t);
  const material_especificado = materialEspecificado(materialBruto);
  const evento_acao = extrairEvento(t);

  // 5. Competência
  const competencia_texto = extrairCompetenciaTexto(t);
  const dataEmissaoISO = ia?.nf_data_emissao || ia?.data_emissao || intake?.nf_data_emissao || '';
  const competencia_esperada = competenciaEsperada(dataEmissaoISO);
  let competencia_ok = null;
  if (competencia_texto && competencia_esperada) {
    competencia_ok =
      competencia_texto.mm === competencia_esperada.mm &&
      competencia_texto.yyyy === competencia_esperada.yyyy;
  }

  // 6. Datas
  const datas = extrairDatasContexto(textoBruto);
  const data_evento = datas.find((d) => d.tipo === 'data_evento')?.display || null;
  const data_execucao = datas.find((d) => d.tipo !== 'data_emissao')?.display || null;

  // 7. PIX — busca em todos os campos
  const pixResult = extrairPix(textoBruto);

  // 8. Campos a preencher automaticamente (somente se vazio na solicitação)
  const preenchidos_automaticamente = [];
  const divergencias = [];

  function registrar(campo, valor, origem, regra) {
    if (!valor) return;
    preenchidos_automaticamente.push({ campo, valor, origem, regra, preenchido_automaticamente: true });
  }

  // Museu
  if (museu) {
    if (purchase?.museu_local && purchase.museu_local !== museu) {
      divergencias.push({ campo: 'museu_local', solicitacao: purchase.museu_local, documento: museu });
    } else {
      registrar('museu_local', museu, 'descricao_nf', 'alias_museu');
    }
  }

  // Função
  if (funcao) registrar('funcao', funcao, 'descricao_nf', 'palavras_chave_funcao');

  // Serviço
  if (servico) registrar('servico', servico, 'descricao_nf', 'extrator_manutencao');

  // Material
  if (materialBruto && material_especificado) registrar('material', materialBruto, 'descricao_nf', 'extrator_material');

  // Evento
  if (evento_acao) registrar('evento_acao', evento_acao, 'descricao_nf', 'extrator_evento');

  // Competência
  if (competencia_texto) registrar('competencia', competencia_texto.display, 'descricao_nf', 'extrator_competencia');

  // PIX
  let pix_confere = null;
  let pix_auto = null;
  if (pixResult.pix_encontrado && pixResult.valido) {
    const pixSolicitacao = purchase?.detalhe_pagamento || '';
    if (!pixSolicitacao) {
      pix_auto = { campo: 'detalhe_pagamento', valor: pixResult.pix_chave, tipo: pixResult.tipo };
      registrar('detalhe_pagamento', pixResult.pix_chave, 'documento', 'extrator_pix');
    } else {
      const chaveSol = normalizarChavePix(pixSolicitacao).chave;
      pix_confere = chaveSol === pixResult.pix_chave;
      if (!pix_confere) {
        divergencias.push({ campo: 'pix', solicitacao: pixSolicitacao, documento: pixResult.pix_chave, alerta: 'Chave PIX encontrada no documento difere da cadastrada na solicitação.' });
      }
    }
  }

  // 9. Status final por tipo
  let status = 'CONFORME';
  const campos_faltantes = [];

  if (!descricao_projeto_ok) status = 'AJUSTE_NECESSARIO';

  if (tipo_despesa === 'MANUTENCAO_ROTINA') {
    if (!museu) campos_faltantes.push('museu_local');
    if (!servico) campos_faltantes.push('servico');
    if (!data_execucao) campos_faltantes.push('data_execucao');
    if (campos_faltantes.length > 0) status = 'AJUSTE_NECESSARIO';
  } else if (tipo_despesa === 'COLABORADOR_MENSAL') {
    if (!funcao) campos_faltantes.push('funcao');
    if (!competencia_texto) campos_faltantes.push('competencia');
    if (competencia_ok === false) { status = 'AJUSTE_NECESSARIO'; campos_faltantes.push('competencia_incorreta'); }
    if (campos_faltantes.length > 0 && status === 'CONFORME') status = 'AJUSTE_NECESSARIO';
  } else if (tipo_despesa === 'MATERIAL') {
    if (!material_especificado) { status = 'AJUSTE_NECESSARIO'; campos_faltantes.push('material_especificado'); }
  }

  if (divergencias.length > 0) status = 'REVISAR';

  // 10. Descrição sugerida por template
  let descricao_sugerida = '';
  const BASE = `Projeto Museus Centro — Termo de Colaboração ${NUMERO_TERMO}, parceria com SMC/FMC`;
  if (tipo_despesa === 'MANUTENCAO_ROTINA') {
    descricao_sugerida = `${BASE}: MANUTENÇÃO DE ROTINA — ${servico || '[ESPECIFICAR SERVIÇO]'} — ${museu || '[MUSEU]'} — ${data_execucao || '[DATA]'}.`;
  } else if (tipo_despesa === 'COLABORADOR_MENSAL') {
    descricao_sugerida = `${BASE}: ${funcao || '[FUNÇÃO]'} ${museu || ''} — referente a ${competencia_texto?.display || competencia_esperada?.display || '[MÊS/ANO]'}.`;
  } else if (tipo_despesa === 'MATERIAL') {
    descricao_sugerida = `${BASE}: MATERIAL ${museu || ''} — ${materialBruto || '[ESPECIFICAR MATERIAL]'}${evento_acao ? ' — ' + evento_acao : ''}${data_evento ? ' em ' + data_evento : ''}.`;
  }

  return {
    executado_em: new Date().toISOString(),
    status,
    tipo_despesa,
    componentes,
    descricao_projeto_ok,
    museu,
    funcao,
    servico,
    material: materialBruto || null,
    material_especificado,
    evento_acao,
    data_evento,
    data_execucao,
    competencia: competencia_texto?.display || null,
    competencia_esperada: competencia_esperada?.display || null,
    competencia_ok,
    pix: pixResult.pix_encontrado ? {
      encontrado: true,
      tipo: pixResult.tipo,
      chave: pixResult.pix_chave,
      chave_original: pixResult.pix_chave_original,
      valido: pixResult.valido,
      motivo: pixResult.motivo || null,
    } : { encontrado: false },
    pix_confere,
    pix_auto,
    preenchidos_automaticamente,
    divergencias,
    campos_faltantes,
    descricao_sugerida,
  };
}