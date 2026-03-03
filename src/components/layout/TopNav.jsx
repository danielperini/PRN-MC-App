import React from 'react';
import { base44 } from '@/api/base44Client';
import { LogOut, UserCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import GlobalSearch from './GlobalSearch';

export default function TopNav({ userEmail, userName, userRole }) {
  return (
    <nav className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <GlobalSearch />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4 ml-auto">
        {userEmail && <NotificationPanel userEmail={userEmail} />}
        
        <Link to={createPageUrl('Perfil')}>
          <Button variant="ghost" size="icon" className="text-gray-500">
            <UserCircle className="w-4 h-4" />
          </Button>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => base44.auth.logout()}
          className="text-gray-500"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </nav>
  );
}