/**
 * pages.config.js - Page routing configuration
 *
 * Otimização: páginas carregadas sob demanda para reduzir o bundle inicial
 * e evitar que módulos pesados bloqueiem Dashboard/Agenda/Galeria/Compras.
 */

import React from 'react';
import __Layout from './Layout.jsx';

const lazyPage = (loader) => React.lazy(loader);

export const PAGES = {
  ActivityLog: lazyPage(() => import('./pages/ActivityLog')),
  AdminUsers: lazyPage(() => import('./pages/AdminUsers')),
  ApprovalsMobile: lazyPage(() => import('./pages/ApprovalsMobile')),
  AssistentePlanejamento: lazyPage(() => import('./pages/AssistentePlanejamento')),
  AuditLog: lazyPage(() => import('./pages/AuditLog')),
  AuditoriaInstitucional: lazyPage(() => import('./pages/AuditoriaInstitucional')),
  BaseConhecimento: lazyPage(() => import('./pages/BaseConhecimento')),
  Cadastro: lazyPage(() => import('./pages/Cadastro')),
  Compras: lazyPage(() => import('./pages/Compras')),
  ComunicacaoVisibilidade: lazyPage(() => import('./pages/ComunicacaoVisibilidadeClippingCompact')),
  ConsolidacaoFinanceira: lazyPage(() => import('./pages/ConsolidacaoFinanceira')),
  CoordReview: lazyPage(() => import('./pages/CoordReview')),
  Dashboard: lazyPage(() => import('./pages/Dashboard')),
  DashboardFinanceiro: lazyPage(() => import('./pages/DashboardFinanceiro')),
  DashboardProfissional: lazyPage(() => import('./pages/DashboardProfissional')),
  Fornecedores: lazyPage(() => import('./pages/Fornecedores')),
  GaleriaFotos: lazyPage(() => import('./pages/GaleriaFotos')),
  GeradorListaPresenca: lazyPage(() => import('./pages/GeradorListaPresenca')),
  GeradorTermoCompromisso: lazyPage(() => import('./pages/GeradorTermoCompromisso')),
  GestaoDocumental: lazyPage(() => import('./pages/GestaoDocumentalDedupe')),
  GestaoPagamentos: lazyPage(() => import('./pages/GestaoPagamentos')),
  GestorArquivos: lazyPage(() => import('./pages/GestorArquivos')),
  HelpManagement: lazyPage(() => import('./pages/HelpManagement')),
  Home: lazyPage(() => import('./pages/Home')),
  LeitorNoticias: lazyPage(() => import('./pages/LeitorNoticias')),
  Manual: lazyPage(() => import('./pages/Manual')),
  MeusDados: lazyPage(() => import('./pages/MeusDados')),
  MhaabMap: lazyPage(() => import('./pages/MhaabMap')),
  MisMap: lazyPage(() => import('./pages/MisMap')),
  MonitoringPanel: lazyPage(() => import('./pages/MonitoringPanel')),
  MumoMap: lazyPage(() => import('./pages/MumoMap')),
  MuseusNoMapa: lazyPage(() => import('./pages/MuseusNoMapa')),
  NovaAtividade: lazyPage(() => import('./pages/NovaAtividade')),
  PlataformaAdmin: lazyPage(() => import('./pages/PlataformaAdmin')),
  PlataformaConfig: lazyPage(() => import('./pages/PlataformaConfig')),
  PrestacaoDeContas: lazyPage(() => import('./pages/PrestacaoDeContas')),
  ProgramacaoEspelho: lazyPage(() => import('./pages/ProgramacaoEspelho')),
  Agenda: lazyPage(() => import('./pages/Agenda')),
  RubricasPorMuseu: lazyPage(() => import('./pages/RubricasPorMuseu')),
  RelatorioFisicoFinanceiro: lazyPage(() => import('./pages/RelatorioFisicoFinanceiro')),
  RelatorioFisicoFinanceiroRevisao: lazyPage(() => import('./pages/RelatorioFisicoFinanceiroRevisao')),
  RelatorioMeta: lazyPage(() => import('./pages/RelatorioMeta')),
  RelatorioPreview: lazyPage(() => import('./pages/RelatorioPreview')),
  Relatorios: lazyPage(() => import('./pages/Relatorios')),
  ReportEditor: lazyPage(() => import('./pages/ReportEditorGuard')),
  Rubricas: lazyPage(() => import('./pages/Rubricas')),
  UserManagement: lazyPage(() => import('./pages/UserManagement')),
  ViadutoMap: lazyPage(() => import('./pages/ViadutoMap')),
  DashboardPatrocinador: lazyPage(() => import('./pages/DashboardPatrocinadorSync')),
  FinanceiroPatrocinador: lazyPage(() => import('./pages/DashboardPatrocinadorSync')),
  EntradaUnica: lazyPage(() => import('./pages/EntradaUnica.jsx')),
  Mensagens: lazyPage(() => import('./pages/Mensagens.jsx')),
  GuiaNotaFiscal: lazyPage(() => import('./pages/GuiaNotaFiscal')),
  Aparencia: lazyPage(() => import('./pages/Aparencia')),
  ConviteAcesso: lazyPage(() => import('./pages/ConviteAcesso')),
  NotificationSettings: lazyPage(() => import('./pages/NotificationSettings')),
};

export const pagesConfig = {
  mainPage: 'Dashboard',
  Pages: PAGES,
  Layout: __Layout,
};
