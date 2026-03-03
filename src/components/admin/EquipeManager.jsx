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

const TIPOS_FUNCAO = {
  'Administrativa': { label: 'Administrativa', color: 'bg-blue-50 border-blue-200' },
  'Coordenação Geral': { label: 'Coordenação Geral', color: 'bg-purple-50 border-purple-200' },
  'Administração': { label: 'Administração', color: 'bg-indigo-50 border-indigo-200' },
  'Comunicação': { label: 'Comunicação', color: 'bg-pink-50 border-pink-200' },
  'Coordenação de Comunicação': { label: 'Coordenação de Comunicação', color: 'bg-rose-50 border-rose-200' },
  'Educativo': { label: 'Educativo', color: 'bg-green-50 border-green-200' },
  'Produção': { label: 'Produção', color: 'bg-amber-50 border-amber-200' }
};

export default function EquipeManager() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingEquipe, setEditingEquipe] = useState(null);
  const [formData, setFormData] = useState({ nome: '', descricao: '', tipo_funcao: '', museu_id: '', coordenador_email: '' });

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
    setFormData({ nome: '', descricao: '', tipo_funcao: '', museu_id: '', coordenador_email: '' });
    setEditingEquipe(null);
    setShowDialog(false);
  };

  const handleEdit = (equipe) => {
    setEditingEquipe(equipe);
    setFormData(equipe);
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!formData.nome || !formData.tipo_funcao) {
      toast.error('Nome e tipo de função são obrigatórios');
      return;
    }
    saveMutation.mutate(formData);
  };

  const getMuseuNome = (museuId) => museus.find((m) => m.id === museuId)?.nome;
  const getCoordenadorNome = (email) => users.find((u) => u.email === email)?.full_name;

  // Organizar equipes por tipo de função e depois por museu
  const equipesPorFuncao = Object.keys(TIPOS_FUNCAO).reduce((acc, tipo) => {
    const equipesDoTipo = equipes
      .filter(e => e.tipo_funcao === tipo)
      .sort((a, b) => (getMuseuNome(a.museu_id) || '').localeCompare(getMuseuNome(b.museu_id) || ''));
    
    // Agrupar por museu
    acc[tipo] = equipesDoTipo.reduce((museuAcc, equipe) => {
      const museuNome = getMuseuNome(equipe.museu_id) || 'Sem museu';
      if (!museuAcc[museuNome]) museuAcc[museuNome] = [];
      museuAcc[museuNome].push(equipe);
      return museuAcc;
    }, {});
    return acc;
  }, {});

  return (
    <section>
      <div className="flex items-center justify-between mb-6 pb-2 border-b border-gray-100">
        <h3 className="text-base font-semibold text-black">Equipes por Função</h3>
        <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} className="bg-black hover:bg-gray-800 text-white gap-1.5">
          <Plus className="w-4 h-4" />Adicionar Equipe
        </Button>
      </div>

      <div className="space-y-6">
        {Object.entries(TIPOS_FUNCAO).map(([tipoKey, tipoConfig]) => {
          const equipesDoTipo = equipesPorFuncao[tipoKey] || {};
          const temEquipes = Object.values(equipesDoTipo).some(list => list.length > 0);
          
          return (
            <div key={tipoKey} className={`border rounded-lg p-4 ${tipoConfig.color}`}>
              <h4 className="font-semibold text-sm mb-4 text-black">{tipoConfig.label}</h4>
              {!temEquipes ? (
                <p className="text-xs text-gray-400">Nenhuma equipe registrada</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(equipesDoTipo).map(([museuNome, equipesMuseu]) => 
                    equipesMuseu.length > 0 && (
                      <div key={museuNome}>
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{museuNome}</p>
                        <div className="space-y-2 ml-2">
                          {equipesMuseu.map((equipe) => (
                            <div key={equipe.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:shadow-sm transition-shadow">
                              <div className="flex-1">
                                <p className="font-medium text-sm text-black">{equipe.nome}</p>
                                {getCoordenadorNome(equipe.coordenador_email) && (
                                  <p className="text-xs text-gray-500">Coord: {getCoordenadorNome(equipe.coordenador_email)}</p>
                                )}
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
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
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
               <Label>Tipo de Função *</Label>
               <Select value={formData.tipo_funcao} onValueChange={(val) => setFormData({ ...formData, tipo_funcao: val })}>
                 <SelectTrigger>
                   <SelectValue placeholder="Selecione o tipo de função" />
                 </SelectTrigger>
                 <SelectContent>
                   {Object.entries(TIPOS_FUNCAO).map(([key, config]) => (
                     <SelectItem key={key} value={key}>
                       {config.label}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
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