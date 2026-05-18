import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Copy, Check, Link2, Mail, Send, UserCheck, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';

const CARGO_OPTIONS = [
  { value: 'COORDENADOR', label: 'Coordenador' },
  { value: 'PROFISSIONAL', label: 'Profissional' },
  { value: 'OBSERVADOR', label: 'Observador' },
];

export default function InviteDialog({ open, onClose, cadastroUrl }) {
  const [tab, setTab] = useState('link');
  const [copied, setCopied] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', full_name: '', role: 'PROFISSIONAL', message: '' });

  const updateEmailRole = (role) => {
    setEmailForm((prev) => ({
      ...prev,
      role,
      funcao: role === 'OBSERVADOR' ? 'Observador' : prev.funcao,
      equipe: role === 'OBSERVADOR' ? 'Observador' : prev.equipe,
    }));
  };

  const copyLink = () => {
    navigator.clipboard.writeText(cadastroUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success('Link copiado!');
  };

  const whatsappText = encodeURIComponent(
    `Olá! Você foi convidado(a) para acessar a plataforma de relatórios dos Museus Centro.\n\nPara solicitar seu acesso, preencha o formulário neste link:\n${cadastroUrl}\n\nApós o envio, sua solicitação será analisada e você receberá instruções de acesso.`
  );

  // ✅ CORREÇÃO: remover dependência do Builder+
  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      if (!emailForm.email) throw new Error('Informe o email do convidado');

      // 🔴 REMOVIDO (Builder+)
      // const res = await base44.functions.invoke('sendDirectInviteEmail', emailForm);

      // ✅ SIMULAÇÃO LOCAL
      return {
        ok: true,
      };
    },
    onSuccess: () => {
      toast.success(`Convite preparado para ${emailForm.email}`);

      toast.message(
        'Envio automático de email indisponível neste plano. Compartilhe o link manualmente.',
        { duration: 5000 }
      );

      // opcional: já copia o link automaticamente
      navigator.clipboard.writeText(cadastroUrl);

      setEmailForm({ email: '', full_name: '', role: 'PROFISSIONAL', message: '' });
      onClose();
    },
    onError: (e) => toast.error(e.message || 'Erro ao processar convite'),
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Convidar Usuário</DialogTitle>
          <DialogDescription>Escolha como deseja convidar o novo profissional</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="link" className="flex-1 gap-2">
              <Link2 className="w-4 h-4" />
              Link público
            </TabsTrigger>
            <TabsTrigger value="email" className="flex-1 gap-2">
              <Mail className="w-4 h-4" />
              Email direto
            </TabsTrigger>
          </TabsList>

          {/* LINK */}
          <TabsContent value="link" className="space-y-5 mt-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                O profissional preenche um formulário e a solicitação fica <strong>pendente de aprovação</strong>.
              </p>
            </div>

            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Link do formulário</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-50 border rounded-lg px-3 py-2.5 break-all">
                  {cadastroUrl}
                </code>
                <Button size="icon" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={copyLink}>
                {copied ? 'Copiado!' : 'Copiar link'}
              </Button>
              <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="outline" className="w-full">WhatsApp</Button>
              </a>
            </div>
          </TabsContent>

          {/* EMAIL */}
          <TabsContent value="email" className="space-y-4 mt-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-lg">
              <Mail className="w-4 h-4 text-red-600 mt-0.5" />
              <p className="text-xs text-red-700">
                O envio automático de email está <strong>indisponível neste plano</strong>.
                Use esta aba apenas para preparar o convite e compartilhar manualmente.
              </p>
            </div>

            <div className="space-y-3">
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={emailForm.email}
                onChange={e => setEmailForm({ ...emailForm, email: e.target.value })}
              />
              <Input
                placeholder="Nome"
                value={emailForm.full_name}
                onChange={e => setEmailForm({ ...emailForm, full_name: e.target.value })}
              />
              <Select value={emailForm.role} onValueChange={updateEmailRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARGO_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Mensagem"
                value={emailForm.message}
                onChange={e => setEmailForm({ ...emailForm, message: e.target.value })}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>

          {tab === 'email' && (
            <Button
              onClick={() => sendEmailMutation.mutate()}
              disabled={!emailForm.email}
            >
              <Send className="w-4 h-4 mr-2" />
              Preparar convite
            </Button>
          )}

          {tab === 'link' && (
            <Button onClick={copyLink}>
              {copied ? 'Copiado!' : 'Copiar link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
