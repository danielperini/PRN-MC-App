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