import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Save, X } from 'lucide-react';
import { toast } from 'sonner';

export default function RubricasMuseuEditor({ museu }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);

  // Fetch rubricas e configs
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 200),
    enabled: !!museu,
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: () => base44.entities.RubricaMuseuConfig.list(),
    enabled: !!museu,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases-all'],
    queryFn: () => base44.entities.PurchaseRequest.list('created_date', 500),
    enabled: !!museu,
  });

  // Rubricas do museu selecionado
  const rubricasDoMuseu = React.useMemo(() => {
    const rubricasIds = new Set(
      configs
        .filter(c => c.museu === museu)
        .map(c => c.rubrica_id)
    );

    return rubricas
      .filter(r => rubricasIds.has(r.id) && r.ativo !== false)
      .map(r => {
        const comprasAprovadas = purchases.filter(
          p => p.rubrica_id === r.id && p.status === 'APROVADO_COORD'
        );
        const comprasPagas = purchases.filter(
          p => p.rubrica_id === r.id && p.status === 'PAGO'
        );

        const valorUtilizado =
          (comprasAprovadas.reduce((sum, p) => sum + (p.valor_total || 0), 0) +
          comprasPagas.reduce((sum, p) => sum + (p.valor_total || 0), 0)) || 0;

        const saldo = (r.valor_total || 0) - valorUtilizado;
        const percentualUtilizado =
          (r.valor_total || 0) > 0 ? ((valorUtilizado / r.valor_total) * 100).toFixed(1) : 0;

        return {
          id: r.id,
          rubrica: r.rubrica,
          categoria: r.categoria,
          valor_total: r.valor_total || 0,
          valorUtilizado,
          saldo,
          percentualUtilizado,
          comprasAprovadas: comprasAprovadas.length,
          comprasPagas: comprasPagas.length,
        };
      });
  }, [rubricas, configs, purchases, museu]);

  const handleEditStart = (rubrica) => {
    setEditingId(rubrica.id);
    setEditValues({
      valor_total: rubrica.valor_total.toString(),
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleSave = async (rubricaId) => {
    setSaving(true);
    try {
      const novoValor = parseFloat(editValues.valor_total);
      if (isNaN(novoValor) || novoValor < 0) {
        toast.error('Valor inválido');
        setSaving(false);
        return;
      }

      await base44.entities.Rubrica.update(rubricaId, {
        valor_total: novoValor,
      });

      queryClient.invalidateQueries({ queryKey: ['rubricas-all'] });
      toast.success('Rubrica salva com sucesso');
      setEditingId(null);
      setEditValues({});
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar rubrica');
    } finally {
      setSaving(false);
    }
  };

  if (rubricasDoMuseu.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
        <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">Nenhuma rubrica configurada para este museu</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rubricasDoMuseu.map((rubrica) => {
        const isEditing = editingId === rubrica.id;
        const temAlerta = rubrica.percentualUtilizado > 80 || rubrica.saldo < 0;

        return (
          <Card
            key={rubrica.id}
            className={`border-2 transition-all ${
              temAlerta
                ? 'border-red-300 bg-red-50/30'
                : rubrica.percentualUtilizado > 50
                ? 'border-yellow-300 bg-yellow-50/30'
                : 'border-green-200 bg-green-50/30'
            }`}
          >
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="font-bold text-black text-sm">{rubrica.rubrica}</h3>
                  <p className="text-xs text-gray-500 mt-1">{rubrica.categoria}</p>
                </div>
                <div
                  className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                    rubrica.percentualUtilizado > 80
                      ? 'bg-red-100 text-red-700'
                      : rubrica.percentualUtilizado > 50
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {rubrica.percentualUtilizado}%
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Orçamento</p>
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editValues.valor_total}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          valor_total: e.target.value,
                        }))
                      }
                      className="mt-1 text-sm font-bold"
                    />
                  ) : (
                    <p className="text-sm font-bold text-black mt-1">
                      R$ {rubrica.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>

                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <p className="text-[10px] text-blue-600 uppercase font-semibold">Utilizado</p>
                  <p className="text-sm font-bold text-blue-700 mt-1">
                    R$ {rubrica.valorUtilizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div
                  className={`p-3 rounded-lg border ${
                    rubrica.saldo < 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
                  }`}
                >
                  <p
                    className={`text-[10px] uppercase font-semibold ${
                      rubrica.saldo < 0 ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    Saldo
                  </p>
                  <p
                    className={`text-sm font-bold mt-1 ${
                      rubrica.saldo < 0 ? 'text-red-700' : 'text-green-700'
                    }`}
                  >
                    R$ {Math.abs(rubrica.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                  <p className="text-[10px] text-purple-600 uppercase font-semibold">Compras</p>
                  <p className="text-sm font-bold text-purple-700 mt-1">
                    ✓ {rubrica.comprasAprovadas + rubrica.comprasPagas}
                  </p>
                </div>
              </div>

              {isEditing ? (
                <div className="flex gap-2 pt-2 border-t border-gray-200">
                  <Button
                    onClick={() => handleSave(rubrica.id)}
                    disabled={saving}
                    className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <Save className="w-4 h-4" />
                    Salvar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleEditCancel}
                    disabled={saving}
                    className="flex-1 gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full text-sm"
                  onClick={() => handleEditStart(rubrica)}
                >
                  Editar Orçamento
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}