import React, { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import SyncOrchestrator from '@/services/SyncOrchestrator';

const MIN_INTERVAL_MS = 2500;
const FALLBACK_INTERVAL_MS = 60_000;

export async function recalculateAllRubricasFromPurchases(rubricaId = null) {
  const response = await base44.functions.invoke('recalcularSaldosRubricas', rubricaId ? { rubrica_id: rubricaId } : {});
  const payload = response?.data || response || {};
  if (payload?.success === false) throw new Error(payload?.error || 'Falha ao recalcular saldos das rubricas.');
  return {
    ...payload,
    updated: Number(payload?.atualizadas || payload?.updated || 0),
    rubricas: Number(payload?.rubricasAtivas || payload?.rubricas || 0),
    purchases: Number(payload?.comprasLidas || payload?.purchases || 0),
  };
}

export default function AutoRubricasSync() {
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const pendingRef = useRef(false);
  const lastRunRef = useRef(0);

  const invalidate = useCallback(async (result) => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas-banco'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['compras-aprovadas-resumo'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases-for-rubricas-sync'] }),
    ]);
    SyncOrchestrator.emit(SyncOrchestrator.EVENTS.RUBRICAS_RECALCULADAS, result);
    SyncOrchestrator.emit(SyncOrchestrator.EVENTS.DASHBOARD_UPDATE);
  }, [queryClient]);

  const runSync = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRunRef.current < MIN_INTERVAL_MS) {
      pendingRef.current = true;
      return;
    }
    if (runningRef.current) {
      pendingRef.current = true;
      return;
    }

    runningRef.current = true;
    pendingRef.current = false;
    lastRunRef.current = now;
    try {
      const result = await recalculateAllRubricasFromPurchases();
      if (result.updated > 0) await invalidate(result);
    } catch (error) {
      console.warn('AutoRubricasSync: recálculo não concluído', error);
    } finally {
      runningRef.current = false;
      if (pendingRef.current) window.setTimeout(() => runSync(true), MIN_INTERVAL_MS);
    }
  }, [invalidate]);

  useEffect(() => {
    runSync(true);
    const handleManualSync = () => runSync(true);
    const handlePurchaseChanged = () => runSync(false);
    window.addEventListener('rubricas:sync', handleManualSync);
    window.addEventListener('purchase:changed', handlePurchaseChanged);

    let unsubscribePurchase = null;
    try {
      if (typeof base44.entities.PurchaseRequest.subscribe === 'function') {
        unsubscribePurchase = base44.entities.PurchaseRequest.subscribe(handlePurchaseChanged);
      }
    } catch (error) {
      console.warn('AutoRubricasSync: assinatura de solicitações indisponível', error);
    }

    const interval = window.setInterval(() => runSync(false), FALLBACK_INTERVAL_MS);
    return () => {
      window.removeEventListener('rubricas:sync', handleManualSync);
      window.removeEventListener('purchase:changed', handlePurchaseChanged);
      window.clearInterval(interval);
      if (typeof unsubscribePurchase === 'function') unsubscribePurchase();
    };
  }, [runSync]);

  return null;
}