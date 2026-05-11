import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
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
import { isCoordenador, canManageUsers } from '@/components/auth/permissions';
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
        label: 'Entrada Única',
        icon: Inbox,
        roles: ['all'],
      },
      {
        path: 'Compras',
        label: 'Financeiro',
        icon: ShoppingCart,
        roles: ['all'],
      },
      {
        path: 'Relatorios',
        label: 'Relatórios',
        icon: FileText,
        roles: ['all'],
      },
      {
        path: 'CoordReview',
        label: 'Aprovação de Relatórios',
        icon: Eye,
        roles: ['coord', 'admin'],
      },
      {
        path: 'Agenda',
        label: 'Agenda Museu Centro',
        icon: CalendarDays,
        roles: ['all'],
      },
      {
        path: 'RubricasPorMuseu',
        label: 'Rubricas por Museu',
        icon: DollarSign,
        roles: ['coord', 'admin'],
      },
    ],
  },

  {
    label: 'Comunicação',
    items: [
      {
        path: 'ComunicacaoVisibilidade',
        label: 'Comunicação',
        icon: Newspaper,
        roles: ['all'],
      },
      {
        path: 'GaleriaFotos',
        label: 'Galeria',
        icon: Image,
        roles: ['all'],
      },
      {
        path: 'ProgramacaoEspelho',
        label: 'Programação e Divulgação',
        subtitle:
          'Links • Minibios • Divulgação • Imagens aprovadas',
        icon: Star,
        roles: ['all'],
      },
      {
        path: 'LeitorNoticias',
        label: 'Notícias',
        icon: Newspaper,
        roles: ['all'],
      },
    ],
  },

  {
    label: 'Ferramentas',
    items: [
      {
        path: 'AssistentePlanejamento',
        label: 'Assistente IA',
        icon: Bot,
        roles: ['all'],
      },
      {
        path: 'GeradorListaPresenca',
        label: 'Lista de Presença',
        icon: CheckSquare,
        roles: ['all'],
      },
      {
        path: 'GeradorTermoCompromisso',
        label: 'Termo de Compromisso',
        icon: FileText,
        roles: ['coord', 'admin'],
      },
      {
        path: 'Manual',
        label: 'Manual e Ajuda',
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
        roles: ['coord', 'admin'],
      },
      {
        path: 'UserManagement',
        label: 'Usuários',
        icon: Users,
        roles: ['coord', 'admin'],
        permission: 'canManageUsers',
      },
      {
        path: 'PlataformaAdmin',
        label: 'Plataforma',
        icon: Settings,
        roles: ['admin'],
        permission: 'canManagePlatform',
      },
    ],
  },

  {
    label: 'Conta',
    items: [
      {
        path: 'MeusDados',
        label: 'Meus Dados',
        icon: User,
        roles: ['all'],
      },
      {
        path: 'Aparencia',
        label: 'Aparência',
        icon: Palette,
        roles: ['all'],
      },
    ],
  },
];

function NavItem({ item, currentPageName, collapsed }) {
  const Icon = item.icon;
  const isActive = currentPageName === item.path;

  return (
    <SidebarTooltip label={item.label} collapsed={collapsed}>
      <Link
        to={`/${item.path}`}
        title={collapsed ? item.label : undefined}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group ${
          isActive
            ? 'bg-white text-slate-900'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <Icon
          className={`w-4 h-4 flex-shrink-0 ${
            isActive
              ? 'text-slate-900'
              : 'text-slate-500 group-hover:text-white'
          }`}
        />

        {!collapsed && (
          <div className="min-w-0">
            <span className="truncate block leading-tight">
              {item.label}
            </span>

            {item.subtitle && (
              <span className="text-[10px] truncate block leading-tight mt-0.5 text-slate-500">
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
  const isCoord = isCoordenador(currentUser, userPermission);
  const isAdmin = role === 'admin' || role === 'ADMIN';

  const baseRole = userPermission?.base_role || '';
  const isObservador =
    baseRole === 'OBSERVADOR' || role === 'OBSERVADOR';

  function shouldShowItem(item) {
    if (isObservador) {
      return [
        'Dashboard',
        'LeitorNoticias',
        'Agenda',
        'ComunicacaoVisibilidade',
        'GaleriaFotos',
      ].includes(item.path);
    }

    if (item.permission === 'canManageUsers') {
      return canManageUsers(currentUser);
    }

    if (item.permission === 'canManagePlatform') {
      return isAdmin;
    }

    if (item.roles.includes('all')) return true;
    if (item.roles.includes('admin') && isAdmin) return true;
    if (item.roles.includes('coord') && isCoord) return true;
    if (item.roles.includes('prof') && !isCoord && !isAdmin) return true;

    return false;
  }

  return <div />;
}
