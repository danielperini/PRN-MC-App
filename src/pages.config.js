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
import Cadastro from './pages/Cadastro';
import CoordReview from './pages/CoordReview';
import Dashboard from './pages/Dashboard';
import DashboardProfissional from './pages/DashboardProfissional';
import GestorArquivos from './pages/GestorArquivos';
import Home from './pages/Home';
import Perfil from './pages/Perfil';
import PermissionManager from './pages/PermissionManager';
import PlataformaAdmin from './pages/PlataformaAdmin';
import Relatorios from './pages/Relatorios';
import ReportEditor from './pages/ReportEditor';
import UserManagement from './pages/UserManagement';
import PlataformaConfig from './pages/PlataformaConfig';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivityLog": ActivityLog,
    "AdminUsers": AdminUsers,
    "AssistentePlanejamento": AssistentePlanejamento,
    "AuditLog": AuditLog,
    "Cadastro": Cadastro,
    "CoordReview": CoordReview,
    "Dashboard": Dashboard,
    "DashboardProfissional": DashboardProfissional,
    "GestorArquivos": GestorArquivos,
    "Home": Home,
    "Perfil": Perfil,
    "PermissionManager": PermissionManager,
    "PlataformaAdmin": PlataformaAdmin,
    "Relatorios": Relatorios,
    "ReportEditor": ReportEditor,
    "UserManagement": UserManagement,
    "PlataformaConfig": PlataformaConfig,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};