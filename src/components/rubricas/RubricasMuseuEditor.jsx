import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit2, AlertCircle } from 'lucide-react';
import EditRubricaDialog from './EditRubricaDialog';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function RubricasMuseuEditor({ museu, canEdit, refreshKey, rubricaFilter }) {
  const [editingRubrica, setEditingRubrica] = React.useState(null);

  const { data: consolidado, isLoading } = useQuery({
    queryKey: ['rubricas-consolidadas-editor', refreshKey],
    queryFn: async () => {
      const res = await base44.functions.invoke('getRubricasConsolidadas', {});
      return res?.data || {};
    },
    staleTime: 0,
    gcTime: 0,
  });

  const rubricas = useMemo(() => {
    if (!consolidado?.por_museu?.[museu]) return [];

    const categorias = consolidado.por_museu[museu];
    const result = [];

    Object.entries(categorias).forEach(([catKey, items]) => {
      (Array.isArray(items) ? items : [])
        .filter(rubricaFilter)
        .forEach((rubrica) => {
          result.push({
            ...rubrica,
            categoria: catKey,
          });
        });
    });

    return result;
  }, [consolidado, museu, rubricaFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (rubricas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-gray-500 text-sm">Nenhuma rubrica disponível para este museu</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rubricas.map((rubrica) => {
        const totalOrcado = toNumber(rubrica.totalOrcado ?? rubrica.valor_rubrica);
        const totalUtilizado = toNumber(rubrica.valorUtilizado ?? rubrica.valor_utilizado);
        const totalSaldo = totalOrcado - totalUtilizado;
        const pct = totalOrcado > 0 ? (totalUtilizado / totalOrcado) * 100 : 0;

        return (
          <Card key={rubrica.id} className="border-gray-200 bg-white hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-black truncate">
                    {rubrica.rubrica || rubrica.nome}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {rubrica.categoria}
                  </p>

                  <div className="flex gap-4 mt-3 text-xs">
                    <div>
                      <p className="text-gray-500">Previsto</p>
                      <p className="font-semibold text-black">
                        {totalOrcado.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Utilizado</p>
                      <p className="font-semibold text-black">
                        {totalUtilizado.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Saldo</p>
                      <p className={`font-semibold ${totalSaldo < 0 ? 'text-red-600' : 'text-black'}`}>
                        {totalSaldo.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-600'
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-500 w-10 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </div>

                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-500 hover:text-black hover:bg-gray-50"
                    onClick={() => setEditingRubrica(rubrica)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {editingRubrica && (
        <EditRubricaDialog
          rubrica={editingRubrica}
          open={!!editingRubrica}
          onClose={() => setEditingRubrica(null)}
        />
      )}
    </div>
  );
}

export default RubricasMuseuEditor;