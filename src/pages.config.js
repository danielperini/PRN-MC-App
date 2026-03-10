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
import AssistentePlanejamento from './pages/AssistentePlanejamento';
import AuditLog from './pages/AuditLog';
import BaseConhecimento from './pages/BaseConhecimento';
import Cadastro from './pages/Cadastro';
import CalendarioAtividades from './pages/CalendarioAtividades';
import Compras from './pages/Compras';
import CoordReview from './pages/CoordReview';
import Dashboard from './pages/Dashboard';
import DashboardProfissional from './pages/DashboardProfissional';
import GestorArquivos from './pages/GestorArquivos';
import Home from './pages/Home';
import MonitoringPanel from './pages/MonitoringPanel';
import NovaAtividade from './pages/NovaAtividade';
import Perfil from './pages/Perfil';
import PlataformaAdmin from './pages/PlataformaAdmin';
import PlataformaConfig from './pages/PlataformaConfig';
import Relatorios from './pages/Relatorios';
import ReportEditor from './pages/ReportEditor';
import UserManagement from './pages/UserManagement';
import GestaoPagamentos from './pages/GestaoPagamentos';
import RelatorioMeta from './pages/RelatorioMeta';
import ProgramacoesAgenda from './pages/ProgramacoesAgenda';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivityLog": ActivityLog,
    "AdminUsers": AdminUsers,
    "AssistentePlanejamento": AssistentePlanejamento,
    "AuditLog": AuditLog,
    "BaseConhecimento": BaseConhecimento,
    "Cadastro": Cadastro,
    "CalendarioAtividades": CalendarioAtividades,
    "Compras": Compras,
    "CoordReview": CoordReview,
    "Dashboard": Dashboard,
    "DashboardProfissional": DashboardProfissional,
    "GestorArquivos": GestorArquivos,
    "Home": Home,
    "MonitoringPanel": MonitoringPanel,
    "NovaAtividade": NovaAtividade,
    "Perfil": Perfil,
    "PlataformaAdmin": PlataformaAdmin,
    "PlataformaConfig": PlataformaConfig,
    "Relatorios": Relatorios,
    "ReportEditor": ReportEditor,
    "UserManagement": UserManagement,
    "GestaoPagamentos": GestaoPagamentos,
    "RelatorioMeta": RelatorioMeta,
    "ProgramacoesAgenda": ProgramacoesAgenda,
}

export const pagesConfig = {
    mainPage: "GestorArquivos",
    Pages: PAGES,
    Layout: __Layout,
};