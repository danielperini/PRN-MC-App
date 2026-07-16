/**
 * Utilitários financeiros centralizados.
 * Todas as funções de status, normalização, deduplicação e cálculo de totais
 * devem vir daqui para garantir consistência em todos os componentes.
 */

// ─── 1. STATUS FINANCEIRAMENTE ATIVOS ────────────────────────────────────────

const ACTIVE_STATUSES = new Set([
  'PAGO', 'APROVADO', 'APROVADO_ADMIN', 'APROVADO_COORD',
  'APROVADA', 'APPROVED', 'PAID'
]);

const INACTIVE_STATUSES = new Set([
  'RASCUNHO', 'PENDENTE', 'EM_REVISAO', 'REJEITADO',
  'CANCELADO', 'ARQUIVADO', 'DELETADO', 'RECUSADO', 'DEVOLVIDO', 'SOLICITADO'
]);

export function isFinanciallyActiveStatus(status) {
  if (!status) return false;
  const s = String(status).toUpperCase().trim();
  return ACTIVE_STATUSES.has(s);
}

// ─── 2. VALOR DA NF ──────────────────────────────────────────────────────────

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

// ─── 3. NORMALIZAÇÃO DE CENTRO DE CUSTO ──────────────────────────────────────

export function normalizeCentroCusto(nf) {
  const raw = String(nf?.centro_custo || '').trim();
  const low = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (!low) return { centro_normalizado: 'Geral', aditivo: '3º Aditivo' };

  if (low.includes('pampulha')) {
    return { centro_normalizado: 'Noturno Pampulha', aditivo: '4º Aditivo Pampulha' };
  }
  if (low.includes('noturno') || low.includes('noturno nos museus')) {
    return { centro_normalizado: 'Noturno 2026', aditivo: '4º Aditivo Noturno 2026' };
  }
  if (low === 'mis' || low === 'mis bh') return { centro_normalizado: 'MIS', aditivo: '3º Aditivo' };
  if (low === 'mhab' || low === 'mab') return { centro_normalizado: 'MHAB', aditivo: '3º Aditivo' };
  if (low === 'mumo' || low === 'mumu') return { centro_normalizado: 'MUMO', aditivo: '3º Aditivo' };
  if (low.includes('geral') || low.includes('transversal') || low.includes('atuacao geral') || low.includes('atuação geral')) {
    return { centro_normalizado: 'Geral', aditivo: '3º Aditivo' };
  }

  return { centro_normalizado: raw || 'Geral', aditivo: '3º Aditivo' };
}

// ─── 4. DEDUPLICAÇÃO FINANCEIRA ───────────────────────────────────────────────

function normalizarFornecedor(nome) {
  return String(nome || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
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
    nf?.nf_numero ||
    nf?.numero_nf ||
    nf?.numero_nota_fiscal ||
    nf?.numero_nota ||
    nf?.nota_fiscal_numero ||
    nf?.nfe_numero
  );
}

function cnpjFornecedor(nf) {
  return somenteDigitos(
    nf?.fornecedor_cnpj ||
    nf?.nf_emitente_cpf_cnpj ||
    nf?.nf_emitente_cnpj ||
    nf?.emitente_cnpj ||
    nf?.cnpj_fornecedor ||
    nf?.cnpj
  );
}

function chaveAcesso(nf) {
  const candidatos = [
    nf?.nf_chave_acesso,
    nf?.chave_acesso,
    nf?.nfe_chave_acesso,
    nf?.xml_chave_acesso,
    nf?.chave_nfe,
  ];

  for (const candidato of candidatos) {
    const chave = somenteDigitos(candidato);
    if (chave.length === 44) return chave;
  }

  return '';
}

function urlFiscal(nf) {
  return String(
    nf?.drive_backup_nf_pdf_link ||
    nf?.nota_fiscal_pdf_url ||
    nf?.nf_pdf_url ||
    nf?.nota_fiscal_url ||
    nf?.arquivo_original_url ||
    nf?.pdf_url ||
    ''
  ).trim().split('?')[0];
}

export function getFinancialDedupKey(nf) {
  if (!nf) return null;

  // 1. Chave fiscal de 44 dígitos: identificador inequívoco da NF-e.
  const chave = chaveAcesso(nf);
  if (chave) return `CHAVE:${chave}`;

  const numero = numeroNF(nf);
  const cnpj = cnpjFornecedor(nf);
  const fornecedor = normalizarFornecedor(nf.fornecedor_nome || nf.nf_emitente_nome || nf.emitente_nome);
  const valorCentavos = Math.round(getPurchaseValue(nf) * 100);

  // 2. Número + CNPJ + valor. A data foi retirada da chave porque registros
  // duplicados podem guardar created_date/aprovação diferentes para a mesma NF.
  if (numero && cnpj && valorCentavos > 0) {
    return `NF:${numero}:${cnpj}:${valorCentavos}`;
  }

  // 3. Quando o CNPJ não foi extraído, número + emitente + valor ainda distingue
  // parcelas e evita contar novamente PDF/XML ou cópias da mesma nota.
  if (numero && fornecedor && valorCentavos > 0) {
    return `NF_FORNECEDOR:${numero}:${fornecedor}:${valorCentavos}`;
  }

  // 4. Mesmo arquivo fiscal vinculado mais de uma vez.
  const arquivo = urlFiscal(nf);
  if (arquivo) return `ARQUIVO:${arquivo}`;

  // 5. Fallback conservador. Só consolida quando fornecedor, valor, rubrica e
  // centro são iguais; registros sem dados suficientes permanecem separados.
  const { centro_normalizado } = normalizeCentroCusto(nf);
  const rubrica = String(nf.rubrica_id || nf.rubrica_nome || nf.item_despesa || '').trim();
  if (!fornecedor || valorCentavos <= 0) return null;

  return `FALLBACK:${fornecedor}:${valorCentavos}:${centro_normalizado}:${rubrica}`;
}

// ─── 5. PRIORIDADE ENTRE DUPLICATAS ──────────────────────────────────────────

function duplicatePriority(nf) {
  let score = 0;
  if (nf.comprovante_pagamento_url || nf.comprovante_url) score += 16;
  if (nf.drive_backup_status === 'concluido') score += 8;
  if (nf.nota_fiscal_pdf_url || nf.nf_pdf_url) score += 4;
  if (nf.nota_fiscal_xml_url || nf.xml_url) score += 2;
  if (String(nf.status || '').toUpperCase() === 'PAGO') score += 1;
  return score;
}

// ─── 6. FILTRO FINANCEIRO COMPLETO ───────────────────────────────────────────

export function getFinanciallyValidPurchases(purchases = []) {
  const ativas = purchases.filter(p => isFinanciallyActiveStatus(p.status));
  const keyMap = new Map();
  const duplicadasDiretas = [];

  for (const nf of ativas) {
    if (nf.duplicada_financeira === true || nf.incluir_no_somatorio === false) {
      duplicadasDiretas.push(nf);
      continue;
    }

    const key = getFinancialDedupKey(nf);
    const effectiveKey = key || `NO_KEY:${nf.id}`;

    if (!keyMap.has(effectiveKey)) {
      keyMap.set(effectiveKey, nf);
      continue;
    }

    const current = keyMap.get(effectiveKey);
    if (duplicatePriority(nf) > duplicatePriority(current)) {
      keyMap.set(effectiveKey, nf);
    }
  }

  const validas = Array.from(keyMap.values());
  const validasRefs = new Set(validas);
  const duplicadasDetectadas = ativas.filter((p) => {
    if (p.duplicada_financeira === true || p.incluir_no_somatorio === false) return false;
    return !validasRefs.has(p);
  });

  const duplicadas = [...new Set([...duplicadasDiretas, ...duplicadasDetectadas])];
  return { validas, duplicadas };
}

// ─── 7. CÁLCULO DOS TOTAIS DOS ADITIVOS ─────────────────────────────────────

export function calculateAditivoTotals(purchases = []) {
  const { validas, duplicadas } = getFinanciallyValidPurchases(purchases);

  const terceiro = { total: 0, utilizado: 0, quantidade_nfs: 0 };
  const noturno2026 = { total: 0, utilizado: 0, quantidade_nfs: 0 };
  const noturnoPampulha = { total: 0, utilizado: 0, quantidade_nfs: 0 };

  for (const nf of validas) {
    const { aditivo } = normalizeCentroCusto(nf);
    const valor = getPurchaseValue(nf);

    if (aditivo === '4º Aditivo Pampulha') {
      noturnoPampulha.utilizado += valor;
      noturnoPampulha.quantidade_nfs += 1;
    } else if (aditivo === '4º Aditivo Noturno 2026') {
      noturno2026.utilizado += valor;
      noturno2026.quantidade_nfs += 1;
    } else {
      terceiro.utilizado += valor;
      terceiro.quantidade_nfs += 1;
    }
  }

  const duplicadas_ignoradas = {
    total_valor: duplicadas.reduce((s, p) => s + getPurchaseValue(p), 0),
    quantidade: duplicadas.length,
  };

  return {
    terceiro_aditivo: terceiro,
    noturno_2026: noturno2026,
    noturno_pampulha: noturnoPampulha,
    duplicadas_ignoradas,
  };
}

// ─── 8. BADGES FINANCEIROS PARA A TABELA ─────────────────────────────────────

export function getFinancialBadges(nf, allPurchases = []) {
  const badges = [];

  if (isFinanciallyActiveStatus(nf.status)) {
    badges.push({ key: 'ativo', label: 'No somatório', color: 'bg-green-50 text-green-700' });
  } else {
    badges.push({ key: 'inativo', label: 'Fora do somatório', color: 'bg-gray-100 text-gray-500' });
  }

  if (nf.duplicada_financeira === true || nf.incluir_no_somatorio === false) {
    badges.push({ key: 'dup', label: 'Duplicata', color: 'bg-red-50 text-red-700' });
  }

  if (nf._centro_corrigido) {
    badges.push({ key: 'cc', label: 'Centro corrigido', color: 'bg-amber-50 text-amber-700' });
  }

  if (nf._rubrica_corrigida) {
    badges.push({ key: 'rub', label: 'Rubrica corrigida', color: 'bg-purple-50 text-purple-700' });
  }

  return badges;
}
