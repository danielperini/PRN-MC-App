import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  Folder,
  Image,
  Settings,
  Bot,
  User,
  Newspaper,
  HelpCircle,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckSquare,
  DollarSign,
  Star,
  Eye,
  Inbox,
  MessageSquare,
  Palette,
  ShieldCheck,
} from 'lucide-react';

import { base44 } from '@/api/base44Client';
import {
  isCoordenador,
  isObservador,
  isPatrocinador,
  canManageUsers,
  SIDEBAR_OBSERVADOR,
  SIDEBAR_PATROCINADOR,
  SIDEBAR_PROFISSIONAL,
} from '@/components/auth/permissions';
import { normalizeEmail } from '@/utils/auth/recoverExistingUserAccess';
import { requestDashboardPriorityRefresh } from '@/utils/dashboardRefresh';
import SidebarTooltip from './SidebarTooltip';

const NAV_GROUPS = [
  {
    label: '',
    items: [
      {
        path: 'Dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        roles: ['all'],
      },
    ],
  },
  {
    label: 'Operação',
    items: [
      {
        path: 'EntradaUnica',
        label: 'Entrada de Documentos',
        icon: Inbox,
        roles: ['all'],
      },
      {
        path: 'CoordReview',
        label: 'Revisão de relatórios',
        icon: Eye,
        roles: ['coord', 'admin'],
        hideForObservador: true,
      },
      {
        path: 'Relatorios',
        label: 'Relatórios',
        icon: FileText,
        roles: ['all'],
      },
    ],
  },
  {
    label: 'Visão geral',
    items: [
      {
        path: 'ComunicacaoVisibilidade',
        label: 'Comunicação',
        icon: Newspaper,
        roles: ['all'],
      },
      {
        path: 'Agenda',
        label: 'Agenda Museu Centro',
        icon: CalendarDays,
        roles: ['all'],
      },
      {
        path: 'GaleriaFotos',
        label: 'Galeria',
        icon: Image,
        roles: ['all'],
      },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      {
        path: 'Compras',
        label: 'Compras e Aprovações',
        icon: ShoppingCart,
        roles: ['all'],
        hideForObservador: true,
      },
      {
        path: 'RubricasPorMuseu',
        label: 'Orçamento por Museu',
        icon: DollarSign,
        roles: ['all'],
      },
    ],
  },
  {
    label: 'Conteúdo',
    items: [
      {
        path: 'LeitorNoticias',
        label: 'Notícias',
        icon: Newspaper,
        roles: ['all'],
      },
      {
        path: 'ProgramacaoEspelho',
        label: 'Programação Completa',
        subtitle:
          'Link de imagens • Minibios • Material de divulgação aprovado',
        icon: Star,
        roles: ['all'],
      },
      {
        path: 'AssistentePlanejamento',
        label: 'Assistente IA',
        icon: Bot,
        roles: ['all'],
      },
      {
        path: 'Manual',
        label: 'Central de Ajuda',
        icon: HelpCircle,
        roles: ['all'],
      },
    ],
  },
  {
    label: 'Administração',
    items: [
      {
        path: 'Mensagens',
        label: 'Mensagens',
        icon: MessageSquare,
        roles: ['all'],
        hideForObservador: true,
      },
      {
        path: 'UserManagement',
        label: 'Gestão de Usuários',
        icon: Users,
        roles: ['coord', 'admin'],
        permission: 'canManageUsers',
      },
      {
        path: 'AuditoriaInstitucional',
        label: 'Auditoria Institucional',
        icon: ShieldCheck,
        roles: ['coord', 'admin'],
      },
      {
        path: 'PlataformaAdmin',
        label: 'Administração do Sistema',
        icon: Settings,
        roles: ['admin'],
        permission: 'canManagePlatform',
      },
      {
        path: 'Aparencia',
        label: 'Aparência',
        icon: Palette,
        roles: ['all'],
      },
      {
        path: 'MeusDados',
        label: 'Meus dados',
        icon: User,
        roles: ['all'],
      },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      {
        path: 'GeradorListaPresenca',
        label: 'Gerador de lista de presença',
        icon: CheckSquare,
        roles: ['all'],
      },
      {
        path: 'GeradorTermoCompromisso',
        label: 'Gerador de termo de compromisso',
        icon: FileText,
        roles: ['all'],
        hideForObservador: true,
      },
    ],
  },
];

const SPONSOR_NAV_GROUPS = [
  {
    label: '',
    items: [
      { path: 'DashboardPatrocinador', label: 'Dashboard', icon: LayoutDashboard, roles: ['all'] },
    ],
  },
  {
    label: 'Institucional',
    items: [
      { path: 'ComunicacaoVisibilidade', label: 'Comunicação', icon: Newspaper, roles: ['all'] },
      { path: 'Agenda', label: 'Agenda Museu Centro', icon: CalendarDays, roles: ['all'] },
      { path: 'MuseusNoMapa', label: 'Agenda por Museu', icon: CalendarDays, roles: ['all'] },
      { path: 'ProgramacaoEspelho', label: 'Programação Completa', icon: Star, roles: ['all'] },
      { path: 'GaleriaFotos', label: 'Galeria', icon: Image, roles: ['all'] },
    ],
  },
  {
    label: 'Indicadores',
    items: [
      { path: 'RubricasPorMuseu', label: 'Orçamento por Museu', icon: DollarSign, roles: ['all'] },
    ],
  },
  {
    label: 'Conta',
    items: [
      { path: 'Mensagens', label: 'Mensagens', icon: MessageSquare, roles: ['all'] },
      { path: 'Manual', label: 'Central de Ajuda', icon: HelpCircle, roles: ['all'] },
      { path: 'Aparencia', label: 'Aparência', icon: Palette, roles: ['all'] },
      { path: 'MeusDados', label: 'Meus Dados', icon: User, roles: ['all'] },
    ],
  },
];

function NavItem({ item, isActive, collapsed, userPermission, user }) {
  const Icon = item.icon;
  const isDashboardLink = item.path === 'Dashboard' || item.path === 'DashboardPatrocinador';

  return (
    <SidebarTooltip label={item.path} collapsed={collapsed}>
      <Link
        to={`/${item.path}`}
        onClick={() => {
          if (isDashboardLink) {
            requestDashboardPriorityRefresh('sidebar-dashboard-click');
          }
        }}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group relative
          ${isActive
            ? 'bg-secondary text-secondary-foreground font-semibold'
            : 'text-primary-foreground/70 hover:bg-primary/80 hover:text-primary-foreground'
          }
          ${collapsed ? 'justify-center px-2' : ''}
        `}
        title={collapsed ? item.label : undefined}
      >
        <Icon className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
        {!collapsed && (
          <span className="truncate leading-tight">{item.label}</span>
        )}
      </Link>
    </SidebarTooltip>
  );
}

export default function Sidebar({ currentPageName, collapsed, onToggle, currentUser }) {
  const [userPermission, setUserPermission] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function loadPerm() {
      if (!currentUser?.email) return;
      try {
        const perms = await base44.entities.UserPermission.filter({ user_email: normalizeEmail(currentUser.email) });
        if (mounted) setUserPermission(perms?.[0] || null);
      } catch {
        if (mounted) setUserPermission(null);
      }
    }
    loadPerm();
    return () => { mounted = false; };
  }, [currentUser?.email]);

  const currentUserWithPermission = currentUser ? { ...currentUser, base_role: userPermission?.base_role || currentUser.base_role } : null;
  const coord = isCoordenador(currentUserWithPermission);
  const sponsor = isPatrocinador(currentUserWithPermission);
  const obs = isObservador(currentUserWithPermission, userPermission);
  const externalReadOnly = sponsor || obs;
  const sourceGroups = externalReadOnly ? SPONSOR_NAV_GROUPS : NAV_GROUPS;

  const filteredGroups = sourceGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (externalReadOnly) {
        return SIDEBAR_PATROCINADOR.has(item.path);
      }
      if (item.hideForObservador && obs) return false;
      if (item.permission === 'canManageUsers' && !canManageUsers(currentUser, userPermission)) return false;
      if (item.permission === 'canManagePlatform' && currentUser?.role !== 'admin') return false;
      if (item.roles?.includes('admin') && !item.roles?.includes('all') && currentUser?.role !== 'admin') return false;
      if (item.roles?.includes('coord') && !item.roles?.includes('all') && !coord && currentUser?.role !== 'admin') return false;

      // Observador: mostrar apenas items permitidos
      if (obs) {
        return SIDEBAR_OBSERVADOR.has(item.path);
      }
      return true;
    }),
  })).filter(group => group.items.length > 0);

  return (
    <aside
      className={`bg-primary text-primary-foreground flex flex-col transition-all duration-300 ease-in-out flex-shrink-0
        ${collapsed ? 'w-16' : 'w-56'}
      `}
      style={{ minHeight: '100vh' }}
    >
      {/* Header */}
      <div className={`flex items-center border-b border-primary-foreground/10 flex-shrink-0
        ${collapsed ? 'justify-center py-4 px-2' : 'justify-between py-4 px-4'}
      `}>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-xs font-bold text-primary-foreground/90 truncate leading-tight">
              Museus Centro
            </p>
            <p className="text-[10px] text-primary-foreground/50 truncate">Gestão Integrada</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-primary-foreground/10 text-primary-foreground/60 hover:text-primary-foreground transition-colors flex-shrink-0"
          title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {filteredGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && !collapsed && (
              <p className="text-[10px] uppercase tracking-widest text-primary-foreground/30 px-2 mb-1 font-semibold">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavItem
                  key={`${item.path}-${item.label}`}
                  item={item}
                  isActive={currentPageName === item.path}
                  collapsed={collapsed}
                  userPermission={userPermission}
                  user={currentUser}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer user */}
      {currentUser && (
        <div className={`border-t border-primary-foreground/10 py-3 px-2 flex-shrink-0
          ${collapsed ? 'flex justify-center' : ''}
        `}>
          <Link
            to="/Perfil"
            className={`flex items-center gap-2 rounded-lg p-2 hover:bg-primary-foreground/10 transition-colors w-full
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <div className="w-7 h-7 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary-foreground">
                {(currentUser.full_name || currentUser.email || '?')[0].toUpperCase()}
              </span>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium text-primary-foreground truncate leading-tight">
                  {currentUser.full_name || currentUser.email}
                </p>
                <p className="text-[10px] text-primary-foreground/50 truncate">
                  {currentUser.role || 'user'}
                </p>
              </div>
            )}
          </Link>
        </div>
      )}
    </aside>
  );
}
