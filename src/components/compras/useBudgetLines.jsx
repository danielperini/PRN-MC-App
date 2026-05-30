import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useEffect, useMemo } from 'react';

/**
 * Hook centralizado para carregar rubricas oficiais da entidade Rubrica.
 * Retorna dados normalizados com interface compatível com o uso legado de BudgetLine.
 * Fonte primária: Rubrica (ativo !== false).
 */

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRubricaAsBudgetLine(r) {
  const valorTotal = toNumber(r?.valor_rubrica ?? r?.valor_total ?? r?.saldo_inicial);
  const utilizado = toNumber(r?.valor_utilizado);
  const saldoDisponivel = valorTotal - utilizado;
  return {
    ...r,
    // Compatibilidade com interface legada de BudgetLine
    id: r.id,
    nome: r.rubrica || r.nome || r.descricao || '',
    codigo: r._chave_oficial || r.id,
    descricao: r.rubrica || r.nome || r.descricao || '',
    rubrica_id: r.id,
    budgetline_id: r.id,
    budget_line_id: r.id,
    saldo_inicial: valorTotal,
    saldo_comprometido: 0,
    saldo_disponivel: saldoDisponivel,
    valor_total_previsto: valorTotal,
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
      const rubricas = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
      return (rubricas || [])
        .filter((r) => r?.ativo !== false)
        .map(normalizeRubricaAsBudgetLine)
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
    },
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const unsubscribe = base44.entities.Rubrica.subscribe(async () => {
      await invalidateBudgetQueries();
    });
    return unsubscribe;
  }, [queryClient]);

  const budgetLineMap = useMemo(() => {
    const map = {};
    for (const line of budgetLines) {
      if (line?.id) map[line.id] = line;
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
      if (typeof objOrId === 'string') return budgetLineMap[objOrId] || null;
      const id =
        objOrId?.budgetline_id ||
        objOrId?.budget_line_id ||
        objOrId?.linha_orcamentaria_id ||
        objOrId?.id || '';
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