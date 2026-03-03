import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, ArrowRight, CheckCircle, UserPlus,
  FileText, Users, Paperclip, Clock, Eye, Bell,
  TrendingUp, LayoutDashboard, History, Settings,
  PersonStanding, Activity, Award, MapPin, BarChart2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const STATUS_LABELS = {
  DRAFT: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600' },
  SUBMITTED: { label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'Em revisão', color: 'bg-amber-100 text-amber-700' },
  RETURNED: { label: 'Devolvido', color: 'bg-red-100 text-red-700' },
  APPROVED: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  ARCHIVED: { label: 'Arquivado', color: 'bg-gray-200 text-gray-500' },
};

function StatCard({ icon: Icon, label, value, color = 'bg-gray-50', highlight }) {
  return (
    <div className={`rounded-2xl border ${highlight ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'} p-5 flex items-center gap-4`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-gray-700" />
      </div>
      <div>
        <p className="text-2xl font-bold text-black leading-none">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function ShortcutCard({ to, icon: Icon, label, desc }) {
  return (
    <Link to={createPageUrl(to)}>
      <div className="p-4 border border-gray-100 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all group cursor-pointer">
        <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-black group-hover:text-white transition-colors">
          <Icon className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" />
        </div>
        <p className="font-semibold text-black text-sm">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}

function AuthenticatedHome({ user }) {
  const isCoordenador = ['COORDENADOR', 'ADMIN', 'admin'].includes(user?.role);

  const { data: reports = [] } = useQuery({
    queryKey: ['home-reports', user?.email],
    queryFn: () => isCoordenador
      ? base44.entities.Report.list('-updated_date', 100)
      : base44.entities.Report.filter({ created_by: user.email }, '-updated_date', 20),
    enabled: !!user,
  });

  const { data: pendingRegs = [] } = useQuery({
    queryKey: ['home-pending-regs'],
    queryFn: () => base44.entities.UserRegistration.filter({ status: 'PENDENTE' }),
    enabled: !!user && isCoordenador,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['home-attachments'],
    queryFn: () => base44.entities.Attachment.list('-created_date', 50),
    enabled: !!user,
  });

  const pendingReview = reports.filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status));
  const myDrafts = reports.filter(r => r.status === 'DRAFT' && r.created_by === user?.email);
  const recentReports = reports.slice(0, 5);

  const shortcuts = [
    { to: 'Dashboard', icon: LayoutDashboard, label: 'Dashboard', desc: 'Visão geral dos relatórios' },
    { to: 'Relatorios', icon: FileText, label: 'Relatórios', desc: 'Criar e gerenciar relatórios' },
    { to: 'GestorArquivos', icon: Paperclip, label: 'Arquivos', desc: 'Visualizar anexos enviados' },
    ...(isCoordenador ? [
      { to: 'CoordReview', icon: Eye, label: 'Revisão', desc: 'Aprovar relatórios pendentes' },
      { to: 'UserManagement', icon: Users, label: 'Usuários', desc: 'Gerenciar acessos' },
      { to: 'AuditLog', icon: History, label: 'Auditoria', desc: 'Histórico de ações' },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-black text-sm">Museus Centro</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">Olá, {user?.full_name?.split(' ')[0]}</span>
            <Link to={createPageUrl('Dashboard')}>
              <Button size="sm" className="bg-black hover:bg-gray-800 text-white gap-1.5">
                Painel <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-black">Bom dia, {user?.full_name?.split(' ')[0]} 👋</h1>
          <p className="text-gray-500 text-sm mt-1">Aqui está um resumo do que está acontecendo na plataforma.</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isCoordenador ? (
            <>
              <StatCard icon={Bell} label="Solicitações pendentes" value={pendingRegs.length} highlight={pendingRegs.length > 0} color="bg-amber-100" />
              <StatCard icon={Clock} label="Aguardando revisão" value={pendingReview.length} color="bg-blue-100" highlight={pendingReview.length > 0} />
              <StatCard icon={FileText} label="Total de relatórios" value={reports.length} color="bg-gray-100" />
              <StatCard icon={Paperclip} label="Arquivos enviados" value={attachments.length} color="bg-gray-100" />
            </>
          ) : (
            <>
              <StatCard icon={FileText} label="Meus relatórios" value={reports.length} color="bg-gray-100" />
              <StatCard icon={Clock} label="Rascunhos abertos" value={myDrafts.length} color="bg-amber-100" highlight={myDrafts.length > 0} />
              <StatCard icon={CheckCircle} label="Aprovados" value={reports.filter(r => r.status === 'APPROVED').length} color="bg-green-100" />
              <StatCard icon={Paperclip} label="Arquivos enviados" value={attachments.length} color="bg-gray-100" />
            </>
          )}
        </div>

        {/* Atalhos + Relatórios Recentes */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Atalhos */}
          <div>
            <h2 className="text-base font-semibold text-black mb-3">Atalhos rápidos</h2>
            <div className="grid grid-cols-2 gap-3">
              {shortcuts.map(s => <ShortcutCard key={s.to} {...s} />)}
            </div>
          </div>

          {/* Relatórios Recentes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-black">Relatórios recentes</h2>
              <Link to={createPageUrl('Relatorios')} className="text-xs text-gray-400 hover:text-black">Ver todos →</Link>
            </div>
            <div className="space-y-2">
              {recentReports.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
                  <p className="text-sm text-gray-400">Nenhum relatório ainda</p>
                </div>
              ) : recentReports.map(r => {
                const st = STATUS_LABELS[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' };
                return (
                  <Link key={r.id} to={createPageUrl(`ReportEditor?id=${r.id}`)}>
                    <div className="p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-300 transition-all flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-black truncate">{r.author_name || '–'}</p>
                        <p className="text-xs text-gray-400">{r.mes_referencia} {r.ano} · {r.museu}</p>
                      </div>
                      <Badge className={`${st.color} text-[11px] font-normal flex-shrink-0`}>{st.label}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Alerta de pendências para coordenador */}
        {isCoordenador && (pendingRegs.length > 0 || pendingReview.length > 0) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-wrap gap-4 items-center justify-between">
            <div>
              <p className="font-semibold text-amber-900">Atenção: há itens aguardando sua ação</p>
              <p className="text-sm text-amber-700 mt-0.5">
                {pendingRegs.length > 0 && `${pendingRegs.length} solicitação(ões) de acesso pendente(s). `}
                {pendingReview.length > 0 && `${pendingReview.length} relatório(s) aguardando revisão.`}
              </p>
            </div>
            <div className="flex gap-2">
              {pendingRegs.length > 0 && (
                <Link to={createPageUrl('UserManagement')}>
                  <Button size="sm" className="bg-amber-700 hover:bg-amber-800 text-white">Ver solicitações</Button>
                </Link>
              )}
              {pendingReview.length > 0 && (
                <Link to={createPageUrl('CoordReview')}>
                  <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100">Revisar relatórios</Button>
                </Link>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function PublicHome() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-black text-base">Museus Centro</span>
          </div>
          <Link to={createPageUrl('Dashboard')}>
            <Button className="bg-black hover:bg-gray-800 text-white gap-2 text-sm">
              Acessar sistema <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-2xl">
          <div className="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6 tracking-wide uppercase">
            Relatório Mensal Individual · 2026
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-black tracking-tight leading-tight mb-5">
            Museu Centro
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            Plataforma centralizada para registro, acompanhamento e aprovação de relatórios.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to={createPageUrl('Dashboard')}>
              <Button size="lg" className="bg-black hover:bg-gray-800 text-white gap-2 px-8">
                Acessar meu painel <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to={createPageUrl('Cadastro')}>
              <Button size="lg" variant="outline" className="gap-2 px-8 border-gray-300">
                <UserPlus className="w-4 h-4" />
                Solicitar acesso
              </Button>
            </Link>
          </div>
        </div>
        <div className="mt-14 flex items-center gap-2 text-sm text-gray-400">
          <CheckCircle className="w-4 h-4 text-green-500" />
          Sistema ativo · Versão 1.0 · 2026
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (isAuth) => {
      if (isAuth) {
        const u = await base44.auth.me();
        setUser(u);
      } else {
        setUser(null);
      }
    });
  }, []);

  if (user === undefined) return null; // brief loading
  if (!user) return <PublicHome />;
  return <AuthenticatedHome user={user} />;
}