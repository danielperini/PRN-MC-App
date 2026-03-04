import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Building2, CheckCircle, Send, HelpCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Outro'];
const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];

const EMPTY = { full_name: '', email: '', museu: '' };

export default function Cadastro() {
  const [form, setForm] = useState(EMPTY);
  const [done, setDone] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => {
      if (!form.full_name || !form.email || !form.museu) {
        throw new Error('Preencha todos os campos obrigatórios.');
      }
      return base44.entities.UserRegistration.create({ ...form, status: 'PENDENTE' });
    },
    onSuccess: () => {
      toast.success('Solicitação enviada com sucesso! Aguarde a análise de um coordenador.');
      setDone(true);
    },
    onError: (e) => toast.error(e.message || 'Erro ao enviar solicitação. Tente novamente.'),
  });

  const recoveryMutation = useMutation({
    mutationFn: () => {
      if (!recoveryEmail) {
        throw new Error('Preencha seu email.');
      }
      return base44.functions.invoke('recoverPassword', { email: recoveryEmail });
    },
    onSuccess: () => {
      toast.success('Senha temporária enviada! Verifique seu email.');
      setRecoveryEmail('');
      setShowRecovery(false);
    },
    onError: (e) => toast.error(e.message || 'Erro ao recuperar senha.'),
  });

  if (done) {
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
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-black text-base">Museus Centro</span>
        </div>
      </header>

      {/* Form */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-black tracking-tight">Solicitar acesso à plataforma</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Preencha o formulário abaixo. Após a análise de um coordenador seu perfil poderá ser aprovado.
            </p>
          </div>

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
              <Label>Museu de atuação <span className="text-red-500">*</span></Label>
              <Select value={form.museu} onValueChange={v => set('museu', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o museu" /></SelectTrigger>
                <SelectContent>
                  {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full mt-6 bg-black hover:bg-gray-800 text-white gap-2"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <Send className="w-4 h-4" />
            {mutation.isPending ? 'Enviando...' : 'Enviar solicitação'}
          </Button>

          <div className="mt-4">
            <Button
              variant="outline"
              className="w-full gap-2 border-gray-300"
              onClick={() => setShowRecovery(true)}
            >
              <HelpCircle className="w-4 h-4" />
              Esqueci minha senha
            </Button>
          </div>
          </div>
          </main>

          {/* Recovery Password Dialog */}
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
              onChange={e => setRecoveryEmail(e.target.value)}
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