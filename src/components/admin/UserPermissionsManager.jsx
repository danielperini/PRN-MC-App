import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Save, Loader2, User, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const PERMISSION_GROUPS = {
  'Relatórios': [
    { key: 'can_view_all_reports', label: 'Visualizar todos os relatórios' },
    { key: 'can_review_reports', label: 'Revisar e aprovar relatórios' },
  ],
  'Financeiro': [
    { key: 'gestao_compras', label: 'Gestão completa de compras e orçamento' },
    { key: 'pode_ver_saude_orcamentaria', label: 'Visualizar saúde orçamentária' },
    { key: 'pode_gerenciar_rubricas', label: 'Gerenciar rubricas' },
    { key: 'pode_aprovar_solicitacoes', label: 'Aprovar solicitações e pagamentos' },
  ],
  'Usuários e Estrutura': [
    { key: 'can_manage_users', label: 'Gerenciar usuários' },
    { key: 'can_manage_equipes', label: 'Gerenciar equipes' },
    { key: 'can_manage_museus', label: 'Gerenciar museus' },
  ],
  'Arquivos': [
    { key: 'can_manage_files', label: 'Gerenciar arquivos completamente' },
  ],
  'Auditoria e Plataforma': [
    { key: 'can_view_audit_log', label: 'Visualizar log de auditoria' },
    { key: 'can_manage_platform', label: 'Gerenciar configurações da plataforma' },
  ],
  'Relatórios Mensais': [
    { key: 'must_submit_monthly_reports', label: 'Obrigado a submeter relatórios mensais' },
  ],
};

const DEFAULT_USER_PERMISSIONS = {
  base_role: 'PROFISSIONAL',
  can_view_all_reports: true,
  can_manage_files: false,
  gestao_compras: false,
  pode_ver_saude_orcamentaria: false,
  pode_gerenciar_rubricas: false,
  pode_aprovar_solicitacoes: false,
  can_manage_users: false,
  can_manage_equipes: false,
  can_manage_museus: false,
  can_view_audit_log: false,
  can_manage_platform: false,
  can_review_reports: false,
  must_submit_monthly_reports: true,
};

export default function UserPermissionsManager() {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users = [] } = useQuery({
    queryKey: ['all-users-permissions'],
    queryFn: async () => {
      const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 200);
      const permissions = await base44.asServiceRole.entities.UserPermission.list('-updated_date', 200);
      
      return allUsers.map(u => {
        const perm = permissions.find(p => p.user_email === u.email);
        return {
          ...u,
          permissions: perm || { user_email: u.email, base_role: 'PROFISSIONAL' },
        };
      });
    },
  });

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setEditingPermissions({ ...user.permissions });
  };

  const handlePermissionChange = (permissionKey, value) => {
    setEditingPermissions(prev => ({
      ...prev,
      [permissionKey]: value,
    }));
  };

  const handleRoleChange = (newRole) => {
    setEditingPermissions(prev => ({
      ...prev,
      base_role: newRole,
    }));
  };

  const handleApplyDefaultsToAll = async () => {
    if (!window.confirm('Isso aplicará as permissões padrão (acesso a relatórios, pedidos de compra, perfil e arquivos próprios) para TODOS os usuários sem role de COORDENADOR ou ADMIN. Confirmar?')) return;
    setApplyingAll(true);
    try {
      const permissions = await base44.asServiceRole.entities.UserPermission.list('-updated_date', 500);
      const permMap = {};
      permissions.forEach(p => { permMap[p.user_email] = p; });

      for (const user of users) {
        if (user.permissions?.base_role === 'COORDENADOR' || user.permissions?.base_role === 'ADMIN') continue;
        const existing = permMap[user.email];
        if (existing) {
          await base44.asServiceRole.entities.UserPermission.update(existing.id, {
            ...DEFAULT_USER_PERMISSIONS,
            user_email: user.email,
            user_name: user.full_name,
          });
        } else {
          await base44.asServiceRole.entities.UserPermission.create({
            ...DEFAULT_USER_PERMISSIONS,
            user_email: user.email,
            user_name: user.full_name,
          });
        }
      }
      queryClient.invalidateQueries(['all-users-permissions']);
      toast({ title: 'Permissões aplicadas!', description: 'Todos os usuários receberam as permissões padrão.' });
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
    setApplyingAll(false);
  };

  const { mutate: savePermissions } = useMutation({
    mutationFn: async () => {
      if (!editingPermissions.id) {
        // Criar nova permissão
        await base44.asServiceRole.entities.UserPermission.create({
          user_email: selectedUser.email,
          user_name: selectedUser.full_name,
          ...editingPermissions,
        });
      } else {
        // Atualizar permissões existentes
        await base44.asServiceRole.entities.UserPermission.update(
          editingPermissions.id,
          editingPermissions
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['all-users-permissions']);
      alert('Permissões atualizadas com sucesso!');
    },
    onError: (error) => {
      alert(`Erro ao salvar: ${error.message}`);
    },
  });

  return (
    <div className="space-y-4 md:space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base md:text-lg font-bold text-gray-900 mb-1">Gerenciar Permissões de Usuários</h3>
          <p className="text-xs md:text-sm text-gray-600">Configure acessos específicos para cada membro da equipe</p>
        </div>
        <Button
          onClick={handleApplyDefaultsToAll}
          disabled={applyingAll}
          variant="outline"
          className="gap-2 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50 whitespace-nowrap"
        >
          {applyingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
          Aplicar padrão a todos
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 w-full">
        {/* Painel de Usuários */}
        <Card className="lg:col-span-1 p-3 md:p-4 border border-gray-200 w-full">
          <div className="space-y-3 md:space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar usuário..."
                className="pl-9 text-xs md:text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-[400px] md:max-h-[600px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="text-xs md:text-sm text-gray-500 text-center py-8">Nenhum usuário encontrado</p>
              ) : (
                filteredUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className={`w-full text-left p-2 md:p-3 rounded-lg border transition-all text-xs md:text-sm ${
                      selectedUser?.id === user.id
                        ? 'bg-indigo-50 border-indigo-300'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 text-xs truncate">{user.full_name}</p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        {user.permissions?.base_role && (
                          <p className="text-xs text-indigo-600 font-semibold mt-1">
                            {user.permissions.base_role}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* Painel de Permissões */}
        {selectedUser ? (
          <Card className="lg:col-span-2 p-3 md:p-6 border border-gray-200 w-full">
            <div className="space-y-4 md:space-y-6">
              {/* Informações do Usuário */}
              <div className="pb-3 md:pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-gray-900 text-sm truncate">{selectedUser.full_name}</h4>
                    <p className="text-xs md:text-sm text-gray-600 truncate">{selectedUser.email}</p>
                  </div>
                </div>
              </div>

              {/* Papel Base */}
              <div>
                <label className="text-xs md:text-sm font-semibold text-gray-700 block mb-3">
                  Papel Principal
                </label>
                <Select value={editingPermissions.base_role || 'PROFISSIONAL'} onValueChange={handleRoleChange}>
                  <SelectTrigger className="text-xs md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROFISSIONAL" className="text-xs md:text-sm">Profissional</SelectItem>
                    <SelectItem value="COORDENADOR" className="text-xs md:text-sm">Coordenador</SelectItem>
                    <SelectItem value="ADMIN" className="text-xs md:text-sm">Administrador</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-2">
                  Define o nível base de acesso do usuário na plataforma
                </p>
              </div>

              {/* Permissões por Grupo */}
              <div className="space-y-4 md:space-y-6 max-h-[300px] md:max-h-[500px] overflow-y-auto">
                {Object.entries(PERMISSION_GROUPS).map(([groupName, permissions]) => (
                  <div key={groupName} className="border-l-4 border-indigo-300 pl-3 md:pl-4">
                    <h5 className="font-semibold text-gray-900 text-xs md:text-sm mb-2 md:mb-3">{groupName}</h5>
                    <div className="space-y-2 md:space-y-3">
                      {permissions.map(perm => (
                        <div key={perm.key} className="flex items-start gap-2 md:gap-3">
                          <Checkbox
                            id={perm.key}
                            checked={editingPermissions[perm.key] === true}
                            onCheckedChange={(value) =>
                              handlePermissionChange(perm.key, value)
                            }
                            className="mt-0.5"
                          />
                          <label
                            htmlFor={perm.key}
                            className="text-xs md:text-sm text-gray-700 cursor-pointer flex-1"
                          >
                            {perm.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Botão de Salvar */}
              <div className="pt-3 md:pt-4 border-t border-gray-200 flex gap-2">
                <Button
                  onClick={() => savePermissions()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 flex-1 text-xs md:text-sm py-2 md:py-2.5"
                >
                  <Save className="w-4 h-4" />
                  Salvar
                </Button>
                <Button
                  onClick={() => {
                    setSelectedUser(null);
                    setEditingPermissions({});
                  }}
                  variant="outline"
                  className="flex-1 text-xs md:text-sm"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="lg:col-span-2 p-4 md:p-6 border border-gray-200 flex items-center justify-center min-h-64 md:min-h-96 w-full">
            <div className="text-center">
              <Shield className="w-10 md:w-12 h-10 md:h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-xs md:text-base text-gray-500 font-medium">Selecione um usuário para gerenciar suas permissões</p>
            </div>
          </Card>
        )}
      </div>

      {/* Legenda */}
      <Card className="p-3 md:p-4 bg-blue-50 border border-blue-200 w-full">
        <p className="text-xs md:text-sm text-blue-900">
          <span className="font-semibold">💡 Nota:</span> Apenas coordenadores e administradores podem modificar permissões. As alterações entram em vigor imediatamente.
        </p>
      </Card>
    </div>
  );
}