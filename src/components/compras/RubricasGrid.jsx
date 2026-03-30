import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toastMessages } from '@/lib/toastMessages';
import { RefreshCw } from 'lucide-react';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function moeda(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function RubricasGrid({ rubricas = [], onRefresh }) {
  const [search, setSearch] = useState('');
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');

  async function handleRecalcular() {
    setRecalcLoading(true);
    setRecalcMsg('');
    try {
      const res = await base44.functions.invoke('recalculateAllRubricas', {});
      const s = res?.data?.sumario;
      if (s) {
        setRecalcMsg(`Atualizado: ${s.total_rubricas_unicas} rubricas | Utilizado: R$ ${moeda(s.valor_total_utilizado)}`);
        toastMessages.syncSuccess();
      } else {
        setRecalcMsg('Recálculo concluído.');
        toastMessages.info('Sincronização concluída com sucesso.');
      }
      if (onRefresh) onRefresh();
    } catch (e) {
      setRecalcMsg('Erro ao recalcular: ' + (e?.message || e));
      toastMessages.syncFailed(e?.message);
    } finally {
      setRecalcLoading(false);
    }
  }

  const filtradas = useMemo(() => {
    return rubricas.filter(r => {
      const texto = `${r?.rubrica || ''} ${r?.grupo || ''}`.toLowerCase();
      return texto.includes(search.toLowerCase());
    });
  }, [rubricas, search]);

  const totais = useMemo(() => {
    let previsto = 0;
    let utilizado = 0;
    for (const r of filtradas) {
      previsto += toNumber(r?.valor_rubrica);
      utilizado += toNumber(r?.valor_utilizado);
    }
    return { previsto, utilizado, saldo: previsto - utilizado };
  }, [filtradas]);

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR */}
      <div className="flex items-center gap-2">
        <input
          placeholder="Buscar rubrica..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border rounded p-2 text-sm"
        />
        <button
          onClick={handleRecalcular}
          disabled={recalcLoading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${recalcLoading ? 'animate-spin' : ''}`} />
          {recalcLoading ? 'Recalculando...' : 'Recalcular'}
        </button>
      </div>

      {recalcMsg && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {recalcMsg}
        </div>
      )}

      {/* TABELA */}
      <div className="overflow-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-2">Grupo</th>
              <th className="p-2">Rubrica</th>
              <th className="p-2">Valor</th>
              <th className="p-2">Utilizado</th>
              <th className="p-2">Saldo</th>
              <th className="p-2">%</th>
            </tr>
          </thead>

          <tbody>
            {filtradas.map((r) => {
              const valor = toNumber(r?.valor_rubrica);
              const utilizado = toNumber(r?.valor_utilizado);
              const saldo = toNumber(r?.saldo ?? (valor - utilizado));
              const perc = valor > 0 ? (utilizado / valor) * 100 : 0;

              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r?.grupo}</td>
                  <td className="p-2">{r?.rubrica}</td>
                  <td className="p-2">R$ {moeda(valor)}</td>
                  <td className="p-2 text-blue-700">R$ {moeda(utilizado)}</td>
                  <td className={`p-2 font-medium ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    R$ {moeda(saldo)}
                  </td>
                  <td className="p-2">{perc.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>

          <tfoot className="bg-gray-50 font-bold">
            <tr>
              <td colSpan={2} className="p-2">TOTAL</td>
              <td className="p-2">R$ {moeda(totais.previsto)}</td>
              <td className="p-2">R$ {moeda(totais.utilizado)}</td>
              <td className="p-2">R$ {moeda(totais.saldo)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}