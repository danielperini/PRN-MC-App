import React from 'react';
import CurationDashboard from '@/components/leitor/CurationDashboard';
import { Newspaper } from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';

export default function LeitorNoticias() {
  const { user, isLoading, isCoordenador } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <Newspaper className="w-12 h-12 text-gray-300 mx-auto mb-4 animate-pulse" />
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Carregando</h1>
          <p className="text-gray-600">Verificando permissões de acesso às notícias.</p>
        </div>
      </div>
    );
  }

  if (!user || !isCoordenador) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <Newspaper className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Acesso Restrito</h1>
          <p className="text-gray-600">
            As notícias estão disponíveis apenas para coordenadores.
          </p>
        </div>
      </div>
    );
  }

  return <CurationDashboard />;
}
