import React, { useMemo } from 'react';

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

const TOTAL_PREVISTO_3_ADITIVO = 1320000;
const TOTAL_PREVISTO_4_ADITIVO = 81719.85;

function AditivoBlock({ titulo, badge, badgeColor, totalPrevisto, totalUtilizado, saldo, rubricasList }) {
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

export default function TotaisAditivoCards({ rubricas = [] }) {
  const { totais3, rubricasPampulha, totais4 } = useMemo(() => {
    const ativas = rubricas.filter((r) => r?.ativo !== false);

    // 3º Aditivo — rubricas com origem contendo '3' e centro_custo != 'Noturno Pampulha'
    const rubricasAditivo3 = ativas.filter(
      (r) =>
        String(r?.origem_recurso || '').includes('3') &&
        String(r?.centro_custo || '') !== 'Noturno Pampulha'
    );
    const previsto3Real = rubricasAditivo3.reduce((acc, r) => acc + toNumber(r.valor_rubrica || r.valor_total), 0);
    const totalPrevisto3 = previsto3Real > 0 ? previsto3Real : TOTAL_PREVISTO_3_ADITIVO;
    const utilizado3 = rubricasAditivo3.reduce((acc, r) => acc + toNumber(r.valor_utilizado), 0);
    const saldo3 = totalPrevisto3 - utilizado3;

    // 4º Aditivo — rubricas com origem contendo '4' OU centro_custo = 'Noturno Pampulha'
    const pampulha = ativas.filter(
      (r) =>
        String(r?.origem_recurso || '').includes('4') ||
        String(r?.centro_custo || '') === 'Noturno Pampulha'
    );
    const previsto4Real = pampulha.reduce((acc, r) => acc + toNumber(r.valor_rubrica || r.valor_total), 0);
    const totalPrevisto4 = previsto4Real > 0 ? previsto4Real : TOTAL_PREVISTO_4_ADITIVO;
    const utilizado4 = pampulha.reduce((acc, r) => acc + toNumber(r.valor_utilizado), 0);
    const saldo4 = totalPrevisto4 - utilizado4;

    return {
      totais3: { totalPrevisto: totalPrevisto3, totalUtilizado: utilizado3, saldo: saldo3 },
      rubricasPampulha: pampulha,
      totais4: { totalPrevisto: totalPrevisto4, totalUtilizado: utilizado4, saldo: saldo4 },
    };
  }, [rubricas]);

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <AditivoBlock
        titulo="3º Termo Aditivo — Noturno Centro"
        badge="3º Aditivo"
        badgeColor="bg-blue-100 text-blue-700"
        totalPrevisto={totais3.totalPrevisto}
        totalUtilizado={totais3.totalUtilizado}
        saldo={totais3.saldo}
      />
      <AditivoBlock
        titulo="4º Termo Aditivo — Noturno Pampulha"
        badge="4º Aditivo"
        badgeColor="bg-violet-100 text-violet-700"
        totalPrevisto={totais4.totalPrevisto}
        totalUtilizado={totais4.totalUtilizado}
        saldo={totais4.saldo}
        rubricasList={rubricasPampulha}
      />
    </div>
  );
}