import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Building2, FileText, Users, Eye, Paperclip, Settings, Shield,
  HelpCircle, BarChart3, History, ChevronLeft, ChevronRight,
  CalendarDays, Layers, BookOpen, ShoppingCart, Banknote, Target, Newspaper,
  Map, DollarSign, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import SuggestionForm from '@/components/sidebar/SuggestionForm';
import { HelpWrapper } from '@/components/help/withContextualHelp';

export default function Sidebar({ currentPageName, collapsed, onToggle, currentUser }) {
  const [customPerms, setCustomPerms] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    if (currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role)) {
      base44.entities.UserPermission.filter({ user_email: currentUser.email })
        .then(perms => setCustomPerms(perms?.[0] || null))
        .catch(() => setCustomPerms(null));
    }
  }, [currentUser?.email]);

  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const canViewMenu = (requiredPerm) => {
    if (!isCoordenador) return true;
    if (!customPerms) return true;
    return customPerms[requiredPerm] !== false;
  };

  const navSections = [
    {
      label: null,
      items: [
        { name: 'Dashboard', icon: BarChart3, label: 'Dashboard', show: true },
        { name: 'DashboardProfissional', icon: FileText, label: 'Meu Painel', show: !isCoordenador },
      ],
    },
    {
      label: 'Trabalho',
      items: [
        { name: 'Relatorios', icon: FileText, label: 'Relatórios', show: true },
        { name: 'NovaAtividade', icon: Layers, label: 'Atividades', show: true },
        { name: 'CalendarioAtividades', icon: CalendarDays, label: 'Agenda', show: true },
      ],
    },
    {
      label: 'Financeiro',
      items: [
        { name: 'Compras', icon: ShoppingCart, label: 'Compras e Equipe', show: true },
        { name: 'Fornecedores', icon: Building2, label: 'Fornecedores', show: isCoordenador },
        { name: 'PrestacaoDeContas', icon: FileText, label: 'Prestação de Contas', show: isCoordenador },
        { name: 'DashboardFinanceiro', icon: BarChart3, label: 'Dashboard Financeiro', show: isCoordenador && canViewMenu('gestao_compras') },
        { name: 'GestaoPagamentos', icon: Banknote, label: 'Pagamentos', show: isCoordenador },
        { name: 'ConsolidacaoFinanceira', icon: DollarSign, label: 'Consolidação Financeira', show: isCoordenador },
        { name: 'RelatorioMeta', icon: Target, label: 'Rel. por Meta', show: isCoordenador },
      ],
    },
    {
      label: 'Gestão',
      items: [
        { name: 'CoordReview', icon: Eye, label: 'Revisão', show: isCoordenador && canViewMenu('can_review_reports') },
        { name: 'UserManagement', icon: Users, label: 'Usuários', show: isCoordenador && canViewMenu('can_manage_users') },
        { name: 'GestorArquivos', icon: Paperclip, label: 'Arquivos', show: isCoordenador && canViewMenu('can_manage_files') },
        { name: 'ActivityLog', icon: History, label: 'Auditoria', show: isCoordenador },
        { name: 'PlataformaAdmin', icon: Settings, label: 'Plataforma', show: isCoordenador && canViewMenu('can_manage_platform') },
      ],
    },
    {
      label: 'Territorialidade',
      items: [
        { 
          name: 'MuseusNoMapa', 
          icon: Map, 
          label: 'Museus Centro no Mapa', 
          show: true,
          submenu: [
            { name: 'MhaabMap', label: 'MHAB' },
            { name: 'MisMap', label: 'MIS' },
            { name: 'MumoMap', label: 'MUMO' },
            { name: 'ViadutoMap', label: 'Viaduto das Artes' },
          ]
        },
      ],
    },
    {
      label: 'Recursos',
      items: [
        { name: 'AssistentePlanejamento', icon: HelpCircle, label: 'Assistente de IA do MC', show: true },
        { name: 'LeitorNoticias', icon: Newspaper, label: 'Curadoria Notícias', show: isCoordenador },
        { name: 'BaseConhecimento', icon: BookOpen, label: 'Conhecimento', show: currentUser?.role === 'admin' },
      ],
    },
  ].map(section => ({
    ...section,
    items: section.items.filter(i => i.show),
  })).filter(section => section.items.length > 0);

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-[#0a0a0a] border-r border-white/5 transition-all duration-300 z-40 flex flex-col ${
        collapsed ? 'w-[72px]' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-white/5 h-16 ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!collapsed && (
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-md">
              <Building2 className="w-4.5 h-4.5 text-black" />
            </div>
            <div>
              <span className="font-bold text-white text-base tracking-tight">Museus Centro</span>
              <p className="text-[10px] text-white/30 leading-none -mt-0.5">FMC / PBH</p>
            </div>
          </Link>
        )}
        {collapsed && (
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-md">
            <Building2 className="w-4 h-4 text-black" />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 text-white/40 hover:text-white hover:bg-white/10 rounded-lg ${collapsed ? 'absolute bottom-auto top-4 right-2' : ''}`}
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-thin">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className={sIdx > 0 ? 'mt-1' : ''}>
            {/* Section label */}
            {section.label && !collapsed && (
              <p className="text-[9px] uppercase tracking-[0.15em] text-white/25 font-semibold px-3 pt-3 pb-1.5 select-none">
                {section.label}
              </p>
            )}
            {section.label && collapsed && sIdx > 0 && (
              <div className="mx-auto w-8 border-t border-white/10 my-2" />
            )}

            {section.items.map(item => {
               const Icon = item.icon;
               const isActive = currentPageName === item.name || (item.submenu && item.submenu.some(s => s.name === currentPageName));
               const isExpanded = expandedSections[item.name];
               const hasSubmenu = item.submenu && item.submenu.length > 0;

               return (
                 <div key={item.name}>
                   <HelpWrapper
                     componentKey={`sidebar-${item.name.toLowerCase()}`}
                     label={item.label}
                     componentType="sidebar_item"
                     contextDescription={`Item de menu para acessar ${item.label}`}
                   >
                     {hasSubmenu ? (
                       <Button
                         variant="ghost"
                         onClick={() => setExpandedSections(p => ({ ...p, [item.name]: !p[item.name] }))}
                         className={`w-full h-9 gap-2.5 text-[13px] font-medium transition-all duration-150 ${
                           collapsed ? 'justify-center px-0' : 'justify-start px-3'
                         } ${
                           isActive
                             ? 'bg-white text-black shadow-sm'
                             : 'text-white/60 hover:text-white hover:bg-white/8'
                         }`}
                         title={collapsed ? item.label : ''}
                       >
                         <Icon className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
                         {!collapsed && <span>{item.label}</span>}
                         {!collapsed && hasSubmenu && (
                           <ChevronDown className={`ml-auto w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                         )}
                       </Button>
                     ) : (
                       <Link to={createPageUrl(item.name)} className="block">
                         <Button
                           variant="ghost"
                           className={`w-full h-9 gap-2.5 text-[13px] font-medium transition-all duration-150 ${
                             collapsed ? 'justify-center px-0' : 'justify-start px-3'
                           } ${
                             isActive
                               ? 'bg-white text-black shadow-sm'
                               : 'text-white/60 hover:text-white hover:bg-white/8'
                           }`}
                           title={collapsed ? item.label : ''}
                         >
                           <Icon className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
                           {!collapsed && <span>{item.label}</span>}
                           {isActive && !collapsed && (
                             <span className="ml-auto w-1.5 h-1.5 rounded-full bg-black/30" />
                           )}
                         </Button>
                       </Link>
                     )}
                   </HelpWrapper>

                   {/* Submenu */}
                   {hasSubmenu && isExpanded && !collapsed && (
                     <div className="space-y-0.5 mt-0.5 pl-2">
                       {item.submenu.map(subitem => {
                         const isSubActive = currentPageName === subitem.name;
                         return (
                           <Link key={subitem.name} to={createPageUrl(subitem.name)} className="block">
                             <Button
                               variant="ghost"
                               className={`w-full h-8 gap-2 text-[12px] font-medium transition-all duration-150 justify-start px-3 ${
                                 isSubActive
                                   ? 'bg-white/20 text-white'
                                   : 'text-white/40 hover:text-white hover:bg-white/8'
                               }`}
                             >
                               <span className="w-1 h-1 rounded-full bg-current flex-shrink-0" />
                               {subitem.label}
                             </Button>
                           </Link>
                         );
                       })}
                     </div>
                   )}
                 </div>
               );
            })}
          </div>
        ))}
      </nav>

      {/* Suggestion Form */}
      <div className={`border-t border-white/5 px-2 py-2 ${collapsed ? 'flex justify-center' : ''}`}>
        <SuggestionForm currentUser={currentUser} collapsed={collapsed} />
      </div>

      {/* User info */}
      {currentUser && (
        <div className={`border-t border-white/5 ${collapsed ? 'p-3 flex justify-center' : 'p-4'}`}>
          {collapsed ? (
            <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {currentUser.full_name?.charAt(0) || '?'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white">
                  {currentUser.full_name?.charAt(0) || '?'}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate leading-snug">
                  {currentUser.full_name}
                </p>
                <p className="text-[10px] text-white/30 truncate">{currentUser.role}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}