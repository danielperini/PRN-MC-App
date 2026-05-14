import React from 'react';
import { Lock, Home, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function AccessDenied({ reason = 'permission' }) {
  const handleLogout = () => {
    base44.auth.logout('/');
  };

  const handleHome = () => {
    window.location.href = '/';
  };

  const messages = {
    permission: {
      title: 'Acesso restrito',
      description: 'Você não tem permissão para acessar esta página.',
    },
    unregistered: {
      title: 'Cadastro incompleto',
      description: 'Sua solicitação de acesso ainda está em análise ou foi rejeitada.',
    },
    notAuthenticated: {
      title: 'Acesso necessário',
      description: 'Você precisa fazer login para acessar esta página.',
    },
    inactive: {
      title: 'Conta inativa',
      description: 'Sua conta foi desativada. Entre em contato com um administrador.',
    },
  };

  const message = messages[reason] || messages.permission;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6">
        {/* Ícone */}
        <div className="flex justify-center">
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-amber-600" />
          </div>
        </div>

        {/* Mensagem */}
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-slate-900">
            {message.title}
          </h1>
          <p className="text-sm text-slate-500">
            {message.description}
          </p>
        </div>

        {/* Ações */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleHome}
            className="flex-1 gap-2 bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Home className="w-4 h-4" />
            Voltar ao painel
          </Button>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="flex-1 gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>

        {/* Ajuda */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center space-y-2">
          <p className="text-xs font-medium text-slate-600">Precisa de ajuda?</p>
          <p className="text-xs text-slate-500">
            Entre em contato com um administrador ou coordenador do projeto.
          </p>
        </div>
      </div>
    </div>
  );
}