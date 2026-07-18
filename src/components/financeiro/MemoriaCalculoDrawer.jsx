import React, { useMemo, useState } from 'react';
import { X, Calculator, ChevronUp, ChevronDown } from 'lucide-react';
import { rubricaPrevisto, rubricaUtilizado } from '@/services/canonicalMetrics';

const fmtBRL = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtPct = (v) => `${Number(v).toFixed(1)}%`;

export default function MemoriaCalculoDrawer({ open, onClose, itens = [], previsto, utilizado, saldo, percentual, divergencia }) {
  const [sortCol, setSortCol] = useState('previsto');
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    const arr = [...itens];
    arr.sort((a, b) => {
      let va, vb;
      if (sortCol === 'previsto') { va = rubricaPrevisto(a); vb = rubricaPrevisto(b); }
      else if (sortCol === 'utilizado') { va = rubricaUtilizado(a); vb = rubricaUtilizado(b); }
      else if (sortCol === 'saldo') { va = rubricaPrevisto(a) - rubricaUtilizado(a); vb = rubricaPrevisto(b) - rubricaUtilizado(b); }
      else { va = (a[sortCol] || '').toLowerCase(); vb = (b[sortCol] || '').toLowerCase(); return sortDir === 'asc' ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1); }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [itens, sortCol, sortDir]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  function SortIcon({ col }) {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-4xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-black" />
            <h2 className="text-lg font-semibold text-black">Memória de Cálculo Orçamentário</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Subtítulo */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
          <p className="text-xs text-gray-500">
            Rubricas de origem <strong>3º ADITIVO</strong> e <strong>4º ADITIVO</strong> — base oficial do orçamento
          </p>
          {divergencia > 1 && (
            <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-amber-600 font-medium text-xs">
                ⚠️ Divergência de {fmtBRL(divergencia)} detectada em relação ao orçamento oficial de R$ 1.401.719,85 — verifique rubricas
              </span>
            </div>
          )}
        </div>

        {/* Totais rápidos */}
        <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-gray-400">Previsto</p>
            <p className="text-sm font-bold text-black">{fmtBRL(previsto)}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-gray-400">Utilizado</p>
            <p className="text-sm font-bold text-gray-700">{fmtBRL(utilizado)} <span className="text-gray-400 font-normal">({fmtPct(percentual)})</span></p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-gray-400">Saldo</p>
            <p className={`text-sm font-bold ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(saldo)}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-xs text-gray-400">Rubricas</p>
            <p className="text-sm font-bold text-black">{itens.length}</p>
          </div>
        </div>

        {/* Tabela scrollável */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-700 cursor-pointer hover:text-black" onClick={() => toggleSort('rubrica')}>
                  Rubrica <SortIcon col="rubrica" />
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700 cursor-pointer hover:text-black" onClick={() => toggleSort('grupo')}>
                  Grupo <SortIcon col="grupo" />
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Natureza</th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Centro Custo</th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-700 cursor-pointer hover:text-black" onClick={() => toggleSort('previsto')}>
                  Previsto <SortIcon col="previsto" />
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-700 cursor-pointer hover:text-black" onClick={() => toggleSort('utilizado')}>
                  Utilizado <SortIcon col="utilizado" />
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-700 cursor-pointer hover:text-black" onClick={() => toggleSort('saldo')}>
                  Saldo <SortIcon col="saldo" />
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Origem</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const prev = rubricaPrevisto(r);
                const util = rubricaUtilizado(r);
                const sal = prev - util;
                return (
                  <tr key={r.id || i} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${sal < 0 ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-800 max-w-[200px]">
                      <span className="block truncate">{r.rubrica || r.nome || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-600 max-w-[140px]">
                      <span className="block truncate">{r.grupo || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{r.natureza_despesa || r.nome_natureza || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[120px]">
                      <span className="block truncate">{r.centro_custo || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-black">{fmtBRL(prev)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{fmtBRL(util)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${sal < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtBRL(sal)}</td>
                    <td className="px-3 py-2 text-gray-400">{r.origem_recurso || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé com totais em negrito */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          <table className="w-full text-xs">
            <tfoot>
              <tr>
                <td className="px-4 py-1 font-bold text-black" colSpan={4}>
                  TOTAL ({itens.length} rubricas)
                </td>
                <td className="px-3 py-1 text-right font-bold text-black">{fmtBRL(previsto)}</td>
                <td className="px-3 py-1 text-right font-bold text-gray-700">{fmtBRL(utilizado)}</td>
                <td className={`px-3 py-1 text-right font-bold ${saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtBRL(saldo)}</td>
                <td className="px-3 py-1" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}