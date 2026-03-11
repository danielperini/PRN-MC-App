import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

export default function MapeamentoRubricasEditor() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    termo_origem: '',
    rubrica_destino: '',
    ativo: true,
  });
  const queryClient = useQueryClient();

  const { data: mapeamentos = [] } = useQuery({
    queryKey: ['mapeamentos-rubricas'],
    queryFn: () => base44.entities.MapeamentoRubricas.list('created_date', 100),
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-select'],
    queryFn: () => base44.entities.Rubrica.filter({ ativo: true }),
  });

  const rubricasUniqueName = [...new Set(rubricas.map(r => r.rubrica))].sort();

  const handleSave = async () => {
    if (!formData.termo_origem || !formData.rubrica_destino) {
      toast.error('Preencha todos os campos');
      return;
    }

    try {
      if (editingId) {
        await base44.entities.MapeamentoRubricas.update(editingId, {
          termo_origem: formData.termo_origem.toUpperCase(),
          rubrica_destino: formData.rubrica_destino,
          ativo: formData.ativo,
        });
        toast.success('✅ Atualizado!');
        setEditingId(null);
      } else {
        await base44.entities.MapeamentoRubricas.create({
          termo_origem: formData.termo_origem.toUpperCase(),
          rubrica_destino: formData.rubrica_destino,
          ativo: formData.ativo,
        });
        toast.success('✅ Criado!');
      }

      setFormData({ termo_origem: '', rubrica_destino: '', ativo: true });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['mapeamentos-rubricas'] });
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  };

  const handleEdit = (map) => {
    setFormData({
      termo_origem: map.termo_origem,
      rubrica_destino: map.rubrica_destino,
      ativo: map.ativo,
    });
    setEditingId(map.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza?')) return;
    try {
      await base44.entities.MapeamentoRubricas.delete(id);
      toast.success('✅ Removido!');
      queryClient.invalidateQueries({ queryKey: ['mapeamentos-rubricas'] });
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-black">Mapeamentos Automáticos</h3>
        <Button
          size="sm"
          className="gap-2 bg-black hover:bg-gray-800 text-white"
          onClick={() => {
            setFormData({ termo_origem: '', rubrica_destino: '', ativo: true });
            setEditingId(null);
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Novo
        </Button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <div>
            <label className="text-sm font-semibold text-black block mb-2">Termo *</label>
            <Input
              value={formData.termo_origem}
              onChange={e => setFormData(f => ({ ...f, termo_origem: e.target.value }))}
              placeholder="Ex: ANALISTA"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-black block mb-2">Rubrica *</label>
            <Select
              value={formData.rubrica_destino}
              onValueChange={v => setFormData(f => ({ ...f, rubrica_destino: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rubricasUniqueName.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.ativo}
              onChange={e => setFormData(f => ({ ...f, ativo: e.target.checked }))}
              className="w-4 h-4"
            />
            <label className="text-sm text-black">Ativo</label>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" className="bg-black hover:bg-gray-800 text-white" onClick={handleSave}>
              {editingId ? 'Atualizar' : 'Criar'}
            </Button>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left p-3 font-semibold text-black">Termo</th>
              <th className="text-left p-3 font-semibold text-black">Rubrica</th>
              <th className="text-center p-3 font-semibold text-black">Status</th>
              <th className="text-center p-3 font-semibold text-black">Ações</th>
            </tr>
          </thead>
          <tbody>
            {mapeamentos.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-4 text-center text-gray-400 text-xs">
                  Nenhum mapeamento
                </td>
              </tr>
            ) : (
              mapeamentos.map(map => (
                <tr key={map.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs text-gray-700">{map.termo_origem}</td>
                  <td className="p-3 text-gray-900">{map.rubrica_destino}</td>
                  <td className="p-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded ${map.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {map.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleEdit(map)}
                        className="p-1 hover:bg-blue-100 text-blue-600 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(map.id)}
                        className="p-1 hover:bg-red-100 text-red-600 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}