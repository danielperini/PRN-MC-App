import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RubricaManager from '@/components/compras/RubricaManager';

export default function PainelRubricasAdmin() {
  const { data: budgetLines = [], isLoading: loadingBL, refetch: refetchBL } = useQuery({
    queryKey: ['budget-lines-admin'],
    queryFn: async () => {
      const all = [];
      let skip = 0;
      while (true) {
        const batch = await base44.entities.BudgetLine.list('-created_date', 500, skip);
        if (!batch?.length) break;
        all.push(...batch);
        if (batch.length < 500) break;
        skip += 500;
      }
      return all;
    },
  });

  const { data: purchases = [], isLoading: loadingP, refetch: refetchP } = useQuery({
    queryKey: ['purchases-admin-rubrica'],
    queryFn: async () => {
      const all = [];
      let skip = 0;
      while (true) {
        const batch = await base44.entities.PurchaseRequest.list('-created_date', 500, skip);
        if (!batch?.length) break;
        all.push(...batch);
        if (batch.length < 500) break;
        skip += 500;
      }
      return all;
    },
  });

  const loading = loadingBL || loadingP;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>Painel de Rubricas (editável)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Edite valores, crie novas rubricas ou importe atualizações. Totais calculados em tempo real.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading}
          onClick={() => { refetchBL(); refetchP(); }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500 gap-3 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Carregando rubricas e solicitações...
        </div>
      ) : (
        <RubricaManager budgetLines={budgetLines} purchases={purchases} />
      )}
    </div>
  );
}