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
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-7 h-7 text-black" />
      </div>
      <div>
        <p className="text-3xl font-bold text-black leading-none">{value}</p>
        <p className="text-base text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function ShortcutCard({ to, icon: Icon, label, desc }) {
  return (
    <Link to={createPageUrl(to)}>
      <div className="p-4 border-2 border-black rounded-xl hover:shadow-md transition-all group cursor-pointer bg-white">
        <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center mb-3 group-hover:bg-black group-hover:text-white transition-colors border border-black">
          <Icon className="w-4 h-4 text-black group-hover:text-white transition-colors" />
        </div>
        <p className="font-semibold text-black text-sm">{label}</p>
        <p className="text-xs text-gray-600 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}

function AuthenticatedHome({ user }) {
  const isCoordenador = ['COORDENADOR', 'ADMIN', 'admin'].includes(user?.role);

  const { data: allReports = [] } = useQuery({
    queryKey: ['home-all-reports'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Report.list('-updated_date', 500);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  const { data: allActivities = [] } = useQuery({
    queryKey: ['home-all-activities'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Activity.list('-created_date', 1000);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  const { data: pendingRegs = [] } = useQuery({
    queryKey: ['home-pending-regs'],
    queryFn: async () => {
      try {
        const data = await base44.entities.UserRegistration.filter({ status: 'PENDENTE' });
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: !!user && isCoordenador,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['home-attachments'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Attachment.list('-created_date', 50);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  // My reports (for non-coord shortcuts)
  const myReports = allReports.filter(r => r.created_by === user?.email || r.author_name === user?.full_name);
  const reports = isCoordenador ? allReports : myReports;

  const pendingReview = allReports.filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status));
  const myDrafts = myReports.filter(r => r.status === 'DRAFT');
  const recentReports = reports.slice(0, 5);

  // Executive KPIs — aggregate from all approved/submitted reports
  const approvedReports = allReports.filter(r => ['APPROVED', 'SUBMITTED', 'IN_REVIEW', 'ARCHIVED'].includes(r.status));
  const totalPublico = approvedReports.reduce((sum, r) => {
    const acts = Array.isArray(r.atividades) ? r.atividades : [];
    return sum + acts.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);
  }, 0) + allActivities.reduce((sum, a) => sum + (Number(a.publico_estimado) || 0), 0);

  const totalAtividades = allActivities.length +
    approvedReports.reduce((sum, r) => sum + (Array.isArray(r.atividades) ? r.atividades.length : 0), 0);

  const museus = [...new Set(allReports.map(r => r.museu).filter(Boolean))];
  const aprovados = allReports.filter(r => r.status === 'APPROVED').length;

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
    <div className="min-h-screen bg-white">
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

        {/* Welcome Banner — aprovado */}
        {user?.newly_approved && (
          <div className="rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-green-700" />
            </div>
            <div>
              <p className="font-semibold text-green-900">Bem-vindo! 🎉</p>
              <p className="text-sm text-green-800 mt-0.5">Sua solicitação foi aprovada. Você agora tem acesso total à plataforma.</p>
            </div>
          </div>
        )}

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-black">Olá, {user?.full_name?.split(' ')[0]} 👋</h1>
          <p className="text-gray-500 text-sm mt-1">Aqui está o panorama geral da plataforma.</p>
        </div>

        {/* Números Executivos do Projeto — visíveis para todos */}
         <div>
           <div className="flex items-center gap-2 mb-3">
             <BarChart2 className="w-4 h-4 text-gray-400" />
             <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Números do Projeto</h2>
           </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
              <PersonStanding className="w-7 h-7 text-black mb-2" />
              <p className="text-5xl font-bold leading-none">{totalPublico.toLocaleString('pt-BR')}</p>
              <p className="text-base text-gray-300">Público total alcançado</p>
            </div>
            <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
              <Activity className="w-7 h-7 text-white mb-2" />
              <p className="text-5xl font-bold text-white leading-none">{totalAtividades.toLocaleString('pt-BR')}</p>
              <p className="text-base text-gray-300">Atividades realizadas</p>
            </div>
            <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
              <Award className="w-7 h-7 text-white mb-2" />
              <p className="text-5xl font-bold text-white leading-none">{aprovados}</p>
              <p className="text-base text-gray-300">Relatórios aprovados</p>
            </div>
            <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
              <MapPin className="w-7 h-7 text-white mb-2" />
              <p className="text-5xl font-bold text-white leading-none">3</p>
              <p className="text-base text-gray-300">Museus ativos</p>
            </div>
          </div>
        </div>

        {/* KPIs pessoais — apenas para coordenadores */}
        {isCoordenador && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Minha Atividade</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Bell} label="Solicitações pendentes" value={pendingRegs.length} highlight={pendingRegs.length > 0} color="bg-white" />
              <StatCard icon={Clock} label="Aguardando revisão" value={pendingReview.length} color="bg-white" highlight={pendingReview.length > 0} />
              <StatCard icon={FileText} label="Total de relatórios" value={allReports.length} color="bg-white" />
              <StatCard icon={Paperclip} label="Arquivos enviados" value={attachments.length} color="bg-white" />
            </div>
          </div>
        )}

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
              <h2 className="text-lg font-bold text-black">Relatórios Recentes</h2>
              <Link to={createPageUrl('Relatorios')} className="text-xs text-gray-400 hover:text-black">Ver todos →</Link>
            </div>
            <div className="space-y-2">
              {recentReports.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl bg-white">
                    <p className="text-sm text-gray-400">Nenhum relatório ainda</p>
                  </div>
              ) : recentReports.slice(0, 3).map(r => {
                 const st = STATUS_LABELS[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' };
                 return (
                   <Link key={r.id} to={createPageUrl(`ReportEditor?id=${r.id}`)}>
                     <div className="p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-300 transition-all flex items-center justify-between gap-3">
                       <div className="min-w-0">
                         <p className="text-base font-semibold text-black truncate">{r.author_name || '–'}</p>
                         <p className="text-xs text-gray-500">{r.mes_referencia} {r.ano} · {r.museu}</p>
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
    const load = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (isAuth) {
          const u = await base44.auth.me();
          setUser(u || null);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Erro ao carregar usuário:', error);
        setUser(null);
      }
    };
    load();
  }, []);

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-400 text-sm">Carregando...</p>
      </div>
    );
  }
  
  if (!user) return <PublicHome />;
  return <AuthenticatedHome user={user} />;
}