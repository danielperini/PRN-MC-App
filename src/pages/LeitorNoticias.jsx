import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import CurationDashboard from '@/components/leitor/CurationDashboard';
import { Newspaper } from 'lucide-react';

export default function LeitorNoticias() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setUser(u)).catch(() => setUser(null));
  }, []);

  if (user?.role === 'PATROCINADOR') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <Newspaper className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Acesso Restrito</h1>
          <p className="text-gray-600">As notícias estão disponíveis apenas para coordenadores e profissionais.</p>
        </div>
      </div>
    );
  }

  return <CurationDashboard />;
}