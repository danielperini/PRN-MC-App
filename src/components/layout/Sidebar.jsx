import React, { useEffect, useState } from 'react';
import HoverManualTooltip from '@/components/help/HoverManualTooltip';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import SuggestionForm from '@/components/sidebar/SuggestionForm';
import { HelpWrapper } from '@/components/help/withContextualHelp';
import { isCoordenador as checkCoordenador, canManageUsers, isPatrocinador } from '@/components/auth/permissions';

export default function Sidebar({ currentPageName, collapsed, onToggle, currentUser }) {
  const [customPerms, setCustomPerms] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    PlataformaAdmin: false,
  });

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
  const isSponsor = isPatrocinador(currentUser);
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

  // Menu diferente para patrocinadores
  const navSections = isSponsor ? [
    {
      items: [
        {
          name: 'DashboardPatrocinador',
          icon: BarChart3,
          label: 'Dashboard',
          tooltip: 'Painel executivo com KPIs, orçamento consolidado e indicadores do projeto.',
          show: true,
        },
      ],
    },
    {
      label: 'Programação',
      items: [
        {
          name: 'ProgramacaoEspelho',
          icon: CalendarDays,
          label: 'Programação',
          tooltip: 'Informações completas da programação: sinopse, links de imagens, minibios dos artistas.',
          show: true,
        },
      ],
    },
    {
      label: 'Museu Centro',
      items: [
        {
          name: 'Agenda',
          icon: CalendarDays,
          label: 'Agenda',
          tooltip: 'Programação cultural dos museus MIS, MHAB e MUMO.',
          show: true,
        },
        {
          name: 'GaleriaFotos',
          icon: Images,
          label: 'Galeria',
          tooltip: 'Fotos e mídias aprovadas das atividades realizadas.',
          show: true,
        },
      ],
    },
    {
      label: 'Perfil',
      items: [
        {
          name: 'Perfil',
          icon: Users,
          label: 'Meu Perfil',
          tooltip: 'Atualize seus dados pessoais.',
          show: true,
        },
      ],
    },
  ] : [
    {
      items: [
        {
          name: 'Dashboard',
          icon: BarChart3,
          label: 'Dashboard',
          tooltip: 'Painel principal com resumo de atividades, relatórios, notificações e indicadores do mês.',
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
          tooltip: 'Crie, edite e acompanhe os relatórios mensais. Exporte o consolidado do mês em PDF com atividades, fotos e assinatura.',
          show: true,
        },
        {
          name: 'Compras',
          icon: ShoppingCart,
          label: 'Compras e Pagamentos',
          tooltip: 'Gerencie compras, pagamentos de equipe, rubricas, notas fiscais e aprovações de fornecedores e colaboradores.',
          show: true,
        },
      ],
    },
    {
      label: 'Museu Centro',
      items: [
        {
          name: 'Agenda',
          icon: CalendarDays,
          label: 'Agenda Museu Centro',
          tooltip: 'Programação cultural dos museus MIS, MHAB e MUMO. Filtre por museu, mês e ano. Importe atividades direto para o seu relatório.',
          show: true,
        },
        {
          name: 'GaleriaFotos',
          icon: Images,
          label: 'Galeria',
          tooltip: 'Galeria de fotos e arquivos de mídia vinculados às atividades e relatórios do projeto.',
          show: true,
        },
        {
          name: 'RubricasPorMuseu',
          icon: Building2,
          label: 'Rubricas por museu',
          tooltip: 'Visualize o orçamento, previsto, utilizado e saldo de cada rubrica separado por museu.',
          show: true,
        },
        {
          name: 'GestorArquivos',
          icon: Paperclip,
          label: 'Arquivos',
          tooltip: 'Organize, consulte e faça upload de contratos, notas fiscais, XML e documentos de apoio.',
          show: true,
        },
        {
          name: 'ProgramacaoEspelho',
          icon: CalendarDays,
          label: 'Informações Completas da Programação',
          description: 'Link de imagens • Minibios • Material de divulgação aprovado',
          tooltip: 'Espelho completo da planilha de programação: sinopse, links de imagens, minibios dos artistas e material de divulgação aprovado.',
          show: true,
        },
        {
          name: 'MeusDados',
          icon: Users,
          label: 'Meus dados',
          tooltip: 'Atualize seus dados cadastrais (banco, CPF/CNPJ, PIX). Obrigatório para envio de nota fiscal.',
          show: true,
        },
        {
          name: 'UserManagement',
          icon: Users,
          label: 'Usuários',
          tooltip: 'Gerencie usuários da plataforma, permissões, funções e acessos por museu.',
          show: canManageUsersFlag,
        },
        {
          name: 'PlataformaAdmin',
          icon: Settings,
          label: 'Plataforma',
          tooltip: 'Painel administrativo: configurações gerais, base de conhecimento e parâmetros da plataforma.',
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
      label: 'Ferramentas',
      items: [
        {
          name: 'GeradorListaPresenca',
          icon: FileText,
          label: 'Gerador de lista de presença',
          tooltip: 'Gere automaticamente listas de presença para atividades, oficinas e eventos. Baixe em PDF pronto para impressão.',
          show: true,
        },
        {
          name: 'GeradorTermoCompromisso',
          icon: ScrollText,
          label: 'Gerador de termo de compromisso',
          tooltip: 'Crie termos de compromisso para participantes e colaboradores. Preencha os dados e exporte em PDF.',
          show: true,
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
          tooltip: 'Assistente inteligente com acesso à base de conhecimento do projeto. Tire dúvidas sobre fluxos, regras, agenda e relatórios.',
          show: true,
        },
        {
          name: 'Manual',
          icon: BookOpen,
          label: 'Manual e Ajuda',
          tooltip: 'Guia completo da plataforma: regras, fluxos, passos rápidos, dúvidas frequentes e orientações para todos os módulos.',
          show: true,
        },
        {
          name: 'LeitorNoticias',
          icon: Newspaper,
          label: 'Notícias',
          tooltip: 'Leia e curade notícias sobre cultura, museus e o setor criativo para manter a equipe atualizada.',
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
              {isSponsor ? 'SP' : 'MC'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">
                {isSponsor ? 'Patrocinador' : 'Museus Centro'}
              </div>
              <div className="text-[11px] text-white/60 truncate">
                {isSponsor ? 'Visão Executiva' : 'Relatório Mensal'}
              </div>
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
                  <TooltipProvider key={item.name} delayDuration={400}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link to={createPageUrl(item.name)}>
                          <Button
                            variant="ghost"
                            className={`w-full justify-start gap-2 rounded-xl px-3 h-auto min-h-[44px] py-2 ${
                              isActive
                                ? 'bg-white text-black'
                                : 'text-white/70 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                            {!collapsed && (
                              <div className="min-w-0 text-left">
                                <div className="truncate">{item.label}</div>
                                {item.description ? (
                                  <div
                                    className={`text-[10px] leading-tight mt-0.5 whitespace-normal ${
                                      isActive ? 'text-black/70' : 'text-white/45'
                                    }`}
                                  >
                                    {item.description}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </Button>
                        </Link>
                      </TooltipTrigger>
                      {item.tooltip && (
                        <TooltipContent side="right" className="max-w-[220px] text-xs">
                          {item.tooltip}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!collapsed && !isSponsor && (
        <div className="border-t border-white/10 p-3 space-y-3">
          <HelpWrapper>
            <SuggestionForm />
          </HelpWrapper>
        </div>
      )}
    </aside>
  );
}