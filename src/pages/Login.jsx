import React, { useState } from 'react';
import { Building2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { appParams } from '@/lib/app-params';

export default function Login() {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [newPassword,setNewPassword] = useState('');
  const [resetDone,setResetDone] = useState(false);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const nextUrl = new URLSearchParams(window.location.search).get('from_url') || '/';
  const resetToken = new URLSearchParams(window.location.search).get('reset_token');
  const handlePasswordLogin = async (event) => {
    event.preventDefault();
    setError(''); setLoading(true);
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(appParams.appId || '')}/auth/login`, {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:email.trim().toLowerCase(),password}),
      });
      if (!response.ok) throw new Error(response.status===403 ? 'Acesso ainda não liberado pela coordenação.' : 'E-mail ou senha incorretos.');
      window.location.assign(nextUrl.startsWith('/') && !nextUrl.startsWith('//') ? nextUrl : '/');
    } catch (loginError) { setError(loginError.message); setLoading(false); }
  };

  const handleCadastro = () => {
    window.location.assign('/Cadastro');
  };

  const handleReset = async (event) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const response=await fetch('/api/auth/password/reset/confirm', {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token:resetToken,password:newPassword}),
      });
      if (!response.ok) throw new Error(response.status===400 ? 'Link inválido ou vencido. Solicite outro.' : 'Não foi possível redefinir a senha.');
      setResetDone(true);
    } catch(resetError) {setError(resetError.message);}
    finally {setLoading(false);}
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 w-12 h-12 rounded-xl bg-black flex items-center justify-center">
          <Building2 className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">{resetToken ? 'Definir nova senha' : 'Entrar na plataforma'}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {resetToken ? 'Escolha uma senha de pelo menos 8 caracteres.' : 'Use sua conta Google cadastrada ou e-mail e senha após a aprovação.'}
        </p>

        {resetToken ? (
          resetDone ? <div className="mt-5"><p className="text-green-700">Senha atualizada. Você já pode entrar.</p><a className="underline" href="/login">Voltar ao login</a></div> :
          <form onSubmit={handleReset} className="mt-5 space-y-2 text-left">
            <Input type="password" autoComplete="new-password" required minLength={8} placeholder="Nova senha" value={newPassword} onChange={event=>setNewPassword(event.target.value)} />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>{loading?'Salvando...':'Salvar nova senha'}</Button>
          </form>
        ) : <>

        <a
          href={`/api/auth/google?return_to=${encodeURIComponent(nextUrl)}`}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <LogIn className="w-4 h-4" />
          Entrar com Google
        </a>

        <form onSubmit={handlePasswordLogin} className="mt-5 space-y-2 text-left">
          <Input type="email" autoComplete="username" required placeholder="E-mail cadastrado" value={email} onChange={event=>setEmail(event.target.value)} />
          <Input type="password" autoComplete="current-password" required placeholder="Senha" value={password} onChange={event=>setPassword(event.target.value)} />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button type="submit" variant="outline" className="w-full" disabled={loading}>{loading ? 'Entrando...' : 'Entrar com e-mail e senha'}</Button>
        </form>

        <Button
          variant="outline"
          className="w-full mt-3 gap-2"
          onClick={handleCadastro}
        >
          <UserPlus className="w-4 h-4" />
          Solicitar / criar acesso
        </Button>
        <a className="block mt-3 text-sm underline text-slate-600" href="/Cadastro">Esqueci minha senha</a>
        </>}
      </div>
    </div>
  );
}
