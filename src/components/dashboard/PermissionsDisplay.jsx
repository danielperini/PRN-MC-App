import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const PERMISSION_LABELS = {
  can_view_all_reports: 'Visualizar relatórios',
  can_review_reports: 'Revisar relatórios',
  can_manage_users: 'Gerenciar usuários',
  can_manage_files: 'Gerenciar arquivos',
  can_manage_museus: 'Gerenciar museus',
  can_manage_equipes: 'Gerenciar equipes',
  can_view_audit_log: 'Auditoria',
  can_manage_platform: 'Plataforma',
};

export default function PermissionsDisplay({ userEmail }) {
  const [perms, setPerms] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const allPerms = await base44.entities.UserPermission.list();
        const userPerms = allPerms.find(p => p.user_email === userEmail);
        setPerms(userPerms || null);
      } catch (error) {
        console.warn('Permissões customizadas indisponíveis no dashboard.', error);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, [userEmail]);

  if (loading) return <p className="text-sm text-gray-400">Carregando...</p>;

  if (!perms) {
    return (
      <div className="p-4 border border-gray-100 rounded-lg bg-gray-50">
        <p className="text-sm text-gray-500">Nenhuma permissão customizada configurada</p>
      </div>
    );
  }

  const grantedPerms = Object.keys(PERMISSION_LABELS).filter(k => perms[k]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-5 h-5 text-blue-600" />
        <p className="font-semibold text-black">Permissões Customizadas</p>
      </div>

      {grantedPerms.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma permissão concedida</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {grantedPerms.map(key => (
            <Badge key={key} className="bg-green-100 text-green-700 gap-1">
              <Check className="w-3 h-3" />
              {PERMISSION_LABELS[key]}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
