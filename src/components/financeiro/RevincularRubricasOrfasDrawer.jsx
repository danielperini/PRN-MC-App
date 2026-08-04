import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  CheckCircle2,
  X,
  Unlink,
  Power,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import SearchableSelect from '@/components/ui/searchable-select';
import { toast } from 'sonner';

const STATUS_ALVO = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function toNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(p) {
  return (
    toNum(p?.valor_pago) ||
    toNum(p?.valor_aprovado_admin) ||
    toNum(p?.valor_aprovado) ||
    toNum(p?.valor_final) ||
    toNum(p?.valor_solicitado) ||
    toNum(p?.valor_total) ||
    toNum(p?.valor) ||
    toNum(p?.rubrica_debitada_valor) ||
    0
  );
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function tokens(s) {
  return new Set(
    normalize(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
  );
}

function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function shortenId(id) {
  if (!id) return '';
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

async function carregarRubricasTodas() {
  try {
    const result = await base44.functions.invoke('listAllRubricas', {});
    const viaFunction =
      Array.isArray(result?.rubricas) ? result.rubricas : Array.isArray(result) ? result : [];
    if (viaFunction.length > 0) return viaFunction;
  } catch (error) {
    console.warn('listAllRubricas falhou:', error);
  }
  try {
    const diretas = await base44.entities.Rubrica.list('ordem_exibicao', 3000);
    if (Array.isArray(diretas)) return diretas;
  } catch (error) {
    console.warn('Rubrica.list falhou:', error);
  }
  return [];
}

export default function RevincularRubricasOrfasDrawer({ open, onClose, onConcluido }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [rubricas, setRubricas] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [mapeamentos, setMapeamentos] = useState({}); // { [rubrica_id_origem]: rubrica_id_destino }
  const [aplicando, setAplicando] = useState(null); // rubrica_id_origem em aplicação
  const [reativando, setReativando] = useState(null);
  const [recalculando, setRecalculando] = useState(false);
  const [concluidos, setConcluidos] = useState({}); // { [rubrica_id_origem]: { remapeadas, valor, destino } }
  const [reativados, setReativados] = useState({}); // { [rubrica_id]: true }
  const [recalculoResultado, setRecalculoResultado] = useState(null);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const [rubs, privPurchases] = await Promise.all([
        carregarRubricasTodas(),
        base44.entities.PurchaseRequest.list('-created_date', 3000).catch(() => []),
      ]);
      setRubricas(rubs);
      setPurchases(privPurchases);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) carregarDados();
  }, [open, carregarDados]);

  const existencia = useMemo(() => {
    const map = new Map();
    for (const r of rubricas) if (r?.id) map.set(r.id, r);
    return map;
  }, [rubricas]);

  const ativas = useMemo(() => rubricas.filter((r) => r?.ativo !== false), [rubricas]);

  const grupos = useMemo(() => {
    const gruposMap = {};
    for (const p of purchases) {
      if (!p?.rubrica_id) continue;
      const st = String(p.status || '').toUpperCase();
      if (!STATUS_ALVO.has(st)) continue;
      if (p.duplicada_financeira === true || p.incluir_no_somatorio === false) continue;
      const rub = existencia.get(p.rubrica_id);
      const existe = !!rub;
      const inativo = existe && rub?.ativo === false;
      if (existe && !inativo) continue;
      const key = p.rubrica_id;
      if (!gruposMap[key]) {
        gruposMap[key] = {
          rubrica_id: key,
          existe,
          ativo: !inativo,
          rubrica_nome_salvo: p.rubrica_nome || rub?.rubrica || rub?.nome || rub?.item_rubrica || '(sem nome salvo)',
          grupo_salvo: rub?.grupo || '',
          compras: [],
          valor_total: 0,
        };
      }
      gruposMap[key].compras.push({
        id: p.id,
        descricao_item: p.descricao_item,
        fornecedor: p.fornecedor_nome || p.nf_emitente_nome || '',
        valor: getPurchaseValue(p),
        status: p.status,
      });
      gruposMap[key].valor_total =
        Math.round((gruposMap[key].valor_total + getPurchaseValue(p)) * 100) / 100;
    }
    const arr = Object.values(gruposMap);
    // sugestões
    for (const g of arr) {
      let best = null;
      let bestScore = 0;
      const baseText = `${g.grupo_salvo} ${g.rubrica_nome_salvo}`;
      for (const r of ativas) {
        const rText = `${r.grupo || r.categoria || ''} ${r.rubrica || r.nome || ''}`;
        const score = similarity(baseText, rText);
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      g.sugestao_id = best?.id || '';
      g.sugestao_nome = best?.rubrica || best?.nome || '';
      g.sugestao_score = bestScore;
    }
    return arr.sort((a, b) => b.valor_total - a.valor_total);
  }, [purchases, existencia, ativas]);

  const gruposDeletados = useMemo(() => grupos.filter((g) => !g.existe), [grupos]);
  const gruposInativos = useMemo(() => grupos.filter((g) => g.existe && !g.ativo), [grupos]);
  const totalValor = useMemo(
    () => Math.round(grupos.reduce((s, g) => s + g.valor_total, 0) * 100) / 100,
    [grupos]
  );
  const totalCompras = useMemo(() => grupos.reduce((s, g) => s + g.compras.length, 0), [grupos]);

  useEffect(() => {
    if (!open) return;
    const inicial = {};
    for (const g of grupos) {
      if (g.sugestao_id) inicial[g.rubrica_id] = g.sugestao_id;
    }
    setMapeamentos((prev) => ({ ...inicial, ...prev }));
  }, [grupos, open]);

  const itemsAtivas = useMemo(
    () => ativas.map((r) => ({
      id: r.id,
      value: r.id,
      label: `${r.rubrica || r.nome || '(sem nome)'}${r.grupo ? ` — ${r.grupo}` : ''}${r.centro_custo ? ` · ${r.centro_custo}` : ''}${r.valor_rubrica ? ` · ${fmtBRL(r.valor_rubrica)}` : ''}`,
    })),
    [ativas]
  );

  const invalidarQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchases'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['rubricas'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['budget-lines'], refetchType: 'none' }),
    ]);
  }, [queryClient]);

  const refetchPrincipais = useCallback(async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['purchases'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['rubricas'], type: 'active' }),
    ]);
  }, [queryClient]);

  const aplicarGrupo = useCallback(
    async (grupo) => {
      const destino = mapeamentos[grupo.rubrica_id];
      if (!destino) {
        toast.error('Selecione uma rubrica de destino.');
        return;
      }
      const rubDestino = existencia.get(destino);
      if (!rubDestino || rubDestino.ativo === false) {
        toast.error('A rubrica de destino selecionada não está ativa. Escolha outra.');
        return;
      }
      setAplicando(grupo.rubrica_id);
      try {
        const updates = grupo.compras.map((p) => ({
          id: p.id,
          rubrica_id: destino,
          rubrica_nome: rubDestino.rubrica || rubDestino.nome || '',
        }));
        await base44.entities.PurchaseRequest.bulkUpdate(updates);
        try {
          await base44.functions.invoke('updateBudgetOnApproval', { rubricaId: destino });
        } catch (err) {
          console.warn('updateBudgetOnApproval falhou (continuando):', err);
        }
        setConcluidos((prev) => ({
          ...prev,
          [grupo.rubrica_id]: {
            remapeadas: grupo.compras.length,
            valor: grupo.valor_total,
            destino,
            destino_nome: rubDestino.rubrica || rubDestino.nome || '',
          },
        }));
        toast.success(`${grupo.compras.length} compra(s) remapeada(s) para "${rubDestino.rubrica || rubDestino.nome}" e rubrica recalculada.`);
        await invalidarQueries();
        await refetchPrincipais();
      } catch (error) {
        console.error('Erro ao aplicar remapeamento:', error);
        toast.error('Erro ao aplicar remapeamento: ' + (error?.message || 'desconhecido'));
      } finally {
        setAplicando(null);
      }
    },
    [mapeamentos, existencia, invalidarQueries, refetchPrincipais]
  );

  const reativar = useCallback(
    async (grupo) => {
      setReativando(grupo.rubrica_id);
      try {
        await base44.entities.Rubrica.update(grupo.rubrica_id, {
          ativo: true,
          status: 'ATIVA',
          motivo_inativacao: null,
        });
        try {
          await base44.functions.invoke('updateBudgetOnApproval', { rubricaId: grupo.rubrica_id });
        } catch (err) {
          console.warn('updateBudgetOnApproval após reativar falhou:', err);
        }
        setReativados((prev) => ({ ...prev, [grupo.rubrica_id]: true }));
        toast.success(`Rubrica "${grupo.rubrica_nome_salvo}" reativada e ${grupo.compras.length} compra(s) agora debitam corretamente.`);
        await invalidarQueries();
        await refetchPrincipais();
      } catch (error) {
        console.error('Erro ao reativar rubrica:', error);
        toast.error('Erro ao reativar rubrica: ' + (error?.message || 'desconhecido'));
      } finally {
        setReativando(null);
      }
    },
    [invalidarQueries, refetchPrincipais]
  );

  const recalcularTudo = useCallback(async () => {
    setRecalculando(true);
    try {
      const response = await base44.functions.invoke('recalculateAllRubricas', {});
      const result = response?.data || response;
      if (result?.success) {
        setRecalculoResultado(result);
        toast.success(
          `Recálculo concluído. Total oficial: ${fmtBRL(result.totalOficial || 0)}. ${result.atualizadas || 0} rubrica(s) atualizadas, ${result.criadas || 0} criadas.`
        );
      } else {
        throw new Error(result?.error || 'Falha no recálculo.');
      }
      await invalidarQueries();
      await refetchPrincipais();
      if (onConcluido) onConcluido();
    } catch (error) {
      console.error('Erro no recálculo final:', error);
      toast.error('Erro no recálculo: ' + (error?.message || 'desconhecido'));
    } finally {
      setRecalculando(false);
    }
  }, [invalidarQueries, refetchPrincipais, onConcluido]);

  const todosAplicados = useMemo(
    () => grupos.every((g) => !!concluidos[g.rubrica_id] || !!reativados[g.rubrica_id]),
    [grupos, concluidos, reativados]
  );

  const totalValorConcluido = useMemo(
    () =>
      grupos.reduce((s, g) => {
        if (concluidos[g.rubrica_id] || reativados[g.rubrica_id]) return s + g.valor_total;
        return s;
      }, 0),
    [grupos, concluidos, reativados]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative ml-auto h-full w-full max-w-3xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-gradient-to-r from-red-50 to-orange-50 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
              <Unlink className="h-5 w-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                Revínculo de Rubricas Órfãs
              </h2>
              <p className="text-xs text-gray-600">
                Compras aprovadas/pagas apontando para rubricas deletadas ou inativas.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-white/60 hover:text-gray-900 transition"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Summary bar */}
        <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando diagnóstico…
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-700">
                <strong className="text-gray-900">{grupos.length}</strong> grupos órfãos
              </span>
              <span className="text-gray-700">
                <strong className="text-gray-900">{totalCompras}</strong> compras
              </span>
              <span className="text-gray-700">
                <strong className="text-red-700">{fmtBRL(totalValor)}</strong> sem débito
              </span>
              {totalValorConcluido > 0 && (
                <span className="text-green-700">
                  <CheckCircle2 className="inline h-4 w-4 -mt-0.5" /> {fmtBRL(totalValorConcluido)} já resolvido
                </span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!loading && grupos.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-green-200 bg-green-50 p-10 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
              <p className="font-semibold text-green-800">Nenhuma compra órfã detectada</p>
              <p className="mt-1 text-sm text-green-700">
                Todas as compras aprovadas/pagas estão vinculadas a rubricas ativas.
              </p>
            </div>
          )}

          {!loading && gruposInativos.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-start gap-2 text-sm text-amber-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>{gruposInativos.length} grupo(s) com rubrica_INATIVA</strong> — a rubrica ainda existe no banco mas está marcada como <code className="rounded bg-amber-100 px-1">ativo: false</code>. Você pode <strong>reativar</strong> a rubrica (mantém o histórico) ou <strong>remapear</strong> para outra ativa.
                </p>
              </div>
            </div>
          )}

          {!loading &&
            grupos.map((g) => {
              const concluido = concluidos[g.rubrica_id];
              const reativado = reativados[g.rubrica_id];
              const resolvido = concluido || reativado;
              const destino = mapeamentos[g.rubrica_id];
              const cardTone = g.existe ? 'amber' : 'red';
              const borderCls = cardTone === 'amber' ? 'border-amber-300' : 'border-red-300';
              const bgCls = cardTone === 'amber' ? 'bg-amber-50' : 'bg-red-50';
              const txtCls = cardTone === 'amber' ? 'text-amber-800' : 'text-red-700';
              return (
                <div
                  key={g.rubrica_id}
                  className={`rounded-2xl border-2 ${borderCls} ${bgCls} p-4 ${resolvido ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`h-4 w-4 ${txtCls}`} />
                        <h3 className="font-bold text-gray-900 truncate" title={g.rubrica_nome_salvo}>
                          {g.rubrica_nome_salvo}
                        </h3>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-600">
                        ID deletado/inativo: <code className="rounded bg-white px-1 text-gray-700">{shortenId(g.rubrica_id)}</code>
                        {g.grupo_salvo ? ` · Grupo salvo: "${g.grupo_salvo}"` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-lg font-bold ${txtCls}`}>{fmtBRL(g.valor_total)}</p>
                      <p className="text-xs text-gray-600">{g.compras.length} compra(s)</p>
                    </div>
                  </div>

                  {resolvido ? (
                    <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      {reativado
                        ? `Rubrica reativada — ${g.compras.length} compra(s) agora debitam nesta rubrica.`
                        : `${concluido.remapeadas} compra(s) remapeada(s) para "${concluido.destino_nome}".`}
                    </div>
                  ) : (
                    <>
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Rubrica ativa de destino
                          {g.sugestao_score > 0.15 && (
                            <span className="ml-1 text-gray-500">(sugestão automática · {Math.round(g.sugestao_score * 100)}%)</span>
                          )}
                        </label>
                        <SearchableSelect
                          value={destino}
                          onValueChange={(v) => setMapeamentos((prev) => ({ ...prev, [g.rubrica_id]: v }))}
                          items={itemsAtivas}
                          placeholder="Selecione a rubrica ativa de destino"
                          className="bg-white"
                        />
                      </div>

                      {g.existe && (
                        <p className="mt-2 text-xs text-gray-600">
                          Ou, em vez de remapear, você pode <strong>reativar</strong> esta rubrica (a rubrica existe, apenas está inativa).
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-black text-white hover:bg-gray-800"
                          disabled={!destino || aplicando === g.rubrica_id}
                          onClick={() => aplicarGrupo(g)}
                        >
                          {aplicando === g.rubrica_id ? (
                            <>
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Aplicando…
                            </>
                          ) : (
                            <>
                              <Unlink className="mr-1.5 h-4 w-4" /> Aplicar remapeamento ({g.compras.length})
                            </>
                          )}
                        </Button>
                        {g.existe && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-400 text-amber-800 hover:bg-amber-100"
                            disabled={reativando === g.rubrica_id}
                            onClick={() => reativar(g)}
                          >
                            {reativando === g.rubrica_id ? (
                              <>
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Reativando…
                              </>
                            ) : (
                              <>
                                <Power className="mr-1.5 h-4 w-4" /> Reativar rubrica
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

          {!loading && grupos.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <p>
                <Info className="inline h-3.5 w-3.5 -mt-0.5" /> Ao aplicar o remapeamento de cada grupo, a função <code className="rounded bg-white px-1">updateBudgetOnApproval</code> recalcula a rubrica de destino. Ao final, use <strong>Recalcular tudo</strong> para garantir a consistência geral via <code className="rounded bg-white px-1">recalculateAllRubricas</code>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && grupos.length > 0 && (
          <div className="border-t border-gray-200 bg-white px-5 py-3 space-y-3">
            {recalculoResultado && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                <CheckCircle2 className="inline h-3.5 w-3.5 -mt-0.5" /> Recálculo concluído:
                {recalculoResultado.atualizadas ? ` ${recalculoResultado.atualizadas} rubrica(s) atualizadas,` : ''}
                {recalculoResultado.criadas ? ` ${recalculoResultado.criadas} criadas,` : ''}
                {recalculoResultado.inativadas ? ` ${recalculoResultado.inativadas} inativadas,` : ''}
                {` total oficial ${fmtBRL(recalculoResultado.totalOficial || 0)}.`}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-600">
                {todosAplicados
                  ? 'Todos os grupos foram resolvidos. Recálculo final recomendado.'
                  : 'Aplique cada grupo (ou reative), depois recalcule tudo.'}
              </p>
              <Button
                className="gap-2 bg-blue-700 text-white hover:bg-blue-800"
                disabled={recalculando}
                onClick={recalcularTudo}
              >
                {recalculando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Recalculando…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" /> Recalcular tudo
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}