import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Save, X } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIAS = [
  { key: 'manutencao', label: 'Manutenção de Rotina' },
  { key: 'diarias_educador', label: 'Diárias de Educador' },
  { key: 'lanches', label: 'Lanches' },
  { key: 'alimentacao_cartao', label: 'Alimentação Cartão' },
  { key: 'material', label: 'Material' },
  { key: 'acoes_educativas', label: 'Ações Educativas' },
  { key: 'som_luz', label: 'Som e Luz' },
  { key: 'exposicao', label: 'Exposição' },
];

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

  // Rubricas agrupadas por categoria
  const rubricasPorCategoria = React.useMemo(() => {
    const rubricasIds = new Set(
      configs
        .filter(c => c.museu === museu)
        .map(c => c.rubrica_id)
    );

    const rubricasDoMuseu = rubricas
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

    // Agrupar por categoria
    return CATEGORIAS.map(cat => ({
      categoria: cat,
      rubricas: rubricasDoMuseu.filter(r => {
        const configsCategoria = configs.filter(c => c.museu === museu && c.rubrica_id === r.id);
        return configsCategoria.some(c => c.categoria_key === cat.key);
      })
    }));
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rubricasPorCategoria.map(({ categoria, rubricas }) => (
        <Card key={categoria.key} className="border border-gray-200">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm text-gray-900 mb-3">{categoria.label}</h3>
            
            {rubricas.length === 0 ? (
              <div className="text-center py-6">
                <AlertCircle className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Sem rubricas configuradas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rubricas.map((rubrica) => {
                  const isEditing = editingId === rubrica.id;
                  const temAlerta = rubrica.percentualUtilizado > 80 || rubrica.saldo < 0;

                  return (
                    <div
                      key={rubrica.id}
                      className={`p-3 rounded-lg border ${
                        temAlerta
                          ? 'bg-red-50 border-red-200'
                          : rubrica.percentualUtilizado > 50
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-green-50 border-green-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-semibold text-xs text-black">{rubrica.rubrica}</h4>
                        <div
                          className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            temAlerta
                              ? 'bg-red-100 text-red-700'
                              : rubrica.percentualUtilizado > 50
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {rubrica.percentualUtilizado}%
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Previsto:</span>
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
                              className="w-20 h-6 text-xs"
                            />
                          ) : (
                            <span className="font-bold text-black">
                              R$ {rubrica.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Saldo:</span>
                          <span className={`font-bold ${rubrica.saldo < 0 ? 'text-red-700' : 'text-green-700'}`}>
                            R$ {Math.abs(rubrica.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="flex gap-1 mt-2">
                          <Button
                            onClick={() => handleSave(rubrica.id)}
                            disabled={saving}
                            size="sm"
                            className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700"
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Salvar
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleEditCancel}
                            disabled={saving}
                            size="sm"
                            className="flex-1 h-7 text-xs"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs mt-2"
                          onClick={() => handleEditStart(rubrica)}
                        >
                          Editar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}