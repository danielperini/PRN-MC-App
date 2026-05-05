import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Save, X, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIAS_LABEL = {
  equipe: 'Equipe e Coordenação (÷3 museus)',
  comunicacao: 'Comunicação',
  manutencao: 'Manutenção de Rotina',
  educador: 'Educador',
  diarias_educador: 'Diárias',
  lanches: 'Lanches',
  alimentacao_cartao: 'Alimentação (÷3 museus)',
  material: 'Material',
  acoes_educativas: 'Ações Educativas (÷3 museus)',
  som_luz: 'Som e Luz',
  exposicao: 'Exposição',
  noturno: 'Noturno nos Museus',
  publicacoes: 'Publicações',
  consultorias: 'Consultorias',
  despesas_gerais: 'Despesas Gerais',
  outros: 'Outros',
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v) {
  return toNumber(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function getBarColor(pct) {
  const p = toNumber(pct);
  if (p >= 100) return 'bg-red-500';
  if (p >= 80) return 'bg-orange-400';
  if (p >= 60) return 'bg-yellow-400';
  return 'bg-green-500';
}

function normalizeResumoMuseu(raw) {
  return {
    totalOrcado: toNumber(raw?.totalOrcado),
    totalUtilizado: toNumber(raw?.totalUtilizado),
    totalPago: toNumber(raw?.totalPago),
    totalComprometido: toNumber(raw?.totalComprometido),
    totalLancamentos: toNumber(raw?.totalLancamentos),
    totalSaldo: toNumber(raw?.totalSaldo),
    pct: toNumber(raw?.pct),
  };
}

function sortRubricas(items) {
  return [...items].sort((a, b) => {
    const ga = String(a?.grupo || '').toLowerCase();
    const gb = String(b?.grupo || '').toLowerCase();
    if (ga !== gb) return ga.localeCompare(gb, 'pt-BR');

    const na = String(a?.rubrica || '').toLowerCase();
    const nb = String(b?.rubrica || '').toLowerCase();
    return na.localeCompare(nb, 'pt-BR');
  });
}

export default function RubricasMuseuEditor({ museu, canEdit = false, refreshKey = 0 }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);

  const { data: consolidado, isLoading, error } = useQuery({
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
    const cats = consolidado?.por_museu?.[museu];
    if (!cats || typeof cats !== 'object') return [];

    return Object.entries(cats)
      .map(([cat_key, rubricas]) => ({
        cat_key,
        label: CATEGORIAS_LABEL[cat_key] || cat_key,
        rubricas: sortRubricas(Array.isArray(rubricas) ? rubricas : []),
      }))
      .filter((item) => item.rubricas.length > 0)
      .sort((a, b) => {
        const order = Object.keys(CATEGORIAS_LABEL);
        const ai = order.indexOf(a.cat_key);
        const bi = order.indexOf(b.cat_key);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
  }, [consolidado, museu]);

  const totais = useMemo(() => {
    return normalizeResumoMuseu(consolidado?.totais_por_museu?.[museu] || {});
  }, [consolidado, museu]);

  const handleSave = async (rubrica) => {
    setSaving(true);

    const novoValor = parseFloat(editValues.valor_rubrica);

    if (isNaN(novoValor) || novoValor < 0) {
      toast.error('Valor inválido');
      setSaving(false);
      return;
    }

    try {
      await base44.entities.Rubrica.update(rubrica.id, {
        valor_rubrica: novoValor,
      });

      await Promise.all([
        queryClient.invalidateQueries({
          predicate: (q) => {
            const k = Array.isArray(q.queryKey)
              ? q.queryKey.join('|').toLowerCase()
              : String(q.queryKey || '').toLowerCase();

            return (
              k.includes('rubrica') ||
              k.includes('museu') ||
              k.includes('budget') ||
              k.includes('purchase') ||
              k.includes('compra')
            );
          },
        }),
        base44.functions
          .invoke('recalculateAllRubricas', {
            trigger: 'update_valor_rubrica_editor',
            rubricaId: rubrica.id,
          })
          .catch(() => null),
      ]);

      toast.success('Rubrica atualizada');
      setEditingId(null);
      setEditValues({});
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
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
          Use "Configurar vínculos" para associar rubricas a este museu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 font-medium mb-1">Total Previsto</p>
            <p className="text-base font-bold text-blue-900">{fmt(totais.totalOrcado)}</p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-100">
          <CardContent className="p-4">
            <p className="text-xs text-green-700 font-medium mb-1">Pago</p>
            <p className="text-base font-bold text-green-800">{fmt(totais.totalPago)}</p>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-100">
          <CardContent className="p-4">
            <p className="text-xs text-orange-600 font-medium mb-1">Comprometido</p>
            <p className="text-base font-bold text-orange-700">
              {fmt(totais.totalComprometido)}
            </p>
            <p className="text-[10px] text-orange-500 mt-0.5">aprovado p/ pagar</p>
          </CardContent>
        </Card>

        <Card className="bg-sky-50 border-sky-100">
          <CardContent className="p-4">
            <p className="text-xs text-sky-600 font-medium mb-1">Lançamentos</p>
            <p className="text-base font-bold text-sky-800">
              {fmt(totais.totalLancamentos)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-4">
            <p className="text-xs text-amber-600 font-medium mb-1">Total Utilizado</p>
            <p className="text-base font-bold text-amber-900">
              {fmt(totais.totalUtilizado)}
            </p>
            <p className="text-[10px] text-amber-500 mt-0.5">
              pago + comprometido + lançamentos
            </p>
          </CardContent>
        </Card>

        <Card
          className={`border ${
            totais.totalSaldo < 0
              ? 'bg-red-50 border-red-100'
              : 'bg-gray-50 border-gray-100'
          }`}
        >
          <CardContent className="p-4">
            <p
              className={`text-xs font-medium mb-1 ${
                totais.totalSaldo < 0 ? 'text-red-600' : 'text-gray-600'
              }`}
            >
              Saldo Disponível
            </p>
            <p
              className={`text-base font-bold ${
                totais.totalSaldo < 0 ? 'text-red-700' : 'text-gray-800'
              }`}
            >
              {fmt(totais.totalSaldo)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{totais.pct}% utilizado</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {porCategoria.map(({ cat_key, label, rubricas }) => {
          const catOrcado = Number(
            rubricas.reduce((s, r) => s + toNumber(r.totalOrcado), 0).toFixed(2)
          );
          const catUtilizado = Number(
            rubricas.reduce((s, r) => s + toNumber(r.valorUtilizado), 0).toFixed(2)
          );
          const catPago = Number(
            rubricas.reduce((s, r) => s + toNumber(r.valorPago), 0).toFixed(2)
          );
          const catComprometido = Number(
            rubricas.reduce((s, r) => s + toNumber(r.valorComprometido), 0).toFixed(2)
          );
          const catLancamentos = Number(
            rubricas.reduce((s, r) => s + toNumber(r.valorLancamentos), 0).toFixed(2)
          );
          const catSaldo = Number((catOrcado - catUtilizado).toFixed(2));
          const catPct =
            catOrcado > 0
              ? Number(((catUtilizado / catOrcado) * 100).toFixed(1))
              : 0;

          return (
            <Card key={cat_key} className="border border-gray-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-bold text-gray-800">
                    {label}
                  </CardTitle>
                  <div className="flex gap-2 text-[11px]">
                    <span className="text-gray-500">
                      Prev:{' '}
                      <span className="font-medium text-gray-700">{fmt(catOrcado)}</span>
                    </span>
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

                <div className="flex gap-3 text-[10px] text-gray-500 mt-1 flex-wrap">
                  <span>
                    ✅ Pago:{' '}
                    <span className="text-green-700 font-medium">{fmt(catPago)}</span>
                  </span>
                  {catComprometido > 0 && (
                    <span>
                      🔒 Comprometido:{' '}
                      <span className="text-orange-600 font-medium">
                        {fmt(catComprometido)}
                      </span>
                    </span>
                  )}
                  {catLancamentos > 0 && (
                    <span>
                      🧾 Lançamentos:{' '}
                      <span className="text-sky-700 font-medium">
                        {fmt(catLancamentos)}
                      </span>
                    </span>
                  )}
                </div>

                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                  <div
                    className={`h-1.5 rounded-full ${getBarColor(catPct)}`}
                    style={{ width: `${Math.min(catPct, 100)}%` }}
                  />
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {rubricas.map((rubrica) => {
                    const pct = toNumber(rubrica.pct);
                    const saldo =
                      rubrica.saldo === null || rubrica.saldo === undefined
                        ? Number(
                            (
                              toNumber(rubrica.totalOrcado) -
                              toNumber(rubrica.valorUtilizado)
                            ).toFixed(2)
                          )
                        : toNumber(rubrica.saldo);
                    const valorPago = toNumber(rubrica.valorPago);
                    const valorComprometido = toNumber(rubrica.valorComprometido);
                    const valorLancamentos = toNumber(rubrica.valorLancamentos);
                    const totalOrcado = toNumber(rubrica.totalOrcado);
                    const valorRubricaOriginal = toNumber(rubrica.valor_rubrica);
                    const divisor = toNumber(rubrica.divisor || 1);
                    const isEditing = editingId === rubrica.id;
                    const nomeRubrica = String(rubrica.rubrica || 'Rubrica').replace(
                      / - (MIS|MUMO|MHAB)$/i,
                      ''
                    );

                    return (
                      <div
                        key={rubrica.id}
                        className="border border-gray-100 rounded-lg p-3 bg-gray-50 hover:bg-white transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex-1">
                            <h4 className="font-semibold text-xs text-gray-900 leading-tight">
                              {nomeRubrica}
                            </h4>

                            <div className="flex flex-wrap gap-2 mt-1">
                              {rubrica.grupo ? (
                                 <span className="text-xs text-gray-600 font-medium">
                                   {rubrica.grupo}
                                 </span>
                               ) : null}

                              {rubrica.centro_custo ? (
                                <span className="text-[10px] text-gray-400">
                                  CC origem: {rubrica.centro_custo}
                                </span>
                              ) : null}

                              {divisor > 1 ? (
                                <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded px-1">
                                  ÷{divisor} museus • parte deste museu
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
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
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-1 mb-2">
                          <div
                            className={`h-1 rounded-full transition-all ${getBarColor(pct)}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                          <div>
                            <p className="text-gray-400 text-[10px]">Previsto museu</p>
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
                              <p className="font-semibold text-gray-800">{fmt(totalOrcado)}</p>
                            )}
                          </div>

                          <div>
                            <p className="text-gray-400 text-[10px]">✅ Pago</p>
                            <p className="font-semibold text-green-700">{fmt(valorPago)}</p>
                          </div>

                          <div>
                            <p className="text-gray-400 text-[10px]">🔒 Aprovado</p>
                            <p
                              className={`font-semibold ${
                                valorComprometido > 0 ? 'text-orange-600' : 'text-gray-400'
                              }`}
                            >
                              {fmt(valorComprometido)}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-400 text-[10px]">🧾 Lançamentos</p>
                            <p
                              className={`font-semibold ${
                                valorLancamentos > 0 ? 'text-sky-700' : 'text-gray-400'
                              }`}
                            >
                              {fmt(valorLancamentos)}
                            </p>
                          </div>

                          <div>
                            <p className="text-gray-400 text-[10px]">Saldo</p>
                            <p
                              className={`font-bold ${
                                saldo < 0
                                  ? 'text-red-600'
                                  : saldo < totalOrcado * 0.2
                                    ? 'text-orange-500'
                                    : 'text-green-600'
                              }`}
                            >
                              {fmt(saldo)}
                            </p>
                          </div>
                        </div>

                        {!isEditing && (
                          <div className="mt-2 text-[10px] text-gray-400">
                            Valor original da rubrica: {fmt(valorRubricaOriginal)}
                          </div>
                        )}

                        {canEdit &&
                          (isEditing ? (
                            <div className="flex gap-1 mt-2">
                              <Button
                                onClick={() => handleSave(rubrica)}
                                disabled={saving}
                                size="sm"
                                className="flex-1 h-6 text-xs bg-green-600 hover:bg-green-700"
                              >
                                <Save className="w-3 h-3 mr-1" /> Salvar
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditValues({});
                                }}
                                disabled={saving}
                                size="sm"
                                className="h-6 text-xs px-2"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full h-5 text-[10px] mt-1 text-gray-400 hover:text-gray-700"
                              onClick={() => {
                                setEditingId(rubrica.id);
                                setEditValues({
                                  valor_rubrica: String(valorRubricaOriginal),
                                });
                              }}
                            >
                              <Pencil className="w-2.5 h-2.5 mr-1" /> Editar valor original
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