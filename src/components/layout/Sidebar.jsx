import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Building2, FileText, Users, Eye, Paperclip, Settings,
  HelpCircle, BarChart3, History, ChevronLeft, ChevronRight,
  CalendarDays, BookOpen, ShoppingCart, Newspaper,
  ChevronDown, Images, ScrollText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import SuggestionForm from '@/components/sidebar/SuggestionForm';
import { HelpWrapper } from '@/components/help/withContextualHelp';
import { isCoordGeral, isCoordenador as checkCoordenador, canManageUsers } from '@/components/auth/permissions';

export default function Sidebar({ currentPageName, collapsed, onToggle, currentUser }) {
  const [customPerms, setCustomPerms] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    if (currentUser?.email) {
      base44.entities.UserPermission.filter({ user_email: currentUser.email })
        .then(perms => setCustomPerms(perms?.[0] || null))
        .catch(() => setCustomPerms(null));
    }
  }, [currentUser?.email]);

  const coord = checkCoordenador(currentUser);
  const canManageUsersFlag = canManageUsers(currentUser) || customPerms?.can_manage_users === true;

  const canViewMenu = (requiredPerm) => {
    if (!coord) return true;
    if (!customPerms) return true;
    return customPerms[requiredPerm] !== false;
  };

  const navSections = [
    {
      items: [{ name: 'Dashboard', icon: BarChart3, label: 'Dashboard', show: true }]
    },
    {
      label: 'Trabalho',
      items: [
        { name: 'Relatorios', icon: FileText, label: 'Relatórios', show: true },
        { name: 'CalendarioAtividades', icon: CalendarDays, label: 'Agenda', show: true },
        { name: 'Compras', icon: ShoppingCart, label: 'Compras e Pagamentos', show: true }
      ]
    },
    {
      label: 'Gestão',
      items: [
        { name: 'UserManagement', icon: Users, label: 'Usuários', show: canManageUsersFlag },
        { name: 'GestorArquivos', icon: Paperclip, label: 'Arquivos', show: true },
        { name: 'GaleriaFotos', icon: Images, label: 'Galeria', show: true },

        {
          name: 'PlataformaAdmin',
          icon: Settings,
          label: 'Plataforma',
          show: coord && canViewMenu('can_manage_platform'),
          submenu: [
            { name: 'PlataformaAdmin', label: 'Painel' },
            { name: 'PlataformaConfig', label: 'Configurações' },
            { name: 'BaseConhecimento', label: 'Conhecimento' }
          ]
        }
      ]
    },
    {
      label: 'Recursos',
      items: [
        { name: 'AssistentePlanejamento', icon: HelpCircle, label: 'Assistente IA', show: true },
        { name: 'LeitorNoticias', icon: Newspaper, label: 'Notícias', show: true }
      ]
    }
  ].map(s => ({ ...s, items: s.items.filter(i => i.show) }))
   .filter(s => s.items.length > 0);

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-[#0b0b0c] border-r border-white/10 transition-all ${collapsed ? 'w-[72px]' : 'w-64'} flex flex-col`}>

      {/* LOGO */}
      <div className={`flex items-center h-16 border-b border-white/10 ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
        {!collapsed && (
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2">
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center">
              <Building2 className="w-4 h-4 text-black" />
            </div>
            <span className="text-white font-semibold text-sm">Museus Centro</span>
          </Link>
        )}

        <Button variant="ghost" size="icon" onClick={onToggle}>
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </Button>
      </div>

      {/* NAV */}
      <nav className="flex-1 px-2 py-3 space-y-2">

        {navSections.map((section, idx) => (
          <div key={idx}>

            {!collapsed && section.label && (
              <p className="text-[10px] uppercase text-white/30 px-3 mb-1">
                {section.label}
              </p>
            )}

            {section.items.map(item => {
              const Icon = item.icon;
              const isActive = currentPageName === item.name;
              const isExpanded = expandedSections[item.name];
              const hasSubmenu = item.submenu;

              return (
                <div key={item.name}>

                  {hasSubmenu ? (
                    <Button
                      variant="ghost"
                      onClick={() => setExpandedSections(p => ({ ...p, [item.name]: !p[item.name] }))}
                      className={`w-full justify-start gap-2 ${
                        isActive ? 'bg-white text-black' : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {!collapsed && item.label}
                      {!collapsed && <ChevronDown className="ml-auto w-4 h-4" />}
                    </Button>
                  ) : (
                    <Link to={createPageUrl(item.name)}>
                      <Button
                        variant="ghost"
                        className={`w-full justify-start gap-2 ${
                          isActive ? 'bg-white text-black' : 'text-white/70 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {!collapsed && item.label}
                      </Button>
                    </Link>
                  )}

                  {hasSubmenu && isExpanded && !collapsed && (
                    <div className="pl-4">
                      {item.submenu.map(sub => (
                        <Link key={sub.name} to={createPageUrl(sub.name)}>
                          <Button variant="ghost" className="w-full justify-start text-xs text-white/60 hover:text-white">
                            {sub.label}
                          </Button>
                        </Link>
                      ))}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        ))}

      </nav>

      {/* FOOTER */}
      <div className="border-t border-white/10 p-2">
        <SuggestionForm currentUser={currentUser} collapsed={collapsed} />
      </div>

    </aside>
  );
}
