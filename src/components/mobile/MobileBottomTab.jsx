import React from 'react';
import { BarChart3, FileText, User, ShoppingCart, CalendarDays } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { requestDashboardPriorityRefresh } from '@/utils/dashboardRefresh';

const ROUTES = [
  { name: 'Dashboard', icon: BarChart3, path: 'Dashboard', label: 'Painel', root: '/' },
  { name: 'Relatórios', icon: FileText, path: 'Relatorios', label: 'Relatórios', root: '/Relatorios' },
  { name: 'Programação', icon: CalendarDays, path: 'ProgramacaoEspelho', label: 'Agenda', root: '/ProgramacaoEspelho' },
  { name: 'Compras', icon: ShoppingCart, path: 'Compras', label: 'Compras', root: '/Compras' },
  { name: 'Perfil', icon: User, path: 'Perfil', label: 'Perfil', root: '/Perfil' },
];

export default function MobileBottomTab({ currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleTabClick = (route) => {
    // Se já está na aba ativa, volta para a raiz da seção
    if (currentPageName === route.path && location.pathname !== route.root) {
      navigate(route.root);
    }
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 select-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex justify-around">
        {ROUTES.map(route => {
          const Icon = route.icon;
          const isActive = currentPageName === route.path;
          return (
            <button
              key={route.path}
              onClick={() => {
                if (route.path === 'Dashboard') {
                  requestDashboardPriorityRefresh('mobile-tab-dashboard-click');
                }
                if (isActive && location.pathname !== route.root) {
                  navigate(route.root);
                } else if (!isActive) {
                  navigate(createPageUrl(route.path));
                }
              }}
              className={`flex-1 flex flex-col items-center justify-center py-2 h-14 transition-colors ${
                isActive ? 'text-black border-t-2 border-black' : 'text-gray-400'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-medium leading-tight">{route.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
