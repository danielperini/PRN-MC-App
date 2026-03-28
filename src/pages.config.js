/**
 * pages.config.js - Page routing configuration
 */

import ActivityLog from './pages/ActivityLog';
import AdminUsers from './pages/AdminUsers';
import ApprovalsMobile from './pages/ApprovalsMobile';
import AssistentePlanejamento from './pages/AssistentePlanejamento';
import AuditLog from './pages/AuditLog';
import BaseConhecimento from './pages/BaseConhecimento';
import Cadastro from './pages/Cadastro';
import CalendarioAtividades from './pages/CalendarioAtividades';
import Compras from './pages/Compras';
import ConsolidacaoFinanceira from './pages/ConsolidacaoFinanceira';
import CoordReview from './pages/CoordReview';
import Dashboard from './pages/Dashboard';
import DashboardFinanceiro from './pages/DashboardFinanceiro';
import DashboardProfissional from './pages/DashboardProfissional';
import Fornecedores from './pages/Fornecedores';
import GaleriaFotos from './pages/GaleriaFotos';
import GeradorListaPresenca from './pages/GeradorListaPresenca';
import GeradorTermoCompromisso from './pages/GeradorTermoCompromisso';
import GestaoDocumental from './pages/GestaoDocumental';
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
import Perfil from './pages/Perfil';
import PlataformaAdmin from './pages/PlataformaAdmin';
import PlataformaConfig from './pages/PlataformaConfig';
import PrestacaoDeContas from './pages/PrestacaoDeContas';
import ProgramacoesAgenda from './pages/ProgramacoesAgenda';
import RelatorioMeta from './pages/RelatorioMeta';
import Relatorios from './pages/Relatorios';
import ReportEditor from './pages/ReportEditor';
import Rubricas from './pages/Rubricas';
import RubricasPorMuseu from './pages/RubricasPorMuseu';
import UserManagement from './pages/UserManagement';
import ViadutoMap from './pages/ViadutoMap';

import __Layout from './Layout.jsx';

export const PAGES = {
  ActivityLog,
  AdminUsers,
  ApprovalsMobile,
  AssistentePlanejamento,
  AuditLog,
  BaseConhecimento,
  Cadastro,
  CalendarioAtividades,
  Compras,
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
  Perfil,
  PlataformaAdmin,
  PlataformaConfig,
  PrestacaoDeContas,
  ProgramacoesAgenda,
  RelatorioMeta,
  Relatorios,
  ReportEditor,
  Rubricas,
  RubricasPorMuseu,
  UserManagement,
  ViadutoMap,
};

export const pagesConfig = {
  mainPage: 'Dashboard',
  Pages: PAGES,
  Layout: __Layout,
};
