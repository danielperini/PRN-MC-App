import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function MuseuManager() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingMuseu, setEditingMuseu] = useState(null);
  const [formData, setFormData] = useState({ nome: '', sigla: '', descricao: '', endereco: '', telefone: '', email: '' });

  const { data: museus = [] } = useQuery({
    queryKey: ['museus'],
    queryFn: () => base44.entities.Museu.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editingMuseu
        ? base44.entities.Museu.update(editingMuseu.id, data)
        : base44.entities.Museu.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['museus']);
      toast.success(editingMuseu ? 'Museu atualizado!' : 'Museu criado!');
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Museu.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['museus']);
      toast.success('Museu removido!');
    },
  });

  const resetForm = () => {
    setFormData({ nome: '', sigla: '', descricao: '', endereco: '', telefone: '', email: '' });
    setEditingMuseu(null);
    setShowDialog(false);
  };

  const handleEdit = (museu) => {
    setEditingMuseu(museu);
    setFormData(museu);
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!formData.nome || !formData.sigla) {
      toast.error('Nome e Sigla são obrigatórios');
      return;
    }
    saveMutation.mutate(formData);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <h3 className="text-base font-semibold text-black">Museus</h3>
        <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} className="bg-black hover:bg-gray-800 text-white gap-1.5">
          <Plus className="w-4 h-4" />Adicionar Museu
        </Button>
      </div>

      <div className="space-y-2">
        {museus.map((museu) => (
          <div key={museu.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
            <div className="flex-1">
              <p className="font-medium text-sm text-black">{museu.nome}</p>
              <p className="text-xs text-gray-400">{museu.sigla} {museu.descricao && `• ${museu.descricao}`}</p>
            </div>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(museu)}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(museu.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMuseu ? 'Editar Museu' : 'Novo Museu'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
            </div>
            <div>
              <Label>Sigla *</Label>
              <Input value={formData.sigla} onChange={(e) => setFormData({ ...formData, sigla: e.target.value })} placeholder="Ex: MHAB" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={formData.endereco} onChange={(e) => setFormData({ ...formData, endereco: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
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