import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Building2, CheckCircle, Send, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastMessages } from '@/lib/actionFeedback';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const ROLES = [
  { value: 'COORDENADOR', label: 'Coordenador' },
  { value: 'PROFISSIONAL', label: 'Profissional' },
  { value: 'OBSERVADOR', label: 'Observador' },
];
const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Outro'];
const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];

const EMPTY = {
  full_name: '',
  email: '',
  museu: '',
  role: 'PROFISSIONAL',
  funcao: '',
  equipe: '',
  password: '',
  confirm_password: '',
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAllowedDirectPasswordDomain(email) {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function NativeSelect({ value, onChange, placeholder, options }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{placeholder}</option>
      {options.map((item) => (
        <option key={item.value || item} value={item.value || item}>
          {item.label || item}
        </option>
      ))}
    </select>
  );
}

export default function Cadastro() {
  const [form, setForm] = useState(EMPTY);
  const [done, setDone] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');

  const set = (k, v) => {
    setForm((prev) => ({
      ...prev,
      [k]: v,
    }));
  };

  const setRole = (role) => {
    setForm((prev) => ({
      ...prev,
      role,
      funcao: role === 'OBSERVADOR' ? 'Observador' : prev.funcao,
      equipe: role === 'OBSERVADOR' ? 'Observador' : prev.equipe,
      museu: role === 'OBSERVADOR' && !prev.museu ? 'Atuação Geral' : prev.museu,
    }));
  };

  const directPasswordFlow = isAllowedDirectPasswordDomain(form.email);

  const mutation = useMutation({
    mutationFn: async () => {
      const email = normalizeEmail(form.email);

      if (!form.full_name || !email || !form.museu) {
        throw new Error('Preencha nome, e-mail e museu de atuação.');
      }

      if (!isAllowedDirectPasswordDomain(email)) {
        throw new Error('Informe um e-mail válido para criar acesso com senha.');
      }

      if (directPasswordFlow) {
        if (!form.password || !form.confirm_password) {
          throw new Error('Preencha senha e confirmação de senha.');
        }

        if (form.password.length < 8) {
          throw new Error('A senha deve ter no mínimo 8 caracteres.');
        }

        if (form.password !== form.confirm_password) {
          throw new Error('A confirmação de senha não confere.');
        }

        try {
          await base44.functions.invoke('createUserWithPassword', {
            email,
            full_name: form.full_name.trim(),
            museu: form.museu,
            funcao: form.funcao || '',
            equipe: form.equipe || '',
            password: form.password,
            role: form.role || 'PROFISSIONAL',
            base_role: form.role || 'PROFISSIONAL',
            require_approval: true,
            acesso_liberado: false,
            status: 'PENDENTE',
            login_provider: 'email_password',
          });
        } catch (error) {
          console.warn('Cadastro com senha aguardará aprovação via UserRegistration:', error);
        }

        const existing = await base44.entities.UserRegistration.filter({ email });
        const activeRequest = existing.find((item) => ['PENDENTE', 'APROVADO'].includes(item.status));
        if (activeRequest?.status === 'APROVADO') {
          throw new Error('Este e-mail já possui aprovação. Use a tela de login para entrar.');
        }
        if (activeRequest?.status === 'PENDENTE') {
          return activeRequest;
        }
      }

      return base44.entities.UserRegistration.create({
        full_name: form.full_name.trim(),
        email,
        museu: form.museu,
        role: form.role || 'PROFISSIONAL',
        base_role: form.role || 'PROFISSIONAL',
        funcao: form.funcao || '',
        equipe: form.equipe || '',
        login_provider: 'email_password',
        acesso_liberado: false,
        status: 'PENDENTE',
      });
    },
    onSuccess: () => {
      toastMessages.sent();
      setDone(true);
    },
    onError: (error) => {
      toastMessages.createFailed(error?.message || 'Não foi possível enviar a solicitação.');
    },
  });

  const recoveryMutation = useMutation({
    mutationFn: async () => {
      const email = normalizeEmail(recoveryEmail);

      if (!email) {
        throw new Error('Preencha seu e-mail.');
      }

      return base44.functions.invoke('recoverPassword', { email });
    },
    onSuccess: () => {
      toastMessages.info('Senha temporária enviada. Verifique seu e-mail.');
      setRecoveryEmail('');
      setShowRecovery(false);
    },
    onError: (error) => {
      toastMessages.sendFailed(error?.message);
    },
  });

  if (done) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-5">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>

        <h1 className="text-2xl font-semibold text-black mb-2">Solicitação enviada!</h1>

        <p className="text-gray-500 max-w-md">
          Sua solicitação de acesso foi registrada. Um coordenador precisa aprovar seu perfil antes do primeiro login.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-black text-base">Museus Centro</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-black tracking-tight">
              {directPasswordFlow ? 'Criar acesso com e-mail e senha' : 'Solicitar acesso à plataforma'}
            </h1>

            <p className="text-gray-500 mt-1 text-sm">
              {directPasswordFlow
                ? 'Preencha seus dados e defina uma senha para acessar sem Google ou Microsoft.'
                : 'Informe um e-mail válido para criar acesso com senha ou solicitar acesso.'}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label>
                Nome completo <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Seu nome completo"
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
              />
            </div>

            <div>
              <Label>
                E-mail <span className="text-red-500">*</span>
              </Label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </div>

            <div>
              <Label>
                Perfil de acesso <span className="text-red-500">*</span>
              </Label>
              <NativeSelect
                value={form.role}
                onChange={setRole}
                placeholder="Selecione o perfil"
                options={ROLES}
              />
              <p className="text-xs text-gray-500 mt-1">
                {ROLES.find((item) => item.value === form.role)?.label || 'Selecione o perfil'}
              </p>
            </div>

            <div>
              <Label>
                Museu de atuação <span className="text-red-500">*</span>
              </Label>
              <NativeSelect
                value={form.museu}
                onChange={(value) => set('museu', value)}
                placeholder="Selecione o museu"
                options={MUSEUS}
              />
            </div>

            {form.role !== 'OBSERVADOR' ? (
              <>
                <div>
                  <Label>Função</Label>
                  <NativeSelect
                    value={form.funcao}
                    onChange={(value) => set('funcao', value)}
                    placeholder="Selecione uma função"
                    options={FUNCOES}
                  />
                </div>

                <div>
                  <Label>Equipe</Label>
                  <NativeSelect
                    value={form.equipe}
                    onChange={(value) => set('equipe', value)}
                    placeholder="Selecione uma equipe"
                    options={EQUIPES}
                  />
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Perfil observador selecionado. O sistema preencherá automaticamente função e equipe como <strong>Observador</strong>.
              </div>
            )}

            {directPasswordFlow && (
              <>
                <div>
                  <Label>
                    Senha <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="password"
                    placeholder="Mínimo de 8 caracteres"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                  />
                </div>

                <div>
                  <Label>
                    Confirmar senha <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="password"
                    placeholder="Repita a senha"
                    value={form.confirm_password}
                    onChange={(e) => set('confirm_password', e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <Button
            className="w-full mt-6 bg-black hover:bg-gray-800 text-white gap-2"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <Send className="w-4 h-4" />
            {mutation.isPending
              ? directPasswordFlow
                ? 'Criando acesso...'
                : 'Enviando...'
              : directPasswordFlow
                ? 'Criar acesso'
                : 'Enviar solicitação'}
          </Button>

          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2 border-gray-300"
              onClick={() => base44.auth.redirectToLogin()}
            >
              Login Google, Microsoft ou e-mail
            </Button>

            <Button
              variant="outline"
              className="flex-1 gap-2 border-gray-300"
              onClick={() => setShowRecovery(true)}
            >
              <HelpCircle className="w-4 h-4" />
              Esqueci
            </Button>
          </div>
        </div>
      </main>

      <Dialog open={showRecovery} onOpenChange={setShowRecovery}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperar senha</DialogTitle>
            <DialogDescription>
              Digite seu e-mail de cadastro. Enviaremos uma senha temporária para você.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              type="email"
              placeholder="seu@email.com"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
            />

            <Button
              className="w-full bg-black hover:bg-gray-800 text-white"
              onClick={() => recoveryMutation.mutate()}
              disabled={recoveryMutation.isPending}
            >
              {recoveryMutation.isPending ? 'Enviando...' : 'Enviar senha temporária'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
