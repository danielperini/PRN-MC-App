import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Building2,
  FileText,
  Users,
  Paperclip,
  Settings,
  HelpCircle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  ShoppingCart,
  Newspaper,
  ChevronDown,
  Images,
  ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import SuggestionForm from '@/components/sidebar/SuggestionForm';
import { HelpWrapper } from '@/components/help/withContextualHelp';
import { isCoordenador as checkCoordenador, canManageUsers } from '@/components/auth/permissions';

export default function Sidebar({ currentPageName, collapsed, onToggle, currentUser }) {
  const [customPerms, setCustomPerms] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    let active = true;

    async function loadPermissions() {
      if (!currentUser?.email) {
        if (active) setCustomPerms(null);
        return;
      }

      try {
        const perms = await base44.entities.UserPermission.filter({
          user_email: currentUser.email,
        });
        if (active) setCustomPerms(perms?.[0] || null);
      } catch (error) {
        console.error('Erro ao carregar permissões do usuário:', error);
        if (active) setCustomPerms(null);
      }
    }

    loadPermissions();

    return () => {
      active = false;
    };
  }, [currentUser?.email]);

  const coord = checkCoordenador(currentUser);
  const canManageUsersFlag =
    canManageUsers(currentUser) || customPerms?.can_manage_users === true;

  const canViewMenu = (requiredPerm) => {
    if (!coord) return true;
    if (!customPerms) return true;
    return customPerms[requiredPerm] !== false;
  };

  const toggleSection = (sectionName) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
  };

  const navSections = [
    {
      items: [
        {
          name: 'Dashboard',
          icon: BarChart3,
          label: 'Dashboard',
          show: true,
        },
      ],
    },
    {
      label: 'Trabalho',
      items: [
        {
          name: 'Relatorios',
          icon: FileText,
          label: 'Relatórios',
          show: true,
        },
        {
          name: 'Compras',
          icon: ShoppingCart,
          label: 'Compras e Pagamentos',
          show: true,
        },
      ],
    },
    {
      label: 'Ferramentas',
      items: [
        {
          name: 'GeradorListaPresenca',
          icon: FileText,
          label: 'Gerador de lista de presença',
          show: true,
        },
        {
          name: 'GeradorTermoCompromisso',
          icon: ScrollText,
          label: 'Gerador de termo de compromisso',
          show: true,
        },
      ],
    },
    {
      label: 'Gestão',
      items: [
        {
          name: 'MeusDados',
          icon: Users,
          label: 'Meus dados',
          show: true,
        },
        {
          name: 'RubricasPorMuseu',
          icon: Building2,
          label: 'Rubricas por museu',
          show: true,
        },
        {
          name: 'UserManagement',
          icon: Users,
          label: 'Usuários',
          show: canManageUsersFlag,
        },
        {
          name: 'GestorArquivos',
          icon: Paperclip,
          label: 'Arquivos',
          show: true,
        },
        {
          name: 'GaleriaFotos',
          icon: Images,
          label: 'Galeria',
          show: true,
        },
        {
          name: 'PlataformaAdmin',
          icon: Settings,
          label: 'Plataforma',
          show: coord && canViewMenu('can_manage_platform'),
          submenu: [
            { name: 'PlataformaAdmin', label: 'Painel' },
            { name: 'PlataformaConfig', label: 'Configurações' },
            { name: 'BaseConhecimento', label: 'Conhecimento' },
          ],
        },
      ],
    },
    {
      label: 'Recursos',
      items: [
        {
          name: 'AssistentePlanejamento',
          icon: HelpCircle,
          label: 'Assistente IA',
          show: true,
        },
        {
          name: 'Manual',
          icon: BookOpen,
          label: 'Manual e Ajuda',
          show: true,
        },
        {
          name: 'LeitorNoticias',
          icon: Newspaper,
          label: 'Notícias',
          show: true,
        },
      ],
    },
  ]
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.show),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={`hidden lg:flex min-h-full self-stretch bg-[#111111] text-white flex-col border-r border-white/10 transition-all duration-300 ${
        collapsed ? 'w-[76px]' : 'w-[290px]'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white font-semibold">
              MC
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">Museus Centro</div>
              <div className="text-[11px] text-white/60 truncate">Relatório Mensal</div>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="text-white/70 hover:text-white hover:bg-white/10"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2">
        {navSections.map((section, idx) => (
          <div key={`${section.label || 'section'}-${idx}`} className="mb-4">
            {!collapsed && section.label && (
              <div className="px-3 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">
                {section.label}
              </div>
            )}

            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageName === item.name;
                const isExpanded = expandedSections[item.name];
                const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;

                if (hasSubmenu) {
                  return (
                    <div key={item.name}>
                      <Button
                        variant="ghost"
                        onClick={() => toggleSection(item.name)}
                        className={`w-full justify-start gap-2 rounded-xl px-3 h-11 ${
                          isActive
                            ? 'bg-white text-black'
                            : 'text-white/70 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {!collapsed && (
                          <ChevronDown
                            className={`w-4 h-4 ml-auto transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </Button>

                      {isExpanded && !collapsed && (
                        <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                          {item.submenu.map((sub) => (
                            <Link key={sub.name} to={createPageUrl(sub.name)}>
                              <Button
                                variant="ghost"
                                className={`w-full justify-start rounded-lg px-3 h-9 ${
                                  currentPageName === sub.name
                                    ? 'bg-white text-black'
                                    : 'text-white/70 hover:text-white hover:bg-white/10'
                                }`}
                              >
                                {sub.label}
                              </Button>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link key={item.name} to={createPageUrl(item.name)}>
                    <Button
                      variant="ghost"
                      className={`w-full justify-start gap-2 rounded-xl px-3 h-11 ${
                        isActive
                          ? 'bg-white text-black'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!collapsed && (
        <div className="border-t border-white/10 p-3 space-y-3">
          <HelpWrapper>
            <SuggestionForm />
          </HelpWrapper>
        </div>
      )}
    </aside>
  );
}