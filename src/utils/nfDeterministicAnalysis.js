/**
 * Pipeline de análise determinística de NFs para o Museus Centro.
 * Executa UMA única vez por documento — resultado salvo em resultado_analise_deterministica.
 * Se o campo executado_em já estiver preenchido, não reanalisar.
 */

// ── Normalização ──────────────────────────────────────────────────────────────
export function norm(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Aliases de museu ──────────────────────────────────────────────────────────
const MUSEU_ALIASES = {
  MIS: ['museu da imagem e do som', 'museu imagem e som', 'mis bh', 'mis'],
  MUMO: ['museu da moda', 'museu do moderno', 'mumo'],
  MHAB: ['museu historico abilio barreto', 'museu abilio barreto', 'museu historico municipal', 'mhab'],
};

// ── Componentes obrigatórios do Termo ─────────────────────────────────────────
const COMPONENTES_TERMO = [
  'projeto museus centro',
  'termo de colaboracao',
  '01 031 069 24 80',
  'smc fmc',
  'fmc',
  'viaduto das artes',
];

// ── Meses em português ────────────────────────────────────────────────────────
const MESES = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const MESES_INV = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// ── Extrair data de qualquer formato ─────────────────────────────────────────
function extrairData(texto) {
  const t = norm(texto);

  // dd/mm/aaaa ou dd-mm-aaaa
  const br = t.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (br) return { dia: Number(br[1]), mes: Number(br[2]), ano: Number(br[3]) };

  // dd de mês de aaaa
  const ext = t.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (ext && MESES[ext[2]]) return { dia: Number(ext[1]), mes: MESES[ext[2]], ano: Number(ext[3]) };

  // MM/AAAA ou MM-AAAA
  const mesAno = t.match(/(?:^|\s)(0?[1-9]|1[0-2])[\/\-](20\d{2})(?:\s|$)/);
  if (mesAno) return { dia: 1, mes: Number(mesAno[1]), ano: Number(mesAno[2]) };

  // mês de AAAA
  const mesPorExtenso = t.match(/(\w+)\s+de\s+(20\d{2})/);
  if (mesPorExtenso && MESES[mesPorExtenso[1]]) {
    return { dia: 1, mes: MESES[mesPorExtenso[1]], ano: Number(mesPorExtenso[2]) };
  }

  // ISO YYYY-MM-DD
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { dia: Number(iso[3]), mes: Number(iso[2]), ano: Number(iso[1]) };

  return null;
}

function dataToIso(d) {
  if (!d) return '';
  return `${d.ano}-${String(d.mes).padStart(2, '0')}-${String(d.dia).padStart(2, '0')}`;
}

function competenciaMesAnterior(dataEmissao) {
  // Competência esperada para colaboradores = mês imediatamente anterior
  if (!dataEmissao) return '';
  const d = extrairData(dataEmissao);
  if (!d) return '';
  let mes = d.mes - 1;
  let ano = d.ano;
  if (mes === 0) { mes = 12; ano--; }
  return `${MESES_INV[mes]}/${ano}`;
}

// ── Extrair PIX ───────────────────────────────────────────────────────────────
function extrairPix(texto) {
  const raw = String(texto || '');

  // CPF: 000.000.000-00 ou 11 dígitos
  const cpf = raw.match(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/);
  if (cpf) {
    const limpo = cpf[1].replace(/[^\d]/g, '');
    if (limpo.length === 11) return { chave: cpf[1], tipo: 'CPF', valida: true };
  }

  // CNPJ: 14 dígitos
  const cnpj = raw.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/);
  if (cnpj) {
    const limpo = cnpj[1].replace(/[^\d]/g, '');
    if (limpo.length === 14) return { chave: cnpj[1], tipo: 'CNPJ', valida: true };
  }

  // E-mail
  const email = raw.match(/\b([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})\b/i);
  if (email) return { chave: email[1].toLowerCase(), tipo: 'EMAIL', valida: true };

  // Telefone com 11 dígitos (celular)
  const tel = raw.match(/(?:PIX|pix)[^0-9]{0,20}(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})/i);
  if (tel) return { chave: tel[1].replace(/[^\d]/g, ''), tipo: 'TELEFONE', valida: true };

  // Chave aleatória (UUID-like 32+ hex)
  const aleatorio = raw.match(/\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i);
  if (aleatorio) return { chave: aleatorio[1], tipo: 'ALEATORIA', valida: true };

  return null;
}

// ── Classificar tipo de despesa ───────────────────────────────────────────────
function classificarTipoDespesa(texto) {
  const t = norm(texto);
  if (t.match(/manutencao|servico de manutencao|zeladoria/)) return 'MANUTENCAO_ROTINA';
  if (t.match(/educador|monitor|coordenador|coordenadora|analista|gestor|gestora|producao|produtor|contador/)) return 'COLABORADOR_MENSAL';
  if (t.match(/material|insumo|suprimento|material de escritorio|material educativo/)) return 'MATERIAL';
  if (t.match(/apresentacao|mostra|evento|show|espetaculo|festival|oficina|palestra/)) return 'SERVICO_EVENTO';
  return 'OUTRO';
}

// ── Detectar museu ────────────────────────────────────────────────────────────
function detectarMuseu(texto) {
  const t = norm(texto);
  for (const [sigla, aliases] of Object.entries(MUSEU_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) return sigla;
  }
  return null;
}

// ── Verificar componentes do Termo ────────────────────────────────────────────
function verificarComponentesTermo(texto) {
  const t = norm(texto);
  return COMPONENTES_TERMO.filter((c) => t.includes(norm(c)));
}

// ── Campo rastreado ───────────────────────────────────────────────────────────
function campo(valor, origem, regra, documentoOrigem = '', confianca = 1.0) {
  return { valor, origem, regra, documento_origem: documentoOrigem, confianca, preenchido_automaticamente: true };
}

// ── Coletar todo o texto disponível ──────────────────────────────────────────
function coletarTexto(intake) {
  const ia = intake?.resultado_ia || {};
  return [
    intake?.raw_text, intake?.ocr_text, intake?.texto_extraido, intake?.conteudo_extraido,
    ia?.raw_text, ia?.ocr_text, ia?.texto_extraido, ia?.full_text, ia?.markdown,
    ia?.dados_extraidos, ia?.analise, ia?.descricao_servico,
    intake?.file_name_original, intake?.file_name_final,
    intake?.nf_emitente_nome, ia?.nf_emitente_nome,
    intake?.descricao_item, ia?.descricao,
  ].filter(Boolean).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
}

// ── Pipeline principal ────────────────────────────────────────────────────────
export function analisarNFDeterministico(intake, purchaseRequest = null) {
  const ia = intake?.resultado_ia || {};
  const fileName = intake?.file_name_original || intake?.file_name_final || '';
  const textoCompleto = coletarTexto(intake);

  const campos = {};
  const divergencias = [];
  const alertas = [];

  // ── 1. Número da NF ─────────────────────────────────────────────────────
  const nfNum = ia.nf_numero || intake?.nf_numero ||
    (fileName.match(/NF[_\s\-]?(\d+)/i) || [])[1] || '';
  if (nfNum) campos.nf_numero = campo(nfNum, ia.nf_numero ? 'IA' : 'Nome do arquivo', 'regex_nf_numero', fileName);

  // ── 2. Valor total ──────────────────────────────────────────────────────
  const valorStr = ia.nf_valor_total || intake?.nf_valor_total || '';
  if (valorStr) {
    const v = Number(String(valorStr).replace(/\./g, '').replace(',', '.'));
    if (!isNaN(v) && v > 0) {
      campos.nf_valor_total = campo(v, ia.nf_valor_total ? 'IA' : 'Dados do intake', 'parse_valor_br', '');
      if (purchaseRequest?.valor_solicitado && Math.abs(purchaseRequest.valor_solicitado - v) > 0.01) {
        divergencias.push({ campo: 'nf_valor_total', solicitacao: purchaseRequest.valor_solicitado, nota_fiscal: v, acao: 'REVISAR' });
      }
    }
  }

  // ── 3. Data de emissão ──────────────────────────────────────────────────
  const dataRaw = ia.nf_data_emissao || ia.data_emissao || intake?.nf_data_emissao || '';
  const dataExtraida = extrairData(dataRaw || textoCompleto);
  if (dataExtraida) {
    campos.nf_data_emissao = campo(dataToIso(dataExtraida), dataRaw ? 'IA' : 'Texto do documento', 'extrair_data_multiformat', '');
  }

  // ── 4. Fornecedor / Emitente ────────────────────────────────────────────
  const fornNome = ia.nf_emitente_nome || ia.fornecedor_nome || intake?.fornecedor_nome || intake?.nf_emitente_nome || '';
  if (fornNome) {
    campos.nf_emitente_nome = campo(fornNome, ia.nf_emitente_nome ? 'IA' : 'Dados do intake', 'campo_estruturado', '');
    if (purchaseRequest?.fornecedor_nome && norm(purchaseRequest.fornecedor_nome) !== norm(fornNome)) {
      divergencias.push({ campo: 'fornecedor_nome', solicitacao: purchaseRequest.fornecedor_nome, nota_fiscal: fornNome, acao: 'REVISAR' });
    }
  }

  // ── 5. CNPJ/CPF ─────────────────────────────────────────────────────────
  const cpfCnpj = ia.nf_emitente_cpf_cnpj || ia.fornecedor_cpf_cnpj || intake?.nf_emitente_cpf_cnpj || '';
  if (cpfCnpj) campos.nf_emitente_cpf_cnpj = campo(cpfCnpj, 'IA', 'campo_estruturado', '');

  // ── 6. Descrição do serviço ──────────────────────────────────────────────
  const desc = ia.descricao_servico || ia.descricao || intake?.descricao_item || '';
  if (desc) {
    campos.descricao_servico = campo(desc, ia.descricao_servico ? 'IA' : 'Descrição do intake', 'campo_livre', '');
    // Material genérico sem especificação
    const dn = norm(desc);
    if (/^(materiais|materiais diversos|insumos)$/.test(dn) || dn === 'materiais') {
      campos.material_especificado = campo(false, 'Análise semântica', 'material_generico_detectado', '');
      alertas.push({ tipo: 'MATERIAL_GENERICO', mensagem: 'Descrição genérica. Especifique o material.', sugestao: '[ESPECIFICAR MATERIAL] — Museus Centro' });
    }
  }

  // ── 7. Competência ───────────────────────────────────────────────────────
  const competencia = ia.competencia || ia.competencia_sugerida || '';
  if (competencia) {
    campos.competencia = campo(competencia, 'IA', 'campo_estruturado', '');
  } else if (dataExtraida) {
    // Inferir competência para colaboradores mensais
    const tipo = classificarTipoDespesa(desc + ' ' + textoCompleto);
    if (tipo === 'COLABORADOR_MENSAL') {
      const compEsperada = competenciaMesAnterior(dataToIso(dataExtraida));
      if (compEsperada) {
        campos.competencia = campo(compEsperada, 'Regra de negócio', 'competencia_mes_anterior_emissao', '');
      }
    }
  }

  // ── 8. Museu ─────────────────────────────────────────────────────────────
  const museuDetectado = detectarMuseu(textoCompleto);
  if (museuDetectado) {
    campos.museu = campo(museuDetectado, 'Análise semântica', 'alias_museu', '');
    if (purchaseRequest?.centro_custo && !norm(purchaseRequest.centro_custo).includes(norm(museuDetectado))) {
      alertas.push({ tipo: 'MUSEU_DIVERGENTE', mensagem: `Museu detectado no documento (${museuDetectado}) difere do centro de custo cadastrado (${purchaseRequest.centro_custo})` });
    }
  }

  // ── 9. PIX ───────────────────────────────────────────────────────────────
  const pixLabels = textoCompleto.match(/(?:chave pix|pix)[^:\n]{0,30}:?[^:\n]{0,50}/gi) || [];
  const pixSource = pixLabels.join(' ') || textoCompleto;
  const pix = extrairPix(pixSource) || extrairPix(ia.nf_emitente_pix || '');
  if (pix) {
    campos.pix = campo(pix.chave, 'Documento', 'regex_pix_' + pix.tipo.toLowerCase(), '');
    campos.pix_tipo = campo(pix.tipo, 'Análise semântica', 'classif_pix', '');
    if (purchaseRequest?.detalhe_pagamento && norm(purchaseRequest.detalhe_pagamento) !== norm(pix.chave)) {
      divergencias.push({ campo: 'chave_pix', solicitacao: purchaseRequest.detalhe_pagamento, nota_fiscal: pix.chave, acao: 'REVISAR', mensagem: 'Chave PIX do documento difere da cadastrada' });
    }
  }

  // ── 10. Tipo de despesa ──────────────────────────────────────────────────
  const tipoDespesa = classificarTipoDespesa(desc + ' ' + textoCompleto);
  campos.tipo_despesa = campo(tipoDespesa, 'Análise semântica', 'classificar_tipo_despesa', '');

  // ── 11. Componentes do Termo ─────────────────────────────────────────────
  const componentesEncontrados = verificarComponentesTermo(textoCompleto);
  campos.componentes_termo = campo(componentesEncontrados, 'Análise semântica', 'verificar_componentes_obrigatorios', '');

  // ── 12. Status final ─────────────────────────────────────────────────────
  let status = 'CONFORME';
  if (divergencias.length > 0) status = 'AJUSTE_NECESSARIO';
  if (alertas.some((a) => a.tipo === 'MATERIAL_GENERICO')) status = 'AJUSTE_NECESSARIO';
  if (!campos.nf_valor_total || !campos.nf_emitente_nome) status = 'REVISAR';

  return {
    executado_em: new Date().toISOString(),
    status,
    campos,
    divergencias,
    alertas,
    tipo_despesa: tipoDespesa,
    museu_detectado: museuDetectado,
  };
}

/**
 * Aplica os campos identificados automaticamente ao formulário,
 * preenchendo APENAS campos vazios.
 */
export function aplicarCamposAoFormulario(analise, formAtual) {
  if (!analise?.campos) return formAtual;
  const novo = { ...formAtual };
  const { campos } = analise;

  function aplicar(chaveForm, chaveAnalise) {
    const c = campos[chaveAnalise];
    if (!c) return;
    const vAtual = String(novo[chaveForm] || '').trim();
    if (!vAtual && c.valor !== undefined && c.valor !== null && String(c.valor).trim() !== '') {
      novo[chaveForm] = c.valor;
    }
  }

  aplicar('nf_numero', 'nf_numero');
  aplicar('nf_valor_total', 'nf_valor_total');
  aplicar('nf_data_emissao', 'nf_data_emissao');
  aplicar('nf_emitente_nome', 'nf_emitente_nome');
  aplicar('nf_emitente_cpf_cnpj', 'nf_emitente_cpf_cnpj');
  aplicar('descricao_servico', 'descricao_servico');
  aplicar('competencia', 'competencia');

  // PIX: apenas se detalhe_pagamento vazio
  if (campos.pix?.valor && !String(novo.detalhe_pagamento || '').trim()) {
    novo.detalhe_pagamento = campos.pix.valor;
  }

  return novo;
}