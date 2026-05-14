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
} from 'lucide-react';

import { base44 } from '@/api/base44Client';
import {
  isCoordenador,
  isObservador,
  isPatrocinador,
  canManageUsers,
  SIDEBAR_OBSERVADOR,
  SIDEBAR_PROFISSIONAL,
} from '@/components/auth/permissions';
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
    label: '',
    items: [
      {
        path: 'ChecklistProducao',
        label: 'Checklist de Produção',
        icon: CheckSquare,
        roles: ['coord', 'admin'],
        hideForObservador: true,
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

function NavItem({ item, currentPageName, collapsed }) {
  const Icon = item.icon;
  const isActive = currentPageName === item.path;

  const currentTheme = document?.documentElement?.getAttribute('data-theme') || 'atual';

  const isDarkTheme =
    currentTheme === 'atual' ||
    currentTheme === 'nuit';

  const activeClasses = isDarkTheme
    ? 'bg-secondary text-secondary-foreground border border-border'
    : 'bg-primary text-primary-foreground border border-border';

  return (
    <SidebarTooltip label={item.label} collapsed={collapsed}>
      <Link
        to={`/${item.path}`}
        title={collapsed ? item.label : undefined}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group ${
          isActive
            ? activeClasses
            : 'text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground'
        }`}
      >
        <Icon
          className={`w-4 h-4 flex-shrink-0 ${
            isActive
              ? isDarkTheme
                ? 'text-secondary-foreground'
                : 'text-primary-foreground'
              : 'text-primary-foreground group-hover:text-primary-foreground'
          }`}
        />

        {!collapsed && (
          <div className="min-w-0">
            <span
              className={`truncate block leading-tight ${
                isActive
                  ? isDarkTheme
                    ? 'text-secondary-foreground'
                    : 'text-primary-foreground'
                  : 'text-primary-foreground'
              }`}
            >
              {item.label}
            </span>

            {item.subtitle && (
              <span
                className={`text-[10px] truncate block leading-tight mt-0.5 ${
                  isActive
                    ? isDarkTheme
                      ? 'text-muted-foreground'
                      : 'text-primary-foreground/80'
                    : 'text-muted-foreground'
                }`}
              >
                {item.subtitle}
              </span>
            )}
          </div>
        )}
      </Link>
    </SidebarTooltip>
  );
}

export default function Sidebar({
  currentPageName,
  collapsed,
  onToggle,
  currentUser,
}) {
  const [userPermission, setUserPermission] = useState(null);

  useEffect(() => {
    async function loadPermission() {
      if (!currentUser?.email) return;

      try {
        const perms = await base44.entities.UserPermission.filter({
          user_email: currentUser.email,
        });

        setUserPermission(perms?.[0] || null);
      } catch {
        setUserPermission(null);
      }
    }

    loadPermission();
  }, [currentUser?.email]);

  const role = currentUser?.role || '';
  const isCoord = isCoordenador(currentUser);
  const isAdmin = role === 'admin' || role === 'ADMIN';
  const isObs = isObservador(currentUser, userPermission) || isPatrocinador(currentUser);

  function shouldShowItem(item) {
    // COORDENADOR: vê tudo (exceto itens com permission específica sem acesso)
    if (isCoord) {
      if (item.permission === 'canManageUsers') return canManageUsers(currentUser);
      if (item.permission === 'canManagePlatform') return isAdmin || isCoord;
      return true;
    }

    // OBSERVADOR / PATROCINADOR: lista restrita
    if (isObs) {
      if (item.hideForObservador) return false;
      return SIDEBAR_OBSERVADOR.has(item.path);
    }

    // PROFISSIONAL: lista definida no permissions.js
    if (item.permission === 'canManageUsers') return false;
    if (item.permission === 'canManagePlatform') return false;
    if (item.roles.includes('coord') && !item.roles.includes('all')) return false;
    if (item.roles.includes('admin') && !item.roles.includes('all')) return false;
    return SIDEBAR_PROFISSIONAL.has(item.path);
  }

  return (
    <div
      className={`flex flex-col bg-primary border-r border-border transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      } min-h-screen`}
    >
      <div
        className={`flex items-center justify-between px-3 py-4 border-b border-border ${
          collapsed ? 'flex-col gap-2' : ''
        }`}
      >
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-xs font-bold text-primary-foreground leading-tight">
              Museus Centro
            </span>

            <span className="text-[10px] text-primary-foreground/70">
              Plataforma de Gestão
            </span>
          </div>
        )}

        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(shouldShowItem);

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label}>
              {!collapsed && group.label && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-primary-foreground/60 uppercase tracking-wider">
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
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div
        className={`border-t border-border px-3 py-3 ${
          collapsed ? 'flex justify-center' : ''
        }`}
      >
        <Link
          to="/Perfil"
          className="flex items-center gap-2 text-sm text-primary-foreground hover:text-primary-foreground transition-colors"
          title={collapsed ? currentUser?.full_name || 'Perfil' : undefined}
        >
          <div className="w-7 h-7 rounded-full bg-primary/80 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-primary-foreground">
              {(
                currentUser?.full_name ||
                currentUser?.email ||
                '?'
              )[0].toUpperCase()}
            </span>
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary-foreground truncate">
                {currentUser?.full_name || 'Usuário'}
              </p>

              <p className="text-[10px] text-primary-foreground/70 truncate">
                {currentUser?.email || ''}
              </p>
            </div>
          )}
        </Link>
      </div>
    </div>
  );
}