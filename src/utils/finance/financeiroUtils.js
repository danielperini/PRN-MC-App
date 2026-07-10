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
  // Tratar strings formatadas como "R$ 1.234,56"
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

  // Pampulha tem prioridade sobre qualquer "noturno" genérico
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

function normalizarData(data) {
  if (!data) return '';
  const s = String(data).split('T')[0]; // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

export function getFinancialDedupKey(nf) {
  if (!nf) return null;

  // 1. Chave de acesso NF-e (44 dígitos) — mais confiável
  const chave = String(nf.nf_chave_acesso || '').replace(/\D/g, '');
  if (chave.length === 44) return `CHAVE:${chave}`;

  // 2. Número NF + CNPJ + valor + data
  const numero = String(nf.nf_numero || '').trim();
  const cnpj = String(nf.fornecedor_cnpj || nf.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
  const valor = String(Math.round(getPurchaseValue(nf) * 100)); // centavos
  const data = normalizarData(nf.nf_data_emissao || nf.aprov_admin_data || nf.created_date);

  if (numero && cnpj && valor !== '0') {
    return `NF:${numero}:${cnpj}:${valor}:${data}`;
  }

  // 3. Fallback: fornecedor normalizado + valor + data + rubrica + centro
  const fornecedor = normalizarFornecedor(nf.fornecedor_nome || nf.nf_emitente_nome);
  const { centro_normalizado } = normalizeCentroCusto(nf);
  const rubrica = String(nf.rubrica_id || nf.rubrica_nome || '').trim();

  if (!fornecedor && !valor) return null;
  return `FALLBACK:${fornecedor}:${valor}:${data}:${centro_normalizado}:${rubrica}`;
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

/**
 * Retorna as NFs que entram no somatório financeiro:
 * - status ativo
 * - não marcadas como duplicata financeira
 * - deduplica por chave, mantendo a de maior prioridade
 *
 * @param {Array} purchases - lista completa de PurchaseRequest
 * @returns {{ validas: Array, duplicadas: Array }}
 */
export function getFinanciallyValidPurchases(purchases = []) {
  // 1. Filtrar por status ativo
  const ativas = purchases.filter(p => isFinanciallyActiveStatus(p.status));

  // 2. Deduplicar por chave
  const keyMap = new Map(); // key -> nf com maior prioridade

  for (const nf of ativas) {
    // Se já marcada como duplicata no banco, pular
    if (nf.duplicada_financeira === true || nf.incluir_no_somatorio === false) continue;

    const key = getFinancialDedupKey(nf);
    if (!key) {
      // Sem chave identificável — incluir sempre
      if (!keyMap.has(`NO_KEY:${nf.id}`)) keyMap.set(`NO_KEY:${nf.id}`, nf);
      continue;
    }

    if (!keyMap.has(key)) {
      keyMap.set(key, nf);
    } else {
      const current = keyMap.get(key);
      if (duplicatePriority(nf) > duplicatePriority(current)) {
        keyMap.set(key, nf);
      }
    }
  }

  const validas = Array.from(keyMap.values());
  const validasIds = new Set(validas.map(p => p.id));
  const duplicadas = ativas.filter(p => !validasIds.has(p.id));

  return { validas, duplicadas };
}

// ─── 7. CÁLCULO DOS TOTAIS DOS ADITIVOS ─────────────────────────────────────

/**
 * Calcula totais por aditivo a partir das NFs válidas (já deduplicadas).
 * @param {Array} purchases - lista completa de PurchaseRequest
 */
export function calculateAditivoTotals(purchases = []) {
  const { validas, duplicadas } = getFinanciallyValidPurchases(purchases);

  let terceiro = { total: 0, utilizado: 0, quantidade_nfs: 0 };
  let noturno2026 = { total: 0, utilizado: 0, quantidade_nfs: 0 };
  let noturnoPampulha = { total: 0, utilizado: 0, quantidade_nfs: 0 };

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

/**
 * Retorna os badges de auditoria financeira para exibição na tabela.
 */
export function getFinancialBadges(nf, allPurchases = []) {
  const badges = [];

  // Status financeiro ativo
  if (isFinanciallyActiveStatus(nf.status)) {
    badges.push({ key: 'ativo', label: 'No somatório', color: 'bg-green-50 text-green-700' });
  } else {
    badges.push({ key: 'inativo', label: 'Fora do somatório', color: 'bg-gray-100 text-gray-500' });
  }

  // Duplicata financeira
  if (nf.duplicada_financeira === true || nf.incluir_no_somatorio === false) {
    badges.push({ key: 'dup', label: 'Duplicata', color: 'bg-red-50 text-red-700' });
  }

  // Centro corrigido
  if (nf._centro_corrigido) {
    badges.push({ key: 'cc', label: 'Centro corrigido', color: 'bg-amber-50 text-amber-700' });
  }

  // Rubrica corrigida
  if (nf._rubrica_corrigida) {
    badges.push({ key: 'rub', label: 'Rubrica corrigida', color: 'bg-purple-50 text-purple-700' });
  }

  return badges;
}