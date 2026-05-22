/**
 * pages.config.js - Page routing configuration
 *
 * Produção estável: imports estáticos. O lazy loading foi retirado porque
 * estava causando rotas sem carregamento adequado em produção/Base44.
 */

import ActivityLog from './pages/ActivityLog';
import AdminUsers from './pages/AdminUsers';
import ApprovalsMobile from './pages/ApprovalsMobile';
import AssistentePlanejamento from './pages/AssistentePlanejamento';
import AuditLog from './pages/AuditLog';
import AuditoriaInstitucional from './pages/AuditoriaInstitucional';
import BaseConhecimento from './pages/BaseConhecimento';
import Cadastro from './pages/Cadastro';
import Compras from './pages/Compras';
import ComunicacaoVisibilidade from './pages/ComunicacaoVisibilidadeClippingCompact';
import ConsolidacaoFinanceira from './pages/ConsolidacaoFinanceira';
import CoordReview from './pages/CoordReview';
import Dashboard from './pages/Dashboard';
import DashboardFinanceiro from './pages/DashboardFinanceiro';
import DashboardProfissional from './pages/DashboardProfissional';
import Fornecedores from './pages/Fornecedores';
import GaleriaFotos from './pages/GaleriaFotos';
import GeradorListaPresenca from './pages/GeradorListaPresenca';
import GeradorTermoCompromisso from './pages/GeradorTermoCompromisso';
import GestaoDocumental from './pages/GestaoDocumentalDedupe';
import GestaoPagamentos from './pages/GestaoPagamentos';
import GestorArquivos from './pages/GestorArquivos';
import HelpManagement from './pages/HelpManagement';
import Home from './pages/Home';
import LeitorNoticias from './pages/LeitorNoticias';
import Manual from './pages/Manual';
import MeusDados from './pages/MeusDados';
import MhaabMap from './pages/MhaabMap';
import MisMap from './pages/MisMap';
import MonitoringPanel from './pages/MonitoringPanel';
import MumoMap from './pages/MumoMap';
import MuseusNoMapa from './pages/MuseusNoMapa';
import NovaAtividade from './pages/NovaAtividade';
import PlataformaAdmin from './pages/PlataformaAdmin';
import PlataformaConfig from './pages/PlataformaConfig';
import PrestacaoDeContas from './pages/PrestacaoDeContas';
import ProgramacaoEspelho from './pages/ProgramacaoEspelho';
import Agenda from './pages/Agenda';
import RubricasPorMuseu from './pages/RubricasPorMuseu';
import RelatorioFisicoFinanceiro from './pages/RelatorioFisicoFinanceiro';
import RelatorioFisicoFinanceiroRevisao from './pages/RelatorioFisicoFinanceiroRevisao';
import RelatorioMeta from './pages/RelatorioMeta';
import RelatorioPreview from './pages/RelatorioPreview';
import Relatorios from './pages/Relatorios';
import ReportEditor from './pages/ReportEditorGuard';
import Rubricas from './pages/Rubricas';
import UserManagement from './pages/UserManagement';
import ViadutoMap from './pages/ViadutoMap';
import DashboardPatrocinador from './pages/DashboardPatrocinadorSync';
import EntradaUnica from './pages/EntradaUnica.jsx';
import Mensagens from './pages/Mensagens.jsx';
import GuiaNotaFiscal from './pages/GuiaNotaFiscal';
import Aparencia from './pages/Aparencia';
import ConviteAcesso from './pages/ConviteAcesso';
import NotificationSettings from './pages/NotificationSettings';
import __Layout from './Layout.jsx';

export const PAGES = {
  ActivityLog,
  AdminUsers,
  ApprovalsMobile,
  AssistentePlanejamento,
  AuditLog,
  AuditoriaInstitucional,
  BaseConhecimento,
  Cadastro,
  Compras,
  ComunicacaoVisibilidade,
  ConsolidacaoFinanceira,
  CoordReview,
  Dashboard,
  DashboardFinanceiro,
  DashboardProfissional,
  Fornecedores,
  GaleriaFotos,
  GeradorListaPresenca,
  GeradorTermoCompromisso,
  GestaoDocumental,
  GestaoPagamentos,
  GestorArquivos,
  HelpManagement,
  Home,
  LeitorNoticias,
  Manual,
  MeusDados,
  MhaabMap,
  MisMap,
  MonitoringPanel,
  MumoMap,
  MuseusNoMapa,
  NovaAtividade,
  PlataformaAdmin,
  PlataformaConfig,
  PrestacaoDeContas,
  ProgramacaoEspelho,
  Agenda,
  RubricasPorMuseu,
  RelatorioFisicoFinanceiro,
  RelatorioFisicoFinanceiroRevisao,
  RelatorioMeta,
  RelatorioPreview,
  Relatorios,
  ReportEditor,
  Rubricas,
  UserManagement,
  ViadutoMap,
  DashboardPatrocinador,
  FinanceiroPatrocinador: DashboardPatrocinador,
  EntradaUnica,
  Mensagens,
  GuiaNotaFiscal,
  Aparencia,
  ConviteAcesso,
  NotificationSettings,
};

export const pagesConfig = {
  mainPage: 'Dashboard',
  Pages: PAGES,
  Layout: __Layout,
};
