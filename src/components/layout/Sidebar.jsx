import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Building2,
  FileText,
  Users,
  Eye,
  Paperclip,
  Settings,
  Shield,
  HelpCircle,
  BarChart3,
  History,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Sidebar({ currentPageName, collapsed, onToggle }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [customPerms, setCustomPerms] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const isAuth = await base44.auth.isAuthenticated();
      if (isAuth) {
        const user = await base44.auth.me();
        setCurrentUser(user);

        // Carregar permissões customizadas se coordenador
        const isCoordenador = ['COORDENADOR', 'ADMIN', 'admin'].includes(user?.role);
        if (isCoordenador && user?.email) {
          try {
            const perms = await base44.entities.UserPermission.filter({ user_email: user.email });
            if (perms.length > 0) setCustomPerms(perms[0]);
          } catch (e) {
            // Se erro, mostrar tudo
            setCustomPerms(null);
          }
        }
      }
    };
    loadUser();
  }, []);

  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const canViewMenu = (requiredPerm) => {
    if (!isCoordenador) return true;
    if (!customPerms) return true; // Se não tem perms customizadas, mostra tudo
    // Se é Consultoria Programação, herda permissões de Coordenação de Comunicação
    if (currentUser?.role === 'CONSULTORIA_PROGRAMACAO') {
      const commPerms = ['can_review_reports', 'can_view_all_reports'];
      if (commPerms.includes(requiredPerm)) return true;
    }
    return customPerms[requiredPerm] !== false;
  };

  const navItems = [
    { name: 'Dashboard', icon: BarChart3, label: 'Dashboard', show: true },
    { name: 'DashboardProfissional', icon: FileText, label: 'Painel Profissional', show: !isCoordenador },
    { name: 'Relatorios', icon: FileText, label: 'Relatórios', show: true },
    { name: 'NovaAtividade', icon: Layers, label: 'Atividades', show: true },
    { name: 'AssistentePlanejamento', icon: HelpCircle, label: 'Assistente', show: true },
    { name: 'GestorArquivos', icon: Paperclip, label: 'Arquivos', show: isCoordenador && canViewMenu('can_manage_files') },
    { name: 'CoordReview', icon: Eye, label: 'Revisão', show: isCoordenador && canViewMenu('can_review_reports') },
    { name: 'UserManagement', icon: Users, label: 'Usuários', show: isCoordenador && canViewMenu('can_manage_users') },
    { name: 'PlataformaAdmin', icon: Settings, label: 'Plataforma', show: isCoordenador && canViewMenu('can_manage_platform') },
    { name: 'CalendarioAtividades', icon: CalendarDays, label: 'Calendário', show: true },
    { name: 'ActivityLog', icon: History, label: 'Registro de Atividade', show: isCoordenador },
    { name: 'BaseConhecimento', icon: BookOpen, label: 'Base de Conhecimento', show: currentUser?.role === 'admin' },
  ].filter(item => item.show);

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-black border-r border-black transition-all duration-300 z-40 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-black">
        {!collapsed && (
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-white text-lg">MC</span>
          </Link>
        )}
        {collapsed && (
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-black" />
          </div>
        )}
        <Button
           variant="ghost"
           size="icon"
           className="h-8 w-8 text-white hover:bg-black"
           onClick={onToggle}
         >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentPageName === item.name;
          return (
            <Link key={item.name} to={createPageUrl(item.name)}>
              <Button
                variant="ghost"
                className={`w-full justify-start gap-3 h-11 ${
                   isActive ? 'bg-white text-black' : 'text-white hover:text-black hover:bg-white'
                 }`}
                title={collapsed ? item.label : ''}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      {currentUser && !collapsed && (
         <div className="p-4 border-t border-black">
           <p className="text-sm font-semibold text-white truncate">{currentUser.full_name}</p>
           <p className="text-xs text-white truncate">{currentUser.role}</p>
         </div>
       )}
    </aside>
  );
}