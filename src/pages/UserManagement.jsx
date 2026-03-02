import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Users, 
  Plus, 
  Pencil,
  Trash2,
  Check,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const STATUS_COLORS = {
  PENDENTE: 'bg-yellow-100 text-yellow-700',
  ATIVO: 'bg-green-100 text-green-700',
  INATIVO: 'bg-gray-100 text-gray-700',
};

const ROLE_LABELS = {
  COORDENADOR: 'Coordenador',
  PROFISSIONAL: 'Profissional',
  ADMIN: 'Administrador',
};

function UserManagementInner() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    role: 'PROFISSIONAL',
    equipe: '',
    status: 'ATIVO',
    museu: ''
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const inviteMutation = useMutation({
    mutationFn: async (data) => {
      await base44.users.inviteUser(data.email, 'user');
      // After invite, update user with role and other data
      const allUsers = await base44.entities.User.list();
      const newUser = allUsers.find(u => u.email === data.email);
      if (newUser) {
        await base44.entities.User.update(newUser.id, {
          role: data.role,
          equipe: data.equipe,
          status: data.status,
          museu: data.museu
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      toast.success('Usuário convidado com sucesso');
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao convidar usuário');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return base44.entities.User.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      toast.success('Usuário atualizado');
      setShowDialog(false);
      resetForm();
    }
  });

  const resetForm = () => {
    setFormData({
      email: '',
      role: 'PROFISSIONAL',
      equipe: '',
      status: 'ATIVO',
      museu: ''
    });
    setEditingUser(null);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      role: user.role || 'PROFISSIONAL',
      equipe: user.equipe || '',
      status: user.status || 'ATIVO',
      museu: user.museu || ''
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (editingUser) {
      updateMutation.mutate({
        id: editingUser.id,
        data: {
          role: formData.role,
          equipe: formData.equipe,
          status: formData.status,
          museu: formData.museu
        }
      });
    } else {
      inviteMutation.mutate(formData);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">
              Gestão de Usuários
            </h1>
            <p className="text-gray-500 mt-1">
              Gerencie os profissionais do sistema
            </p>
          </div>
          <Button 
            className="bg-black hover:bg-gray-800 text-white gap-2"
            onClick={() => {
              resetForm();
              setShowDialog(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Convidar Usuário
          </Button>
        </div>

        {/* Users List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-20 text-gray-400">
              Carregando usuários...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum usuário cadastrado</p>
            </div>
          ) : (
            users.map(user => (
              <div 
                key={user.id} 
                className="p-5 border border-gray-100 rounded-xl hover:border-gray-200 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {user.full_name?.[0] || user.email?.[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-black">
                          {user.full_name || 'Sem nome'}
                        </span>
                        <Badge className={`${STATUS_COLORS[user.status || 'PENDENTE']} font-normal`}>
                          {user.status || 'PENDENTE'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        {user.email} • {ROLE_LABELS[user.role] || 'Profissional'}
                        {user.museu && ` • ${user.museu}`}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => openEdit(user)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Editar Usuário' : 'Convidar Novo Usuário'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {!editingUser && (
              <div>
                <Label>Email</Label>
                <Input 
                  type="email"
                  placeholder="email@exemplo.com"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
            )}
            
            <div>
              <Label>Papel</Label>
              <Select 
                value={formData.role} 
                onValueChange={(v) => setFormData({...formData, role: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
                  <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Museu</Label>
              <Select 
                value={formData.museu} 
                onValueChange={(v) => setFormData({...formData, museu: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MHAB">MHAB</SelectItem>
                  <SelectItem value="MIS">MIS</SelectItem>
                  <SelectItem value="MUMO">MUMO</SelectItem>
                  <SelectItem value="Atuação Geral">Atuação Geral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Equipe</Label>
              <Select value={formData.equipe} onValueChange={v => setFormData({...formData, equipe: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {['Comunicação','Coordenação','Administração','Educativo','Produção'].map(e =>
                    <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(v) => setFormData({...formData, status: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="INATIVO">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowDialog(false)}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1 bg-black hover:bg-gray-800"
                onClick={handleSubmit}
                disabled={inviteMutation.isPending || updateMutation.isPending}
              >
                {editingUser ? 'Salvar' : 'Convidar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function UserManagement() {
  return <RequireAuth requireRole="COORDENADOR"><UserManagementInner /></RequireAuth>;
}