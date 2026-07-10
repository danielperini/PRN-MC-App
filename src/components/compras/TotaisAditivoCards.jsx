import React, { useMemo } from 'react';
import { calculateAditivoTotals, normalizeCentroCusto } from '@/utils/finance/financeiroUtils';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v ?? 0);
}

// Valores contratuais oficiais (não derivar do banco)
const TOTAL_PREVISTO_3_ADITIVO = 1320000;
const TOTAL_PREVISTO_4_NOTURNO = 1320000; // 3º Aditivo Noturno 2026 (mesmo contrato base)
const TOTAL_PREVISTO_4_PAMPULHA = 81719.85;

function AditivoBlock({ titulo, badge, badgeColor, totalPrevisto, totalUtilizado, saldo, rubricasList, qtdNFs, qtdDuplicatas }) {
  const pct = totalPrevisto > 0 ? ((totalUtilizado / totalPrevisto) * 100) : 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-black';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeColor}`}>
          {badge}
        </span>
        <p className="text-sm font-semibold text-gray-800">{titulo}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] text-gray-500 font-medium">Total Previsto</p>
          <p className="text-base font-bold text-gray-900 tabular-nums">{fmtBRL(totalPrevisto)}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 font-medium">Utilizado</p>
          <p className="text-base font-bold text-gray-900 tabular-nums">{fmtBRL(totalUtilizado)}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 font-medium">Saldo</p>
          <p className={`text-base font-bold tabular-nums ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {fmtBRL(saldo)}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>Execução</span>
          <span className="font-semibold text-gray-700">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-gray-400">
        <span>{qtdNFs} NF(s) ativas</span>
        {qtdDuplicatas > 0 && (
          <span className="text-amber-600 font-medium">{qtdDuplicatas} duplicata(s) ignorada(s)</span>
        )}
      </div>

      {rubricasList && rubricasList.length > 0 && (
        <details className="mt-1">
          <summary className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            {rubricasList.length} rubrica{rubricasList.length !== 1 ? 's' : ''} vinculada{rubricasList.length !== 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-1.5 pl-1">
            {rubricasList.map((r) => {
              const prev = toNumber(r.valor_rubrica || r.valor_total);
              const util = toNumber(r.valor_utilizado);
              const saldoR = prev - util;
              return (
                <li key={r.id} className="text-[11px] text-gray-600 flex justify-between gap-2 border-b border-gray-50 pb-1">
                  <span className="flex-1 truncate">{r.rubrica || r.nome}</span>
                  <span className={`tabular-nums shrink-0 ${saldoR < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                    {fmtBRL(prev)}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function TotaisAditivoCards({ rubricas = [], compras = [] }) {
  const { totais3, totaisN2026, totais4, rubricasNoturno, rubricasPampulha, duplicadas } = useMemo(() => {
    const ativas = rubricas.filter((r) => r?.ativo !== false);

    // Rubricas por grupo
    const rubricasNoturno = ativas.filter((r) => String(r?.centro_custo || '') === 'Noturno 2026');
    const rubricasPampulha = ativas.filter((r) => String(r?.centro_custo || '') === 'Noturno Pampulha');

    // Calcular totais usando o módulo centralizado (inclui APROVADO_COORD)
    const aditivoTotals = calculateAditivoTotals(compras);

    return {
      totais3: {
        totalPrevisto: TOTAL_PREVISTO_3_ADITIVO,
        totalUtilizado: aditivoTotals.terceiro_aditivo.utilizado,
        saldo: TOTAL_PREVISTO_3_ADITIVO - aditivoTotals.terceiro_aditivo.utilizado,
        qtdNFs: aditivoTotals.terceiro_aditivo.quantidade_nfs,
      },
      totaisN2026: {
        totalPrevisto: TOTAL_PREVISTO_4_NOTURNO,
        totalUtilizado: aditivoTotals.noturno_2026.utilizado,
        saldo: TOTAL_PREVISTO_4_NOTURNO - aditivoTotals.noturno_2026.utilizado,
        qtdNFs: aditivoTotals.noturno_2026.quantidade_nfs,
      },
      totais4: {
        totalPrevisto: TOTAL_PREVISTO_4_PAMPULHA,
        totalUtilizado: aditivoTotals.noturno_pampulha.utilizado,
        saldo: TOTAL_PREVISTO_4_PAMPULHA - aditivoTotals.noturno_pampulha.utilizado,
        qtdNFs: aditivoTotals.noturno_pampulha.quantidade_nfs,
      },
      rubricasNoturno,
      rubricasPampulha,
      duplicadas: aditivoTotals.duplicadas_ignoradas,
    };
  }, [rubricas, compras]);

  return (
    <div className="mb-6 space-y-4">
      {duplicadas.quantidade > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span className="font-semibold">⚠</span>
          {duplicadas.quantidade} NF(s) duplicada(s) detectada(s) — ignoradas no somatório ({fmtBRL(duplicadas.total_valor)})
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AditivoBlock
          titulo="3º Termo Aditivo — Museus (Geral)"
          badge="3º Aditivo"
          badgeColor="bg-blue-100 text-blue-700"
          totalPrevisto={totais3.totalPrevisto}
          totalUtilizado={totais3.totalUtilizado}
          saldo={totais3.saldo}
          rubricasList={[]}
          qtdNFs={totais3.qtdNFs}
          qtdDuplicatas={duplicadas.quantidade}
        />
        <AditivoBlock
          titulo="4º Aditivo — Noturno 2026 (Centro)"
          badge="Noturno 2026"
          badgeColor="bg-indigo-100 text-indigo-700"
          totalPrevisto={totaisN2026.totalPrevisto}
          totalUtilizado={totaisN2026.totalUtilizado}
          saldo={totaisN2026.saldo}
          rubricasList={rubricasNoturno}
          qtdNFs={totaisN2026.qtdNFs}
          qtdDuplicatas={0}
        />
        <AditivoBlock
          titulo="4º Aditivo — Noturno Pampulha"
          badge="Noturno Pampulha"
          badgeColor="bg-violet-100 text-violet-700"
          totalPrevisto={totais4.totalPrevisto}
          totalUtilizado={totais4.totalUtilizado}
          saldo={totais4.saldo}
          rubricasList={rubricasPampulha}
          qtdNFs={totais4.qtdNFs}
          qtdDuplicatas={0}
        />
      </div>
    </div>
  );
}