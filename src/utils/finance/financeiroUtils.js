/**
 * Utilitários financeiros centralizados.
 * Todas as funções de status, normalização, deduplicação e cálculo de totais
 * devem vir daqui para garantir consistência em todos os componentes.
 */

const ACTIVE_STATUSES = new Set([
  'PAGO', 'APROVADO', 'APROVADO_ADMIN', 'APROVADO_COORD',
  'APROVADA', 'APPROVED', 'PAID'
]);

export function isFinanciallyActiveStatus(status) {
  if (!status) return false;
  return ACTIVE_STATUSES.has(String(status).toUpperCase().trim());
}

function toNumber(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[R$\s.]/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function getPurchaseValue(p) {
  if (!p) return 0;
  return (
    toNumber(p.valor_pago) ||
    toNumber(p.valor_aprovado_admin) ||
    toNumber(p.valor_aprovado) ||
    toNumber(p.valor_final) ||
    toNumber(p.valor_solicitado) ||
    toNumber(p.nf_valor_total) ||
    toNumber(p.valor_total) ||
    toNumber(p.valor) ||
    0
  );
}

function normalizarTexto(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function aditivoExplicito(nf) {
  const raw = normalizarTexto(
    nf?.aditivo || nf?.termo_aditivo || nf?.aditivo_nome ||
    nf?.instrumento_aditivo || nf?.fonte_orcamentaria || ''
  );
  if (!raw) return '';
  if (raw.includes('4') || raw.includes('quarto')) return '4º Aditivo Noturno 2026';
  if (raw.includes('3') || raw.includes('terceiro')) return '3º Aditivo';
  return '';
}

export function normalizeCentroCusto(nf) {
  const raw = String(nf?.centro_custo || '').trim();
  const low = normalizarTexto(raw);
  const explicito = aditivoExplicito(nf);

  if (low.includes('pampulha')) {
    return {
      centro_normalizado: 'Noturno Pampulha',
      aditivo: explicito || '4º Aditivo Noturno 2026'
    };
  }

  if (low.includes('noturno')) {
    return {
      centro_normalizado: 'Noturno 2026',
      aditivo: explicito || '3º Aditivo'
    };
  }

  if (!low) return { centro_normalizado: 'Geral', aditivo: explicito || '3º Aditivo' };
  if (low === 'mis' || low === 'mis bh') return { centro_normalizado: 'MIS', aditivo: explicito || '3º Aditivo' };
  if (low === 'mhab' || low === 'mab') return { centro_normalizado: 'MHAB', aditivo: explicito || '3º Aditivo' };
  if (low === 'mumo' || low === 'mumu') return { centro_normalizado: 'MUMO', aditivo: explicito || '3º Aditivo' };
  if (low.includes('geral') || low.includes('transversal') || low.includes('atuacao geral')) {
    return { centro_normalizado: 'Geral', aditivo: explicito || '3º Aditivo' };
  }
  return { centro_normalizado: raw || 'Geral', aditivo: explicito || '3º Aditivo' };
}

function normalizarFornecedor(nome) {
  return String(nome || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\b(NF|NFSE|NFE|DOCUMENTO|MUSEUS|CENTRO|COMP|PDF|XML)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function somenteDigitos(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizarNumeroNF(value) {
  return String(value || '')
    .toUpperCase()
    .trim()
    .replace(/^NF(?:E|SE)?\s*/i, '')
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^0+(?=\d)/, '');
}

function numeroNF(nf) {
  return normalizarNumeroNF(
    nf?.nf_numero || nf?.numero_nf || nf?.numero_nota_fiscal ||
    nf?.numero_nota || nf?.nota_fiscal_numero || nf?.nfe_numero
  );
}

function cnpjFornecedor(nf) {
  return somenteDigitos(
    nf?.fornecedor_cnpj || nf?.fornecedor_cpf_cnpj || nf?.nf_emitente_cpf_cnpj ||
    nf?.nf_emitente_cnpj || nf?.emitente_cnpj || nf?.cnpj_fornecedor || nf?.cnpj
  );
}

function chaveAcesso(nf) {
  const candidatos = [nf?.nf_chave_acesso, nf?.chave_acesso, nf?.nfe_chave_acesso, nf?.xml_chave_acesso, nf?.chave_nfe];
  for (const candidato of candidatos) {
    const chave = somenteDigitos(candidato);
    if (chave.length === 44) return chave;
  }
  return '';
}

function urlFiscal(nf) {
  return String(
    nf?.drive_backup_nf_pdf_link || nf?.nota_fiscal_pdf_url || nf?.nf_pdf_url ||
    nf?.nota_fiscal_url || nf?.arquivo_original_url || nf?.pdf_url || nf?.file_url || ''
  ).trim().split('?')[0];
}

function dataFiscalISO(nf) {
  const raw = nf?.nf_data_emissao || nf?.data_emissao_nf || nf?.data_nf || nf?.data_emissao || nf?.competencia || '';
  if (!raw) return '';
  const texto = String(raw).trim();
  const iso = texto.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const br = texto.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function competenciaFiscal(nf) {
  const explicita = String(nf?.mes_referencia || nf?.competencia || nf?.referencia || '').trim();
  if (explicita) return explicita.toUpperCase();
  const data = dataFiscalISO(nf);
  return data ? data.slice(0, 7) : '';
}

function rubricaIdentidade(nf) {
  return normalizarTexto(
    nf?.rubrica_id || nf?.budgetline_id || nf?.rubrica_nome ||
    nf?.item_despesa || nf?.descricao_rubrica || ''
  );
}

export function hasInvalidFiscalDate(nf, minimumYear = 2026) {
  const data = dataFiscalISO(nf);
  if (!data) return false;
  return Number(data.slice(0, 4)) < minimumYear;
}

export function getFinancialDedupKey(nf) {
  if (!nf) return null;
  const chave = chaveAcesso(nf);
  if (chave) return `CHAVE:${chave}`;

  const numero = numeroNF(nf);
  const cnpj = cnpjFornecedor(nf);
  const fornecedor = normalizarFornecedor(
    nf.fornecedor_nome || nf.nf_emitente_nome || nf.emitente_nome ||
    nf.descricao_item || nf.nome_documento
  );
  const valorCentavos = Math.round(getPurchaseValue(nf) * 100);
  const data = dataFiscalISO(nf);
  const competencia = competenciaFiscal(nf);
  const rubrica = rubricaIdentidade(nf);
  const { centro_normalizado } = normalizeCentroCusto(nf);

  if (numero && cnpj && valorCentavos > 0) return `NF:${numero}:${cnpj}:${valorCentavos}`;
  if (numero && fornecedor && valorCentavos > 0) return `NF_FORNECEDOR:${numero}:${fornecedor}:${valorCentavos}`;

  const arquivo = urlFiscal(nf);
  if (arquivo) return `ARQUIVO:${arquivo}`;

  const intake = String(nf?.intake_id || nf?.document_intake_id || nf?.attachment_id || '').trim();
  if (intake) return `INTAKE:${intake}`;

  if (cnpj && valorCentavos > 0 && data) {
    return `CNPJ_DATA:${cnpj}:${valorCentavos}:${data}:${rubrica}:${centro_normalizado}`;
  }

  if (fornecedor && valorCentavos > 0 && data) {
    return `FORNECEDOR_DATA:${fornecedor}:${valorCentavos}:${data}:${rubrica}:${centro_normalizado}`;
  }

  if (!fornecedor || valorCentavos <= 0 || !competencia) return null;
  return `FALLBACK:${fornecedor}:${valorCentavos}:${centro_normalizado}:${rubrica}:${competencia}`;
}

function duplicatePriority(nf) {
  let score = 0;
  if (chaveAcesso(nf)) score += 64;
  if (numeroNF(nf)) score += 32;
  if (cnpjFornecedor(nf)) score += 16;
  if (nf.comprovante_pagamento_url || nf.comprovante_url) score += 8;
  if (nf.drive_backup_status === 'concluido') score += 4;
  if (nf.nota_fiscal_pdf_url || nf.nf_pdf_url || nf.nota_fiscal_url) score += 2;
  if (nf.nota_fiscal_xml_url || nf.xml_url) score += 1;
  if (String(nf.status || '').toUpperCase() === 'PAGO') score += 1;
  return score;
}

export function getFinanciallyValidPurchases(purchases = []) {
  const ativas = purchases.filter((p) => isFinanciallyActiveStatus(p.status));
  const keyMap = new Map();
  const duplicadasDiretas = [];
  const datasInvalidas = [];

  // Exclusão por data fiscal anterior a 2026 só acontece quando o registro está
  // explicitamente fora do somatório (incluir_no_somatorio=false) ou marcado como
  // duplicada_financeira. Sem flag, o registro entra normalmente no somatório.
  for (const nf of ativas) {
    const excluida = nf.duplicada_financeira === true || nf.incluir_no_somatorio === false;
    if (excluida) {
      if (hasInvalidFiscalDate(nf)) datasInvalidas.push(nf);
      else duplicadasDiretas.push(nf);
      continue;
    }

    const key = getFinancialDedupKey(nf);
    const effectiveKey = key || `NO_KEY:${nf.id}`;
    if (!keyMap.has(effectiveKey)) {
      keyMap.set(effectiveKey, nf);
      continue;
    }

    const current = keyMap.get(effectiveKey);
    if (duplicatePriority(nf) > duplicatePriority(current)) keyMap.set(effectiveKey, nf);
  }

  const validas = Array.from(keyMap.values());
  const validasRefs = new Set(validas);
  const duplicadasDetectadas = ativas.filter((p) => {
    if (p.duplicada_financeira === true || p.incluir_no_somatorio === false) return false;
    return !validasRefs.has(p);
  });

  const duplicadas = [...new Set([...duplicadasDiretas, ...duplicadasDetectadas])];
  return { validas, duplicadas, datasInvalidas };
}

export function calculateAditivoTotals(purchases = []) {
  const { validas, duplicadas, datasInvalidas } = getFinanciallyValidPurchases(purchases);
  const terceiro = { total: 0, utilizado: 0, quantidade_nfs: 0 };
  const noturno2026 = { total: 0, utilizado: 0, quantidade_nfs: 0 };
  const noturnoPampulha = { total: 0, utilizado: 0, quantidade_nfs: 0 };

  for (const nf of validas) {
    const normalizado = normalizeCentroCusto(nf);
    const valor = getPurchaseValue(nf);

    if (normalizado.centro_normalizado === 'Noturno Pampulha') {
      noturnoPampulha.utilizado += valor;
      noturnoPampulha.quantidade_nfs += 1;
    }

    if (normalizado.aditivo === '4º Aditivo Noturno 2026') {
      noturno2026.utilizado += valor;
      noturno2026.quantidade_nfs += 1;
    } else {
      terceiro.utilizado += valor;
      terceiro.quantidade_nfs += 1;
    }
  }

  return {
    terceiro_aditivo: terceiro,
    noturno_2026: noturno2026,
    noturno_pampulha: noturnoPampulha,
    duplicadas_ignoradas: {
      total_valor: duplicadas.reduce((s, p) => s + getPurchaseValue(p), 0),
      quantidade: duplicadas.length,
      registros: duplicadas,
    },
    datas_invalidas_ignoradas: {
      total_valor: datasInvalidas.reduce((s, p) => s + getPurchaseValue(p), 0),
      quantidade: datasInvalidas.length,
      registros: datasInvalidas,
    },
  };
}

function getRubricaPrevisto(r) {
  // Alinhado com rubricaPrevisto() de canonicalMetrics.js
  return (
    toNumber(r?.valor_rubrica) ||
    toNumber(r?.valor_total) ||
    toNumber(r?.valor_previsto) ||
    toNumber(r?.previsto) ||
    toNumber(r?.valor) ||
    0
  );
}

function getRubricaUtilizado(r) {
  // Alinhado com rubricaUtilizado() de canonicalMetrics.js
  return (
    toNumber(r?.valor_utilizado) ||
    toNumber(r?.valor_executado) ||
    toNumber(r?.utilizado) ||
    toNumber(r?.realizado) ||
    0
  );
}

export function auditAditivoTotals(purchases = [], rubricas = []) {
  const calculado = calculateAditivoTotals(purchases);
  const ativas = (rubricas || []).filter((r) => r?.ativo !== false);
  const rubricas3 = [];
  const rubricas4 = [];

  for (const rubrica of ativas) {
    const origem = (rubrica.origem_recurso || '').trim();
    // Classificar por origem_recurso explícita primeiro
    if (origem === '4º ADITIVO' || origem === '4º Aditivo') {
      rubricas4.push(rubrica);
    } else if (origem === '3º ADITIVO' || origem === '3º Aditivo') {
      rubricas3.push(rubrica);
    } else {
      // Fallback: usar normalizeCentroCusto para rubricas sem origem_recurso explícita
      const normalizado = normalizeCentroCusto(rubrica);
      if (normalizado.aditivo === '4º Aditivo Noturno 2026') rubricas4.push(rubrica);
      else if (normalizado.aditivo === '3º Aditivo') rubricas3.push(rubrica);
      // Rubricas de outros aditivos ("Repasse / Aditivos Anteriores") são ignoradas nos totais
    }
  }

  const somaRubricas = (lista, campoFn) => lista.reduce((sum, item) => sum + campoFn(item), 0);
  const utilizadoRubricas3 = somaRubricas(rubricas3, getRubricaUtilizado);
  const utilizadoRubricas4 = somaRubricas(rubricas4, getRubricaUtilizado);
  const previstoRubricas3 = somaRubricas(rubricas3, getRubricaPrevisto);
  const previstoRubricas4 = somaRubricas(rubricas4, getRubricaPrevisto);

  return {
    ...calculado,
    rubricas: {
      terceiro_aditivo: {
        previsto: previstoRubricas3,
        utilizado: utilizadoRubricas3,
        quantidade: rubricas3.length,
      },
      quarto_aditivo: {
        previsto: previstoRubricas4,
        utilizado: utilizadoRubricas4,
        quantidade: rubricas4.length,
      },
    },
    divergencias: {
      terceiro_aditivo: utilizadoRubricas3 - calculado.terceiro_aditivo.utilizado,
      quarto_aditivo: utilizadoRubricas4 - calculado.noturno_2026.utilizado,
    },
    auditado_em: new Date().toISOString(),
  };
}

export function getFinancialBadges(nf) {
  const badges = [];
  if (hasInvalidFiscalDate(nf)) {
    badges.push({ key: 'data', label: 'Data fiscal para revisão', color: 'bg-amber-50 text-amber-700' });
    badges.push({ key: 'inativo', label: 'Fora do somatório', color: 'bg-gray-100 text-gray-500' });
  } else if (isFinanciallyActiveStatus(nf.status)) {
    badges.push({ key: 'ativo', label: 'No somatório', color: 'bg-green-50 text-green-700' });
  } else {
    badges.push({ key: 'inativo', label: 'Fora do somatório', color: 'bg-gray-100 text-gray-500' });
  }
  if (nf.duplicada_financeira === true || nf.incluir_no_somatorio === false) {
    badges.push({ key: 'dup', label: 'Duplicata', color: 'bg-red-50 text-red-700' });
  }
  if (nf._centro_corrigido) badges.push({ key: 'cc', label: 'Centro corrigido', color: 'bg-amber-50 text-amber-700' });
  if (nf._rubrica_corrigida) badges.push({ key: 'rub', label: 'Rubrica corrigida', color: 'bg-purple-50 text-purple-700' });
  return badges;
}