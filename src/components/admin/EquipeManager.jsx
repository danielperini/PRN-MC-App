import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function EquipeManager() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingEquipe, setEditingEquipe] = useState(null);
  const [formData, setFormData] = useState({ nome: '', descricao: '', museu_id: '', coordenador_email: '' });

  const { data: equipes = [] } = useQuery({
    queryKey: ['equipes'],
    queryFn: () => base44.entities.Equipe.list(),
  });

  const { data: museus = [] } = useQuery({
    queryKey: ['museus'],
    queryFn: () => base44.entities.Museu.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editingEquipe
        ? base44.entities.Equipe.update(editingEquipe.id, data)
        : base44.entities.Equipe.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['equipes']);
      toast.success(editingEquipe ? 'Equipe atualizada!' : 'Equipe criada!');
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Equipe.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['equipes']);
      toast.success('Equipe removida!');
    },
  });

  const resetForm = () => {
    setFormData({ nome: '', descricao: '', museu_id: '', coordenador_email: '' });
    setEditingEquipe(null);
    setShowDialog(false);
  };

  const handleEdit = (equipe) => {
    setEditingEquipe(equipe);
    setFormData(equipe);
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!formData.nome) {
      toast.error('Nome é obrigatório');
      return;
    }
    saveMutation.mutate(formData);
  };

  const getMuseuNome = (museuId) => museus.find((m) => m.id === museuId)?.nome;
  const getCoordenadorNome = (email) => users.find((u) => u.email === email)?.full_name;

  return (
    <section>
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <h3 className="text-base font-semibold text-black">Equipes</h3>
        <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} className="bg-black hover:bg-gray-800 text-white gap-1.5">
          <Plus className="w-4 h-4" />Adicionar Equipe
        </Button>
      </div>

      <div className="space-y-2">
        {equipes.map((equipe) => (
          <div key={equipe.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
            <div className="flex-1">
              <p className="font-medium text-sm text-black">{equipe.nome}</p>
              <p className="text-xs text-gray-400">
                {getMuseuNome(equipe.museu_id) && `${getMuseuNome(equipe.museu_id)} •`} {getCoordenadorNome(equipe.coordenador_email) && `Coord: ${getCoordenadorNome(equipe.coordenador_email)}`}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(equipe)}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(equipe.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEquipe ? 'Editar Equipe' : 'Nova Equipe'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Museu</Label>
              <Select value={formData.museu_id} onValueChange={(val) => setFormData({ ...formData, museu_id: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um museu" />
                </SelectTrigger>
                <SelectContent>
                  {museus.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Coordenador</Label>
              <Select value={formData.coordenador_email} onValueChange={(val) => setFormData({ ...formData, coordenador_email: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um coordenador" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter((u) => u.role === 'COORDENADOR' || u.role === 'admin').map((u) => (
                    <SelectItem key={u.email} value={u.email}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-3 border-t">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button className="bg-black hover:bg-gray-800 text-white" onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}