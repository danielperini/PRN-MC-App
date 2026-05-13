import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { LogIn, Mail, Copy, CheckCircle, Users, Eye, BarChart2, Image, Calendar } from 'lucide-react';

const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';

const TEXTO_INSTITUCIONAL = `O sistema Museus Centro / Viaduto das Artes já está disponível para acompanhamento das atividades, programação, indicadores, galerias, relatórios e execução orçamentária consolidada do projeto.

O acesso pode ser realizado preferencialmente utilizando sua conta Google institucional.

Usuários com domínio @pbh.gov.br possuem aprovação automática no sistema.

Link de acesso:
${APP_URL}`;

const OBSERVADOR_ACESSO = [
  { icon: BarChart2, label: 'Dashboard Patrocinador' },
  { icon: Eye, label: 'Relatórios aprovados' },
  { icon: Image, label: 'Galeria de Fotos' },
  { icon: Calendar, label: 'Programação e Agenda' },
  { icon: BarChart2, label: 'Execução orçamentária' },
  { icon: Users, label: 'Indicadores e KPIs' },
];

export default function ConviteAcesso() {
  const [copiado, setCopiado] = useState(false);
  const [copiadoTexto, setCopiadoTexto] = useState(false);
  const [enviandoAndre, setEnviandoAndre] = useState(false);
  const [emailConvite, setEmailConvite] = useState('');
  const [nomeConvite, setNomeConvite] = useState('');
  const [tipoConvite, setTipoConvite] = useState('patrocinador');
  const [enviandoConvite, setEnviandoConvite] = useState(false);

  const copiarLink = () => {
    navigator.clipboard.writeText(APP_URL);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
    toast.success('Link copiado!');
  };

  const copiarTexto = () => {
    navigator.clipboard.writeText(TEXTO_INSTITUCIONAL);
    setCopiadoTexto(true);
    setTimeout(() => setCopiadoTexto(false), 2500);
    toast.success('Texto copiado!');
  };

  const enviarAndre = async () => {
    setEnviandoAndre(true);
    try {
      await base44.functions.invoke('sendAccessInviteEmail', { type: 'andre' });
      toast.success('Email enviado para retinaeletricafilmes@gmail.com');
    } catch (e) {
      toast.error('Erro ao enviar: ' + e.message);
    } finally {
      setEnviandoAndre(false);
    }
  };

  const enviarConvite = async () => {
    if (!emailConvite) { toast.error('Informe o email de destino'); return; }
    setEnviandoConvite(true);
    try {
      await base44.functions.invoke('sendAccessInviteEmail', {
        type: tipoConvite,
        to: emailConvite,
        nome: nomeConvite || undefined,
      });
      toast.success(`Convite enviado para ${emailConvite}`);
      setEmailConvite('');
      setNomeConvite('');
    } catch (e) {
      toast.error('Erro ao enviar: ' + e.message);
    } finally {
      setEnviandoConvite(false);
    }
  };

  const irParaLogin = () => {
    base44.auth.redirectToLogin();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Museus Centro / Viaduto das Artes</h1>
            <p className="text-xs text-slate-500">Sistema de Gestão e Acompanhamento</p>
          </div>
          <Button onClick={irParaLogin} className="gap-2 bg-slate-900 hover:bg-slate-800 text-white">
            <LogIn className="w-4 h-4" />
            Entrar no sistema
          </Button>
        </div>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-6">

        {/* Card principal — Login Google */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-slate-900 to-slate-700 px-8 py-10 text-white text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-4">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Acesso ao Sistema</h2>
            <p className="text-slate-300 text-sm max-w-md mx-auto">
              Recomendamos utilizar sua conta Google para acesso rápido e seguro ao sistema.
            </p>
          </div>

          <div className="px-8 py-6 space-y-4">
            <Button
              onClick={irParaLogin}
              size="lg"
              className="w-full gap-3 bg-slate-900 hover:bg-slate-800 text-white h-12 text-base font-medium"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Entrar com Google
            </Button>

            <div className="flex items-center gap-3 text-sm text-slate-500">
              <div className="flex-1 h-px bg-slate-200" />
              <span>ou copie o link de acesso</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <div className="flex gap-2">
              <Input value={APP_URL} readOnly className="text-xs text-slate-600 bg-slate-50" />
              <Button variant="outline" onClick={copiarLink} className="shrink-0 gap-2">
                {copiado ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </Button>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-xs text-blue-700 font-medium mb-1">Aprovação automática</p>
              <p className="text-xs text-blue-600">
                Usuários com email <strong>@pbh.gov.br</strong> e convidados especiais entram automaticamente
                aprovados, sem necessidade de aprovação manual.
              </p>
            </div>
          </div>
        </div>

        {/* O que o Observador pode ver */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="font-semibold text-slate-900 mb-1">Perfil: Observador Patrocinador</h3>
          <p className="text-sm text-slate-500 mb-4">Acesso de leitura aos dados consolidados e aprovados do projeto.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {OBSERVADOR_ACESSO.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
                <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-xs text-slate-700">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            ✅ Visualização · ❌ Sem edição, aprovação ou acesso financeiro crítico
          </p>
        </div>

        {/* Texto institucional para copiar */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-slate-900">Texto para Patrocinadores / PBH</h3>
              <p className="text-xs text-slate-500 mt-0.5">Copie e envie para parceiros, PBH e patrocinadores.</p>
            </div>
            <Button variant="outline" size="sm" onClick={copiarTexto} className="gap-2 shrink-0">
              {copiadoTexto ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiadoTexto ? 'Copiado' : 'Copiar texto'}
            </Button>
          </div>
          <pre className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
            {TEXTO_INSTITUCIONAL}
          </pre>
        </div>

        {/* Envio de convites */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900">Enviar convite por email</h3>
            <p className="text-xs text-slate-500 mt-0.5">Envie o convite institucional diretamente para um destinatário.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="Email de destino"
              value={emailConvite}
              onChange={e => setEmailConvite(e.target.value)}
            />
            <Input
              placeholder="Nome (opcional)"
              value={nomeConvite}
              onChange={e => setNomeConvite(e.target.value)}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {['patrocinador', 'pbh'].map(t => (
              <button
                key={t}
                onClick={() => setTipoConvite(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tipoConvite === t
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t === 'pbh' ? 'PBH / Observador' : 'Patrocinador'}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={enviarConvite}
              disabled={enviandoConvite || !emailConvite}
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white"
            >
              <Mail className="w-4 h-4" />
              {enviandoConvite ? 'Enviando...' : 'Enviar convite'}
            </Button>

            <Button
              variant="outline"
              onClick={enviarAndre}
              disabled={enviandoAndre}
              className="gap-2"
            >
              <Mail className="w-4 h-4" />
              {enviandoAndre ? 'Enviando...' : 'Enviar para André (Retina)'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}