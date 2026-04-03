import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toastMessages } from '@/lib/toastMessages';
import { toast } from 'sonner';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function moeda(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseMoneda(str) {
  const cleaned = String(str || '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export default function RubricasGrid({ rubricas = [], onRefresh }) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState(null);

  // 🔒 PERMITIR APENAS EDITAR VALOR TOTAL (NÃO UTILIZADO)
  async function handleEditValor(rubricaId, currentValue) {
    setEditingId(rubricaId);
    setEditValue(String(currentValue));
  }

  async function handleSaveValor(rubricaId) {
    setSavingId(rubricaId);

    try {
      const newValue = parseMoneda(editValue);
      if (!Number.isFinite(newValue) || newValue < 0) {
        toast.error('Informe um valor válido');
        return;
      }

      await base44.entities.Rubrica.update(rubricaId, {
        valor_rubrica: newValue
      });

      toast.success('Valor atualizado');

      setEditingId(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      toast.error('Erro ao salvar');
    } finally {
      setSavingId(null);
    }
  }

  const filtradas = useMemo(() => {
    return rubricas.filter((r) => {
      const texto = `${r?.rubrica || ''} ${r?.grupo || ''}`.toLowerCase();
      return texto.includes(search.toLowerCase());
    });
  }, [rubricas, search]);

  const totais = useMemo(() => {
    let previsto = 0;
    let utilizado = 0;
    let comprometido = 0;

    for (const r of filtradas) {
      previsto += toNumber(r?.valor_rubrica);
      utilizado += toNumber(r?.valor_utilizado);
      comprometido += toNumber(r?.saldo_comprometido);
    }

    return {
      previsto,
      utilizado,
      comprometido,
      saldo: previsto - utilizado - comprometido
    };
  }, [filtradas]);

  return (
    <div className="space-y-4">

      <input
        placeholder="Buscar rubrica..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded p-2 text-sm"
      />

      <div className="overflow-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2">Grupo</th>
              <th className="p-2">Rubrica</th>
              <th className="p-2">Valor</th>
              <th className="p-2">Utilizado</th>
              <th className="p-2">Comprometido</th>
              <th className="p-2">Saldo real</th>
              <th className="p-2">%</th>
            </tr>
          </thead>

          <tbody>
            {filtradas.map((r) => {
              const valor = toNumber(r?.valor_rubrica);
              const utilizado = toNumber(r?.valor_utilizado);
              const comprometido = toNumber(r?.saldo_comprometido);

              const saldo = valor - utilizado - comprometido;

              const perc = valor > 0
                ? ((utilizado + comprometido) / valor) * 100
                : 0;

              return (
                <tr key={r.id} className="border-t">

                  <td className="p-2">{r?.grupo}</td>
                  <td className="p-2">{r?.rubrica}</td>

                  {/* ✔ EDITÁVEL */}
                  <td
                    className="p-2 cursor-pointer hover:bg-yellow-100"
                    onClick={() => handleEditValor(r.id, valor)}
                  >
                    {editingId === r.id ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleSaveValor(r.id)}
                        className="w-full border rounded px-1"
                        disabled={savingId === r.id}
                      />
                    ) : (
                      `R$ ${moeda(valor)}`
                    )}
                  </td>

                  {/* 🔒 BLOQUEADO */}
                  <td className="p-2 text-blue-700">
                    R$ {moeda(utilizado)}
                  </td>

                  {/* 🔒 BLOQUEADO */}
                  <td className="p-2 text-orange-700">
                    R$ {moeda(comprometido)}
                  </td>

                  <td className={`p-2 font-medium ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    R$ {moeda(saldo)}
                  </td>

                  <td className="p-2">
                    {perc.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot className="bg-gray-50 font-bold">
            <tr>
              <td colSpan={2} className="p-2">TOTAL</td>
              <td className="p-2">R$ {moeda(totais.previsto)}</td>
              <td className="p-2">R$ {moeda(totais.utilizado)}</td>
              <td className="p-2">R$ {moeda(totais.comprometido)}</td>
              <td className="p-2">R$ {moeda(totais.saldo)}</td>
              <td></td>
            </tr>
          </tfoot>

        </table>
      </div>
    </div>
  );
}
