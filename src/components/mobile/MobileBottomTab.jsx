import React from 'react';
import { BarChart3, FileText, User, ShoppingCart, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const ROUTES = [
  { name: 'Dashboard', icon: BarChart3, path: 'Dashboard', label: 'Painel' },
  { name: 'Relatórios', icon: FileText, path: 'Relatorios', label: 'Relatórios' },
  { name: 'Atividades', icon: Layers, path: 'NovaAtividade', label: 'Atividades' },
  { name: 'Compras', icon: ShoppingCart, path: 'Compras', label: 'Compras' },
  { name: 'Perfil', icon: User, path: 'Perfil', label: 'Perfil' },
];

export default function MobileBottomTab({ currentPageName }) {
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
            <Link
              key={route.path}
              to={createPageUrl(route.path)}
              className={`flex-1 flex flex-col items-center justify-center py-2 h-14 transition-colors ${
                isActive ? 'text-black border-t-2 border-black' : 'text-gray-400'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-medium leading-tight">{route.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}