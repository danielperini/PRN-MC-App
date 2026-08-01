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

// Valores contratuais oficiais — referência para o banner
const CONTRATO_3_ADITIVO = 1320000;
const CONTRATO_4_ADITIVO = 81719.85;
const CONTRATO_5_ADITIVO = 15800;
const CONTRATO_TOTAL = CONTRATO_3_ADITIVO + CONTRATO_4_ADITIVO + CONTRATO_5_ADITIVO;

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
  const { totais3, totais4, totais5, rubricas4, rubricas5, duplicadas, datasInvalidas } = useMemo(() => {
    const ativas = rubricas.filter((r) => r?.ativo !== false);

    const rubricas4 = ativas.filter((r) => {
      const origem = (r.origem_recurso || '').trim();
      return origem === '4º ADITIVO' || origem === '4º Aditivo';
    });
    const rubricas3 = ativas.filter((r) => {
      const origem = (r.origem_recurso || '').trim();
      return origem === '3º ADITIVO' || origem === '3º Aditivo';
    });
    const rubricas5 = ativas.filter((r) => {
      const origem = (r.origem_recurso || '').trim();
      return origem === '5º ADITIVO' || origem === '5º Aditivo';
    });

    // Previsto e utilizado direto das rubricas (mesma fonte do Dashboard)
    const previsto3 = rubricas3.reduce((s, r) => s + toNumber(r.valor_rubrica || r.valor_total), 0);
    const utilizado3 = rubricas3.reduce((s, r) => s + toNumber(r.valor_utilizado || r.utilizado), 0);
    const previsto4 = rubricas4.reduce((s, r) => s + toNumber(r.valor_rubrica || r.valor_total), 0);
    const utilizado4 = rubricas4.reduce((s, r) => s + toNumber(r.valor_utilizado || r.utilizado), 0);
    const utilizado5 = rubricas5.reduce((s, r) => s + toNumber(r.valor_utilizado || r.utilizado), 0);

    const auditoria = auditAditivoTotals(compras, ativas);

    return {
      totais3: {
        totalPrevisto: previsto3,
        totalUtilizado: utilizado3,
        saldo: previsto3 - utilizado3,
        qtdNFs: auditoria.terceiro_aditivo.quantidade_nfs,
      },
      totais4: {
        totalPrevisto: previsto4,
        totalUtilizado: utilizado4,
        saldo: previsto4 - utilizado4,
        qtdNFs: auditoria.noturno_2026.quantidade_nfs,
      },
      totais5: {
        totalUtilizado: utilizado5,
        saldo: CONTRATO_5_ADITIVO - utilizado5,
        qtdNFs: rubricas5.length,
      },
      rubricas4,
      rubricas5,
      duplicadas: auditoria.duplicadas_ignoradas,
      datasInvalidas: auditoria.datas_invalidas_ignoradas,
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

      {datasInvalidas.quantidade > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-xs text-orange-800 flex items-center gap-2">
          <span className="font-semibold">⚠</span>
          {datasInvalidas.quantidade} documento(s) com data fiscal anterior a 2026 foram retirados provisoriamente do somatório para revisão ({fmtBRL(datasInvalidas.total_valor)}).
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-700">
        <span className="font-semibold">Base contratual oficial:</span> {fmtBRL(CONTRATO_TOTAL)}
        <span className="ml-2 text-gray-500">(3º aditivo {fmtBRL(CONTRATO_3_ADITIVO)} + 4º aditivo {fmtBRL(CONTRATO_4_ADITIVO)} + 5º aditivo {fmtBRL(CONTRATO_5_ADITIVO)})</span>
        <span className="ml-3 font-semibold">Base rubricas cadastradas:</span> {fmtBRL(totais3.totalPrevisto + totais4.totalPrevisto)}
        <span className="block mt-1 text-gray-500">O previsto exibido nos cards é a soma real das rubricas cadastradas. O 4º Aditivo apura o Noturno Pampulha. Rubricas "Noturno 2026" pertencem ao 3º Aditivo.</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AditivoBlock
          titulo="3º Termo Aditivo — Museus Centro"
          badge="3º Aditivo"
          badgeColor="bg-blue-100 text-blue-700"
          totalPrevisto={CONTRATO_3_ADITIVO}
          totalUtilizado={totais3.totalUtilizado}
          saldo={CONTRATO_3_ADITIVO - totais3.totalUtilizado}
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
        <AditivoBlock
          titulo="5º Aditivo — 3º Simpósio Patrimônio Cultural BH"
          badge="5º Aditivo"
          badgeColor="bg-emerald-100 text-emerald-700"
          totalPrevisto={CONTRATO_5_ADITIVO}
          totalUtilizado={totais5.totalUtilizado}
          saldo={totais5.saldo}
          rubricasList={rubricas5}
          qtdNFs={totais5.qtdNFs}
          qtdDuplicatas={0}
        />
      </div>
    </div>
  );
}