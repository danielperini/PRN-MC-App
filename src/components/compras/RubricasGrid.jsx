import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react';

export default function RubricasGrid() {
  const [rubricas, setRubricas] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({});
  const [novaRubrica, setNovaRubrica] = useState({
    grupo: '',
    rubrica: '',
    valor_total: ''
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await base44.entities.Rubrica.list('', 2000);

    // ❌ REMOVE CONSULTORIA PROGRAMACAO
    const filtrado = (data || []).filter(r =>
      !(
        String(r.grupo || '').toLowerCase().includes('consultoria') &&
        String(r.rubrica || '').toLowerCase().includes('programação')
      )
    );

    setRubricas(filtrado);
  }

  function iniciarEdicao(r) {
    setEditandoId(r.id);
    setForm({
      grupo: r.grupo || '',
      rubrica: r.rubrica || '',
      valor_total: r.valor_total || r.valor_rubrica || 0,
      valor_utilizado: r.valor_utilizado || 0
    });
  }

  async function salvarEdicao(id) {
    await base44.entities.Rubrica.update(id, {
      grupo: form.grupo,
      rubrica: form.rubrica,
      valor_total: Number(form.valor_total),
      valor_utilizado: Number(form.valor_utilizado)
    });

    setEditandoId(null);
    load();
  }

  async function deletar(id) {
    if (!confirm('Remover rubrica?')) return;
    await base44.entities.Rubrica.delete(id);
    load();
  }

  async function criarRubrica() {
    if (!novaRubrica.rubrica) return;

    await base44.entities.Rubrica.create({
      grupo: novaRubrica.grupo,
      rubrica: novaRubrica.rubrica,
      valor_total: Number(novaRubrica.valor_total || 0),
      valor_utilizado: 0
    });

    setNovaRubrica({ grupo: '', rubrica: '', valor_total: '' });
    load();
  }

  return (
    <div className="space-y-4">

      {rubricas.map(r => {
        const editando = editandoId === r.id;

        return (
          <div key={r.id} className="border rounded-lg p-3 flex items-center gap-3">

            {editando ? (
              <>
                <Input value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))} />
                <Input value={form.rubrica} onChange={e => setForm(f => ({ ...f, rubrica: e.target.value }))} />
                <Input type="number" value={form.valor_total} onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))} />
                <Input type="number" value={form.valor_utilizado} onChange={e => setForm(f => ({ ...f, valor_utilizado: e.target.value }))} />

                <Button size="sm" onClick={() => salvarEdicao(r.id)}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditandoId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1 text-sm">
                  <div className="font-medium">{r.grupo}</div>
                  <div>{r.rubrica}</div>
                  <div className="text-xs text-slate-500">
                    Total: {r.valor_total} | Utilizado: {r.valor_utilizado}
                  </div>
                </div>

                <Button size="sm" variant="outline" onClick={() => iniciarEdicao(r)}>
                  <Pencil className="w-4 h-4" />
                </Button>

                <Button size="sm" variant="destructive" onClick={() => deletar(r.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        );
      })}

      {/* NOVA RUBRICA */}
      <div className="border rounded-lg p-3 flex items-center gap-3 bg-slate-50">
        <Input
          placeholder="Grupo"
          value={novaRubrica.grupo}
          onChange={e => setNovaRubrica(f => ({ ...f, grupo: e.target.value }))}
        />
        <Input
          placeholder="Nome da rubrica"
          value={novaRubrica.rubrica}
          onChange={e => setNovaRubrica(f => ({ ...f, rubrica: e.target.value }))}
        />
        <Input
          type="number"
          placeholder="Valor total"
          value={novaRubrica.valor_total}
          onChange={e => setNovaRubrica(f => ({ ...f, valor_total: e.target.value }))}
        />

        <Button onClick={criarRubrica}>
          <Plus className="w-4 h-4 mr-1" />
          Nova
        </Button>
      </div>

    </div>
  );
}
