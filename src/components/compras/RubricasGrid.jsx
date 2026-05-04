import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react';

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

function isConsultoriaProgramacao(r) {
  const grupo = String(r?.grupo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const rubrica = String(r?.rubrica || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  return (
    grupo.includes('consultorias') &&
    rubrica.includes('consultoria de programacao') &&
    toNumber(r?.valor_rubrica || r?.valor_total) === 30000
  );
}

export default function RubricasGrid({ rubricas = [], onRefresh }) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [showNova, setShowNova] = useState(false);

  const [editForm, setEditForm] = useState({
    grupo: '',
    rubrica: '',
    valor_rubrica: '',
    valor_utilizado: '',
    saldo: ''
  });

  const [novaRubrica, setNovaRubrica] = useState({
    grupo: '',
    rubrica: '',
    valor_rubrica: '',
    valor_utilizado: '',
    saldo: ''
  });

  function startEdit(r) {
    setEditingId(r.id);
    setEditForm({
      grupo: r?.grupo || '',
      rubrica: r?.rubrica || '',
      valor_rubrica: String(r?.valor_rubrica || r?.valor_total || 0),
      valor_utilizado: String(r?.valor_utilizado || 0),
      saldo: String(r?.saldo ?? '')
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({
      grupo: '',
      rubrica: '',
      valor_rubrica: '',
      valor_utilizado: '',
      saldo: ''
    });
  }

  async function saveEdit(rubricaId) {
    setSavingId(rubricaId);

    try {
      const valor = parseMoneda(editForm.valor_rubrica);
      const utilizado = parseMoneda(editForm.valor_utilizado);
      const saldoInformado = editForm.saldo === '' ? valor - utilizado : parseMoneda(editForm.saldo);
      const percentual = valor > 0 ? (utilizado / valor) * 100 : 0;

      await base44.entities.Rubrica.update(rubricaId, {
        grupo: editForm.grupo,
        categoria: editForm.grupo,
        rubrica: editForm.rubrica,
        nome: editForm.rubrica,
        item_rubrica: editForm.rubrica,
        valor_rubrica: valor,
        valor_total: valor,
        valor_utilizado: utilizado,
        saldo: saldoInformado,
        saldo_real: saldoInformado,
        percentual_utilizado: percentual
      });

      toast.success('Rubrica atualizada');
      cancelEdit();
      onRefresh?.();
    } catch (e) {
      toast.error('Erro ao salvar rubrica');
    } finally {
      setSavingId(null);
    }
  }

  async function removeRubrica(rubricaId) {
    if (!confirm('Remover esta rubrica?')) return;

    setSavingId(rubricaId);

    try {
      await base44.entities.Rubrica.update(rubricaId, {
        ativo: false,
        status: 'INATIVA_REMOVIDA_MANUALMENTE'
      });

      toast.success('Rubrica removida');
      onRefresh?.();
    } catch (e) {
      toast.error('Erro ao remover rubrica');
    } finally {
      setSavingId(null);
    }
  }

  async function createRubrica() {
    try {
      if (!novaRubrica.grupo || !novaRubrica.rubrica) {
        toast.error('Informe grupo e rubrica');
        return;
      }

      const valor = parseMoneda(novaRubrica.valor_rubrica);
      const utilizado = parseMoneda(novaRubrica.valor_utilizado);
      const saldo = novaRubrica.saldo === '' ? valor - utilizado : parseMoneda(novaRubrica.saldo);
      const percentual = valor > 0 ? (utilizado / valor) * 100 : 0;

      await base44.entities.Rubrica.create({
        grupo: novaRubrica.grupo,
        categoria: novaRubrica.grupo,
        rubrica: novaRubrica.rubrica,
        nome: novaRubrica.rubrica,
        item_rubrica: novaRubrica.rubrica,
        valor_rubrica: valor,
        valor_total: valor,
        valor_utilizado: utilizado,
        saldo,
        saldo_real: saldo,
        percentual_utilizado: percentual,
        ativo: true,
        status: 'ATIVA',
        origem_recurso: '3º ADITIVO',
        fonte_recurso: '3º ADITIVO'
      });

      toast.success('Rubrica criada');
      setNovaRubrica({
        grupo: '',
        rubrica: '',
        valor_rubrica: '',
        valor_utilizado: '',
        saldo: ''
      });
      setShowNova(false);
      onRefresh?.();
    } catch (e) {
      toast.error('Erro ao criar rubrica');
    }
  }

  const filtradas = useMemo(() => {
    return rubricas.filter((r) => {
      if (r?.ativo === false) return false;
      if (isConsultoriaProgramacao(r)) return false;

      const texto = `${r?.rubrica || ''} ${r?.grupo || ''}`.toLowerCase();
      return texto.includes(search.toLowerCase());
    });
  }, [rubricas, search]);

  const dadosProcessados = useMemo(() => {
    return filtradas.map((r) => {
      const valor = toNumber(r?.valor_rubrica || r?.valor_total);
      const utilizado = toNumber(r?.valor_utilizado);
      const saldo = r?.saldo !== undefined && r?.saldo !== null ? toNumber(r.saldo) : valor - utilizado;
      const perc = valor > 0 ? (utilizado / valor) * 100 : 0;

      return {
        ...r,
        valor,
        utilizado,
        saldo,
        perc
      };
    });
  }, [filtradas]);

  const totais = useMemo(() => {
    let previsto = 0;
    let utilizado = 0;

    for (const r of dadosProcessados) {
      previsto += r.valor;
      utilizado += r.utilizado;
    }

    return {
      previsto,
      utilizado,
      saldo: previsto - utilizado
    };
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
              <th className="p-2">Grupo</th>
              <th className="p-2">Rubrica</th>
              <th className="p-2">Valor</th>
              <th className="p-2">Utilizado</th>
              <th className="p-2">Saldo</th>
              <th className="p-2">%</th>
              <th className="p-2">Ações</th>
            </tr>
          </thead>

          <tbody>
            {dadosProcessados.map((r) => {
              const editing = editingId === r.id;

              return (
                <tr key={r.id} className="border-t">

                  <td className="p-2">
                    {editing ? (
                      <input
                        value={editForm.grupo}
                        onChange={(e) => setEditForm((f) => ({ ...f, grupo: e.target.value }))}
                        className="w-full border rounded px-1 py-1"
                        disabled={savingId === r.id}
                      />
                    ) : (
                      r?.grupo
                    )}
                  </td>

                  <td className="p-2">
                    {editing ? (
                      <input
                        value={editForm.rubrica}
                        onChange={(e) => setEditForm((f) => ({ ...f, rubrica: e.target.value }))}
                        className="w-full border rounded px-1 py-1"
                        disabled={savingId === r.id}
                      />
                    ) : (
                      r?.rubrica
                    )}
                  </td>

                  <td className="p-2">
                    {editing ? (
                      <input
                        value={editForm.valor_rubrica}
                        onChange={(e) => setEditForm((f) => ({ ...f, valor_rubrica: e.target.value }))}
                        className="w-full border rounded px-1 py-1"
                        disabled={savingId === r.id}
                      />
                    ) : (
                      `R$ ${moeda(r.valor)}`
                    )}
                  </td>

                  <td className="p-2 text-blue-700">
                    {editing ? (
                      <input
                        value={editForm.valor_utilizado}
                        onChange={(e) => setEditForm((f) => ({ ...f, valor_utilizado: e.target.value }))}
                        className="w-full border rounded px-1 py-1 text-blue-700"
                        disabled={savingId === r.id}
                      />
                    ) : (
                      `R$ ${moeda(r.utilizado)}`
                    )}
                  </td>

                  <td className={`p-2 font-medium ${r.saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {editing ? (
                      <input
                        value={editForm.saldo}
                        onChange={(e) => setEditForm((f) => ({ ...f, saldo: e.target.value }))}
                        placeholder="auto"
                        className="w-full border rounded px-1 py-1"
                        disabled={savingId === r.id}
                      />
                    ) : (
                      `R$ ${moeda(r.saldo)}`
                    )}
                  </td>

                  <td className="p-2">
                    {r.perc.toFixed(1)}%
                  </td>

                  <td className="p-2">
                    {editing ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => saveEdit(r.id)}
                          disabled={savingId === r.id}
                          className="border rounded px-2 py-1 hover:bg-green-50 text-green-700"
                          title="Salvar"
                        >
                          <Check className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingId === r.id}
                          className="border rounded px-2 py-1 hover:bg-gray-50"
                          title="Cancelar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="border rounded px-2 py-1 hover:bg-yellow-50"
                          title="Editar rubrica"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeRubrica(r.id)}
                          disabled={savingId === r.id}
                          className="border rounded px-2 py-1 hover:bg-red-50 text-red-600"
                          title="Remover rubrica"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
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
              <td className="p-2">R$ {moeda(totais.saldo)}</td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>

        </table>
      </div>

      {!showNova ? (
        <button
          type="button"
          onClick={() => setShowNova(true)}
          className="w-full border border-dashed rounded p-3 text-sm flex items-center justify-center gap-2 hover:bg-gray-50"
        >
          <Plus className="w-4 h-4" />
          Inserir nova rubrica
        </button>
      ) : (
        <div className="border rounded p-3 bg-gray-50 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input
              placeholder="Grupo"
              value={novaRubrica.grupo}
              onChange={(e) => setNovaRubrica((f) => ({ ...f, grupo: e.target.value }))}
              className="border rounded p-2 text-sm"
            />
            <input
              placeholder="Rubrica"
              value={novaRubrica.rubrica}
              onChange={(e) => setNovaRubrica((f) => ({ ...f, rubrica: e.target.value }))}
              className="border rounded p-2 text-sm md:col-span-2"
            />
            <input
              placeholder="Valor"
              value={novaRubrica.valor_rubrica}
              onChange={(e) => setNovaRubrica((f) => ({ ...f, valor_rubrica: e.target.value }))}
              className="border rounded p-2 text-sm"
            />
            <input
              placeholder="Utilizado"
              value={novaRubrica.valor_utilizado}
              onChange={(e) => setNovaRubrica((f) => ({ ...f, valor_utilizado: e.target.value }))}
              className="border rounded p-2 text-sm"
            />
            <input
              placeholder="Saldo automático"
              value={novaRubrica.saldo}
              onChange={(e) => setNovaRubrica((f) => ({ ...f, saldo: e.target.value }))}
              className="border rounded p-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNova(false)}
              className="border rounded px-3 py-2 text-sm hover:bg-white"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={createRubrica}
              className="border rounded px-3 py-2 text-sm bg-black text-white hover:bg-gray-800"
            >
              Criar rubrica
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
