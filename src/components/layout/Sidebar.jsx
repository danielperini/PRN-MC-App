import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  Folder,
  Image,
  Settings,
  User,
  Newspaper,
  HelpCircle,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  DollarSign,
  Star,
  Eye,
  Inbox,
  MessageSquare,
  Palette,
  ShieldCheck,
  ScrollText,
  Banknote,
  HardDrive,
  ExternalLink,
  ChevronUp,
  UserCog,
  LogOut,
  Bot,
  UsersRound,
} from 'lucide-react';

import { base44 } from '@/api/base44Client';
import {
  isCoordenador,
  isObservador,
  isPatrocinador,
  canManageUsers,
  COORD_GERAL_EMAILS,
  SIDEBAR_OBSERVADOR,
  SIDEBAR_PATROCINADOR,
  SIDEBAR_PROFISSIONAL,
} from '@/components/auth/permissions';
import { normalizeEmail } from '@/utils/auth/recoverExistingUserAccess';
import { requestDashboardPriorityRefresh } from '@/utils/dashboardRefresh';
import SidebarTooltip from './SidebarTooltip';
import { artigoSala } from '@/utils/generoUtils';

const NAV_GROUPS_BASE = [
  {
    label: '',
    items: [
      { path: 'Dashboard', label: 'Painel', icon: LayoutDashboard, roles: ['all'] },
    ],
  },
  {
    label: 'Meu Trabalho',
    items: [
      { path: 'MeusDados', label: 'Meus Dados', icon: User, roles: ['all'] },
      { path: 'Perfil', label: 'Perfil', icon: User, roles: ['all'] },
      { path: 'Manual', label: 'Ajuda', icon: HelpCircle, roles: ['all'] },
      { path: 'Aparencia', label: 'Aparência', icon: Palette, roles: ['all'] },
    ],
  },
  {
    label: 'Documentos',
    items: [
      { path: 'EntradaUnica', label: 'Entrada de Docs', icon: Inbox, roles: ['all'] },
    ],
  },
  {
    label: 'Atividades e Programação',
    items: [
      { path: 'Agenda', label: 'Agenda', icon: CalendarDays, roles: ['all'] },
      { path: 'AssistentePlanejamento', label: 'Assistente IA', icon: Bot, roles: ['all'] },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { path: 'Relatorios', label: 'Relatórios', icon: FileText, roles: ['all'] },
      { path: 'RelatorioExecucaoObjeto', label: 'Rel. Execução', icon: ScrollText, roles: ['coord', 'admin'] },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { path: 'Compras', label: 'Compras', icon: ShoppingCart, roles: ['all'], hideForObservador: true },
      { path: 'RubricasPorMuseu', label: 'Orçamento', icon: DollarSign, roles: ['all'] },
      { path: 'Movimentacoes', label: 'Movimentações', icon: Banknote, roles: ['coord', 'admin'] },
      { path: 'Equipe', label: 'Equipe', icon: UsersRound, roles: ['all'], hideForObservador: true, hideForPatrocinador: true },
    ],
  },
  {
    label: 'Galeria e Comunicação',
    items: [
      { path: 'GaleriaFotos', label: 'Galeria', icon: Image, roles: ['all'] },
      { path: 'ComunicacaoVisibilidade', label: 'Comunicação', icon: Newspaper, roles: ['all'] },
      { path: 'LeitorNoticias', label: 'Notícias', icon: Newspaper, roles: ['all'] },
    ],
  },
  {
    label: 'Administração',
    items: [
      { path: 'Mensagens', label: 'Mensagens', icon: MessageSquare, roles: ['all'], hideForObservador: true },
      { path: 'UserManagement', label: 'Usuários', icon: Users, roles: ['coord', 'admin'], permission: 'canManageUsers' },
      { path: 'AuditoriaInstitucional', label: 'Auditoria', icon: ShieldCheck, roles: ['coord', 'admin'] },
      { path: 'PlataformaAdmin', label: 'Administração', icon: Settings, roles: ['admin'], permission: 'canManagePlatform' },
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
      { path: 'RubricasPorMuseu', label: 'Orçamento por Museu e Noturno', icon: DollarSign, roles: ['all'] },
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

function UserFooterMenu({ currentUser, collapsed }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const firstName = (currentUser?.full_name || currentUser?.email || '').split(' ')[0];
  const salaLabel = firstName ? `Sala ${artigoSala(firstName)} ${firstName}` : 'Meu Espaço';

  const menuItems = [
    { label: salaLabel, path: '/MeusDados', icon: UserCog },
  
    { label: 'Aparência', path: '/Aparencia', icon: Palette },
    { label: 'Ajuda', path: '/Manual', icon: HelpCircle },
  ];

  return (
    <div ref={ref} className={`border-t border-primary-foreground/10 py-3 px-2 flex-shrink-0 relative ${collapsed ? 'flex justify-center' : ''}`}>
      {open && !collapsed && (
        <div className="absolute bottom-full left-2 right-2 mb-1 bg-white rounded-lg shadow-lg border border-border overflow-hidden z-50">
          {menuItems.map(({ label, path, icon: Icon }) => (
            <button
              key={path}
              onClick={() => { navigate(path); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-slate-50 transition-colors"
            >
              <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
      {open && collapsed && (
        <div className="absolute bottom-full left-full ml-2 mb-0 bg-white rounded-lg shadow-lg border border-border overflow-hidden z-50 w-44">
          {menuItems.map(({ label, path, icon: Icon }) => (
            <button
              key={path}
              onClick={() => { navigate(path); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-slate-50 transition-colors"
            >
              <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg p-2 hover:bg-primary-foreground/10 transition-colors w-full ${collapsed ? 'justify-center' : ''}`}
      >
        <div className="w-7 h-7 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-primary-foreground">
            {(currentUser.full_name || currentUser.email || '?')[0].toUpperCase()}
          </span>
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-xs font-medium text-primary-foreground truncate leading-tight">
                {currentUser.full_name || currentUser.email}
              </p>
              <p className="text-[10px] text-primary-foreground/50 truncate">
                {currentUser.role || 'user'}
              </p>
            </div>
            <ChevronUp className={`w-3 h-3 text-primary-foreground/50 flex-shrink-0 transition-transform ${open ? '' : 'rotate-180'}`} />
          </>
        )}
      </button>
    </div>
  );
}

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

function getSalaLabel(fullName) {
  const firstName = (fullName || '').split(' ')[0];
  if (!firstName) return 'Meu Espaço';
  return `Sala ${artigoSala(firstName)} ${firstName}`;
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
  const userRoleNorm = String(currentUser?.role || '').toUpperCase();
  const externalReadOnly = sponsor || obs;

  // Label dinâmico "Sala da [Nome]"
  const salaLabel = getSalaLabel(currentUser?.full_name);

  const sourceGroups = externalReadOnly ? SPONSOR_NAV_GROUPS : NAV_GROUPS_BASE;

  // Substituir label "Meus Dados" pelo label dinâmico em todos os grupos
  const groupsWithDynamic = sourceGroups.map(group => ({
    ...group,
    items: group.items.map(item =>
      item.path === 'MeusDados' ? { ...item, label: salaLabel } : item
    ),
  }));

  const isCoordGeralFixo = COORD_GERAL_EMAILS.includes(String(currentUser?.email || '').toLowerCase());

  const filteredGroups = groupsWithDynamic.map(group => ({
    ...group,
    items: group.items.filter(item => {
      // Bypass absoluto para emails privilegiados — nunca bloqueados
      if (isCoordGeralFixo) return true;

      if (externalReadOnly) {
        return SIDEBAR_PATROCINADOR.has(item.path);
      }
      if (item.hideForObservador && obs) return false;
      if (item.hideForPatrocinador && sponsor) return false;
      if (item.permission === 'canManageUsers') {
        const isAdminRole = userRoleNorm === 'ADMIN' || userRoleNorm === 'COORDENADOR';
        if (!isAdminRole && !canManageUsers(currentUserWithPermission || currentUser, userPermission)) return false;
      }
      if (item.permission === 'canManagePlatform' && userRoleNorm !== 'ADMIN') return false;
      if (item.roles?.includes('admin') && !item.roles?.includes('all') && userRoleNorm !== 'ADMIN') return false;
      if (item.roles?.includes('coord') && !item.roles?.includes('all') && !coord && userRoleNorm !== 'ADMIN') return false;

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

      {/* Seção Drive — visível para coordenadores, admins e emails privilegiados */}
      {(isCoordGeralFixo || coord || obs || currentUser?.role === 'admin' || String(currentUser?.role || '').toUpperCase() === 'ADMIN') && (
        <div className="px-2 pb-2">
          {!collapsed && (
            <p className="text-[10px] uppercase tracking-widest text-primary-foreground/30 px-2 mb-1 font-semibold">
              Drive
            </p>
          )}
          <div className="space-y-0.5">
            {[
              {
                label: 'Notas Fiscais',
                url: 'https://drive.google.com/drive/folders/1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp',
                title: 'NFs organizadas por MM-YYYY',
              },
              {
                label: 'Relatórios Mensais',
                url: 'https://drive.google.com/drive/folders/1MuP2BxtlYPNBfcaDi6cFRhtAufj0cFWY',
                title: 'HTMLs por Museu/Período',
              },
              {
                label: 'Galeria de Fotos',
                url: 'https://drive.google.com/drive/folders/1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9',
                title: 'Fotos por Período/Museu/Atividade',
              },

            ].map(({ label, url, title }) => (
              <SidebarTooltip key={label} label={title} collapsed={collapsed}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={collapsed ? label : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 text-primary-foreground/70 hover:bg-primary/80 hover:text-primary-foreground ${collapsed ? 'justify-center px-2' : ''}`}
                >
                  <HardDrive className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
                  {!collapsed && (
                    <span className="truncate leading-tight flex-1">{label}</span>
                  )}
                  {!collapsed && <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-40" />}
                </a>
              </SidebarTooltip>
            ))}
          </div>
        </div>
      )}

      {/* Footer user */}
      {currentUser && (
        <UserFooterMenu currentUser={currentUser} collapsed={collapsed} />
      )}
    </aside>
  );
}