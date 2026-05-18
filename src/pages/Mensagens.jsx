import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isCoordenador, isObservador, isPatrocinador } from '@/components/auth/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Send, Save, Users, Eye, ChevronLeft, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import MensagensHistorico from '@/components/mensagens/MensagensHistorico';
import MensagensDestinatarios from '@/components/mensagens/MensagensDestinatarios';
import MensagensPreview from '@/components/mensagens/MensagensPreview';

const VIEWS = { form: 'form', preview: 'preview', historico: 'historico' };

export default function Mensagens() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [authorized, setAuthorized] = useState(null); // null=loading
  const [readOnlySponsor, setReadOnlySponsor] = useState(false);
  const [view, setView] = useState(VIEWS.form);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    titulo: '',
    assunto: '',
    corpo: '',
    enviar_email: true,
    exibir_banner: false,
    data_expiracao: '',
  });

  const [destinatarios, setDestinatarios] = useState([]);
  const [filtros, setFiltros] = useState({});
  const [currentMessageId, setCurrentMessageId] = useState(null);

  useEffect(() => {
    base44.auth.me().then(async (u) => {
      setUser(u);
      let permission = null;
      try {
        const permissions = await base44.entities.UserPermission.filter({ user_email: u.email.toLowerCase() });
        permission = permissions?.[0] || null;
      } catch {}
      const userWithPermission = { ...u, base_role: permission?.base_role || u.base_role };
      const sponsor = isPatrocinador(userWithPermission) || isObservador(userWithPermission, permission);
      setReadOnlySponsor(sponsor);
      const allowed = sponsor || isCoordenador(userWithPermission) || u?.role === 'admin' || u?.role === 'ADMIN';
      setAuthorized(allowed);
    }).catch(() => setAuthorized(false));
  }, []);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSaveDraft() {
    if (!form.titulo || !form.corpo) {
      toast({ title: 'Preencha título e corpo da mensagem.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const data = {
        ...form,
        status: 'rascunho',
        destinatarios,
        filtros_destinatarios: filtros,
        remetente_email: user?.email,
        remetente_nome: user?.full_name || user?.email,
        total_destinatarios: destinatarios.length,
      };
      let msg;
      if (currentMessageId) {
        msg = await base44.entities.SystemMessage.update(currentMessageId, data);
      } else {
        msg = await base44.entities.SystemMessage.create(data);
        setCurrentMessageId(msg.id);
      }
      toast({ title: 'Mensagem salva como rascunho.' });
    } catch (e) {
      toast({ title: 'Erro ao salvar rascunho.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!form.titulo || !form.assunto || !form.corpo) {
      toast({ title: 'Preencha título, assunto e corpo.', variant: 'destructive' });
      return;
    }
    if (destinatarios.length === 0) {
      toast({ title: 'Selecione ao menos um destinatário.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // Garante que existe um registro salvo
      let msgId = currentMessageId;
      if (!msgId) {
        const msg = await base44.entities.SystemMessage.create({
          ...form,
          status: 'rascunho',
          destinatarios,
          filtros_destinatarios: filtros,
          remetente_email: user?.email,
          remetente_nome: user?.full_name || user?.email,
          total_destinatarios: destinatarios.length,
        });
        msgId = msg.id;
        setCurrentMessageId(msgId);
      }

      const res = await base44.functions.invoke('sendSystemMessage', {
        messageId: msgId,
        destinatarios,
        assunto: form.assunto,
        corpo: form.corpo,
        titulo: form.titulo,
        enviar_email: form.enviar_email,
      });

      if (res.data?.ok) {
        toast({ title: 'Mensagem enviada com sucesso.' });
        // Reset
        setForm({ titulo: '', assunto: '', corpo: '', enviar_email: true, exibir_banner: false, data_expiracao: '' });
        setDestinatarios([]);
        setFiltros({});
        setCurrentMessageId(null);
        setView(VIEWS.historico);
      } else {
        toast({ title: res.data?.error || 'Não foi possível enviar a mensagem.', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Erro ao enviar mensagem. Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (authorized === null) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-lg font-semibold">Acesso restrito</p>
        <p className="text-sm">Apenas coordenadores e administradores podem acessar esta área.</p>
      </div>
    );
  }

  if (readOnlySponsor) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mensagens</h1>
          <p className="text-sm text-slate-500 mt-0.5">Comunicados institucionais e avisos publicados para acompanhamento.</p>
        </div>
        <MensagensHistorico />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mensagens</h1>
          <p className="text-sm text-slate-500 mt-0.5">Envie comunicados internos e e-mails para usuários do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === VIEWS.form ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView(VIEWS.form)}
          >
            Nova mensagem
          </Button>
          <Button
            variant={view === VIEWS.historico ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView(VIEWS.historico)}
          >
            Histórico
          </Button>
        </div>
      </div>

      {view === VIEWS.historico && <MensagensHistorico />}

      {view === VIEWS.preview && (
        <MensagensPreview
          form={form}
          destinatarios={destinatarios}
          onBack={() => setView(VIEWS.form)}
          onConfirm={handleSend}
          loading={loading}
        />
      )}

      {view === VIEWS.form && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulário principal */}
          <div className="lg:col-span-2 space-y-5 bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 text-base">Composição da mensagem</h2>

            <div className="space-y-1">
              <Label>Título interno</Label>
              <Input
                placeholder="Ex: Comunicado sobre envio de NFs — Abril 2026"
                value={form.titulo}
                onChange={(e) => updateForm('titulo', e.target.value)}
              />
              <p className="text-xs text-slate-400">Apenas para controle interno (não aparece no e-mail)</p>
            </div>

            <div className="space-y-1">
              <Label>Assunto do e-mail</Label>
              <Input
                placeholder="Ex: Prazo de envio de documentos — Museus Centro"
                value={form.assunto}
                onChange={(e) => updateForm('assunto', e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Corpo da mensagem</Label>
              <Textarea
                placeholder="Digite aqui o conteúdo completo da mensagem..."
                value={form.corpo}
                onChange={(e) => updateForm('corpo', e.target.value)}
                rows={10}
                className="resize-none"
              />
            </div>

            {/* Opções de envio */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <p className="text-sm font-medium text-slate-700">Canais de envio</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enviar_email}
                  onChange={(e) => updateForm('enviar_email', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-slate-700">Enviar por e-mail para os destinatários</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.exibir_banner}
                  onChange={(e) => updateForm('exibir_banner', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-slate-700">Exibir como aviso no sistema (banner)</span>
              </label>
              {form.exibir_banner && (
                <div className="space-y-1 ml-7">
                  <Label>Data de expiração do aviso</Label>
                  <Input
                    type="date"
                    value={form.data_expiracao}
                    onChange={(e) => updateForm('data_expiracao', e.target.value)}
                    className="max-w-xs"
                  />
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleSaveDraft} disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                Salvar rascunho
              </Button>
              <Button
                onClick={() => {
                  if (!form.titulo || !form.assunto || !form.corpo) {
                    toast({ title: 'Preencha título, assunto e corpo antes de pré-visualizar.', variant: 'destructive' });
                    return;
                  }
                  if (destinatarios.length === 0) {
                    toast({ title: 'Selecione ao menos um destinatário.', variant: 'destructive' });
                    return;
                  }
                  setView(VIEWS.preview);
                }}
                disabled={loading}
              >
                <Eye className="w-4 h-4 mr-2" />
                Pré-visualizar e enviar
              </Button>
            </div>
          </div>

          {/* Painel de destinatários */}
          <div className="lg:col-span-1">
            <MensagensDestinatarios
              destinatarios={destinatarios}
              setDestinatarios={setDestinatarios}
              filtros={filtros}
              setFiltros={setFiltros}
            />
          </div>
        </div>
      )}
    </div>
  );
}
