import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Building2, LogIn, Send, CheckCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { recoverExistingUserAccess, normalizeEmail } from '@/utils/auth/recoverExistingUserAccess';

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const ROLES = [
  { value: 'COORDENADOR', label: 'Coordenador' },
  { value: 'PROFISSIONAL', label: 'Profissional' },
  { value: 'OBSERVADOR', label: 'Observador' },
];
const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Outro'];

function NativeSelect({ value, onChange, placeholder, options }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{placeholder}</option>
      {options.map((item) => (
        <option key={item.value || item} value={item.value || item}>{item.label || item}</option>
      ))}
    </select>
  );
}

const UserNotRegisteredError = () => {
  const [step, setStep] = useState('welcome'); // welcome | form | done
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [form, setForm] = useState({ full_name: '', email: '', museu: '', role: 'PROFISSIONAL', funcao: '' });
  const [approvedRegistration, setApprovedRegistration] = useState(null);
  const [recoveringAccess, setRecoveringAccess] = useState(true);


  // Tentar pré-preencher com dados do usuário autenticado
  useEffect(() => {
    base44.auth.me().then(async (u) => {
      if (u?.email) {
        const email = normalizeEmail(u.email);
        setUserEmail(email);
        setUserName(u.full_name || '');
        setForm(prev => ({
          ...prev,
          email,
          full_name: u.full_name || '',
        }));

        try {
          const recovered = await recoverExistingUserAccess({ ...u, email }, { origin: 'user-not-registered-screen' });
          if (recovered.recovered) {
            setApprovedRegistration({ email, status: 'APROVADO', recovered: true });
            setRecoveringAccess(false);
            setTimeout(() => {
              window.location.reload();
            }, 1200);
            return;
          }

          const registrations = await base44.entities.UserRegistration.filter({
            email,
          });

          const approved = registrations.find(r => r.status === 'APROVADO');

          if (approved) {
            setApprovedRegistration(approved);

            setTimeout(() => {
              window.location.reload();
            }, 2500);
          }
        } catch (e) {
          console.warn('Falha ao verificar aprovação:', e);
        }
        setRecoveringAccess(false);
      } else {
        setRecoveringAccess(false);
      }
    }).catch(() => setRecoveringAccess(false));
  }, []);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const setRole = (role) => setForm(prev => ({
    ...prev,
    role,
    funcao: role === 'OBSERVADOR' ? 'Observador' : prev.funcao,
    equipe: role === 'OBSERVADOR' ? 'Observador' : prev.equipe,
    museu: role === 'OBSERVADOR' && !prev.museu ? 'Atuação Geral' : prev.museu,
  }));

  const handleSubmit = async () => {
    if (!form.full_name || !form.email || !form.museu) {
      setError('Preencha nome, e-mail e museu de atuação.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await base44.entities.UserRegistration.create({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        museu: form.museu,
        role: form.role || 'PROFISSIONAL',
        base_role: form.role || 'PROFISSIONAL',
        funcao: form.funcao || '',
        equipe: form.role === 'OBSERVADOR' ? 'Observador' : '',
        status: 'PENDENTE',
      });
      setStep('done');
    } catch (e) {
      setError(e?.message || 'Não foi possível enviar a solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginOther = () => {
    base44.auth.logout('/');
  };

  const handleLoginGoogle = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  if (recoveringAccess) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin mb-5" />
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Verificando acesso existente</h1>
        <p className="text-slate-500 max-w-md text-sm">
          Estamos sincronizando automaticamente cadastros antigos, permissÃµes e histÃ³rico do usuÃ¡rio antes de solicitar novo cadastro.
        </p>
      </div>
    );
  }

  if (approvedRegistration) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-5">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>

        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Acesso liberado!
        </h1>

        <p className="text-slate-500 max-w-md text-sm">
          Seu cadastro foi aprovado pela coordenação.
          O sistema está finalizando seu acesso automaticamente.
        </p>

        <Button
          onClick={() => window.location.reload()}
          className="mt-6 bg-black hover:bg-neutral-800"
        >
          Entrar no sistema
        </Button>
      </div>
    );
  }


  // ── Tela de sucesso ───────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-5">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Solicitação enviada!</h1>
        <p className="text-slate-500 max-w-sm text-sm">
          Sua solicitação foi registrada. Após aprovação da coordenação, seu acesso será liberado para o método de login usado.
        </p>
        <button
          onClick={handleLoginOther}
          className="mt-6 text-xs text-slate-400 underline underline-offset-2"
        >
          Sair e usar outro e-mail
        </button>
      </div>
    );
  }

  // ── Formulário de cadastro ────────────────────────────────────────
  if (step === 'form') {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <header className="border-b border-gray-100">
          <div className="max-w-lg mx-auto px-6 py-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-black text-sm">Museus Centro</span>
          </div>
        </header>

        <main className="flex-1 flex items-start justify-center px-6 py-10">
          <div className="w-full max-w-lg">
            <h1 className="text-xl font-semibold text-slate-900 mb-1">Solicitar acesso</h1>
            <p className="text-sm text-slate-500 mb-6">
              Preencha os dados abaixo. Após análise de um coordenador seu acesso será liberado.
            </p>

            <div className="space-y-4">
              <div>
                <Label>Nome completo <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Seu nome completo"
                  value={form.full_name}
                  onChange={e => set('full_name', e.target.value)}
                />
              </div>
              <div>
                <Label>E-mail <span className="text-red-500">*</span></Label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                />
              </div>
              <div>
                <Label>Perfil de acesso <span className="text-red-500">*</span></Label>
                <NativeSelect
                  value={form.role}
                  onChange={setRole}
                  placeholder="Selecione o perfil"
                  options={ROLES}
                />
              </div>
              <div>
                <Label>Museu de atuação <span className="text-red-500">*</span></Label>
                <NativeSelect
                  value={form.museu}
                  onChange={v => set('museu', v)}
                  placeholder="Selecione o museu"
                  options={MUSEUS}
                />
              </div>
              {form.role !== 'OBSERVADOR' ? (
                <div>
                  <Label>Função</Label>
                  <NativeSelect
                    value={form.funcao}
                    onChange={v => set('funcao', v)}
                    placeholder="Selecione uma função"
                    options={FUNCOES}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Perfil observador selecionado. Função e equipe serão preenchidas como <strong>Observador</strong>.
                </div>
              )}
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}

            <Button
              className="w-full mt-5 bg-black hover:bg-gray-800 text-white gap-2"
              onClick={handleSubmit}
              disabled={loading}
            >
              <Send className="w-4 h-4" />
              {loading ? 'Enviando...' : 'Enviar solicitação'}
            </Button>

            <button
              onClick={() => setStep('welcome')}
              className="mt-3 w-full text-xs text-slate-400 underline underline-offset-2"
            >
              Voltar
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Tela de boas-vindas (padrão) ──────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-3">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 text-center">Museus Centro</h1>
          <p className="text-sm text-slate-500 text-center mt-1">Viaduto das Artes</p>
        </div>

        {/* Card principal */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          {userEmail ? (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800">
              <p className="font-medium mb-0.5">Conta não cadastrada</p>
              <p className="text-xs text-amber-700">
                <strong>{userEmail}</strong> ainda não possui acesso liberado nesta plataforma.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Esta plataforma é restrita à equipe do projeto. Faça login com Google, Microsoft ou e-mail e senha, ou solicite acesso abaixo.
            </p>
          )}

          {/* Entrar pelo provedor de login */}
          <button
            onClick={handleLoginGoogle}
            className="w-full flex items-center justify-center gap-3 h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Entrar ou continuar login
          </button>

          <p className="text-xs text-center text-slate-400">
            Recomendado · acesso rápido e seguro
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400">ou</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Solicitar acesso */}
          <button
            onClick={() => setStep('form')}
            className="w-full flex items-center justify-between h-11 px-4 border border-slate-200 hover:bg-slate-50 rounded-xl text-sm text-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Send className="w-4 h-4 text-slate-400" />
              Solicitar acesso ao sistema
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          {/* Trocar conta */}
          {userEmail && (
            <button
              onClick={handleLoginOther}
              className="w-full flex items-center justify-between h-11 px-4 border border-slate-200 hover:bg-slate-50 rounded-xl text-sm text-slate-600 transition-colors"
            >
              <span className="flex items-center gap-2">
                <LogIn className="w-4 h-4 text-slate-400" />
                Sair e usar outro e-mail
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Para e-mail e senha, use a página de cadastro para criar o acesso.
        </p>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
