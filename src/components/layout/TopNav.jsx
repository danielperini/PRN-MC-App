import React from 'react';
import { base44 } from '@/api/base44Client';
import { LogOut, UserCircle, Home, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { usePatrocinadorView } from '@/context/PatrocinadorViewContext';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/components/notifications/NotificationBell';
import { requestDashboardPriorityRefresh } from '@/utils/dashboardRefresh';
import GlobalSearch from './GlobalSearch';

export default function TopNav({ currentUser }) {
  const navigate = useNavigate();
  const { isPatrocinadorView, setIsPatrocinadorView } = usePatrocinadorView();
  return (
    <nav className="h-16 border-b border-black bg-white flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Back button + Search */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-500 hover:text-black hover:bg-gray-100 h-8 w-8 shrink-0" title="Voltar página anterior">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <GlobalSearch />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4 ml-auto">
        <Link to="/" onClick={() => requestDashboardPriorityRefresh('topnav-dashboard-click')}>
           <Button variant="ghost" className="text-black hover:bg-black hover:text-white h-9 px-3 gap-1.5 text-xs font-medium" title="Voltar ao Dashboard">
             <Home className="w-4 h-4" />
             <span className="hidden sm:inline">Dashboard</span>
           </Button>
         </Link>
        {currentUser?.email && <NotificationBell />}
        
        {currentUser?.email && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsPatrocinadorView(!isPatrocinadorView)}
            className="text-black hover:bg-black hover:text-white h-11 w-11"
            title={isPatrocinadorView ? 'Voltar à visão completa' : 'Visão patrocinador'}
          >
            {isPatrocinadorView ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </Button>
        )}
        
        <Link to="/Perfil">
           <Button variant="ghost" size="icon" className="text-black hover:bg-black hover:text-white h-11 w-11">
             <UserCircle className="w-5 h-5" />
           </Button>
         </Link>

         <Button
           variant="ghost"
           size="icon"
           onClick={() => base44.auth.logout()}
           className="text-black hover:bg-black hover:text-white h-11 w-11"
         >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </nav>
  );
}