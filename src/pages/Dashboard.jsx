import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  FileText, 
  Plus, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Send,
  Eye,
  Archive,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG = {
  DRAFT: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700', icon: Clock },
  SUBMITTED: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-yellow-100 text-yellow-700', icon: Eye },
  RETURNED: { label: 'Devolvido', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  APPROVED: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  ARCHIVED: { label: 'Arquivado', color: 'bg-purple-100 text-purple-700', icon: Archive },
};

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const user = await base44.auth.me();
      setCurrentUser(user);
    };
    loadUser();
  }, []);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['my-reports'],
    queryFn: () => base44.entities.Report.filter(
      { created_by: currentUser?.email },
      '-created_date'
    ),
    enabled: !!currentUser?.email,
  });

  const { data: allReports = [] } = useQuery({
    queryKey: ['all-reports'],
    queryFn: () => base44.entities.Report.list('-created_date'),
    enabled: currentUser?.role === 'COORDENADOR' || currentUser?.role === 'ADMIN',
  });

  const isCoordenador = currentUser?.role === 'COORDENADOR' || currentUser?.role === 'ADMIN';
  const displayReports = isCoordenador ? allReports : reports;

  const stats = {
    total: displayReports.length,
    draft: displayReports.filter(r => r.status === 'DRAFT').length,
    submitted: displayReports.filter(r => r.status === 'SUBMITTED').length,
    inReview: displayReports.filter(r => r.status === 'IN_REVIEW').length,
    approved: displayReports.filter(r => r.status === 'APPROVED').length,
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">
              Meus Relatórios
            </h1>
            <p className="text-gray-500 mt-1">
              {isCoordenador ? 'Visão geral de todos os relatórios' : 'Gerencie seus relatórios mensais'}
            </p>
          </div>
          <Link to={createPageUrl('ReportEditor')}>
            <Button className="bg-black hover:bg-gray-800 text-white gap-2">
              <Plus className="w-4 h-4" />
              Novo Relatório
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Rascunhos" value={stats.draft} />
          <StatCard label="Enviados" value={stats.submitted} />
          <StatCard label="Em Revisão" value={stats.inReview} />
          <StatCard label="Aprovados" value={stats.approved} />
        </div>

        {/* Reports List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-20 text-gray-400">
              Carregando relatórios...
            </div>
          ) : displayReports.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum relatório encontrado</p>
              <Link to={createPageUrl('ReportEditor')}>
                <Button variant="outline" className="mt-4">
                  Criar primeiro relatório
                </Button>
              </Link>
            </div>
          ) : (
            displayReports.map(report => {
              const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
              const StatusIcon = statusConfig.icon;
              
              return (
                <Link 
                  key={report.id} 
                  to={createPageUrl(`ReportEditor?id=${report.id}`)}
                  className="block"
                >
                  <div className="p-5 border border-gray-100 rounded-xl hover:border-gray-200 hover:bg-gray-50/50 transition-all group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-black">
                              {report.mes_referencia} {report.ano}
                            </span>
                            <Badge className={`${statusConfig.color} font-normal`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {statusConfig.label}
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

function StatCard({ label, value }) {
  return (
    <div className="p-4 border border-gray-100 rounded-xl">
      <p className="text-2xl font-semibold text-black">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}