import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Upload, Edit2, Trash2, Phone, Mail, Building2 } from 'lucide-react';
import { toastMessages } from '@/lib/toastMessages';

export default function Fornecedores() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'pessoa_fisica',
    cpf: '',
    cnpj: '',
    email: '',
    telefone: '',
    endereco_completo: '',
    contato_vendedor_nome: '',
    contato_vendedor_telefone: '',
    contato_vendedor_email: '',
    banco: '',
    agencia: '',
    conta: '',
    tipo_conta: 'corrente',
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
      toastMessages.createSuccess();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Fornecedor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedores'] });
      resetForm();
      toastMessages.updateSuccess();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Fornecedor.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedores'] });
      toastMessages.deleteSuccess();
    }
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
      cpf: '',
      cnpj: '',
      email: '',
      telefone: '',
      endereco_completo: '',
      contato_vendedor_nome: '',
      contato_vendedor_telefone: '',
      contato_vendedor_email: '',
      banco: '',
      agencia: '',
      conta: '',
      tipo_conta: 'corrente',
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
                     <p className="text-xs text-gray-500">{fornecedor.cpf || fornecedor.cnpj}</p>
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
                {fornecedor.endereco_completo && (
                  <p className="text-xs text-gray-500">{fornecedor.endereco_completo}</p>
                )}
                {fornecedor.contato_vendedor_nome && (
                  <div className="bg-gray-50 p-2 rounded text-xs">
                    <p className="font-semibold text-gray-700">Vendedor: {fornecedor.contato_vendedor_nome}</p>
                    {fornecedor.contato_vendedor_telefone && <p>{fornecedor.contato_vendedor_telefone}</p>}
                    {fornecedor.contato_vendedor_email && <p>{fornecedor.contato_vendedor_email}</p>}
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
          <form onSubmit={handleSubmit} className="space-y-4 max-h-96 overflow-y-auto">
            {/* Dados do Fornecedor */}
            <div className="border-b pb-3">
              <h4 className="font-semibold text-sm mb-3 text-gray-700">Fornecedor</h4>
              <Input
                placeholder="Nome *"
                value={formData.nome}
                onChange={(e) => setFormData({...formData, nome: e.target.value})}
                required
              />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">CPF</label>
                  <Input
                    placeholder="123.456.789-00"
                    value={formData.cpf}
                    onChange={(e) => setFormData({...formData, cpf: e.target.value})}
                    disabled={formData.tipo === 'pessoa_juridica'}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">CNPJ</label>
                  <Input
                    placeholder="12.345.678/0001-00"
                    value={formData.cnpj}
                    onChange={(e) => setFormData({...formData, cnpj: e.target.value})}
                    disabled={formData.tipo === 'pessoa_fisica'}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs text-gray-600 block mb-1">Tipo</label>
                <select 
                  value={formData.tipo} 
                  onChange={(e) => setFormData({...formData, tipo: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  <option value="pessoa_fisica">Pessoa Física</option>
                  <option value="pessoa_juridica">Pessoa Jurídica</option>
                </select>
              </div>
            </div>

            {/* Endereço */}
            <div className="border-b pb-3">
              <h4 className="font-semibold text-sm mb-3 text-gray-700">Endereço</h4>
              <Input
                placeholder="Endereço completo (rua, nº, bairro, cidade, estado)"
                value={formData.endereco_completo}
                onChange={(e) => setFormData({...formData, endereco_completo: e.target.value})}
              />
            </div>

            {/* Contatos */}
            <div className="border-b pb-3">
              <h4 className="font-semibold text-sm mb-3 text-gray-700">Contatos</h4>
              <Input
                placeholder="Email do fornecedor"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="mb-3"
              />
              <Input
                placeholder="Telefone do fornecedor"
                value={formData.telefone}
                onChange={(e) => setFormData({...formData, telefone: e.target.value})}
              />
            </div>

            {/* Contato de Vendedor */}
            <div className="border-b pb-3 bg-amber-50 p-3 rounded">
              <h4 className="font-semibold text-sm mb-3 text-amber-900">Contato de Vendedor/Representante</h4>
              <Input
                placeholder="Nome do vendedor ou representante"
                value={formData.contato_vendedor_nome}
                onChange={(e) => setFormData({...formData, contato_vendedor_nome: e.target.value})}
                className="mb-3"
              />
              <Input
                placeholder="Telefone do vendedor"
                value={formData.contato_vendedor_telefone}
                onChange={(e) => setFormData({...formData, contato_vendedor_telefone: e.target.value})}
                className="mb-3"
              />
              <Input
                placeholder="Email do vendedor"
                type="email"
                value={formData.contato_vendedor_email}
                onChange={(e) => setFormData({...formData, contato_vendedor_email: e.target.value})}
              />
            </div>

            {/* Dados Bancários */}
            <div className="pb-3">
              <h4 className="font-semibold text-sm mb-3 text-gray-700">Dados Bancários</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
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
                className="mb-3"
              />
              <Input
                placeholder="PIX"
                value={formData.pix}
                onChange={(e) => setFormData({...formData, pix: e.target.value})}
              />
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}