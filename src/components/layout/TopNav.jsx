import React from 'react';
import { base44 } from '@/api/base44Client';
import { LogOut, UserCircle, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import PendingActionsAlert from '@/components/notifications/PendingActionsAlert';
import PurchaseNotificationBell from '@/components/notifications/PurchaseNotificationBell';
import GlobalSearch from './GlobalSearch';

export default function TopNav({ currentUser }) {
  return (
    <nav className="h-16 border-b border-black bg-white flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <GlobalSearch />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4 ml-auto">
        <Link to={createPageUrl('Dashboard')}>
          <Button variant="ghost" size="icon" className="text-black hover:bg-black hover:text-white h-11 w-11" title="Ir para Home">
            <Home className="w-5 h-5" />
          </Button>
        </Link>
        {currentUser?.email && <PendingActionsAlert />}
        {currentUser?.email && <NotificationCenter />}
        {currentUser?.email && <PurchaseNotificationBell currentUser={currentUser} />}
        
        <Link to={createPageUrl('Perfil')}>
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