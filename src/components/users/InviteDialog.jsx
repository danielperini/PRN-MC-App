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
  { value: 'PROFISSIONAL', label: 'Profissional' },
  { value: 'COORD_PRODUCAO', label: 'Coordenação de Produção' },
  { value: 'COORD_ADMINISTRATIVA', label: 'Coordenação Administrativa' },
  { value: 'COORD_COMUNICACAO', label: 'Coordenação de Comunicação' },
  { value: 'CONSULTORIA_PROGRAMACAO', label: 'Consultoria Programação' },
  { value: 'COORDENADOR', label: 'Coordenação Geral' },
  { value: 'ADMIN', label: 'Administração' },
];

export default function InviteDialog({ open, onClose, cadastroUrl }) {
  const [tab, setTab] = useState('link');
  const [copied, setCopied] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', full_name: '', role: 'PROFISSIONAL', message: '' });

  const copyLink = () => {
    navigator.clipboard.writeText(cadastroUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success('Link copiado!');
  };

  const whatsappText = encodeURIComponent(
    `Olá! Você foi convidado(a) para acessar a plataforma de relatórios dos Museus Centro.\n\nPara solicitar seu acesso, preencha o formulário neste link:\n${cadastroUrl}\n\nApós o envio, sua solicitação será analisada e você receberá instruções de acesso.`
  );

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      if (!emailForm.email) throw new Error('Informe o email do convidado');
      const res = await base44.functions.invoke('sendDirectInviteEmail', emailForm);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success(`Convite enviado para ${emailForm.email}!`);
      setEmailForm({ email: '', full_name: '', role: 'PROFISSIONAL', message: '' });
      onClose();
    },
    onError: (e) => toast.error(e.message || 'Erro ao enviar convite'),
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

          {/* ── ABA: LINK COM APROVAÇÃO ── */}
          <TabsContent value="link" className="space-y-5 mt-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                O profissional preenche um formulário e a solicitação fica <strong>pendente de aprovação</strong> sua antes de obter acesso.
              </p>
            </div>

            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Link do formulário de cadastro</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 break-all text-gray-700">
                  {cadastroUrl}
                </code>
                <Button size="icon" variant="outline" onClick={copyLink} className="flex-shrink-0 h-10 w-10">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={copyLink}>
                {copied ? <Check className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copiado!' : 'Copiar link'}
              </Button>
              <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="outline" className="w-full gap-2 text-green-700 border-green-200 hover:bg-green-50">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm.029 18.88c-1.161 0-2.305-.292-3.318-.844l-3.677.965.984-3.595a6.844 6.844 0 01-.92-3.467C5.098 8.516 8.052 5.12 12.028 5.12c1.961 0 3.791.765 5.169 2.15a7.264 7.264 0 012.141 5.166c-.001 4.016-3.269 7.444-7.309 7.444z"/>
                  </svg>
                  WhatsApp
                </Button>
              </a>
            </div>

            <p className="text-xs text-gray-400 text-center">
              Após o envio do formulário, a solicitação aparecerá em <strong>Solicitações de Acesso</strong> aguardando sua aprovação.
            </p>
          </TabsContent>

          {/* ── ABA: EMAIL DIRETO ── */}
          <TabsContent value="email" className="space-y-4 mt-4">
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-lg">
              <UserCheck className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-green-700">
                O profissional recebe um email com o acesso <strong>já pré-aprovado</strong>. Ele só precisa completar o cadastro.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Email <span className="text-red-500">*</span></Label>
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={emailForm.email}
                  onChange={e => setEmailForm({ ...emailForm, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Nome (opcional)</Label>
                <Input
                  placeholder="Nome do profissional"
                  value={emailForm.full_name}
                  onChange={e => setEmailForm({ ...emailForm, full_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Cargo</Label>
                <Select value={emailForm.role} onValueChange={v => setEmailForm({ ...emailForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARGO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mensagem personalizada (opcional)</Label>
                <Textarea
                  placeholder="Adicione uma mensagem ao email de convite..."
                  value={emailForm.message}
                  onChange={e => setEmailForm({ ...emailForm, message: e.target.value })}
                  className="min-h-[70px]"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {tab === 'email' && (
            <Button
              className="bg-black hover:bg-gray-800 text-white gap-2"
              onClick={() => sendEmailMutation.mutate()}
              disabled={sendEmailMutation.isPending || !emailForm.email}
            >
              <Send className="w-4 h-4" />
              {sendEmailMutation.isPending ? 'Enviando...' : 'Enviar convite'}
            </Button>
          )}
          {tab === 'link' && (
            <Button className="bg-black hover:bg-gray-800 text-white gap-2" onClick={copyLink}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado!' : 'Copiar link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}