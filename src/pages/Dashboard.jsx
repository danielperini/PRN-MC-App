import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  FileText, Plus, Clock, CheckCircle, AlertCircle,
  Send, Eye, Archive, ChevronRight, Users, Target, Accessibility
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG = {
  DRAFT:     { label: 'Rascunho',   color: 'bg-gray-100 text-gray-700',    icon: Clock },
  SUBMITTED: { label: 'Enviado',    color: 'bg-blue-100 text-blue-700',    icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-yellow-100 text-yellow-700', icon: Eye },
  RETURNED:  { label: 'Devolvido',  color: 'bg-red-100 text-red-700',      icon: AlertCircle },
  APPROVED:  { label: 'Aprovado',   color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  ARCHIVED:  { label: 'Arquivado',  color: 'bg-purple-100 text-purple-700', icon: Archive },
};

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser);
  }, []);

  const isCoordenador = currentUser?.role === 'COORDENADOR' || currentUser?.role === 'ADMIN';

  const { data: myReports = [], isLoading: loadingMy } = useQuery({
    queryKey: ['my-reports', currentUser?.email],
    queryFn: () => base44.entities.Report.filter({ created_by: currentUser?.email }, '-created_date'),
    enabled: !!currentUser?.email,
  });

  const { data: allReports = [], isLoading: loadingAll } = useQuery({
    queryKey: ['all-reports'],
    queryFn: () => base44.entities.Report.list('-created_date'),
    enabled: isCoordenador,
  });

  const displayReports = isCoordenador ? allReports : myReports;
  const recentReports = displayReports.slice(0, 8);
  const isLoading = isCoordenador ? loadingAll : loadingMy;

  // Indicators
  const allAtividades = displayReports.flatMap(r => r.atividades || []);
  const pendentes = displayReports.filter(r => ['SUBMITTED', 'IN_REVIEW'].includes(r.status)).length;
  const publicoTotal = allAtividades.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);
  const metas   = allAtividades.filter(a => a.classificacao === 'META').length;
  const rotinas = allAtividades.filter(a => a.classificacao === 'ROTINA').length;
  const extras  = allAtividades.filter(a => a.classificacao === 'EXTRA').length;
  const comAcess = allAtividades.filter(a => a.acessibilidade && a.acessibilidade !== 'Não').length;
  const comParc  = allAtividades.filter(a => a.parceria === 'Sim').length;

  const porEquipe = allAtividades.reduce((acc, a) => {
    const eq = a.equipe_responsavel || 'Sem equipe';
    acc[eq] = (acc[eq] || 0) + 1;
    return acc;
  }, {});
  const topEquipe = Object.entries(porEquipe).sort((a, b) => b[1] - a[1])[0];

  const stats = [
    { label: 'Total de Relatórios', value: displayReports.length },
    { label: 'Rascunhos', value: displayReports.filter(r => r.status === 'DRAFT').length },
    { label: 'Enviados', value: displayReports.filter(r => r.status === 'SUBMITTED').length },
    { label: 'Em Revisão', value: displayReports.filter(r => r.status === 'IN_REVIEW').length },
    { label: 'Aprovados', value: displayReports.filter(r => r.status === 'APPROVED').length },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">Dashboard</h1>
            <p className="text-gray-500 mt-1">
              {isCoordenador ? 'Visão geral de todos os relatórios' : `Olá, ${currentUser?.full_name || ''}`}
            </p>
          </div>
          <Link to={createPageUrl('ReportEditor')}>
            <Button className="bg-black hover:bg-gray-800 text-white gap-2">
              <Plus className="w-4 h-4" />
              Novo Relatório
            </Button>
          </Link>
        </div>

        {/* Status Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {stats.map(s => (
            <div key={s.label} className="p-4 border border-[#E5E5E5] rounded-xl shadow-sm">
              <p className="text-2xl font-semibold text-black">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Indicators — coordenador only */}
        {isCoordenador && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
            <IndicatorCard
              icon={<AlertCircle className="w-4 h-4" />}
              label="Pendentes de revisão"
              value={pendentes}
              highlight={pendentes > 0}
              action={pendentes > 0 ? <Link to={createPageUrl('CoordReview')}><span className="text-xs underline">Revisar</span></Link> : null}
            />
            <IndicatorCard
              icon={<Users className="w-4 h-4" />}
              label={`Atividades — ${topEquipe ? topEquipe[0] : '–'}`}
              value={topEquipe ? `${topEquipe[1]} ativ.` : '0'}
              sub="equipe mais ativa"
            />
            <IndicatorCard
              icon={<Eye className="w-4 h-4" />}
              label="Público total"
              value={publicoTotal.toLocaleString('pt-BR')}
              sub="participantes"
            />
            <IndicatorCard
              icon={<Target className="w-4 h-4" />}
              label="META · ROTINA · EXTRA"
              value={`${metas} · ${rotinas} · ${extras}`}
              sub={`${comAcess} acessíveis · ${comParc} parcerias`}
            />
          </div>
        )}

        {/* Recentes */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-black">Relatórios Recentes</h2>
          <Link to={createPageUrl('Relatorios')}>
            <Button variant="ghost" size="sm" className="text-gray-500 gap-1">
              Ver todos <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-20 text-gray-400">Carregando...</div>
          ) : recentReports.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum relatório encontrado</p>
              <Link to={createPageUrl('ReportEditor')}>
                <Button variant="outline" className="mt-4 border-black">Criar primeiro relatório</Button>
              </Link>
            </div>
          ) : (
            recentReports.map(report => {
              const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
              const StatusIcon = cfg.icon;
              return (
                <Link key={report.id} to={createPageUrl(`ReportEditor?id=${report.id}`)} className="block">
                  <div className="p-5 border border-[#E5E5E5] rounded-xl shadow-sm hover:border-gray-300 transition-all group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-50 border border-[#E5E5E5] rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-black">{report.mes_referencia} {report.ano}</span>
                            <Badge className={`${cfg.color} font-normal`}>
                              <StatusIcon className="w-3 h-3 mr-1" />{cfg.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {report.museu} • {report.author_name}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function IndicatorCard({ icon, label, value, sub, highlight, action }) {
  return (
    <div className={`p-4 border rounded-xl shadow-sm ${highlight ? 'border-black' : 'border-[#E5E5E5]'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-gray-400 text-xs">{icon}{label}</div>
        {action}
      </div>
      <p className="text-xl font-semibold text-black">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}