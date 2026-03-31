import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  Folder,
  Image,
  ClipboardList,
  Settings,
  Bot,
  User,
  BookOpen,
  Newspaper,
  HelpCircle,
  ShoppingCart,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  BarChart3,
  Map,
  CheckSquare,
  Receipt,
  DollarSign,
  PieChart,
  Star,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { isCoordenador, canManageUsers } from '@/components/auth/permissions';

const NAV_GROUPS = [
  {
    label: '',
    items: [
      { path: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['all'] },
    ],
  },
  {
    label: 'Trabalho',
    items: [
      { path: 'Relatorios', label: 'Relatórios', icon: FileText, roles: ['all'] },
      { path: 'Compras', label: 'Compras e Pagamentos', icon: ShoppingCart, roles: ['all'] },
    ],
  },
  {
    label: 'Museu Centro',
    items: [
      { path: 'Agenda', label: 'Agenda Museu Centro', icon: CalendarDays, roles: ['all'] },
      { path: 'GaleriaFotos', label: 'Galeria', icon: Image, roles: ['all'] },
      { path: 'RubricasPorMuseu', label: 'Rubricas por museu', icon: DollarSign, roles: ['coord', 'admin'] },
      { path: 'GestorArquivos', label: 'Arquivos', icon: Folder, roles: ['all'] },
      { path: 'ProgramacaoEspelho', label: 'Informações Completas da Programação', subtitle: 'Link de imagens • Minibios • Material de divulgação aprovado', icon: Star, roles: ['all'] },
    ],
  },
  {
    label: 'Meus dados',
    items: [
      { path: 'MeusDados', label: 'Meus dados', icon: User, roles: ['all'] },
      { path: 'UserManagement', label: 'Usuários', icon: Users, roles: ['coord', 'admin'], permission: 'canManageUsers' },
      { path: 'PlataformaAdmin', label: 'Plataforma', icon: Settings, roles: ['admin'], permission: 'canManagePlatform' },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      { path: 'GeradorListaPresenca', label: 'Gerador de lista de presença', icon: CheckSquare, roles: ['all'] },
      { path: 'GeradorTermoCompromisso', label: 'Gerador de termo de compromisso', icon: FileText, roles: ['coord', 'admin'] },
    ],
  },
  {
    label: 'Recursos',
    items: [
      { path: 'AssistentePlanejamento', label: 'Assistente IA', icon: Bot, roles: ['all'] },
      { path: 'Manual', label: 'Manual e Ajuda', icon: HelpCircle, roles: ['all'] },
      { path: 'LeitorNoticias', label: 'Notícias', icon: Newspaper, roles: ['all'] },
    ],
  },
];

function NavItem({ item, currentPageName, collapsed, userPermission }) {
  const Icon = item.icon;
  const isActive = currentPageName === item.path;

  return (
    <Link
      to={`/${item.path}`}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group ${
        isActive
          ? 'bg-slate-900 text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-700'}`} />
      {!collapsed && (
        <div className="min-w-0">
          <span className="truncate block leading-tight">{item.label}</span>
          {item.subtitle && (
            <span className={`text-[10px] truncate block leading-tight mt-0.5 ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
              {item.subtitle}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export default function Sidebar({ currentPageName, collapsed, onToggle, currentUser }) {
  const [userPermission, setUserPermission] = useState(null);

  useEffect(() => {
    async function loadPermission() {
      if (!currentUser?.email) return;
      try {
        const perms = await base44.entities.UserPermission.filter({ user_email: currentUser.email });
        setUserPermission(perms?.[0] || null);
      } catch {
        setUserPermission(null);
      }
    }
    loadPermission();
  }, [currentUser?.email]);

  const role = currentUser?.role || '';
  const isCoord = isCoordenador(currentUser, userPermission);
  const isAdmin = role === 'admin' || role === 'ADMIN';

  function shouldShowItem(item) {
    if (item.roles.includes('all')) return true;
    if (item.roles.includes('admin') && isAdmin) return true;
    if (item.roles.includes('coord') && isCoord) return true;
    if (item.roles.includes('prof') && !isCoord && !isAdmin) return true;

    if (item.permission === 'canManageUsers') return canManageUsers(currentUser);
    if (item.permission === 'canViewAuditLog') return isCoord || isAdmin;
    if (item.permission === 'canManagePlatform') return isAdmin;

    return false;
  }

  return (
    <div
      className={`flex flex-col bg-white border-r border-slate-200 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      } min-h-screen`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-4 border-b border-slate-100 ${collapsed ? 'flex-col gap-2' : ''}`}>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-900 leading-tight">Museus Centro</span>
            <span className="text-[10px] text-slate-400">Plataforma de Gestão</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(shouldShowItem);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavItem
                    key={item.path}
                    item={item}
                    currentPageName={currentPageName}
                    collapsed={collapsed}
                    userPermission={userPermission}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className={`border-t border-slate-100 px-3 py-3 ${collapsed ? 'flex justify-center' : ''}`}>
        <Link
          to="/Perfil"
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          title={collapsed ? currentUser?.full_name || 'Perfil' : undefined}
        >
          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-slate-600">
              {(currentUser?.full_name || currentUser?.email || '?')[0].toUpperCase()}
            </span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-800 truncate">{currentUser?.full_name || 'Usuário'}</p>
              <p className="text-[10px] text-slate-400 truncate">{currentUser?.email || ''}</p>
            </div>
          )}
        </Link>
      </div>
    </div>
  );
}