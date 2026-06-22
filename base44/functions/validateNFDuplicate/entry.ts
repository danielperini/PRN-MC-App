/**
 * validateNFDuplicate — Verificação centralizada e bloqueante de duplicidade de NF.
 *
 * Critérios de duplicidade (em ordem de prioridade):
 *   1. Mesma chave de acesso XML (44 dígitos) — certeza absoluta
 *   2. Mesmo CNPJ/CPF emitente + mesmo número NF — duplicidade provável
 *   3. Mesmo fornecedor + valor + data de emissão — possível duplicidade
 *
 * Retorna:
 *   { isDuplicate: bool, confidence: 'CERTEZA'|'PROVAVEL'|'POSSIVEL', motivo, matches: [] }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function safeStr(v) {
  return String(v || '').trim();
}

function parseValor(v) {
  if (!v) return 0;
  const s = String(v).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const STATUS_ATIVOS = new Set([
  'SOLICITADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO',
]);

const STATUS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function buildMatchSummary(match) {
  const prefix = STATUS_APROVADOS.has(match.status) ? '⛔ JÁ APROVADA' : '⚠️ Pendente';
  const num = match.nf_numero ? `NF ${match.nf_numero}` : '';
  const prov = match.fornecedor_nome || match.nf_emitente_nome || '';
  const num_proc = match.numero_processamento ? ` — Proc. ${match.numero_processamento}` : '';
  return `${prefix}: ${[num, prov].filter(Boolean).join(' / ')}${num_proc}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      nf_numero,
      nf_emitente_cpf_cnpj,
      nf_valor_total,
      nf_data_emissao,
      nf_chave_acesso,
      exclude_id,           // ID da própria solicitação (edição)
      check_approved_only,  // Se true, só verifica contra aprovadas (para criação de nova)
    } = body;

    const cnpj = onlyDigits(nf_emitente_cpf_cnpj);
    const numero = safeStr(nf_numero);
    const chave = onlyDigits(nf_chave_acesso).slice(0, 44);
    const valor = parseValor(nf_valor_total);
    const dataEmissao = safeStr(nf_data_emissao);

    // Precisa de pelo menos CNPJ + número, ou chave XML para verificar
    if (!chave && (!cnpj || !numero)) {
      return Response.json({
        isDuplicate: false,
        confidence: null,
        motivo: null,
        matches: [],
        skipped: true,
        reason: 'Dados insuficientes para verificação (CNPJ + número ou chave XML obrigatórios)',
      });
    }

    // ── 1. Buscar candidatos por CNPJ e por número em paralelo ──
    const [porCnpj, porNumero, porChave] = await Promise.all([
      cnpj
        ? base44.asServiceRole.entities.PurchaseRequest.filter(
            { fornecedor_cnpj: cnpj }, '-created_date', 300
          ).catch(() => [])
        : Promise.resolve([]),
      numero
        ? base44.asServiceRole.entities.PurchaseRequest.filter(
            { nf_numero: numero }, '-created_date', 100
          ).catch(() => [])
        : Promise.resolve([]),
      chave
        ? base44.asServiceRole.entities.PurchaseRequest.filter(
            { nf_chave_acesso: chave }, '-created_date', 20
          ).catch(() => [])
        : Promise.resolve([]),
    ]);

    // Também buscar em DocumentIntake para pegar NFs na fila de entrada
    const [intakesPorCnpj, intakesPorNumero] = await Promise.all([
      cnpj
        ? base44.asServiceRole.entities.DocumentIntake.filter(
            { nf_emitente_cpf_cnpj: cnpj }, '-created_date', 200
          ).catch(() => [])
        : Promise.resolve([]),
      numero
        ? base44.asServiceRole.entities.DocumentIntake.filter(
            { nf_numero: numero }, '-created_date', 50
          ).catch(() => [])
        : Promise.resolve([]),
    ]);

    // Deduplicar candidatos de PurchaseRequest
    const purchaseMap = new Map();
    for (const r of [...(porCnpj || []), ...(porNumero || []), ...(porChave || [])]) {
      if (!r?.id) continue;
      if (exclude_id && r.id === exclude_id) continue;
      if (!STATUS_ATIVOS.has(r.status)) continue; // ignora cancelados e devolvidos
      purchaseMap.set(r.id, r);
    }

    // Deduplicar candidatos de DocumentIntake
    const intakeMap = new Map();
    for (const r of [...(intakesPorCnpj || []), ...(intakesPorNumero || [])]) {
      if (!r?.id) continue;
      if (r.status_registro === 'REMOVIDO') continue;
      intakeMap.set(r.id, { ...r, _source: 'intake' });
    }

    const matches = [];

    // ── 2. Checar PurchaseRequests ──
    for (const purchase of purchaseMap.values()) {
      const pCnpj = onlyDigits(purchase.fornecedor_cnpj || purchase.nf_emitente_cpf_cnpj);
      const pNum = safeStr(purchase.nf_numero);
      const pChave = onlyDigits(purchase.nf_chave_acesso || '').slice(0, 44);
      const pValor = parseValor(purchase.nf_valor_total || purchase.valor_solicitado || 0);
      const pData = safeStr(purchase.nf_data_emissao);

      let confidence = null;
      let motivo = null;

      // Regra 1: Chave XML idêntica → certeza absoluta
      if (chave && pChave && chave === pChave) {
        confidence = 'CERTEZA';
        motivo = `Chave de acesso XML idêntica: ${chave}`;
      }
      // Regra 2: CNPJ + número NF iguais
      else if (cnpj && pCnpj && cnpj === pCnpj && numero && pNum && numero === pNum) {
        confidence = 'PROVAVEL';
        motivo = `Mesmo CNPJ (${cnpj}) e número NF (${numero})`;
      }
      // Regra 2b: Número NF idêntico + pelo menos 2 de 3 (CNPJ, valor, data) batem
      else if (numero && pNum && numero === pNum) {
        let matchCount = 0;
        const fields = [];
        if (cnpj && pCnpj && cnpj === pCnpj) { matchCount++; fields.push(`CNPJ ${cnpj}`); }
        if (valor > 0 && Math.abs(valor - pValor) < 0.02) { matchCount++; fields.push(`valor R$ ${valor.toFixed(2)}`); }
        if (dataEmissao && pData && dataEmissao === pData) { matchCount++; fields.push(`data ${dataEmissao}`); }
        if (matchCount >= 2) {
          confidence = 'PROVAVEL';
          motivo = `Mesmo número NF (${numero}) + ${fields.join(' e ')}`;
        }
      }
      // Regra 3: CNPJ + valor + data iguais
      else if (
        cnpj && pCnpj && cnpj === pCnpj &&
        valor > 0 && Math.abs(valor - pValor) < 0.02 &&
        dataEmissao && pData && dataEmissao === pData
      ) {
        confidence = 'POSSIVEL';
        motivo = `Mesmo CNPJ (${cnpj}), valor R$ ${valor.toFixed(2)} e data ${dataEmissao}`;
      }

      if (confidence) {
        matches.push({
          id: purchase.id,
          source: 'PurchaseRequest',
          confidence,
          motivo,
          status: purchase.status,
          is_approved: STATUS_APROVADOS.has(purchase.status),
          numero_processamento: purchase.numero_processamento,
          nf_numero: purchase.nf_numero,
          nf_valor_total: purchase.nf_valor_total,
          nf_data_emissao: purchase.nf_data_emissao,
          fornecedor_nome: purchase.fornecedor_nome || purchase.nf_emitente_nome,
          rubrica_debitada_em: purchase.rubrica_debitada_em,
          summary: buildMatchSummary(purchase),
        });
      }
    }

    // ── 3. Checar DocumentIntake (NFs na fila de entrada) ──
    for (const intake of intakeMap.values()) {
      const iCnpj = onlyDigits(intake.nf_emitente_cpf_cnpj || '');
      const iNum = safeStr(intake.nf_numero);
      const iValor = parseValor(intake.nf_valor_total || 0);

      let confidence = null;
      let motivo = null;

      if (cnpj && iCnpj && cnpj === iCnpj && numero && iNum && numero === iNum) {
        confidence = 'PROVAVEL';
        motivo = `Mesmo CNPJ (${cnpj}) e número NF (${numero}) no intake`;
      } else if (numero && iNum && numero === iNum) {
        // Regra 2b para intakes: mesmo NF + pelo menos 1 de 2 (CNPJ ou valor)
        let matchCount = 0;
        const fields = [];
        if (cnpj && iCnpj && cnpj === iCnpj) { matchCount++; fields.push(`CNPJ ${cnpj}`); }
        if (valor > 0 && Math.abs(valor - iValor) < 0.02) { matchCount++; fields.push(`valor R$ ${valor.toFixed(2)}`); }
        if (matchCount >= 1) {
          confidence = 'PROVAVEL';
          motivo = `Mesmo número NF (${numero}) + ${fields.join(' e ')} no intake`;
        }
      } else if (
        cnpj && iCnpj && cnpj === iCnpj &&
        valor > 0 && Math.abs(valor - iValor) < 0.02
      ) {
        confidence = 'POSSIVEL';
        motivo = `Mesmo CNPJ e valor R$ ${valor.toFixed(2)} no intake`;
      }

      if (confidence) {
        matches.push({
          id: intake.id,
          source: 'DocumentIntake',
          confidence,
          motivo,
          status: intake.status_processamento,
          is_approved: ['APROVADO'].includes(intake.status_processamento),
          nf_numero: intake.nf_numero,
          nf_valor_total: intake.nf_valor_total,
          fornecedor_nome: intake.fornecedor_nome || intake.nf_emitente_nome,
          summary: `⚠️ Na fila de entrada: ${intake.nf_emitente_nome || ''} NF ${intake.nf_numero || ''} (${intake.status_processamento})`,
        });
      }
    }

    // ── 4. Classificar resultado ──
    if (matches.length === 0) {
      return Response.json({
        isDuplicate: false,
        confidence: null,
        motivo: null,
        matches: [],
      });
    }

    // Pegar o match de maior severidade
    const priority = { CERTEZA: 3, PROVAVEL: 2, POSSIVEL: 1 };
    matches.sort((a, b) => (priority[b.confidence] || 0) - (priority[a.confidence] || 0));
    const top = matches[0];

    // É bloqueante se há aprovada com CERTEZA ou PROVAVEL
    const hasApprovedDuplicate = matches.some(
      (m) => m.is_approved && ['CERTEZA', 'PROVAVEL'].includes(m.confidence)
    );

    return Response.json({
      isDuplicate: true,
      isBlocking: hasApprovedDuplicate || top.confidence === 'CERTEZA',
      confidence: top.confidence,
      motivo: top.motivo,
      hasApprovedDuplicate,
      matches,
      message: `Possível nota fiscal duplicada. Já existe lançamento para este fornecedor, número, valor ou XML. (${top.motivo})`,
    });

  } catch (error) {
    console.error('validateNFDuplicate error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});