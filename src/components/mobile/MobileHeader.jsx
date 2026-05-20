import React from 'react';
import { ChevronLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { requestDashboardPriorityRefresh } from '@/utils/dashboardRefresh';

export default function MobileHeader({ title, showBack = true, onBack }) {
  const navigate = useNavigate();
  
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-100 select-none" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="h-14 px-4 flex items-center justify-between">
        {showBack ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -ml-2"
            onClick={handleBack}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        ) : (
          <div className="w-8" />
        )}
        <h1 className="text-base font-semibold text-black flex-1 text-center">{title}</h1>
        <Link
          to={createPageUrl('Dashboard')}
          onClick={() => requestDashboardPriorityRefresh('mobile-header-dashboard-click')}
        >
          <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-gray-500">
            <Home className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
