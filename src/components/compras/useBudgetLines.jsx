import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useEffect, useMemo } from 'react';

/**
 * Hook centralizado para carregar e sincronizar linhas orçamentárias / rubricas
 * Todas as páginas e componentes devem usar este hook para acesso consistente
 * Sincronização em tempo real via subscriptions
 */

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeBudgetLine(line) {
  const rubricaId =
    line?.rubrica_id ||
    line?.budgetline_id ||
    line?.budget_line_id ||
    '';

  const saldoInicial = toNumber(line?.saldo_inicial);
  const saldoComprometido = toNumber(line?.saldo_comprometido);
  const saldoDisponivel = saldoInicial - saldoComprometido;

  return {
    ...line,
    rubrica_id: rubricaId,
    budgetline_id: line?.id || line?.budgetline_id || '',
    budget_line_id: line?.id || line?.budget_line_id || '',
    saldo_inicial: saldoInicial,
    saldo_comprometido: saldoComprometido,
    saldo_disponivel: saldoDisponivel,
    valor_total_previsto: toNumber(line?.valor_total_previsto || line?.saldo_inicial),
  };
}

export function useBudgetLines() {
  const queryClient = useQueryClient();

  const invalidateBudgetQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['budget-lines'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines-sync'] }),
      queryClient.invalidateQueries({ queryKey: ['budget'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'] }),
      queryClient.invalidateQueries({ queryKey: ['rubricas-consolidadas'] }),
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['team-members'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments-pending'] }),
      queryClient.invalidateQueries({ queryKey: ['team-payments-pending-review'] }),
    ]);
  };

  const { data: budgetLines = [], isLoading, error } = useQuery({
    queryKey: ['budget-lines'],
    queryFn: async () => {
      const allLines = await base44.entities.BudgetLine.list('codigo', 5000);

      return (allLines || [])
        .filter((line) => line?.codigo?.startsWith('MC3A'))
        .map(normalizeBudgetLine)
        .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || '')));
    },
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const unsubscribe = base44.entities.BudgetLine.subscribe(async (event) => {
      if (event?.data?.codigo?.startsWith('MC3A')) {
        await invalidateBudgetQueries();
      }
    });

    return unsubscribe;
  }, [queryClient]);

  const budgetLineMap = useMemo(() => {
    const map = {};
    for (const line of budgetLines) {
      if (line?.id) map[line.id] = line;
      if (line?.budgetline_id) map[line.budgetline_id] = line;
      if (line?.budget_line_id) map[line.budget_line_id] = line;
    }
    return map;
  }, [budgetLines]);

  const rubricaMap = useMemo(() => {
    const map = {};
    for (const line of budgetLines) {
      if (line?.rubrica_id) {
        if (!map[line.rubrica_id]) map[line.rubrica_id] = [];
        map[line.rubrica_id].push(line);
      }
    }
    return map;
  }, [budgetLines]);

  const totalInicial = useMemo(
    () => budgetLines.reduce((acc, line) => acc + toNumber(line.saldo_inicial), 0),
    [budgetLines]
  );

  const totalComprometido = useMemo(
    () => budgetLines.reduce((acc, line) => acc + toNumber(line.saldo_comprometido), 0),
    [budgetLines]
  );

  const totalDisponivel = totalInicial - totalComprometido;

  return {
    budgetLines,
    isLoading,
    error,
    refreshBudgetLines: invalidateBudgetQueries,

    totalInicial,
    totalComprometido,
    totalDisponivel,

    getBudgetLine: (id) => budgetLineMap[id] || null,
    getBudgetLineByCode: (code) =>
      budgetLines.find((line) => String(line.codigo || '') === String(code || '')) || null,

    getBudgetLineByAnyId: (objOrId) => {
      if (!objOrId) return null;

      if (typeof objOrId === 'string') {
        return budgetLineMap[objOrId] || null;
      }

      const id =
        objOrId?.budgetline_id ||
        objOrId?.budget_line_id ||
        objOrId?.linha_orcamentaria_id ||
        objOrId?.id ||
        '';

      return budgetLineMap[id] || null;
    },

    getBudgetLinesByRubricaId: (rubricaId) => rubricaMap[rubricaId] || [],

    hasSaldoSuficiente: (budgetlineId, valor) => {
      const line = budgetLineMap[budgetlineId];
      if (!line) return false;
      return toNumber(line.saldo_disponivel) >= toNumber(valor);
    },
  };
}