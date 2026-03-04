import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  FileText, Plus, Clock, CheckCircle, AlertCircle,
  Send, Eye, Archive, ChevronRight, LayoutDashboard, User } from
'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CoordDashboard from '../components/dashboard/CoordDashboard';
import AdvancedFilters from '../components/dashboard/AdvancedFilters';
import ComplianceStats from '../components/dashboard/ComplianceStats';
import MomentosCarrossel from '../components/dashboard/MomentosCarrossel';
import WidgetCustomizer from '../components/dashboard/WidgetCustomizer';
import { useWidgetPreferences } from '../components/dashboard/useWidgetPreferences';
import ActivityMetricsWidget from '../components/dashboard/ActivityMetricsWidget';
import OpportunityMetricsWidget from '../components/dashboard/OpportunityMetricsWidget';

const STATUS_CONFIG = {
  DRAFT: { label: 'Rascunho', color: 'bg-white text-black border border-black', icon: Clock },
  SUBMITTED: { label: 'Enviado', color: 'bg-white text-black border border-black', icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-white text-black border border-black', icon: Eye },
  RETURNED: { label: 'Devolvido', color: 'bg-black text-white border border-black', icon: AlertCircle },
  APPROVED: { label: 'Aprovado', color: 'bg-black text-white border border-black', icon: CheckCircle },
  ARCHIVED: { label: 'Arquivado', color: 'bg-gray-200 text-black border border-black', icon: Archive }
};

function DashboardInner() {
  const { user: currentUser, isLoading: userLoading, isCoordenador } = useCurrentUser();
  const { widgets, loaded: widgetsLoaded, toggleWidget, resetToDefault } = useWidgetPreferences();
  const [view, setView] = React.useState('coordenador');
  const [filters, setFilters] = React.useState({ museu: '', status: '' });

  // Current month/year for compliance stats
  const now = new Date();
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const currentMonth = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  const { data: myReports = [], isLoading: loadingMy } = useQuery({
    queryKey: ['my-reports', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return [];
      const data = await base44.entities.Report.filter({ created_by: currentUser.email }, '-created_date');
      return Array.isArray(data) ? data : [];
    },
    enabled: !!currentUser?.email && !userLoading
  });

  const { data: allReports = [], isLoading: loadingAll } = useQuery({
    queryKey: ['all-reports'],
    queryFn: async () => {
      const data = await base44.entities.Report.list('-created_date', 200);
      return Array.isArray(data) ? data : [];
    },
    enabled: isCoordenador
  });

  const showCoordView = isCoordenador && view === 'coordenador';
  const showDedicatedProfView = !isCoordenador;
  const displayReports = React.useMemo(() => {
    let reports = showCoordView ? allReports : myReports;
    if (!Array.isArray(reports)) return [];
    return reports;
  }, [showCoordView, allReports, myReports]);

  // Aplicar filtros
  const filteredReports = React.useMemo(() => {
    let reports = displayReports;
    if (filters.museu) {
      reports = reports.filter((r) => r.museu === filters.museu);
    }
    if (filters.status) {
      reports = reports.filter((r) => r.status === filters.status);
    }
    return reports;
  }, [displayReports, filters.museu, filters.status]);

  const recentReports = filteredReports.slice(0, 8);
  const isLoading = showCoordView ? loadingAll : loadingMy || userLoading;

  const stats = React.useMemo(() => [
  { label: 'Total', value: filteredReports.length },
  { label: 'Rascunhos', value: filteredReports.filter((r) => r.status === 'DRAFT').length },
  { label: 'Enviados', value: filteredReports.filter((r) => r.status === 'SUBMITTED').length },
  { label: 'Em Revisão', value: filteredReports.filter((r) => r.status === 'IN_REVIEW').length },
  { label: 'Aprovados', value: filteredReports.filter((r) => r.status === 'APPROVED').length }],
  [filteredReports]);

  return (
    <div className="min-h-screen bg-white">
      





















































































































































    </div>);

}

export default function Dashboard() {
  return <RequireAuth><DashboardInner /></RequireAuth>;
}