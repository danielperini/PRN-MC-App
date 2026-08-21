import React from 'react';
import { Building2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function Login() {
  const handleLogin = () => {
    const nextUrl = `${window.location.origin}/`;
    base44.auth.redirectToLogin(nextUrl);
  };

  const handleCadastro = () => {
    window.location.assign('/Cadastro');
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 w-12 h-12 rounded-xl bg-black flex items-center justify-center">
          <Building2 className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Entrar na plataforma</h1>
        <p className="mt-2 text-sm text-slate-500">
          Use seu acesso Google, Microsoft ou e-mail para continuar.
        </p>

        <Button
          className="w-full mt-8 bg-black hover:bg-slate-800 text-white gap-2"
          onClick={handleLogin}
        >
          <LogIn className="w-4 h-4" />
          Entrar
        </Button>

        <Button
          variant="outline"
          className="w-full mt-3 gap-2"
          onClick={handleCadastro}
        >
          <UserPlus className="w-4 h-4" />
          Solicitar / criar acesso
        </Button>
      </div>
    </div>
  );
}
