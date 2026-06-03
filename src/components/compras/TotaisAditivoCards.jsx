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

export default function TotaisAditivoCards({ rubricas = [] }) {
  const totais = useMemo(() => {
    // Soma apenas rubricas ativas do 3º Aditivo
    const rubricasAditivo3 = rubricas.filter(
      (r) => r?.ativo !== false && String(r?.origem_recurso || '').includes('3')
    );
    const totalUtilizado = rubricasAditivo3.reduce(
      (acc, r) => acc + toNumber(r.valor_utilizado),
      0
    );
    const saldo = TOTAL_PREVISTO_3_ADITIVO - totalUtilizado;
    return { totalPrevisto: TOTAL_PREVISTO_3_ADITIVO, totalUtilizado, saldo };
  }, [rubricas]);

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-medium text-gray-500">Total Previsto</p>
        <p className="mt-1 break-words text-lg font-bold leading-tight text-gray-900 tabular-nums">
          {fmtBRL(totais.totalPrevisto)}
        </p>
        <p className="text-xs text-gray-400">Valor total do 3º Aditivo</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-medium text-gray-500">Total Utilizado</p>
        <p className="mt-1 break-words text-lg font-bold leading-tight text-gray-900 tabular-nums">
          {fmtBRL(totais.totalUtilizado)}
        </p>
        <p className="text-xs text-gray-400">Aprovado coord. + admin + pago</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-medium text-gray-500">Saldo Disponível</p>
        <p className={`mt-1 break-words text-lg font-bold leading-tight tabular-nums ${totais.saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
          {fmtBRL(totais.saldo)}
        </p>
      </div>
    </div>
  );
}