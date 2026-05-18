import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import {
  Plus,
  FileText,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  BarChart2,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import LoadingDataNotice from '@/components/ui/LoadingDataNotice';

const STATUS_CONFIG = {
  DRAFT: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600', icon: Clock },
  SUBMITTED: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700', icon: Eye },
  RETURNED: { label: 'Devolvido', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  APPROVED: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  ARCHIVED: { label: 'Arquivado', color: 'bg-slate-100 text-slate-600', icon: FileText },
};

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

export default function Relatorios() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [filterMuseu, setFilterMuseu] = useState('todos');
  const [filterMes, setFilterMes] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');

  const isAdmin = user?.role === 'admin';
  const isCoordenador = user?.role === 'COORDENADOR' || user?.role === 'admin';

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['relatorios-list'],
    queryFn: () => base44.entities.Report.list('-created_date', 200),
  });

  const myReports = useMemo(() => {
    if (isAdmin || isCoordenador) return reports;
    return reports.filter((r) => r.created_by === user?.email);
  }, [reports, user, isAdmin, isCoordenador]);

  const filtered = useMemo(() => {
    return myReports.filter((r) => {
      if (filterMuseu !== 'todos' && r.museu !== filterMuseu) return false;
      if (filterMes !== 'todos' && r.mes_referencia !== filterMes) return false;
      if (filterStatus !== 'todos' && r.status !== filterStatus) return false;
      return true;
    });
  }, [myReports, filterMuseu, filterMes, filterStatus]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Relatórios Mensais</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} relatório{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/RelatorioFisicoFinanceiro">
            <Button variant="outline" className="gap-2">
              <BarChart2 className="h-4 w-4" />
              Gerador de Relatório
            </Button>
          </Link>

          <Link to="/ReportEditor?novo=1">
            <Button className="gap-2 bg-black text-white hover:bg-gray-900">
              <Plus className="h-4 w-4" />
              Novo Relatório
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <Select value={filterMuseu} onValueChange={setFilterMuseu}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Museu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os museus</SelectItem>
            {MUSEUS.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterMes} onValueChange={setFilterMes}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {MESES.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-16">
          <LoadingDataNotice
            title="Carregando relatórios"
            message="A página ainda está recuperando os relatórios aprovados e rascunhos do app. Os filtros e a lista serão atualizados assim que os dados chegarem."
            className="mx-auto max-w-xl"
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum relatório encontrado</p>
          <Link to="/ReportEditor?novo=1" className="mt-3 inline-block">
            <Button size="sm" className="bg-black text-white hover:bg-gray-900 gap-1">
              <Plus className="h-3.5 w-3.5" /> Criar primeiro relatório
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((report) => {
            const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
            const Icon = cfg.icon;
            return (
              <Card key={report.id} className="border border-gray-200 bg-white hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge className={`${cfg.color} text-xs font-medium gap-1`}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                        {report.museu && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {report.museu}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {report.mes_referencia} {report.ano}
                        </span>
                      </div>

                      <p className="font-medium text-gray-900 truncate">
                        {report.author_name || report.created_by || 'Sem autor'}
                      </p>

                      {report.funcao && (
                        <p className="text-sm text-gray-500 truncate">{report.funcao}</p>
                      )}

                      {report.return_comment && (
                        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                          Retorno: {report.return_comment}
                        </div>
                      )}
                    </div>

                    <Link to={`/ReportEditor?id=${report.id}`}>
                      <Button size="sm" variant="outline" className="gap-1 shrink-0">
                        <Eye className="h-3.5 w-3.5" />
                        Abrir
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
