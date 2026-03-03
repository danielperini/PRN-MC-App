import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Plus, Trash2, Edit, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

const CATEGORIES = [
  'Relatórios',
  'Usuários',
  'Arquivos',
  'Estrutura',
  'Auditoria',
  'Plataforma'
];

function PlataformaConfigInner() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [searchKey, setSearchKey] = useState('');
  const [formData, setFormData] = useState(null);

  const { data: permissionTypes = [], isLoading } = useQuery({
    queryKey: ['permission-types'],
    queryFn: () => base44.entities.PermissionType.list('-ordem', 1000),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PermissionType.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['permission-types']);
      toast.success('Tipo de permissão criado');
      setShowDialog(false);
      setFormData(null);
    },
    onError: (e) => toast.error('Erro ao criar: ' + e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PermissionType.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['permission-types']);
      toast.success('Permissão atualizada');
      setEditingType(null);
    },
    onError: (e) => toast.error('Erro ao atualizar: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PermissionType.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['permission-types']);
      toast.success('Permissão removida');
    },
    onError: (e) => toast.error('Erro ao remover: ' + e.message),
  });

  const handleOpenCreate = () => {
    setEditingType(null);
    setFormData({
      key: '',
      label: '',
      description: '',
      category: 'Plataforma',
      ativo: true,
      ordem: permissionTypes.length,
    });
    setShowDialog(true);
  };

  const handleOpenEdit = (type) => {
    setEditingType(type);
    setFormData(type);
  };

  const handleSave = () => {
    if (!formData.key || !formData.label) {
      toast.error('Preencha chave e rótulo');
      return;
    }
    if (editingType) {
      updateMutation.mutate({
        id: editingType.id,
        data: {
          label: formData.label,
          description: formData.description,
          category: formData.category,
          ativo: formData.ativo,
          ordem: formData.ordem,
        },
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filtered = permissionTypes.filter(t =>
    !searchKey || t.key.toLowerCase().includes(searchKey.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight flex items-center gap-3">
              <Settings className="w-8 h-8 text-purple-600" />
              Tipos de Permissões
            </h1>
            <p className="text-gray-500 mt-1">Gerencie as permissões customizadas do sistema</p>
          </div>
          <Button className="bg-black hover:bg-gray-800 text-white gap-2" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4" />
            Novo Tipo
          </Button>
        </div>

        <div className="mb-6">
          <Input
            placeholder="Buscar por chave..."
            value={searchKey}
            onChange={e => setSearchKey(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-gray-200 rounded-2xl">
              <Settings className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Nenhum tipo de permissão</p>
            </div>
          ) : (
            filtered.map(type => (
              <div key={type.id} className="p-5 border border-gray-100 rounded-xl hover:border-gray-200 transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <code className="bg-gray-100 px-2.5 py-1 rounded text-sm text-gray-700 font-mono">
                        {type.key}
                      </code>
                      <Badge className="bg-blue-100 text-blue-700 text-xs">{type.category}</Badge>
                      {!type.ativo && <Badge className="bg-red-100 text-red-700 text-xs">Inativo</Badge>}
                    </div>
                    <p className="font-semibold text-black">{type.label}</p>
                    {type.description && (
                      <p className="text-sm text-gray-500 mt-1">{type.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => handleOpenEdit(type)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200"
                      onClick={() => deleteMutation.mutate(type.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingType ? 'Editar Tipo' : 'Novo Tipo de Permissão'}</DialogTitle>
          </DialogHeader>

          {formData && (
            <div className="space-y-4 mt-4">
              <div>
                <Label>Chave (ex: can_manage_reports) *</Label>
                <Input
                  value={formData.key}
                  onChange={e => setFormData({ ...formData, key: e.target.value })}
                  placeholder="can_manage_reports"
                  disabled={editingType}
                  className="mt-1 font-mono text-sm"
                />
              </div>

              <div>
                <Label>Rótulo (como aparece na UI) *</Label>
                <Input
                  value={formData.label}
                  onChange={e => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Gerenciar Relatórios"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição detalhada..."
                  className="mt-1 min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Categoria</Label>
                  <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={formData.ordem}
                    onChange={e => setFormData({ ...formData, ordem: parseInt(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={formData.ativo}
                  onChange={e => setFormData({ ...formData, ativo: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="ativo" className="cursor-pointer">Ativo no sistema</Label>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PlataformaConfig() {
  return <RequireAuth requireRole="COORDENADOR"><PlataformaConfigInner /></RequireAuth>;
}