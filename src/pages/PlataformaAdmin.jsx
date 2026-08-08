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
import AuditSystemPanel from '../components/admin/AuditSystemPanel';
import Auditoria360DiariaPanel from '../components/admin/Auditoria360DiariaPanel';
import AutomacoesManutencaoCard from '../components/admin/AutomacoesManutencaoCard';
import HardeningPanel from '../components/admin/HardeningPanel';
import ComunicadosPanel from '../components/admin/ComunicadosPanel';
import BoletimSemanalAgendaPanel from '../components/admin/BoletimSemanalAgendaPanel';
import {
  Users, FileText, History, Settings,
  CheckCircle, ChevronRight,
  AlertTriangle, Download, Database, Building2, Users2,
  BookOpen, RotateCw, Send, Mail, HardDrive, Wrench, ChevronDown, Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toastMessages } from '@/lib/toastMessages';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const [restoringMembers, setRestoringMembers] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [fundindoMetas, setFundindoMetas] = useState(false);
  const [fusaoResult, setFusaoResult] = useState(null);
  const [sendingLink, setSendingLink] = useState(false);
  const [linkResult, setLinkResult] = useState(null);
  const [higienizando, setHigienizando] = useState(false);
  const [higienizacaoResult, setHigienizacaoResult] = useState(null);
  const [sincronizandoNFs, setSincronizandoNFs] = useState(false);
  const [sincronizacaoNFsResult, setSincronizacaoNFsResult] = useState(null);
  const [organizandoNFsIA, setOrganizandoNFsIA] = useState(false);
  const [organizacaoNFsIAResult, setOrganizacaoNFsIAResult] = useState(null);
  const [normalizandoValores, setNormalizandoValores] = useState(false);
  const [normalizacaoValoresResult, setNormalizacaoValoresResult] = useState(null);
  const [sincronizandoRubricas, setSincronizandoRubricas] = useState(false);
  const [sincronizacaoRubricasResult, setSincronizacaoRubricasResult] = useState(null);
  const [corrigindoMetas, setCorrigindoMetas] = useState(false);
  const [correcaoMetasResult, setCorrecaoMetasResult] = useState(null);
  const [adminPanel, setAdminPanel] = useState(null);

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

  const handleSincronizarNFsDrive = async () => {
    setSincronizandoNFs(true);
    setSincronizacaoNFsResult(null);
    try {
      const res = await base44.functions.invoke('sincronizarNFsPastaRaizDrive', { batch_size: 80 });
      const data = res?.data || res;
      setSincronizacaoNFsResult(data);
      if (data?.cobertura_percentual >= 100) {
        toast.success(`Sincronização 100% concluída — ${data.total_criados} notas sincronizadas.`);
      } else {
        toast.success(`Sincronização parcial: ${data?.cobertura_percentual?.toFixed(1)}% (${data?.total_pendentes || 0} pendentes).`);
      }
    } catch (e) {
      toast.error(`Falha na sincronização: ${e?.message || e}`);
      setSincronizacaoNFsResult({ erro: String(e?.message || e) });
    } finally {
      setSincronizandoNFs(false);
    }
  };
  const handleFundirMetas = async () => {
    setFundindoMetas(true);
    setFusaoResult(null);
    try {
      const res = await base44.functions.invoke('fundirMetasEducativas', {});
      setFusaoResult(res.data);
      toastMessages.success('Fusão de metas concluída com sucesso');
    } catch (error) {
      toastMessages.error(error?.message || 'Erro ao fundir metas');
    } finally {
      setFundindoMetas(false);
    }
  };

  const handleRestoreInactiveMembers = async () => {
    setRestoringMembers(true);
    try {
      const res = await base44.functions.invoke('restoreInactiveTeamMembers', {});
      setRestoreResult(res.data);
      await queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toastMessages.success(res.data?.message || 'Membros restaurados com sucesso');
    } catch (error) {
      console.error('Erro:', error);
      toastMessages.error(error?.message || 'Erro ao restaurar membros');
    } finally {
      setRestoringMembers(false);
    }
  };

  const handleHigienizarEntradaUnica = async () => {
    setHigienizando(true);
    setHigienizacaoResult(null);
    try {
      const res = await base44.functions.invoke('higienizarEntradaUnicaNFs', {});
      const data = res.data || {};
      setHigienizacaoResult(data?.resumo || null);
      if (data?.success) {
        toastMessages.success(
          `${data.resumo?.deletadas_estrutural || 0} deletadas (estrutural), ${data.resumo?.deletadas_nome_idêntico || 0} deletadas (nome), ${data.resumo?.suspeitas_marcadas || 0} suspeitas, ${data.resumo?.xmls_vinculados || 0} XMLs vinculados`
        );
      } else {
        toastMessages.error(data?.error || 'Falha na higienização');
      }
    } catch (error) {
      toastMessages.error(error?.message || 'Erro ao higienizar Entrada Única');
    } finally {
      setHigienizando(false);
    }
  };

  const handleSendLinkApp = async () => {
    setSendingLink(true);
    setLinkResult(null);
    try {
      const res = await base44.functions.invoke('notifyLinkCorretoApp', {});
      const data = res.data || {};
      setLinkResult(data);
      if (data.total !== undefined) {
        toastMessages.success(`E-mail enviado para ${data.enviados} de ${data.total} destinatários`);
      } else {
        toastMessages.error('Não foi possível concluir o envio');
      }
    } catch (error) {
      toastMessages.error(error?.message || 'Erro ao enviar link do app');
    } finally {
      setSendingLink(false);
    }
  };

  const handleOrganizarNFsIA = async () => {
    setOrganizandoNFsIA(true);
    setOrganizacaoNFsIAResult(null);
    try {
      toast.success('Processamento iniciado em background...');
      const res = await base44.functions.invoke('organizarNFsComIA', { limite: 50 });
      const data = res?.data || res;
      setOrganizacaoNFsIAResult(data);
      if (data?.ok) {
        toast.success(
          `${data.stats?.atualizado || 0} NFs atualizadas, ${data.stats?.pulado || 0} puladas, ${data.stats?.erro || 0} erros.`
        );
      } else {
        toastMessages.error(data?.error || 'Falha na organização');
      }
    } catch (error) {
      toastMessages.error(error?.message || 'Erro ao organizar NFs com IA');
    } finally {
      setOrganizandoNFsIA(false);
    }
  };

  const handleNormalizarValoresAprovados = async (loop = false) => {
    setNormalizandoValores(true);
    if (!loop) setNormalizacaoValoresResult(null);
    let pular = 0;
    let acumulado = { total_varridas: 0, corrigidas: 0, rubricas_recalculadas: 0, erros: 0, lotes: 0 };
    try {
      // Loop automático até concluir (ou até 15 lotes de segurança)
      for (let i = 0; i < 15; i++) {
        const res = await base44.functions.invoke('normalizarValorAprovadoAdminNFs', { limite: 200, pular });
        const data = res?.data || res;
        acumulado.total_varridas += data?.total_varridas || 0;
        acumulado.corrigidas += data?.corrigidas || 0;
        acumulado.rubricas_recalculadas += data?.rubricas_recalculadas || 0;
        acumulado.erros += data?.erros || 0;
        acumulado.lotes += 1;
        if (data?.has_more) {
          pular = data?.proximo_pular || 0;
        } else {
          break;
        }
      }
      setNormalizacaoValoresResult(acumulado);
      toast.success(
        `${acumulado.corrigidas} NFs normalizadas, ${acumulado.rubricas_recalculadas} rubricas recalculadas.`
      );
    } catch (error) {
      toastMessages.error(error?.message || 'Erro ao normalizar valores aprovados');
      setNormalizacaoValoresResult({ ...acumulado, erro: String(error?.message || error) });
    } finally {
      setNormalizandoValores(false);
    }
  };

  const handleSincronizarValorUtilizadoRubricas = async () => {
    setSincronizandoRubricas(true);
    setSincronizacaoRubricasResult(null);
    let pular = 0;
    let acumulado = { total_rubricas: 0, atualizadas: 0, sem_nfs_aprovadas: 0, sem_valor: 0, erros: 0, lotes: 0 };
    try {
      // Loop automático até concluir (ou até 20 lotes de segurança).
      for (let i = 0; i < 20; i++) {
        const res = await base44.functions.invoke('sincronizarValorUtilizadoRubricas', { limite: 100, pular });
        const data = res?.data || res;
        acumulado.total_rubricas += data?.total_rubricas || 0;
        acumulado.atualizadas += data?.atualizadas || 0;
        acumulado.sem_nfs_aprovadas += data?.sem_nfs_aprovadas || 0;
        acumulado.sem_valor += data?.sem_valor || 0;
        acumulado.erros += data?.erros || 0;
        acumulado.lotes += 1;
        if (data?.has_more) {
          pular = data?.proximo_pular || 0;
        } else {
          break;
        }
      }
      setSincronizacaoRubricasResult(acumulado);
      toast.success(
        `${acumulado.atualizadas} rubricas sincronizadas (${acumulado.total_rubricas} verificadas).`
      );
      await queryClient.invalidateQueries({ queryKey: ['rubricas'] });
    } catch (error) {
      toastMessages.error(error?.message || 'Erro ao sincronizar valor_utilizado das rubricas');
      setSincronizacaoRubricasResult({ ...acumulado, erro: String(error?.message || error) });
    } finally {
      setSincronizandoRubricas(false);
    }
  };

  const handleCorrigirMetasSalaEspera = async () => {
    setCorrigindoMetas(true);
    setCorrecaoMetasResult(null);
    try {
      const res = await base44.functions.invoke('corrigirMetasDashboardSalaEspera', {});
      const data = res?.data || res;
      setCorrecaoMetasResult(data);
      if (data?.ok) {
        toast.success(
          `${data.nfs_normalizadas || 0} NFs normalizadas, ${data.rubricas_recalculadas || 0} rubricas recalculadas, ${data.rubricas_vinculadas || 0} vinculadas, ${data.metas_corrigidas_financeiro || 0} metas financeiro + ${data.metas_corrigidas_fisico || 0} físico. ${data.items_sala_criados || 0} itens Sala de Espera.`
        );
        await queryClient.invalidateQueries({ queryKey: ['rubricas'] });
      } else {
        toastMessages.error(data?.error || 'Falha na correção de metas');
      }
    } catch (error) {
      toastMessages.error(error?.message || 'Erro ao corrigir metas via Sala de Espera');
      setCorrecaoMetasResult({ erro: String(error?.message || error) });
    } finally {
      setCorrigindoMetas(false);
    }
  };

  const totalUsers = users.length;
  const totalReports = reports.length;
  const approvedReports = reports.filter(r => r.status === 'APPROVED').length;

  return (
    <div className="max-w-6xl mx-auto p-6">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings /> Plataforma
        </h1>

        <div className="flex items-center gap-2">
          <Button
            variant={adminPanel === null ? "default" : "outline"}
            className="gap-2"
            onClick={() => setAdminPanel(null)}
          >
            <FileText className="w-4 h-4" />
            Relatórios
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Settings className="w-4 h-4" />
                Painéis administrativos
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={() => setAdminPanel('permissoes')}>
                <Users2 className="w-4 h-4 mr-2" /> Permissões
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAdminPanel('museus')}>
                <Building2 className="w-4 h-4 mr-2" /> Museus
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAdminPanel('equipes')}>
                <Users className="w-4 h-4 mr-2" /> Equipes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAdminPanel('metadados')}>
                <Database className="w-4 h-4 mr-2" /> Metadados
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAdminPanel('auditoria')}>
                <History className="w-4 h-4 mr-2" /> Auditoria
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAdminPanel('hardening')}>
                <Lock className="w-4 h-4 mr-2" /> Hardening
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAdminPanel('comunicados')}>
                <Send className="w-4 h-4 mr-2" /> Comunicados
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAdminPanel('ferramentas')}>
                <Wrench className="w-4 h-4 mr-2" /> Ferramentas
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={createPageUrl('BaseConhecimento')} className="flex items-center">
                  <BookOpen className="w-4 h-4 mr-2" /> Biblioteca
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Send className="w-4 h-4" />
                Ações admin
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem disabled={restoringMembers} onClick={handleRestoreInactiveMembers}>
                <RotateCw className="w-4 h-4 mr-2" /> Restaurar membros inativos
              </DropdownMenuItem>
              <DropdownMenuItem disabled={sendingLink} onClick={handleSendLinkApp}>
                <Mail className="w-4 h-4 mr-2" /> Enviar link do app a todos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Usuários" value={totalUsers} icon={Users} />
        <KpiCard label="Relatórios" value={totalReports} icon={FileText} />
        <KpiCard label="Aprovados" value={approvedReports} icon={CheckCircle} />
      </div>

      {adminPanel === null ? (
        <div className="border rounded-lg divide-y">
          {reports.map(r => (
            <div key={r.id} className="p-3 flex justify-between items-center">
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
        </div>
      ) : (
        <div className="space-y-6">
          {adminPanel === 'permissoes' && <UserPermissionsManager />}
          {adminPanel === 'museus' && <MuseuManager />}
          {adminPanel === 'equipes' && <EquipeManager />}
          {adminPanel === 'metadados' && <MetadadosManager />}
          {adminPanel === 'auditoria' && (
            <>
              <Auditoria360DiariaPanel />
              <AuditSystemPanel />
            </>
          )}
          {adminPanel === 'hardening' && <HardeningPanel />}
          {adminPanel === 'comunicados' && (
            <>
              <ComunicadosPanel />
              <BoletimSemanalAgendaPanel />
            </>
          )}
          {adminPanel === 'ferramentas' && <AutomacoesManutencaoCard />}
        </div>
      )}
    </div>
  );
}

export default function PlataformaAdmin() {
  return <RequireAuth requireRole="COORDENADOR"><PlataformaAdminInner /></RequireAuth>;
}