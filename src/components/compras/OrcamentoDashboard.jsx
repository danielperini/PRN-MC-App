import React from 'react';
import { TrendingDown, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';

export default function OrcamentoDashboard({ budgetLines, purchases, isCoordenador }) {
  const totalInicial = budgetLines.reduce((acc, l) => acc + (l.saldo_inicial || 0), 0);
  const totalComprometido = budgetLines.reduce((acc, l) => acc + (l.saldo_comprometido || 0), 0);
  const totalDisponivel = totalInicial - totalComprometido;
  const pctUsado = totalInicial > 0 ? (totalComprometido / totalInicial) * 100 : 0;

  // Agrupar por natureza
  const porNatureza = budgetLines.reduce((acc, l) => {
    const key = l.natureza_nome || l.natureza_codigo || 'Outros';
    if (!acc[key]) acc[key] = { nome: key, previsto: 0, comprometido: 0 };
    acc[key].previsto += l.saldo_inicial || 0;
    acc[key].comprometido += l.saldo_comprometido || 0;
    return acc;
  }, {});

  const fmt = (v) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 border border-gray-100 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-gray-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Saldo Inicial</span>
          </div>
          <p className="text-2xl font-bold text-black">{fmt(totalInicial)}</p>
          <p className="text-xs text-gray-400 mt-1">3º Termo Aditivo total</p>
        </div>

        <div className="p-5 border border-gray-100 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Comprometido</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">{fmt(totalComprometido)}</p>
          <p className="text-xs text-gray-400 mt-1">{pctUsado.toFixed(1)}% do total</p>
        </div>

        <div className={`p-5 border rounded-2xl ${totalDisponivel < totalInicial * 0.1 ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${totalDisponivel < totalInicial * 0.1 ? 'bg-red-100' : 'bg-green-100'}`}>
              <TrendingUp className={`w-4 h-4 ${totalDisponivel < totalInicial * 0.1 ? 'text-red-600' : 'text-green-600'}`} />
            </div>
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Disponível</span>
          </div>
          <p className={`text-2xl font-bold ${totalDisponivel < totalInicial * 0.1 ? 'text-red-700' : 'text-green-700'}`}>{fmt(totalDisponivel)}</p>
          {totalDisponivel < totalInicial * 0.1 && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Saldo crítico (&lt;10%)</p>
          )}
        </div>
      </div>

      {/* Barra geral */}
      <div className="p-4 border border-gray-100 rounded-xl">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Utilização do orçamento</span>
          <span>{pctUsado.toFixed(1)}% comprometido</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pctUsado > 90 ? 'bg-red-500' : pctUsado > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(pctUsado, 100)}%` }}
          />
        </div>
      </div>

      {/* Por natureza */}
      {Object.keys(porNatureza).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Por Natureza Contábil</h3>
          <div className="space-y-2">
            {Object.values(porNatureza).map(nat => {
              const pct = nat.previsto > 0 ? (nat.comprometido / nat.previsto) * 100 : 0;
              return (
                <div key={nat.nome} className="p-3 border border-gray-100 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-gray-700 truncate flex-1 mr-4">{nat.nome}</span>
                    <span className={`text-xs font-semibold ${pct > 90 ? 'text-red-600' : 'text-gray-600'}`}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-amber-400' : 'bg-green-400'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-400">
                    <span>Previsto: {fmt(nat.previsto)}</span>
                    <span>Disponível: {fmt(nat.previsto - nat.comprometido)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabela por rubrica */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Rubricas Orçamentárias</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-gray-500 font-medium">Código</th>
                <th className="text-left py-2 text-gray-500 font-medium">Descrição</th>
                <th className="text-right py-2 text-gray-500 font-medium">Previsto</th>
                <th className="text-right py-2 text-gray-500 font-medium">Comprometido</th>
                <th className="text-right py-2 text-gray-500 font-medium">Disponível</th>
                <th className="text-right py-2 text-gray-500 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {budgetLines.map(l => {
                const saldo = (l.saldo_inicial || 0) - (l.saldo_comprometido || 0);
                const pct = l.saldo_inicial > 0 ? ((l.saldo_comprometido || 0) / l.saldo_inicial) * 100 : 0;
                return (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 font-mono text-gray-500">{l.codigo}</td>
                    <td className="py-2 text-gray-700 max-w-xs truncate">{l.descricao}</td>
                    <td className="py-2 text-right text-gray-600">{fmt(l.saldo_inicial)}</td>
                    <td className="py-2 text-right text-amber-600">{fmt(l.saldo_comprometido)}</td>
                    <td className={`py-2 text-right font-semibold ${saldo < 0 ? 'text-red-600' : saldo < (l.saldo_inicial * 0.1) ? 'text-amber-600' : 'text-green-600'}`}>
                      {fmt(saldo)}
                    </td>
                    <td className={`py-2 text-right ${pct > 90 ? 'text-red-600' : 'text-gray-500'}`}>{pct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}