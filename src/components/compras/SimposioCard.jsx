import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const GRUPO_SIMPOSIO = 'Simpósio do Patrimônio Cultural de BH';
const STATUS_CONTABILIZADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function toNumber(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v ?? 0);
}

function valorCompra(compra) {
  return toNumber(compra?.valor_pago)
    || toNumber(compra?.valor_aprovado_admin)
    || toNumber(compra?.valor_aprovado)
    || toNumber(compra?.valor_solicitado)
    || 0;
}

export default function SimposioCard() {
  const { data: rubricas = [], isLoading: loadingRubricas } = useQuery({
    queryKey: ['rubricas-simposio'],
    queryFn: () => base44.entities.Rubrica.filter({ grupo: GRUPO_SIMPOSIO, ativo: true }),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: todasCompras = [], isLoading: loadingCompras } = useQuery({
    queryKey: ['compras-simposio'],
    queryFn: () => base44.entities.PurchaseRequest.filter({
      status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] }
    }, '-created_date', 2000),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  const isLoading = loadingRubricas || loadingCompras;

  const resumo = useMemo(() => {
    const rubricaIds = new Set((rubricas || []).map(r => String(r.id)));
    const rubricaById = new Map((rubricas || []).map(r => [String(r.id), r]));

    const totalPrevisto = (rubricas || []).reduce((acc, r) => acc + toNumber(r.valor_rubrica || r.valor_total), 0);

    // Compras vinculadas por rubrica_id
    const comprasDoSimposio = (todasCompras || []).filter(c => {
      const status = String(c?.status || '').toUpperCase();
      if (!STATUS_CONTABILIZADOS.has(status)) return false;
      const rubId = c?.rubrica_id || c?.budgetline_id;
      return rubId && rubricaIds.has(String(rubId));
    });

    let totalUtilizado = 0;
    let totalPago = 0;
    const porRubrica = new Map();

    comprasDoSimposio.forEach(c => {
      const val = valorCompra(c);
      totalUtilizado += val;
      if (String(c.status || '').toUpperCase() === 'PAGO') totalPago += val;

      const rubId = String(c?.rubrica_id || c?.budgetline_id || '');
      const rubrica = rubricaById.get(rubId);
      const nome = rubrica?.rubrica || rubrica?.nome || c?.rubrica_nome || 'Sem rubrica';
      const previsto = toNumber(rubrica?.valor_rubrica || rubrica?.valor_total);

      const atual = porRubrica.get(rubId) || { nome, previsto, utilizado: 0 };
      atual.utilizado += val;
      porRubrica.set(rubId, atual);
    });

    // Garantir que todas as rubricas apareçam mesmo sem compras
    (rubricas || []).forEach(r => {
      if (!porRubrica.has(String(r.id))) {
        porRubrica.set(String(r.id), {
          nome: r.rubrica || r.nome || '—',
          previsto: toNumber(r.valor_rubrica || r.valor_total),
          utilizado: 0,
        });
      }
    });

    const linhas = Array.from(porRubrica.values())
      .sort((a, b) => b.previsto - a.previsto);

    return {
      totalPrevisto: Number(totalPrevisto.toFixed(2)),
      totalUtilizado: Number(totalUtilizado.toFixed(2)),
      totalPago: Number(totalPago.toFixed(2)),
      saldo: Number((totalPrevisto - totalUtilizado).toFixed(2)),
      pct: totalPrevisto > 0 ? (totalUtilizado / totalPrevisto) * 100 : 0,
      linhas,
    };
  }, [rubricas, todasCompras]);

  const barColor = resumo.pct > 90 ? 'bg-red-500' : resumo.pct > 70 ? 'bg-amber-500' : 'bg-amber-600';

  return (
    <div className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-amber-50 border-b border-amber-100 px-5 py-4">
        <span className="inline-block rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 mb-1">
          5º Aditivo
        </span>
        <h2 className="text-lg font-bold text-gray-900 leading-tight">Simpósio do Patrimônio Cultural de BH</h2>
        <p className="text-xs text-gray-500 mt-0.5">Custos previstos e realizados vinculados às rubricas do Simpósio.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Previsto</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{isLoading ? '...' : fmtBRL(resumo.totalPrevisto)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Utilizado</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{isLoading ? '...' : fmtBRL(resumo.totalUtilizado)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Pago</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{isLoading ? '...' : fmtBRL(resumo.totalPago)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Saldo</p>
          <p className={`text-xl font-bold mt-1 tabular-nums ${resumo.saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {isLoading ? '...' : fmtBRL(resumo.saldo)}
          </p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="px-5 py-3 border-b border-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>Percentual de execução</span>
          <span className="font-bold text-gray-700">{resumo.pct.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(resumo.pct, 100)}%` }} />
        </div>
      </div>

      {/* Lista de rubricas */}
      <div className="px-5 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Rubricas vinculadas ({resumo.linhas.length})
        </p>

        {isLoading ? (
          <p className="text-xs text-gray-400">Carregando...</p>
        ) : (
          <div className="space-y-2">
            {resumo.linhas.map((item, idx) => {
              const pct = item.previsto > 0 ? (item.utilizado / item.previsto) * 100 : 0;
              return (
                <div key={idx} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-xs font-medium text-gray-800 flex-1 min-w-0">{item.nome}</p>
                    <span className="text-xs font-bold tabular-nums shrink-0 text-gray-800">{fmtBRL(item.utilizado)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                    <span>Prev: {fmtBRL(item.previsto)}</span>
                    <span>{pct > 0 ? `${pct.toFixed(0)}%` : '0%'}</span>
                  </div>
                  {item.previsto > 0 && (
                    <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-1 rounded-full ${pct > 90 ? 'bg-red-500' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}