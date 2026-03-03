import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Trash2, Edit, Save, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';

const DEFAULT_PERMISSIONS = [
  { key: 'can_view_all_reports', label: 'Visualizar todos os relatórios' },
  { key: 'can_review_reports', label: 'Revisar e aprovar relatórios' },
  { key: 'can_manage_users', label: 'Gerenciar usuários' },
  { key: 'can_manage_files', label: 'Gerenciar arquivos (completo)' },
  { key: 'can_manage_museus', label: 'Gerenciar museus' },
  { key: 'can_manage_equipes', label: 'Gerenciar equipes' },
  { key: 'can_view_audit_log', label: 'Visualizar auditoria' },
  { key: 'can_manage_platform', label: 'Gerenciar plataforma' },
  { key: 'must_submit_monthly_reports', label: 'Obrigado a entregar relatórios mensais' },
];

function PermissionManagerInner() {
  const queryClient = useQueryClient();
  const [editingPerm, setEditingPerm] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [formData, setFormData] = useState(null);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: permissions = [], isLoading: loadingPerms } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: () => base44.entities.UserPermission.list('-created_date', 1000),
  });

  const { data: permissionTypes = [] } = useQuery({
    queryKey: ['permission-types'],
    queryFn: async () => {
      try {
        return await base44.entities.PermissionType.list('', 1000);
      } catch {
        return [];
      }
    },
  });

  const PERMISSIONS = permissionTypes.length > 0
    ? permissionTypes.filter(t => t.ativo).map(t => ({ key: t.key, label: t.label }))
    : DEFAULT_PERMISSIONS;

  const createPermMutation = useMutation({
    mutationFn: (data) => base44.entities.UserPermission.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-permissions']);
      toast.success('Permissões criadas com sucesso');
      setShowDialog(false);
      setFormData(null);
    },
    onError: () => toast.error('Erro ao criar permissões'),
  });

  const updatePermMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UserPermission.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-permissions']);
      toast.success('Permissões atualizadas');
      setEditingPerm(null);
    },
    onError: () => toast.error('Erro ao atualizar permissões'),
  });

  const deletePermMutation = useMutation({
    mutationFn: (id) => base44.entities.UserPermission.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['user-permissions']);
      toast.success('Permissões removidas');
    },
    onError: () => toast.error('Erro ao remover permissões'),
  });

  const handleOpenCreate = () => {
    const newForm = {
      user_email: '',
      user_name: '',
      base_role: 'COORDENADOR',
    };
    PERMISSIONS.forEach(p => {
      newForm[p.key] = false;
    });
    newForm.can_view_all_reports = true;
    newForm.can_review_reports = true;
    setFormData(newForm);
    setShowDialog(true);
  };

  const handleOpenEdit = (perm) => {
    setEditingPerm(perm);
  };

  const togglePermission = (key) => {
    if (editingPerm) {
      setEditingPerm(prev => ({ ...prev, [key]: !prev[key] }));
    } else {
      setFormData(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const handleSelectUser = (user) => {
    setFormData(prev => ({
      ...prev,
      user_email: user.email,
      user_name: user.full_name,
    }));
  };

  const handleSave = () => {
    if (editingPerm) {
      const dataToUpdate = {};
      PERMISSIONS.forEach(p => {
        dataToUpdate[p.key] = editingPerm[p.key];
      });
      updatePermMutation.mutate({
        id: editingPerm.id,
        data: dataToUpdate,
      });
    } else {
      if (!formData.user_email) {
        toast.error('Selecione um usuário');
        return;
      }
      createPermMutation.mutate(formData);
    }
  };

  const getUserPermissions = () => {
    const permMap = {};
    permissions.forEach(p => {
      permMap[p.user_email] = p;
    });

    return users.map(user => {
      if (permMap[user.email]) {
        return permMap[user.email];
      }
      return {
        id: null,
        user_email: user.email,
        user_name: user.full_name,
        base_role: user.role,
        isNew: true,
      };
    });
  };

  const allUserPerms = getUserPermissions().filter(p =>
    !searchEmail || p.user_email.toLowerCase().includes(searchEmail.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-600" />
              Gerenciamento de Permissões
            </h1>
            <p className="text-gray-500 mt-1">Configure permissões customizadas para coordenadores e admins</p>
          </div>
          <Button className="bg-black hover:bg-gray-800 text-white gap-2" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4" />
            Adicionar Permissões
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Buscar por email..."
            value={searchEmail}
            onChange={e => setSearchEmail(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Permissions List */}
        <div className="space-y-3">
          {loadingPerms || loadingUsers ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : allUserPerms.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-gray-200 rounded-2xl">
              <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Nenhum usuário encontrado</p>
            </div>
          ) : (
            allUserPerms.map(perm => (
              <div key={perm.id || perm.user_email} className={`p-5 border rounded-xl transition-all ${perm.isNew ? 'border-amber-200 bg-amber-50' : 'border-gray-100 hover:border-gray-200'}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-black">{perm.user_name}</p>
                    <p className="text-sm text-gray-500">{perm.user_email}</p>
                    <p className="text-xs text-gray-400 mt-1">Matrícula: MCA202600000003</p>
                    <div className="flex gap-2 mt-2">
                      <Badge className="bg-blue-100 text-blue-700">{perm.base_role}</Badge>
                      {perm.isNew && <Badge className="bg-amber-100 text-amber-700">Sem permissões</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      if (perm.isNew) {
                        setFormData({
                          user_email: perm.user_email,
                          user_name: perm.user_name,
                          base_role: perm.base_role,
                        });
                        PERMISSIONS.forEach(p => {
                          setFormData(prev => ({ ...prev, [p.key]: false }));
                        });
                        setShowDialog(true);
                      } else {
                        handleOpenEdit(perm);
                      }
                    }}>
                      <Edit className="w-4 h-4 mr-1" />{perm.isNew ? 'Adicionar' : 'Editar'}
                    </Button>
                    {perm.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200"
                        onClick={() => deletePermMutation.mutate(perm.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Permissions Dropdown */}
                {!perm.isNew && (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        <span>Permissões ({PERMISSIONS.filter(p => perm[p.key]).length})</span>
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 space-y-2 p-4 bg-gray-50 rounded-lg">
                      {PERMISSIONS.map(p => (
                        <div key={p.key} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={perm[p.key]}
                            disabled
                            className="pointer-events-none"
                          />
                          <span className={perm[p.key] ? 'text-gray-700' : 'text-gray-400'}>
                            {p.label}
                          </span>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Permissões Customizadas</DialogTitle>
          </DialogHeader>

          {formData && (
            <div className="space-y-6 mt-4">
              {/* User Selection */}
              <div>
                <Label className="mb-2 block">Selecione o usuário</Label>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {loadingUsers ? (
                    <p className="p-3 text-gray-400 text-sm">Carregando usuários...</p>
                  ) : (
                    users.map(user => (
                        <button
                          key={user.id}
                          onClick={() => handleSelectUser(user)}
                          className={`w-full text-left p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${
                            formData.user_email === user.email ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                          }`}
                        >
                          <p className="font-medium text-black">{user.full_name || user.email}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </button>
                      ))
                  )}
                </div>
              </div>

              {/* Permissions Checkboxes */}
              <div>
                <p className="font-semibold text-black mb-3">Permissões</p>
                <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                  {PERMISSIONS.map(p => (
                    <div key={p.key} className="flex items-center gap-2">
                      <Checkbox
                        checked={formData[p.key]}
                        onCheckedChange={() => togglePermission(p.key)}
                        id={p.key}
                      />
                      <label htmlFor={p.key} className="text-sm cursor-pointer">{p.label}</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={handleSave}
              disabled={createPermMutation.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPerm} onOpenChange={o => !o && setEditingPerm(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Permissões: {editingPerm?.user_name}</DialogTitle>
          </DialogHeader>

          {editingPerm && (
            <div className="space-y-4 mt-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">{editingPerm.user_email}</p>
                <Badge className="bg-blue-100 text-blue-700">{editingPerm.base_role}</Badge>
              </div>

              <div>
                <p className="font-semibold text-black mb-3">Permissões</p>
                <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                  {PERMISSIONS.map(p => (
                    <div key={p.key} className="flex items-center gap-2">
                      <Checkbox
                        checked={editingPerm[p.key]}
                        onCheckedChange={() => togglePermission(p.key)}
                        id={`edit-${p.key}`}
                      />
                      <label htmlFor={`edit-${p.key}`} className="text-sm cursor-pointer">{p.label}</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setEditingPerm(null)}>Cancelar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={handleSave}
              disabled={updatePermMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PermissionManager() {
  return <RequireAuth requireRole="COORDENADOR"><PermissionManagerInner /></RequireAuth>;
}