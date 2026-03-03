import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Building2, CheckCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Outro'];
const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];

const EMPTY = { full_name: '', email: '', funcao: '', museu: '', equipe: '', mensagem: '' };

export default function Cadastro() {
  const [form, setForm] = useState(EMPTY);
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => {
      if (!form.full_name || !form.email || !form.funcao || !form.museu) {
        throw new Error('Preencha todos os campos obrigatórios.');
      }
      return base44.entities.UserRegistration.create({ ...form, status: 'PENDENTE' });
    },
    onSuccess: () => setDone(true),
    onError: (e) => toast.error(e.message || 'Erro ao enviar solicitação. Tente novamente.'),
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
              Preencha o formulário abaixo. Após a análise de um coordenador, você receberá um convite por e-mail.
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
              <Label>Função <span className="text-red-500">*</span></Label>
              <Select value={form.funcao} onValueChange={v => set('funcao', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione sua função" /></SelectTrigger>
                <SelectContent>
                  {FUNCOES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <div>
              <Label>Equipe</Label>
              <Select value={form.equipe} onValueChange={v => set('equipe', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione a equipe (opcional)" /></SelectTrigger>
                <SelectContent>
                  {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mensagem (opcional)</Label>
              <Textarea
                placeholder="Fale um pouco sobre sua atuação nos museus..."
                value={form.mensagem}
                onChange={e => set('mensagem', e.target.value)}
                className="min-h-[80px]"
              />
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
        </div>
      </main>
    </div>
  );
}