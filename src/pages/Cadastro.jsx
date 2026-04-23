import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Building2, CheckCircle, Send, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastMessages } from '@/lib/toastMessages';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Outro'];
const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];

const EMPTY = {
  full_name: '',
  email: '',
  museu: '',
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

  if (!normalized) return false;

  return (
    normalized.endsWith('@pbh.gov.br') ||
    normalized.endsWith('@viadutodasartes.org.br') ||
    normalized.endsWith('@periniprojetos.com.br')
  );
}

export default function Cadastro() {
  const [form, setForm] = useState(EMPTY);
  const [done, setDone] = useState(false);
  const [directAccessCreated, setDirectAccessCreated] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const directPasswordFlow = isAllowedDirectPasswordDomain(form.email);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.full_name || !form.email || !form.museu) {
        throw new Error('Preencha todos os campos obrigatórios.');
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

        return base44.functions.invoke('createUserWithPassword', {
          email: normalizeEmail(form.email),
          full_name: form.full_name,
          museu: form.museu,
          funcao: form.funcao || '',
          equipe: form.equipe || '',
          password: form.password,
          role: 'PROFISSIONAL',
        });
      }

      return base44.entities.UserRegistration.create({
        full_name: form.full_name,
        email: normalizeEmail(form.email),
        museu: form.museu,
        funcao: form.funcao || '',
        equipe: form.equipe || '',
        status: 'PENDENTE',
      });
    },
    onSuccess: () => {
      if (directPasswordFlow) {
        toastMessages.createSuccess('Acesso criado com sucesso! Você já pode entrar com e-mail e senha.');
        setDirectAccessCreated(true);
        setDone(true);
        return;
      }

      toastMessages.createSuccess();
      setDone(true);
    },
    onError: (e) => toastMessages.createFailed(e.message),
  });

  const recoveryMutation = useMutation({
    mutationFn: () => {
      if (!recoveryEmail) {
        throw new Error('Preencha seu email.');
      }
      return base44.functions.invoke('recoverPassword', {
        email: normalizeEmail(recoveryEmail),
      });
    },
    onSuccess: () => {
      toastMessages.info('Senha temporária enviada! Verifique seu email.');
      setRecoveryEmail('');
      setShowRecovery(false);
    },
    onError: (e) => toastMessages.createFailed(e.message),
  });

  if (done) {
    if (directAccessCreated) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-5">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-black mb-2">Acesso criado!</h1>
          <p className="text-gray-500 max-w-md mb-6">
            Seu usuário foi criado com sucesso. Agora você já pode entrar usando seu e-mail e a senha cadastrada.
          </p>
          <Button
            className="bg-black hover:bg-gray-800 text-white"
            onClick={() => base44.auth.redirectToLogin()}
          >
            Ir para o login
          </Button>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-5">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-semibold text-black mb-2">Solicitação enviada!</h1>
        <p className="text-gray-500 max-w-md">
          Sua solicitação de acesso foi registrada. Um coordenador irá revisá-la e você receberá um convite por e-mail assim que aprovada.
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
              {directPasswordFlow ? 'Criar acesso à plataforma' : 'Solicitar acesso à plataforma'}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              {directPasswordFlow
                ? 'Seu domínio permite criação imediata de acesso com senha.'
                : 'Preencha o formulário abaixo. Após a análise de um coordenador seu perfil poderá ser aprovado.'}
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
                Museu de atuação <span className="text-red-500">*</span>
              </Label>
              <Select value={form.museu} onValueChange={(v) => set('museu', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o museu" />
                </SelectTrigger>
                <SelectContent>
                  {MUSEUS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Função</Label>
              <Select value={form.funcao} onValueChange={(v) => set('funcao', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  {FUNCOES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Equipe</Label>
              <Select value={form.equipe} onValueChange={(v) => set('equipe', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a equipe" />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPES.map((equipe) => (
                    <SelectItem key={equipe} value={equipe}>
                      {equipe}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google
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
            <DialogTitle>Recuperar Senha</DialogTitle>
            <DialogDescription>
              Digite seu email de cadastro. Enviaremos uma senha temporária para você.
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
              {recoveryMutation.isPending ? 'Enviando...' : 'Enviar Senha Temporária'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
