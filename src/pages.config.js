/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
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
import GeradorTermoCompromisso from './pages/GeradorTermoCompromisso';
import GestaoPagamentos from './pages/GestaoPagamentos';
import GestorArquivos from './pages/GestorArquivos';
import HelpManagement from './pages/HelpManagement';
import Home from './pages/Home';
import LeitorNoticias from './pages/LeitorNoticias';
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
import UserManagement from './pages/UserManagement';
import ViadutoMap from './pages/ViadutoMap';
import GeradorListaPresenca from './pages/GeradorListaPresenca';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivityLog": ActivityLog,
    "AdminUsers": AdminUsers,
    "ApprovalsMobile": ApprovalsMobile,
    "AssistentePlanejamento": AssistentePlanejamento,
    "AuditLog": AuditLog,
    "BaseConhecimento": BaseConhecimento,
    "Cadastro": Cadastro,
    "CalendarioAtividades": CalendarioAtividades,
    "Compras": Compras,
    "ConsolidacaoFinanceira": ConsolidacaoFinanceira,
    "CoordReview": CoordReview,
    "Dashboard": Dashboard,
    "DashboardFinanceiro": DashboardFinanceiro,
    "DashboardProfissional": DashboardProfissional,
    "Fornecedores": Fornecedores,
    "GaleriaFotos": GaleriaFotos,
    "GeradorTermoCompromisso": GeradorTermoCompromisso,
    "GestaoPagamentos": GestaoPagamentos,
    "GestorArquivos": GestorArquivos,
    "HelpManagement": HelpManagement,
    "Home": Home,
    "LeitorNoticias": LeitorNoticias,
    "MhaabMap": MhaabMap,
    "MisMap": MisMap,
    "MonitoringPanel": MonitoringPanel,
    "MumoMap": MumoMap,
    "MuseusNoMapa": MuseusNoMapa,
    "NovaAtividade": NovaAtividade,
    "Perfil": Perfil,
    "PlataformaAdmin": PlataformaAdmin,
    "PlataformaConfig": PlataformaConfig,
    "PrestacaoDeContas": PrestacaoDeContas,
    "ProgramacoesAgenda": ProgramacoesAgenda,
    "RelatorioMeta": RelatorioMeta,
    "Relatorios": Relatorios,
    "ReportEditor": ReportEditor,
    "UserManagement": UserManagement,
    "ViadutoMap": ViadutoMap,
    "GeradorListaPresenca": GeradorListaPresenca,
}

export const pagesConfig = {
    mainPage: "GestorArquivos",
    Pages: PAGES,
    Layout: __Layout,
};