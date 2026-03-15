import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Save, X, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { toast } from 'sonner';

export default function RubricasMuseuEditor({ museu, canEdit = false }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 300),
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: () => base44.entities.RubricaMuseuConfig.list(),
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos-rubricas'],
    queryFn: () => base44.entities.LancamentoRubrica.list('data_lancamento', 1000),
  });

  // Calcular saldo real por rubrica para este museu
  const rubricasDoMuseu = React.useMemo(() => {
    const configsMuseu = configs.filter(c => c.museu === museu);
    const rubricaIdsNoMuseu = new Set(configsMuseu.map(c => c.rubrica_id));

    return rubricas
      .filter(r => rubricaIdsNoMuseu.has(r.id) && r.ativo !== false)
      .map(r => {
        const config = configsMuseu.find(c => c.rubrica_id === r.id);
        const divisor = config?.divisor || 1;

        const totalOrcado = (r.valor_rubrica || 0) / divisor;

        // Lançamentos desta rubrica
        const lansRubrica = lancamentos.filter(l => l.rubrica_id === r.id);
        const totalLancado = lansRubrica.reduce((sum, l) => sum + (l.valor || 0), 0);

        // Saldo: usa campos da entidade se disponíveis, senão calcula
        const valorUtilizado = r.valor_utilizado != null ? r.valor_utilizado / divisor : totalLancado / divisor;
        const saldo = totalOrcado - valorUtilizado;
        const pct = totalOrcado > 0 ? ((valorUtilizado / totalOrcado) * 100) : 0;

        return {
          id: r.id,
          rubrica: r.rubrica,
          grupo: r.grupo,
          categoria_key: config?.categoria_key,
          totalOrcado,
          valorUtilizado,
          saldo,
          pct: parseFloat(pct.toFixed(1)),
          divisor,
        };
      });
  }, [rubricas, configs, lancamentos, museu]);

  // Agrupar por grupo
  const porGrupo = React.useMemo(() => {
    const grupos = {};
    rubricasDoMuseu.forEach(r => {
      const g = r.grupo || 'Outros';
      if (!grupos[g]) grupos[g] = [];
      grupos[g].push(r);
    });
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
  }, [rubricasDoMuseu]);

  // Totais globais do museu
  const totais = React.useMemo(() => {
    const totalOrcado = rubricasDoMuseu.reduce((s, r) => s + r.totalOrcado, 0);
    const totalUtilizado = rubricasDoMuseu.reduce((s, r) => s + r.valorUtilizado, 0);
    const totalSaldo = totalOrcado - totalUtilizado;
    const pct = totalOrcado > 0 ? (totalUtilizado / totalOrcado) * 100 : 0;
    return { totalOrcado, totalUtilizado, totalSaldo, pct: parseFloat(pct.toFixed(1)) };
  }, [rubricasDoMuseu]);

  const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const getSaldoColor = (saldo, pct) => {
    if (saldo < 0) return 'text-red-600';
    if (pct >= 80) return 'text-orange-500';
    return 'text-green-600';
  };

  const getBarColor = (pct) => {
    if (pct >= 100) return 'bg-red-500';
    if (pct >= 80) return 'bg-orange-400';
    if (pct >= 60) return 'bg-yellow-400';
    return 'bg-green-500';
  };

  const handleEditStart = (rubrica) => {
    setEditingId(rubrica.id);
    setEditValues({ valor_rubrica: (rubrica.totalOrcado * (rubrica.divisor || 1)).toString() });
  };

  const handleEditCancel = () => { setEditingId(null); setEditValues({}); };

  const handleSave = async (rubricaId) => {
    setSaving(true);
    try {
      const novoValor = parseFloat(editValues.valor_rubrica);
      if (isNaN(novoValor) || novoValor < 0) { toast.error('Valor inválido'); return; }
      await base44.entities.Rubrica.update(rubricaId, { valor_rubrica: novoValor });
      queryClient.invalidateQueries({ queryKey: ['rubricas-all'] });
      toast.success('Rubrica atualizada');
      setEditingId(null);
    } catch (e) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (rubricasDoMuseu.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Nenhuma rubrica configurada para {museu}</p>
        <p className="text-gray-400 text-xs mt-1">Use "Gerenciar Rubricas" para vincular rubricas a este museu.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo do museu */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 font-medium mb-1">Total Orçado</p>
            <p className="text-lg font-bold text-blue-900">{fmt(totais.totalOrcado)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-4">
            <p className="text-xs text-amber-600 font-medium mb-1">Total Utilizado</p>
            <p className="text-lg font-bold text-amber-900">{fmt(totais.totalUtilizado)}</p>
          </CardContent>
        </Card>
        <Card className={`border ${totais.totalSaldo < 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
          <CardContent className="p-4">
            <p className={`text-xs font-medium mb-1 ${totais.totalSaldo < 0 ? 'text-red-600' : 'text-green-600'}`}>Saldo Disponível</p>
            <p className={`text-lg font-bold ${totais.totalSaldo < 0 ? 'text-red-700' : 'text-green-700'}`}>{fmt(totais.totalSaldo)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-100">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium mb-1">% Utilizado</p>
            <p className={`text-lg font-bold ${totais.pct >= 80 ? 'text-red-600' : 'text-gray-800'}`}>{totais.pct}%</p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
              <div
                className={`h-1.5 rounded-full ${getBarColor(totais.pct)}`}
                style={{ width: `${Math.min(totais.pct, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rubricas por grupo */}
      {porGrupo.map(([grupo, rubricasGrupo]) => {
        const totalGrupoOrcado = rubricasGrupo.reduce((s, r) => s + r.totalOrcado, 0);
        const totalGrupoUtilizado = rubricasGrupo.reduce((s, r) => s + r.valorUtilizado, 0);
        const totalGrupoSaldo = totalGrupoOrcado - totalGrupoUtilizado;

        return (
          <Card key={grupo} className="border border-gray-200">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-gray-800">{grupo}</CardTitle>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>Orçado: <strong className="text-gray-700">{fmt(totalGrupoOrcado)}</strong></span>
                <span>Utilizado: <strong className="text-amber-600">{fmt(totalGrupoUtilizado)}</strong></span>
                <span>Saldo: <strong className={totalGrupoSaldo < 0 ? 'text-red-600' : 'text-green-600'}>{fmt(totalGrupoSaldo)}</strong></span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-3">
                {rubricasGrupo.map((rubrica) => {
                  const isEditing = editingId === rubrica.id;
                  return (
                    <div key={rubrica.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-xs text-gray-900">{rubrica.rubrica}</h4>
                          {rubrica.divisor > 1 && (
                            <span className="text-[10px] text-gray-400">Compartilhada ÷{rubrica.divisor}</span>
                          )}
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${rubrica.saldo < 0 ? 'border-red-300 text-red-600' : rubrica.pct >= 80 ? 'border-orange-300 text-orange-600' : 'border-green-300 text-green-600'}`}>
                          {rubrica.pct}%
                        </Badge>
                      </div>

                      {/* Barra de progresso */}
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                        <div
                          className={`h-1.5 rounded-full transition-all ${getBarColor(rubrica.pct)}`}
                          style={{ width: `${Math.min(rubrica.pct, 100)}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-1 text-xs mb-2">
                        <div>
                          <p className="text-gray-400 text-[10px]">Orçado</p>
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={editValues.valor_rubrica}
                              onChange={(e) => setEditValues(prev => ({ ...prev, valor_rubrica: e.target.value }))}
                              className="w-full h-6 text-xs mt-0.5"
                            />
                          ) : (
                            <p className="font-semibold text-gray-800">{fmt(rubrica.totalOrcado)}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-gray-400 text-[10px]">Utilizado</p>
                          <p className="font-semibold text-amber-600">{fmt(rubrica.valorUtilizado)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-[10px]">Saldo</p>
                          <p className={`font-bold ${getSaldoColor(rubrica.saldo, rubrica.pct)}`}>{fmt(rubrica.saldo)}</p>
                        </div>
                      </div>

                      {canEdit && (
                        isEditing ? (
                          <div className="flex gap-1 mt-1">
                            <Button onClick={() => handleSave(rubrica.id)} disabled={saving} size="sm" className="flex-1 h-6 text-xs bg-green-600 hover:bg-green-700">
                              <Save className="w-3 h-3 mr-1" />Salvar
                            </Button>
                            <Button variant="outline" onClick={handleEditCancel} disabled={saving} size="sm" className="h-6 text-xs px-2">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" className="w-full h-6 text-xs mt-1" onClick={() => handleEditStart(rubrica)}>
                            Editar valor orçado
                          </Button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}