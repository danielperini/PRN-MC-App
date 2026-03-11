import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Upload, Edit2, Trash2, Phone, Mail, Building2 } from 'lucide-react';

export default function Fornecedores() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'pessoa_fisica',
    cpf_cnpj: '',
    email: '',
    telefone: '',
    banco: '',
    agencia: '',
    conta: '',
    pix: '',
    categorias_servico: []
  });

  const queryClient = useQueryClient();

  const { data: fornecedores = [], isLoading } = useQuery({
    queryKey: ['fornecedores'],
    queryFn: () => base44.entities.Fornecedor.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Fornecedor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedores'] });
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Fornecedor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedores'] });
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Fornecedor.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fornecedores'] })
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (fornecedor) => {
    setFormData(fornecedor);
    setEditingId(fornecedor.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      tipo: 'pessoa_fisica',
      cpf_cnpj: '',
      email: '',
      telefone: '',
      banco: '',
      agencia: '',
      conta: '',
      pix: '',
      categorias_servico: []
    });
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Fornecedores</h1>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Fornecedor
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {fornecedores.map(fornecedor => (
            <Card key={fornecedor.id} className="p-4 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-sm">{fornecedor.nome}</h3>
                    <p className="text-xs text-gray-500">{fornecedor.cpf_cnpj}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(fornecedor)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(fornecedor.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {fornecedor.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4" /> {fornecedor.email}
                  </div>
                )}
                {fornecedor.telefone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4" /> {fornecedor.telefone}
                  </div>
                )}
                {fornecedor.categorias_servico?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {fornecedor.categorias_servico.map(cat => (
                      <span key={cat} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
                {fornecedor.banco && (
                  <div className="text-xs text-gray-500 border-t pt-2">
                    {fornecedor.banco} | Ag: {fornecedor.agencia} | Cc: {fornecedor.conta}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              placeholder="Nome"
              value={formData.nome}
              onChange={(e) => setFormData({...formData, nome: e.target.value})}
              required
            />
            <Input
              placeholder="CPF/CNPJ"
              value={formData.cpf_cnpj}
              onChange={(e) => setFormData({...formData, cpf_cnpj: e.target.value})}
              required
            />
            <Input
              placeholder="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
            <Input
              placeholder="Telefone"
              value={formData.telefone}
              onChange={(e) => setFormData({...formData, telefone: e.target.value})}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                placeholder="Banco"
                value={formData.banco}
                onChange={(e) => setFormData({...formData, banco: e.target.value})}
              />
              <Input
                placeholder="Agência"
                value={formData.agencia}
                onChange={(e) => setFormData({...formData, agencia: e.target.value})}
              />
            </div>
            <Input
              placeholder="Conta"
              value={formData.conta}
              onChange={(e) => setFormData({...formData, conta: e.target.value})}
            />
            <Input
              placeholder="PIX"
              value={formData.pix}
              onChange={(e) => setFormData({...formData, pix: e.target.value})}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}