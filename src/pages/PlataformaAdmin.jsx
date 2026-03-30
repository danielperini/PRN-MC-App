import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import MetadadosManager from '../components/admin/MetadadosManager';
import MuseuManager from '../components/admin/MuseuManager';
import EquipeManager from '../components/admin/EquipeManager';
import UserPermissionsManager from '../components/admin/UserPermissionsManager';
import {
  Users, FileText, History, Settings,
  CheckCircle, ChevronRight,
  AlertTriangle, Download, Database, Building2, Users2,
  BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toastMessages } from '@/lib/toastMessages';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';

const STATUS_CONFIG = {
  DRAFT:     { label: 'Rascunho',   color: 'bg-gray-100 text-gray-700' },
  SUBMITTED: { label: 'Enviado',    color: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-yellow-100 text-yellow-700' },
  RETURNED:  { label: 'Devolvido',  color: 'bg-red-100 text-red-700' },
  APPROVED:  { label: 'Aprovado',   color: 'bg-green-100 text-green-700' },
  ARCHIVED:  { label: 'Arquivado',  color: 'bg-purple-100 text-purple-700' },
};

function KpiCard({ label, value, icon: Icon, sub }) {
  return (
    <div className="p-5 border border-gray-100 rounded-xl bg-white">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-gray-500" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function PlataformaAdminInner() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['reports'],
    queryFn: () => base44.entities.Report.list('-created_date', 500),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['logs'],
    queryFn: () => base44.entities.AuditLog.list('-created_date', 50),
  });

  const archiveReportMutation = useMutation({
    mutationFn: (id) => base44.entities.Report.update(id, { status: 'ARCHIVED' }),
    onSuccess: () => queryClient.invalidateQueries(['reports']),
  });

  const totalUsers = users.length;
  const totalReports = reports.length;
  const approvedReports = reports.filter(r => r.status === 'APPROVED').length;

  return (
    <div className="max-w-6xl mx-auto p-6">

      {/* HEADER */}
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings /> Plataforma
        </h1>

        <Link to={createPageUrl('BaseConhecimento')}>
          <Button className="gap-2">
            <BookOpen className="w-4 h-4" />
            Biblioteca de Conhecimento
          </Button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Usuários" value={totalUsers} icon={Users} />
        <KpiCard label="Relatórios" value={totalReports} icon={FileText} />
        <KpiCard label="Aprovados" value={approvedReports} icon={CheckCircle} />
      </div>

      <Tabs defaultValue="relatorios">

        <TabsList>
          <TabsTrigger value="permissoes">Permissões</TabsTrigger>
          <TabsTrigger value="museus">Museus</TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
          <TabsTrigger value="metadados">Metadados</TabsTrigger>
        </TabsList>

        <TabsContent value="permissoes">
          <UserPermissionsManager />
        </TabsContent>

        <TabsContent value="museus">
          <MuseuManager />
        </TabsContent>

        <TabsContent value="equipes">
          <EquipeManager />
        </TabsContent>

        <TabsContent value="metadados">
          <MetadadosManager />
        </TabsContent>

        <TabsContent value="relatorios">
          {reports.map(r => (
            <div key={r.id} className="border p-3 flex justify-between">
              <div>
                {r.author_name} - {r.mes_referencia}/{r.ano}
                <Badge className="ml-2">{r.status}</Badge>
              </div>
              <div className="flex gap-2">
                <Link to={createPageUrl(`ReportEditor?id=${r.id}`)}>
                  <Button size="sm">Ver</Button>
                </Link>
                {r.status === 'APPROVED' && (
                  <Button size="sm" onClick={() => archiveReportMutation.mutate(r.id)}>
                    Arquivar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="auditoria">
          {logs.map(l => (
            <div key={l.id} className="text-sm border p-2">
              {l.action} - {l.actor_email}
            </div>
          ))}
        </TabsContent>

      </Tabs>
    </div>
  );
}

export default function PlataformaAdmin() {
  return <RequireAuth requireRole="COORDENADOR"><PlataformaAdminInner /></RequireAuth>;
}