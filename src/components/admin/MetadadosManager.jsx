import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, ToggleLeft, ToggleRight, GripVertical } from 'lucide-react';

const CATEGORIAS = [
  { value: 'museu', label: 'Museus' },
  { value: 'tipo_atividade', label: 'Tipos de Atividade' },
  { value: 'classificacao', label: 'Classificações de Atividade' },
  { value: 'status_relatorio', label: 'Status de Relatório' },
  { value: 'funcao', label: 'Funções dos Profissionais' },
  { value: 'equipe', label: 'Equipes' },
];

function ItemRow({ item, onDelete, onToggle }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${item.ativo ? 'border-gray-100 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-sm text-black truncate">{item.label}</p>
          {item.valor !== item.label && (
            <p className="text-xs text-gray-400 font-mono">{item.valor}</p>
          )}
          {item.descricao && <p className="text-xs text-gray-400 truncate">{item.descricao}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge className={item.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'} variant="secondary">
          {item.ativo ? 'Ativo' : 'Inativo'}
        </Badge>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggle(item)}>
          {item.ativo
            ? <ToggleRight className="w-4 h-4 text-green-600" />
            : <ToggleLeft className="w-4 h-4 text-gray-400" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(item.id)}>
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
        </Button>
      </div>
    </div>
  );
}

function AddItemForm({ categoria, onAdd }) {
  const [label, setLabel] = useState('');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [open, setOpen] = useState(false);

  const handleAdd = () => {
    if (!label.trim()) return;
    onAdd({
      categoria,
      label: label.trim(),
      valor: valor.trim() || label.trim().toUpperCase().replace(/\s+/g, '_'),
      descricao: descricao.trim(),
      ativo: true,
      ordem: 0,
    });
    setLabel(''); setValor(''); setDescricao('');
    setOpen(false);
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5 mt-3" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5" /> Adicionar item
      </Button>
    );
  }

  return (
    <div className="mt-3 p-4 border border-dashed border-gray-300 rounded-xl space-y-3 bg-gray-50">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Rótulo *</label>
          <Input placeholder="Ex: MHAB" value={label} onChange={e => setLabel(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Valor interno (opcional)</label>
          <Input placeholder="Ex: MHAB (auto)" value={valor} onChange={e => setValor(e.target.value)} className="h-8 text-sm font-mono" />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Descrição (opcional)</label>
        <Input placeholder="Descrição breve..." value={descricao} onChange={e => setDescricao(e.target.value)} className="h-8 text-sm" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="bg-black text-white hover:bg-gray-800" onClick={handleAdd}>Salvar</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

export default function MetadadosManager() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('museu');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['metadados'],
    queryFn: () => base44.entities.MetadadosConfig.list('ordem', 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.MetadadosConfig.create(data),
    onSuccess: () => { queryClient.invalidateQueries(['metadados']); toast.success('Item adicionado'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MetadadosConfig.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(['metadados']); toast.success('Item atualizado'); },
    onError: () => toast.error('Erro ao atualizar item'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MetadadosConfig.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['metadados']); toast.success('Item removido'); },
  });

  const handleToggle = (item) => {
    updateMutation.mutate({ id: item.id, data: { ativo: !item.ativo } });
  };

  const categoriaItems = items.filter(i => i.categoria === activeTab);

  return (
    <div>
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIAS.map(cat => (
          <button
            key={cat.value}
            onClick={() => setActiveTab(cat.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === cat.value
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
            <span className={`ml-1.5 text-xs ${activeTab === cat.value ? 'text-gray-300' : 'text-gray-400'}`}>
              {items.filter(i => i.categoria === cat.value && i.ativo).length}
            </span>
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {isLoading && <p className="text-center py-8 text-gray-400 text-sm">Carregando...</p>}
        {!isLoading && categoriaItems.length === 0 && (
          <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-400">Nenhum item cadastrado para esta categoria</p>
          </div>
        )}
        {categoriaItems.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            onDelete={deleteMutation.mutate}
            onToggle={handleToggle}
          />
        ))}
      </div>

      <AddItemForm categoria={activeTab} onAdd={createMutation.mutate} />
    </div>
  );
}