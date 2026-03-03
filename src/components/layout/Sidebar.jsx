import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { 
  BarChart3, 
  FileText, 
  Users, 
  Eye,
  Paperclip,
  Settings,
  Shield,
  History,
  ChevronLeft,
  ChevronRight,
  Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Sidebar({ currentPageName, collapsed = false, onToggle }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isCoordenador, setIsCoordenador] = useState(false);
  const [customPerms, setCustomPerms] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const isAuth = await base44.auth.isAuthenticated();
      if (isAuth) {
        const user = await base44.auth.me();
        setCurrentUser(user);
        const isCord = ['COORDENADOR', 'ADMIN', 'admin'].includes(user?.role);
        setIsCoordenador(isCord);
        
        if (isCord && user?.email) {
          base44.entities.UserPermission.filter({ user_email: user.email }).then(perms => {
            if (perms.length > 0) setCustomPerms(perms[0]);
          }).catch(() => {});
        }
      }
    };
    loadUser();
  }, []);

  const canViewMenu = (requiredPerm) => {
    if (!isCoordenador) return true;
    if (!customPerms) return true;
    return customPerms[requiredPerm] !== false;
  };

  const navItems = [
    { name: 'Dashboard', icon: BarChart3, label: 'Dashboard', show: true },
    { name: 'DashboardProfissional', icon: FileText, label: 'Painel Profissional', show: !isCoordenador },
    { name: 'Relatorios', icon: FileText, label: 'Relatórios', show: true },
    { name: 'ActivityLog', icon: History, label: 'Atividades', show: true },
    { name: 'GestorArquivos', icon: Paperclip, label: 'Arquivos', show: isCoordenador && canViewMenu('can_manage_files') },
    { name: 'CoordReview', icon: Eye, label: 'Revisão', show: isCoordenador && canViewMenu('can_review_reports') },
    { name: 'AdminUsers', icon: Users, label: 'Usuários', show: isCoordenador && canViewMenu('can_manage_users') },
    { name: 'UserManagement', icon: Users, label: 'Convites', show: isCoordenador && canViewMenu('can_manage_users') },
    { name: 'PermissionManager', icon: Shield, label: 'Permissões', show: isCoordenador && canViewMenu('can_manage_users') },
    { name: 'PlataformaAdmin', icon: Settings, label: 'Plataforma', show: isCoordenador && canViewMenu('can_manage_platform') },
    { name: 'AuditLog', icon: History, label: 'Auditoria', show: isCoordenador && canViewMenu('can_view_audit_log') },
  ].filter(item => item.show);

  return (
    <aside className={`${
      collapsed ? 'w-20' : 'w-64'
    } bg-gray-900 text-white h-screen flex flex-col fixed left-0 top-0 z-40 transition-all duration-300 border-r border-gray-800`}>
      {/* Logo */}
      <div className={`flex items-center justify-between h-16 px-4 border-b border-gray-800 ${collapsed ? 'flex-col gap-2' : ''}`}>
        {!collapsed && (
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-gray-900" />
            </div>
            <span className="font-bold text-sm">Museus</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-gray-400 hover:text-white"
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentPageName === item.name;
          return (
            <Link key={item.name} to={createPageUrl(item.name)}>
              <Button
                variant="ghost"
                className={`w-full justify-start gap-3 h-10 ${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800'
                } ${collapsed ? 'px-2 justify-center' : 'px-3'}`}
                title={collapsed ? item.label : ''}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="text-sm">{item.label}</span>}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      {currentUser && !collapsed && (
        <div className="border-t border-gray-800 p-4">
          <p className="text-xs font-medium text-gray-300 truncate">{currentUser.full_name}</p>
          <p className="text-xs text-gray-500 truncate">{currentUser.role}</p>
        </div>
      )}
    </aside>
  );
}