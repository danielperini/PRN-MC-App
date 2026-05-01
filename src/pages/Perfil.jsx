import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { User, Settings, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Perfil() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Carregando...
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
          <User className="w-8 h-8 text-slate-500" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{user.full_name}</h1>
          <p className="text-slate-500">{user.email}</p>
        </div>
      </div>

      <div className="space-y-3">
        <Link to="/MeusDados">
          <Button variant="outline" className="w-full justify-start gap-2">
            <Settings className="w-4 h-4" />
            Minhas Informações
          </Button>
        </Link>
        <Link to="/Aparencia">
          <Button variant="outline" className="w-full justify-start gap-2">
            <Settings className="w-4 h-4" />
            Aparência
          </Button>
        </Link>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
          onClick={() => base44.auth.logout('/')}
        >
          <LogOut className="w-4 h-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}