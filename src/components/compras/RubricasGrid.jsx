import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { Pencil, X, Save, Trash2 } from 'lucide-react';

const CENTROS_CUSTO = [
  'MHAB',
  'MIS',
  'MUMO',
  'Atuação Geral',
  'Atende a todos',
  'Noturno',
  'Noturno Pampulha'
];

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
  // Remove R$, espaços e trata formato BR (1.234,56) e EN (1234.56)
  let cleaned = String(str || '').replace(/R\$\s*/g, '').trim();
  // Se tem vírgula E ponto: formato BR => remove pontos, troca vírgula por ponto
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // Só vírgula: pode ser decimal BR
    cleaned = cleaned.replace(',', '.');
  }
  // Se só ponto: já é decimal EN
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function EditModal({ rubrica, onClose, onSave }) {
  const [form, setForm] = useState({
    grupo: rubrica.grupo || '',
    rubrica: rubrica.rubrica || '',
    centro_custo: rubrica.centro_custo || '',
    valor_rubrica: String(toNumber(rubrica.valor_rubrica || rubrica.valor_total)),
    valor_utilizado: String(toNumber(rubrica.valor_utilizado))
  });
  const [saving, setSaving] = useState(false);

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const valor_rubrica = parseMoneda(form.valor_rubrica);
      const valor_utilizado = parseMoneda(form.valor_utilizado);

      const res = await base44.functions.invoke('salvarRubrica', {
        id: rubrica.id,
        grupo: form.grupo,
        rubrica: form.rubrica,
        centro_custo: form.centro_custo,
        valor_rubrica,
        valor_utilizado,
      });

      if (res?.data?.error) throw new Error(res.data.error);

      toast.success('Rubrica atualizada');
      onSave();
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Editar Rubrica</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Grupo</label>
            <input
              value={form.grupo}
              onChange={e => handleChange('grupo', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Rubrica</label>
            <input
              value={form.rubrica}
              onChange={e => handleChange('rubrica', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Centro de Custo</label>
            <select
              value={form.centro_custo}
              onChange={e => handleChange('centro_custo', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="">— Selecione —</option>
              {CENTROS_CUSTO.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Valor Previsto (R$)</label>
              <input
                value={form.valor_rubrica}
                onChange={e => handleChange('valor_rubrica', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Valor Utilizado (R$)</label>
              <input
                value={form.valor_utilizado}
                onChange={e => handleChange('valor_utilizado', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RubricasGrid({ rubricas = [], onRefresh }) {
  const [search, setSearch] = useState('');
  const [editingRubrica, setEditingRubrica] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  async function handleDelete(r) {
    if (!window.confirm(`Deletar a rubrica "${r.rubrica || r.grupo}"?\n\nEsta ação é irreversível.`)) return;
    setDeletingId(r.id);
    try {
      await base44.entities.Rubrica.delete(r.id);
      toast.success('Rubrica deletada.');
      if (onRefresh) onRefresh();
    } catch (e) {
      toast.error('Erro ao deletar: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  }

  const filtradas = useMemo(() => {
    return rubricas.filter((r) => {
      const texto = `${r?.rubrica || ''} ${r?.grupo || ''}`.toLowerCase();
      return texto.includes(search.toLowerCase());
    });
  }, [rubricas, search]);

  const dadosProcessados = useMemo(() => {
    return filtradas.map((r) => {
      const valor = toNumber(r?.valor_rubrica || r?.valor_total);
      const utilizado = toNumber(r?.valor_utilizado);
      const saldo = valor - utilizado;
      const perc = valor > 0 ? (utilizado / valor) * 100 : 0;
      return { ...r, valor, utilizado, saldo, perc };
    });
  }, [filtradas]);

  // Totais contratuais oficiais fixos — não derivados da soma das rubricas
  const CONTRATO_3A = 1320000;
  const CONTRATO_4A = 81719.85;
  const CONTRATO_5A = 15800;
  const CONTRATO_TOTAL = CONTRATO_3A + CONTRATO_4A + CONTRATO_5A; // R$ 1.417.519,85

  const totais = useMemo(() => {
    let utilizado = 0;
    for (const r of dadosProcessados) {
      utilizado += r.utilizado;
    }
    // Previsto = valor contratual oficial (não soma das rubricas filtradas)
    const previsto = CONTRATO_TOTAL;
    return { previsto, utilizado, saldo: previsto - utilizado };
  }, [dadosProcessados]);

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
              <th className="p-2 text-left">Grupo</th>
              <th className="p-2 text-left">Rubrica</th>
              <th className="p-2 text-left">Centro de Custo</th>
              <th className="p-2 text-left">Natureza</th>
              <th className="p-2 text-right">Valor</th>
              <th className="p-2 text-right">Utilizado</th>
              <th className="p-2 text-right">Saldo</th>
              <th className="p-2 text-center">%</th>
              <th className="p-2 text-center">Ações</th>
            </tr>
          </thead>

          <tbody>
            {dadosProcessados.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="p-2">{r?.grupo}</td>
                <td className="p-2">{r?.rubrica}</td>
                <td className="p-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {r?.centro_custo || '—'}
                  </span>
                </td>
                <td className="p-2">
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {r?.natureza_despesa || r?.nome_natureza || '—'}
                  </span>
                </td>
                <td className="p-2 text-right tabular-nums">R$ {moeda(r.valor)}</td>
                <td className="p-2 text-right tabular-nums text-blue-700">R$ {moeda(r.utilizado)}</td>
                <td className={`p-2 text-right tabular-nums font-medium ${r.saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  R$ {moeda(r.saldo)}
                </td>
                <td className="p-2 text-center">{r.perc.toFixed(1)}%</td>
                <td className="p-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => setEditingRubrica(r)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-black transition-colors"
                      title="Editar rubrica"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      disabled={deletingId === r.id}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                      title="Deletar rubrica"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot className="bg-gray-50 font-bold">
            <tr>
              <td colSpan={4} className="p-2">TOTAL</td>
              <td className="p-2 text-right tabular-nums">R$ {moeda(totais.previsto)}</td>
              <td className="p-2 text-right tabular-nums">R$ {moeda(totais.utilizado)}</td>
              <td className="p-2 text-right tabular-nums">R$ {moeda(totais.saldo)}</td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editingRubrica && (
        <EditModal
          rubrica={editingRubrica}
          onClose={() => setEditingRubrica(null)}
          onSave={() => {
            setEditingRubrica(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
}