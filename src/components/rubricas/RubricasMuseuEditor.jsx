import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Save, X } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIAS_LABEL = {
  manutencao: 'Manutenção de Rotina',
  diarias_educador: 'Diárias de Educador',
  lanches: 'Lanches',
  alimentacao_cartao: 'Alimentação Cartão',
  material: 'Material',
  acoes_educativas: 'Ações Educativas',
  som_luz: 'Som e Luz',
  exposicao: 'Exposição',
  outros: 'Outros',
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function RubricasMuseuEditor({
  museu,
  canEdit = false,
  refreshKey = 0,
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);

  const {
    data: consolidado,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['rubricas-consolidadas', museu, refreshKey],
    queryFn: async () => {
      const res = await base44.functions.invoke('getRubricasConsolidadas', {});
      return res?.data || {};
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  const porCategoria = useMemo(() => {
    if (!consolidado?.por_museu?.[museu]) return [];

    const cats = consolidado.por_museu[museu];

    return Object.entries(cats)
      .map(([cat_key, rubricas]) => ({
        cat_key,
        label: CATEGORIAS_LABEL[cat_key] || cat_key,
        rubricas: Array.isArray(rubricas) ? rubricas : [],
      }))
      .sort((a, b) => {
        const order = Object.keys(CATEGORIAS_LABEL);
        const ai = order.indexOf(a.cat_key);
        const bi = order.indexOf(b.cat_key);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
  }, [consolidado, museu]);

  const totais = useMemo(() => {
    const t = consolidado?.totais_por_museu?.[museu] || {};
    const totalOrcado = toNumber(t.totalOrcado);
    const totalUtilizado = toNumber(t.totalUtilizado);
    const totalSaldo = toNumber(t.totalSaldo);
    const pct =
      t.pct !== undefined && t.pct !== null
        ? toNumber(t.pct)
        : totalOrcado > 0
        ? Number(((totalUtilizado / totalOrcado) * 100).toFixed(2))
        : 0;

    return {
      totalOrcado,
      totalUtilizado,
      totalSaldo,
      pct,
    };
  }, [consolidado, museu]);

  const fmt = (v) =>
    toNumber(v).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

  const getSaldoColor = (saldo, pct) => {
    if (toNumber(saldo) < 0) return 'text-red-600';
    if (toNumber(pct) >= 80) return 'text-orange-500';
    return 'text-green-600';
  };

  const getBarColor = (pct) => {
    const p = toNumber(pct);
    if (p >= 100) return 'bg-red-500';
    if (p >= 80) return 'bg-orange-400';
    if (p >= 60) return 'bg-yellow-400';
    return 'bg-green-500';
  };

  const handleEditStart = (rubrica) => {
    const valorOriginal =
      rubrica?.valor_rubrica !== undefined && rubrica?.valor_rubrica !== null
        ? toNumber(rubrica.valor_rubrica)
        : toNumber(rubrica.totalOrcado) * toNumber(rubrica.divisor || 1);

    setEditingId(rubrica.id);
    setEditValues({
      valor_rubrica: String(valorOriginal),
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleSave = async (rubricaId) => {
    setSaving(true);
    try {
      const novoValor = parseFloat(editValues.valor_rubrica);

      if (isNaN(novoValor) || novoValor < 0) {
        toast.error('Valor inválido');
        setSaving(false);
        return;
      }

      await base44.entities.Rubrica.update(rubricaId, {
        valor_rubrica: novoValor,
      });

      await Promise.all([
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = Array.isArray(query.queryKey)
              ? query.queryKey.join('|').toLowerCase()
              : String(query.queryKey || '').toLowerCase();

            return (
              key.includes('rubrica') ||
              key.includes('museu') ||
              key.includes('budget') ||
              key.includes('purchase') ||
              key.includes('compra')
            );
          },
        }),
        base44.functions.invoke('recalculateAllRubricas', {
          trigger: 'update_valor_rubrica_editor',
          rubricaId,
        }).catch(() => null),
      ]);

      toast.success('Rubrica atualizada');
      setEditingId(null);
      setEditValues({});
    } catch (e) {
      toast.error('Erro ao salvar');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Carregando rubricas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
        <p className="text-red-500 text-sm">
          Erro ao carregar dados: {error.message}
        </p>
      </div>
    );
  }

  if (porCategoria.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm font-medium">
          Nenhuma rubrica encontrada para {museu}
        </p>
        <p className="text-gray-400 text-xs mt-1">
          Use o botão &quot;Configurar vínculos&quot; para associar as rubricas
          cadastradas a este museu automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo do museu */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 font-medium mb-1">Total Previsto</p>
            <p className="text-lg font-bold text-blue-900">
              {fmt(totais.totalOrcado)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-4">
            <p className="text-xs text-amber-600 font-medium mb-1">Total Utilizado</p>
            <p className="text-lg font-bold text-amber-900">
              {fmt(totais.totalUtilizado)}
            </p>
          </CardContent>
        </Card>

        <Card
          className={`border ${
            totais.totalSaldo < 0
              ? 'bg-red-50 border-red-100'
              : 'bg-green-50 border-green-100'
          }`}
        >
          <CardContent className="p-4">
            <p
              className={`text-xs font-medium mb-1 ${
                totais.totalSaldo < 0 ? 'text-red-600' : 'text-green-600'
              }`}
            >
              Saldo Disponível
            </p>
            <p
              className={`text-lg font-bold ${
                totais.totalSaldo < 0 ? 'text-red-700' : 'text-green-700'
              }`}
            >
              {fmt(totais.totalSaldo)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 border-gray-100">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium mb-1">% Utilizado</p>
            <p
              className={`text-lg font-bold ${
                totais.pct >= 80 ? 'text-red-600' : 'text-gray-800'
              }`}
            >
              {totais.pct}%
            </p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
              <div
                className={`h-1.5 rounded-full ${getBarColor(totais.pct)}`}
                style={{ width: `${Math.min(toNumber(totais.pct), 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cards por categoria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {porCategoria.map(({ cat_key, label, rubricas }) => {
          const catOrcado = rubricas.reduce(
            (s, r) => s + toNumber(r.totalOrcado),
            0
          );
          const catUtilizado = rubricas.reduce(
            (s, r) => s + toNumber(r.valorUtilizado),
            0
          );
          const catSaldo = Number((catOrcado - catUtilizado).toFixed(2));

          return (
            <Card key={cat_key} className="border border-gray-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-gray-800">
                    {label}
                  </CardTitle>
                  <div className="flex gap-3 text-[11px] text-gray-500">
                    <span className="text-gray-600">{fmt(catOrcado)}</span>
                    <span
                      className={
                        catSaldo < 0
                          ? 'text-red-600 font-semibold'
                          : 'text-green-600 font-semibold'
                      }
                    >
                      Saldo: {fmt(catSaldo)}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-4">
                <div className="space-y-3">
                  {rubricas.map((rubrica) => {
                    const pct = toNumber(rubrica.pct);
                    const saldo = toNumber(rubrica.saldo);
                    const valorUtilizado = toNumber(rubrica.valorUtilizado);
                    const totalOrcado = toNumber(rubrica.totalOrcado);
                    const divisor = toNumber(rubrica.divisor || 1);
                    const isEditing = editingId === rubrica.id;

                    return (
                      <div
                        key={rubrica.id}
                        className="border border-gray-100 rounded-lg p-3 bg-gray-50"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex-1">
                            <h4 className="font-semibold text-xs text-gray-900 leading-tight">
                              {String(
                                rubrica.rubrica || rubrica.nome || 'Rubrica'
                              ).replace(/ - (MIS|MUMO|MHAB)$/i, '')}
                            </h4>

                            {divisor > 1 && (
                              <span className="text-[10px] text-gray-400">
                                Compartilhada ÷{divisor} museus
                              </span>
                            )}
                          </div>

                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${
                              saldo < 0
                                ? 'border-red-300 text-red-600'
                                : pct >= 80
                                ? 'border-orange-300 text-orange-600'
                                : 'border-green-300 text-green-600'
                            }`}
                          >
                            {pct}%
                          </Badge>
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                          <div
                            className={`h-1.5 rounded-full transition-all ${getBarColor(
                              pct
                            )}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-1 text-xs mb-1">
                          <div>
                            <p className="text-gray-400 text-[10px]">Previsto</p>
                            {isEditing ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={editValues.valor_rubrica || ''}
                                onChange={(e) =>
                                  setEditValues((prev) => ({
                                    ...prev,
                                    valor_rubrica: e.target.value,
                                  }))
                                }
                                className="w-full h-6 text-xs mt-0.5"
                              />
                            ) : (
                              <p className="font-semibold text-gray-800">
                                {fmt(totalOrcado)}
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="text-gray-400 text-[10px]">Utilizado</p>
                            <p className="font-semibold text-amber-600">
                              {fmt(valorUtilizado)}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-400 text-[10px]">Saldo</p>
                            <p className={`font-bold ${getSaldoColor(saldo, pct)}`}>
                              {fmt(saldo)}
                            </p>
                          </div>
                        </div>

                        {canEdit &&
                          (isEditing ? (
                            <div className="flex gap-1 mt-1">
                              <Button
                                onClick={() => handleSave(rubrica.id)}
                                disabled={saving}
                                size="sm"
                                className="flex-1 h-6 text-xs bg-green-600 hover:bg-green-700"
                              >
                                <Save className="w-3 h-3 mr-1" />
                                Salvar
                              </Button>

                              <Button
                                variant="outline"
                                onClick={handleEditCancel}
                                disabled={saving}
                                size="sm"
                                className="h-6 text-xs px-2"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full h-6 text-xs mt-1"
                              onClick={() => handleEditStart(rubrica)}
                            >
                              Editar valor previsto
                            </Button>
                          ))}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}