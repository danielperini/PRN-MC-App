import React from 'react';
import { BarChart3, FileText, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const ROUTES = [
  { name: 'Dashboard', icon: BarChart3, path: 'Dashboard' },
  { name: 'Relatórios', icon: FileText, path: 'Relatorios' },
  { name: 'Perfil', icon: User, path: 'Perfil' },
];

export default function MobileBottomTab({ currentPageName }) {
  return (
    <div className="hidden md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 select-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex justify-around">
        {ROUTES.map(route => {
          const Icon = route.icon;
          const isActive = currentPageName === route.path;
          return (
            <Link
              key={route.name}
              to={createPageUrl(route.path)}
              className={`flex-1 flex flex-col items-center justify-center h-16 transition-colors ${
                isActive
                  ? 'text-black border-t-2 border-black'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">{route.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}