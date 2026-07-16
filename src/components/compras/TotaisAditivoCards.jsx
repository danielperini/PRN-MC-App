import React, { useMemo } from 'react';
import { auditAditivoTotals, normalizeCentroCusto } from '@/utils/finance/financeiroUtils';

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
const TOTAL_PREVISTO_CONSOLIDADO = TOTAL_PREVISTO_3_ADITIVO + TOTAL_PREVISTO_4_ADITIVO;

function AditivoBlock({ titulo, badge, badgeColor, totalPrevisto, totalUtilizado, saldo, rubricasList, qtdNFs, qtdDuplicatas }) {
  const pct = totalPrevisto > 0 ? ((totalUtilizado / totalPrevisto) * 100) : 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-black';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 min-w-0">
      <div className="flex items-start gap-2 flex-wrap">
        <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeColor}`}>
          {badge}
        </span>
        <p className="text-sm font-semibold text-gray-800 leading-tight">{titulo}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500 font-medium">Total Previsto</p>
          <p className="text-[13px] font-bold text-gray-900 tabular-nums truncate">{fmtBRL(totalPrevisto)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500 font-medium">Utilizado</p>
          <p className="text-[13px] font-bold text-gray-900 tabular-nums truncate">{fmtBRL(totalUtilizado)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500 font-medium">Saldo</p>
          <p className={`text-[13px] font-bold tabular-nums truncate ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
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
          <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
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
              const prev = toNumber(r.valor_rubrica || r.valor_total || r.valor_previsto);
              const util = toNumber(r.valor_utilizado || r.utilizado);
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
  const { totais3, totais4, rubricas4, duplicadas, datasInvalidas, divergencias } = useMemo(() => {
    const ativas = rubricas.filter((r) => r?.ativo !== false);
    const rubricas4 = ativas.filter((r) => normalizeCentroCusto(r).aditivo === '4º Aditivo Noturno 2026');
    const auditoria = auditAditivoTotals(compras, ativas);
    const utilizado3 = toNumber(auditoria?.terceiro_aditivo?.utilizado);
    const utilizado4 = toNumber(auditoria?.noturno_2026?.utilizado);

    return {
      totais3: {
        totalPrevisto: TOTAL_PREVISTO_3_ADITIVO,
        totalUtilizado: utilizado3,
        saldo: TOTAL_PREVISTO_3_ADITIVO - utilizado3,
        qtdNFs: auditoria.terceiro_aditivo.quantidade_nfs,
      },
      totais4: {
        totalPrevisto: TOTAL_PREVISTO_4_ADITIVO,
        totalUtilizado: utilizado4,
        saldo: TOTAL_PREVISTO_4_ADITIVO - utilizado4,
        qtdNFs: auditoria.noturno_2026.quantidade_nfs,
      },
      rubricas4,
      duplicadas: auditoria.duplicadas_ignoradas,
      datasInvalidas: auditoria.datas_invalidas_ignoradas,
      divergencias: auditoria.divergencias,
    };
  }, [rubricas, compras]);

  const divergencia3 = Math.abs(toNumber(divergencias?.terceiro_aditivo));
  const divergencia4 = Math.abs(toNumber(divergencias?.quarto_aditivo));

  return (
    <div className="mb-6 space-y-4">
      {duplicadas.quantidade > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span className="font-semibold">⚠</span>
          {duplicadas.quantidade} NF(s) duplicada(s) detectada(s) — ignoradas no somatório ({fmtBRL(duplicadas.total_valor)})
        </div>
      )}

      {datasInvalidas.quantidade > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-xs text-orange-800 flex items-center gap-2">
          <span className="font-semibold">⚠</span>
          {datasInvalidas.quantidade} documento(s) com data fiscal anterior a 2026 foram retirados provisoriamente do somatório para revisão ({fmtBRL(datasInvalidas.total_valor)}).
        </div>
      )}

      {(divergencia3 > 0.01 || divergencia4 > 0.01) && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
          Auditoria ativa: os cards usam solicitações aprovadas deduplicadas. Divergências entre rubricas e solicitações — 3º Aditivo: {fmtBRL(divergencias.terceiro_aditivo)}; 4º Aditivo: {fmtBRL(divergencias.quarto_aditivo)}.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-700">
        <span className="font-semibold">Previsto consolidado oficial:</span> {fmtBRL(TOTAL_PREVISTO_CONSOLIDADO)}
        <span className="ml-2 text-gray-500">(3º aditivo {fmtBRL(TOTAL_PREVISTO_3_ADITIVO)} + 4º aditivo {fmtBRL(TOTAL_PREVISTO_4_ADITIVO)})</span>
        <span className="block mt-1 text-gray-500">O 4º Aditivo é apurado pelas rubricas e solicitações do Noturno Pampulha. As rubricas “Noturno 2026” permanecem no 3º Aditivo, salvo indicação explícita em contrário.</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AditivoBlock
          titulo="3º Termo Aditivo — Museus Centro"
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
          titulo="4º Aditivo — Noturno nos Museus 2026 / Pampulha"
          badge="4º Aditivo"
          badgeColor="bg-indigo-100 text-indigo-700"
          totalPrevisto={totais4.totalPrevisto}
          totalUtilizado={totais4.totalUtilizado}
          saldo={totais4.saldo}
          rubricasList={rubricas4}
          qtdNFs={totais4.qtdNFs}
          qtdDuplicatas={0}
        />
      </div>
    </div>
  );
}
