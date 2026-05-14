import React, { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const STATUS_CONTA_UTILIZADO = new Set([
  'APROVADO',
  'APROVADO_COORD',
  'APROVADO_ADMIN',
  'PAGO',
]);

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/\s/g, '')
    .replace(/^R\$/i, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function getRubricaTotal(rubrica) {
  return toNumber(
    rubrica?.valor_total_original ??
    rubrica?.valor_original ??
    rubrica?.valor_total ??
    rubrica?.valor_rubrica ??
    rubrica?.total ??
    rubrica?.valor_previsto ??
    0
  );
}

function getPurchaseRubricaId(purchase) {
  return (
    purchase?.rubrica_id ||
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    ''
  );
}

function getPurchaseValue(purchase) {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_solicitado) ||
    toNumber(purchase?.nf_valor_total) ||
    toNumber(purchase?.valor_total) ||
    toNumber(purchase?.valor) ||
    toNumber(purchase?.rubrica_debitada_valor) ||
    0
  );
}

function shouldUpdateRubrica(rubrica, next) {
  const currentUtilizado = toNumber(rubrica?.valor_utilizado);
  const currentSaldo = toNumber(rubrica?.saldo);
  const currentPercentual = toNumber(rubrica?.percentual_utilizado ?? rubrica?.percentual);

  return (
    Math.abs(currentUtilizado - next.valor_utilizado) > 0.009 ||
    Math.abs(currentSaldo - next.saldo) > 0.009 ||
    Math.abs(currentPercentual - next.percentual_utilizado) > 0.009
  );
}

async function listRubricas() {
  try {
    const viaEntity = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
    return Array.isArray(viaEntity) ? viaEntity : [];
  } catch (error) {
    console.warn('AutoRubricasSync: falha ao listar rubricas', error);
    return [];
  }
}

async function listPurchases() {
  try {
    const viaEntity = await base44.entities.PurchaseRequest.list('-created_date', 1000);
    return Array.isArray(viaEntity) ? viaEntity : [];
  } catch (error) {
    console.warn('AutoRubricasSync: falha ao listar solicitações', error);
    return [];
  }
}

export async function recalculateAllRubricasFromPurchases() {
  const [rubricas, purchases] = await Promise.all([listRubricas(), listPurchases()]);
  if (!rubricas.length) return { updated: 0, rubricas: 0, purchases: purchases.length };

  const totalsByRubrica = new Map();

  purchases.forEach((purchase) => {
    const status = normalizeStatus(purchase?.status);
    if (!STATUS_CONTA_UTILIZADO.has(status)) return;

    const rubricaId = getPurchaseRubricaId(purchase);
    if (!rubricaId) return;

    const value = getPurchaseValue(purchase);
    if (!value) return;

    totalsByRubrica.set(rubricaId, (totalsByRubrica.get(rubricaId) || 0) + value);
  });

  let updated = 0;

  for (const rubrica of rubricas) {
    if (!rubrica?.id) continue;

    const valorTotal = getRubricaTotal(rubrica);
    const valorUtilizado = Number((totalsByRubrica.get(rubrica.id) || 0).toFixed(2));
    const saldo = Number((valorTotal - valorUtilizado).toFixed(2));
    const percentual = valorTotal > 0 ? Number(((valorUtilizado / valorTotal) * 100).toFixed(2)) : 0;

    const next = {
      valor_utilizado: valorUtilizado,
      saldo,
      percentual_utilizado: percentual,
      percentual,
      recalculado_em: new Date().toISOString(),
      recalculo_origem: 'PurchaseRequest',
    };

    if (!shouldUpdateRubrica(rubrica, next)) continue;

    try {
      await base44.entities.Rubrica.update(rubrica.id, next);
      updated += 1;
    } catch (error) {
      console.warn(`AutoRubricasSync: falha ao atualizar rubrica ${rubrica.id}`, error);
    }
  }

  return { updated, rubricas: rubricas.length, purchases: purchases.length };
}

export default function AutoRubricasSync() {
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const lastRunRef = useRef(0);
  const queuedRef = useRef(false);

  const invalidateFinanceQueries = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases-for-rubricas-sync'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-financeiro'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-coordenacao'] }),
    ]);
  }, [queryClient]);

  const runSync = useCallback(async (force = false) => {
    const now = Date.now();

    if (!force && now - lastRunRef.current < 1200) {
      queuedRef.current = true;
      return;
    }

    if (runningRef.current) {
      queuedRef.current = true;
      return;
    }

    runningRef.current = true;
    queuedRef.current = false;
    lastRunRef.current = now;

    try {
      const result = await recalculateAllRubricasFromPurchases();
      await invalidateFinanceQueries();
      window.dispatchEvent(new CustomEvent('rubricas:recalculadas', { detail: result }));
      window.dispatchEvent(new CustomEvent('dashboard:update', { detail: result }));
    } finally {
      runningRef.current = false;

      if (queuedRef.current) {
        queuedRef.current = false;
        window.setTimeout(() => runSync(true), 250);
      }
    }
  }, [invalidateFinanceQueries]);

  useEffect(() => {
    runSync(true);

    const handleManualSync = () => runSync(true);
    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible') runSync(true);
    };

    window.addEventListener('rubricas:sync', handleManualSync);
    window.addEventListener('rubricas:sync:request', handleManualSync);
    window.addEventListener('purchase:changed', handleManualSync);
    window.addEventListener('focus', handleManualSync);
    document.addEventListener('visibilitychange', handleVisibilitySync);

    let unsubscribePurchase = null;
    let unsubscribeRubrica = null;

    try {
      if (typeof base44.entities.PurchaseRequest.subscribe === 'function') {
        unsubscribePurchase = base44.entities.PurchaseRequest.subscribe(() => runSync(true));
      }
    } catch {}

    try {
      if (typeof base44.entities.Rubrica.subscribe === 'function') {
        unsubscribeRubrica = base44.entities.Rubrica.subscribe(() => runSync(true));
      }
    } catch {}

    const fastInterval = window.setInterval(() => runSync(), 3000);
    const fullInterval = window.setInterval(() => runSync(true), 60000);

    return () => {
      window.removeEventListener('rubricas:sync', handleManualSync);
      window.removeEventListener('rubricas:sync:request', handleManualSync);
      window.removeEventListener('purchase:changed', handleManualSync);
      window.removeEventListener('focus', handleManualSync);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      window.clearInterval(fastInterval);
      window.clearInterval(fullInterval);

      if (typeof unsubscribePurchase === 'function') unsubscribePurchase();
      if (typeof unsubscribeRubrica === 'function') unsubscribeRubrica();
    };
  }, [runSync]);

  return null;
}
