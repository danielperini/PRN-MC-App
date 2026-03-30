import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toastMessages } from '@/lib/toastMessages';
import { toast } from 'sonner';
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

function parseMoneda(str) {
  // Converte "1.234,56" em 1234.56
  const cleaned = String(str || '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function formatMoneda(value) {
  // Formata como moeda: "1234.56" → "1.234,56"
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function RubricasGrid({ rubricas = [], onRefresh }) {
  const [search, setSearch] = useState('');
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editField, setEditField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState(null);

  async function handleEditCell(rubricaId, field, currentValue) {
    setEditingId(rubricaId);
    setEditField(field);
    setEditValue(String(currentValue));
  }

  async function handleSaveEdit(rubricaId, field) {
    setSavingId(rubricaId);
    try {
      const newValue = parseMoneda(editValue);
      if (!Number.isFinite(newValue) || newValue < 0) {
        toast.error('Informe um valor válido (ex: 1.234,56)');
        setSavingId(null);
        return;
      }

      const rubrica = rubricas.find(r => r.id === rubricaId);
      const updateData = {};
      
      if (field === 'valor_rubrica') {
        updateData.valor_rubrica = newValue;
        updateData.saldo = newValue - toNumber(rubrica?.valor_utilizado);
        const perc = newValue > 0 ? (toNumber(rubrica?.valor_utilizado) / newValue) * 100 : 0;
        updateData.percentual_utilizado = perc;
      } else {
        updateData.valor_utilizado = newValue;
        updateData.saldo = toNumber(rubrica?.valor_rubrica) - newValue;
        const perc = toNumber(rubrica?.valor_rubrica) > 0 ? (newValue / toNumber(rubrica?.valor_rubrica)) * 100 : 0;
        updateData.percentual_utilizado = perc;
      }

      await base44.entities.Rubrica.update(rubricaId, updateData);
      toast.success(`${field === 'valor_rubrica' ? 'Valor' : 'Valor utilizado'} atualizado!`);
      setEditingId(null);
      setEditField(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      toast.error('Erro ao salvar: ' + (e?.message || e));
    } finally {
      setSavingId(null);
    }
  }

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
                <tr key={r.id} className="border-t hover:bg-blue-50">
                  <td className="p-2">{r?.grupo}</td>
                  <td className="p-2">{r?.rubrica}</td>
                  <td 
                    className="p-2 cursor-pointer hover:bg-yellow-100 transition"
                    onClick={() => handleEditCell(r.id, 'valor_rubrica', valor)}
                  >
                    {editingId === r.id && editField === 'valor_rubrica' ? (
                      <input
                        autoFocus
                        type="text"
                        placeholder="0,00"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleSaveEdit(r.id, 'valor_rubrica')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(r.id, 'valor_rubrica');
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-full border rounded px-1 text-sm"
                        disabled={savingId === r.id}
                      />
                    ) : (
                      <span className="cursor-pointer">R$ {moeda(valor)}</span>
                    )}
                  </td>
                  <td 
                    className="p-2 text-blue-700 cursor-pointer hover:bg-yellow-100 transition"
                    onClick={() => handleEditCell(r.id, 'valor_utilizado', utilizado)}
                  >
                    {editingId === r.id && editField === 'valor_utilizado' ? (
                      <input
                        autoFocus
                        type="text"
                        placeholder="0,00"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleSaveEdit(r.id, 'valor_utilizado')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(r.id, 'valor_utilizado');
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-full border rounded px-1 text-sm"
                        disabled={savingId === r.id}
                      />
                    ) : (
                      <span className="cursor-pointer">R$ {moeda(utilizado)}</span>
                    )}
                  </td>
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