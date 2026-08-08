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
import HardeningPanel from '../components/admin/HardeningPanel';
import ComunicadosPanel from '../components/admin/ComunicadosPanel';
import BoletimSemanalAgendaPanel from '../components/admin/BoletimSemanalAgendaPanel';
import {
  Users, FileText, History, Settings,
  CheckCircle, ChevronRight,
  AlertTriangle, Download, Database, Building2, Users2,
  BookOpen, RotateCw, Send, Mail, HardDrive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toastMessages } from '@/lib/toastMessages';
import { toast } from 'sonner';
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
          <TabsTrigger value="membros">👥 Membros</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="auditoria">📊 Auditoria</TabsTrigger>
          <TabsTrigger value="hardening">🔒 Hardening</TabsTrigger>
          <TabsTrigger value="comunicados">📣 Comunicados</TabsTrigger>
          <TabsTrigger value="metadados">Metadados</TabsTrigger>
          <TabsTrigger value="ferramentas">🔧 Ferramentas</TabsTrigger>
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

        <TabsContent value="membros">
          <div className="border-2 border-black rounded-lg p-6 bg-white">
            <h2 className="text-lg font-bold text-black mb-4">Restaurar Membros Inativos</h2>
            <p className="text-sm text-gray-700 mb-6">
              Clique abaixo para restaurar automaticamente todos os membros de equipe com status inativo ou suspenso.
            </p>
            
            <Button
              onClick={handleRestoreInactiveMembers}
              disabled={restoringMembers}
              className="bg-black text-white hover:bg-gray-900 gap-2"
            >
              {restoringMembers ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  Restaurando...
                </>
              ) : (
                <>
                  <RotateCw className="w-4 h-4" />
                  Restaurar Agora
                </>
              )}
            </Button>

            {restoreResult && (
              <div className="mt-6 p-4 border-2 border-black rounded-lg bg-white">
                <p className="font-semibold text-black mb-2">{restoreResult.message}</p>
                {restoreResult.restored && restoreResult.restored.length > 0 && (
                  <div className="text-sm text-gray-700">
                    <p className="font-medium mb-2">✅ Restaurados:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {restoreResult.restored.map((m) => (
                        <li key={m.id}>{m.name} (era {m.previousStatus})</li>
                      ))}
                    </ul>
                  </div>
                )}
                {restoreResult.errors && restoreResult.errors.length > 0 && (
                  <div className="text-sm text-red-700 mt-3">
                    <p className="font-medium mb-2">❌ Erros:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {restoreResult.errors.map((e) => (
                        <li key={e.id}>{e.name}: {e.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
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
          <div className="space-y-6">
            <Auditoria360DiariaPanel />
            <AuditSystemPanel />
          </div>
        </TabsContent>

        <TabsContent value="hardening">
          <HardeningPanel />
        </TabsContent>

        <TabsContent value="comunicados">
          <ComunicadosPanel />
        </TabsContent>

        <TabsContent value="ferramentas">
          <div className="space-y-6">
            {/* Corrigir Metas do Dashboard via Sala de Espera */}
            <div className="border-2 border-violet-600 rounded-lg p-6 bg-violet-50">
              <h2 className="text-lg font-bold text-violet-900 mb-1 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Corrigir Metas do Dashboard via Sala de Espera
              </h2>
              <p className="text-sm text-violet-800 mb-4">
                Inteligência da Sala de Espera aplicada aos cards de metas desatualizados (financeiro 0%,
                físico 0%, "Sem rubricas vinculadas"). Normaliza <code>valor_aprovado_admin</code> das NFs
                aprovadas, recalcula <code>valor_utilizado</code> das rubricas, vincula rubricas órfãs às
                metas (determinístico + IA), corrige <code>meta_codigo</code> das atividades e cria itens
                na Sala de Espera — tratados/devolvidos (APROVADO) para correções automáticas e
                AGUARDANDO_REVISAO para as ambíguas. Idempotente.
              </p>

              <Button
                onClick={handleCorrigirMetasSalaEspera}
                disabled={corrigindoMetas}
                className="bg-violet-700 text-white hover:bg-violet-800 gap-2"
              >
                {corrigindoMetas ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    Corrigindo via Sala de Espera...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Corrigir todas as metas agora
                  </>
                )}
              </Button>

              {correcaoMetasResult && !correcaoMetasResult.erro && (
                <div className="mt-6 p-4 border border-violet-300 rounded-lg bg-white">
                  <p className="font-semibold text-gray-800 mb-3">
                    ✅ Correção concluída ({((correcaoMetasResult.execution_ms || 0) / 1000).toFixed(1)}s)
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>🔎 NFs verificadas: {correcaoMetasResult.nfs_verificadas || 0}</li>
                    <li>💵 NFs normalizadas: <strong>{correcaoMetasResult.nfs_normalizadas || 0}</strong></li>
                    <li>🔁 Rubricas recalculadas: <strong>{correcaoMetasResult.rubricas_recalculadas || 0}</strong></li>
                    <li>🔗 Rubricas vinculadas a metas: <strong>{correcaoMetasResult.rubricas_vinculadas || 0}</strong></li>
                    <li>📊 Metas corrigidas (financeiro): <strong>{correcaoMetasResult.metas_corrigidas_financeiro || 0}</strong></li>
                    <li>🏃 Metas corrigidas (físico): <strong>{correcaoMetasResult.metas_corrigidas_fisico || 0}</strong></li>
                    <li>📋 Atividades com meta_codigo corrigido: {correcaoMetasResult.atividades_meta_corrigidas || 0}</li>
                    <li className="text-violet-700">📮 Itens Sala de Espera: {correcaoMetasResult.items_sala_criados || 0} ({correcaoMetasResult.items_sala_aprovados || 0} tratados, {correcaoMetasResult.items_sala_revisao || 0} em revisão)</li>
                  </ul>
                  {correcaoMetasResult.detalhes_por_meta?.length > 0 && (
                    <details className="mt-3">
                      <summary className="text-xs text-gray-500 cursor-pointer">Detalhe por meta</summary>
                      <ul className="mt-2 text-xs text-gray-600 space-y-1 max-h-48 overflow-y-auto">
                        {correcaoMetasResult.detalhes_por_meta.map((d, i) => (
                          <li key={i}>
                            <strong>META {d.meta}</strong> ({d.titulo}) — rubricas: {d.rubricas}, previsto: R$ {(d.previsto || 0).toFixed(2)}, utilizado: R$ {(d.utilizado || 0).toFixed(2)}
                            {d.acoes?.length > 0 && <span className="block text-gray-500 ml-3">↳ {d.acoes.join('; ')}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {correcaoMetasResult?.erro && (
                <div className="mt-6 p-4 border border-red-300 rounded-lg bg-white text-red-700 text-sm">
                  ❌ {correcaoMetasResult.erro}
                </div>
              )}
            </div>

            {/* Normalizar valor_aprovado_admin das NFs aprovadas/pagas */}
            <div className="border-2 border-teal-500 rounded-lg p-6 bg-teal-50">
              <h2 className="text-lg font-bold text-teal-900 mb-1 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Normalizar valores aprovados das NFs (Dashboard 0%)
              </h2>
              <p className="text-sm text-teal-800 mb-4">
                Varrer todas as NFs <strong>APROVADO_ADMIN</strong> e <strong>PAGO</strong> que ainda não têm
                <code className="bg-teal-100 px-1 rounded">valor_aprovado_admin</code> preenchido, normalizar com o
                valor real (<code>nf_valor_total</code> &rarr; <code>valor_total</code> &rarr; <code>valor_aprovado</code> &rarr;
                <code>valor_solicitado</code>) e recalcular <code>valor_utilizado</code> das rubricas afetadas.
                Corrige de vez os cards de metas que aparecem em 0%. Executa em loop automático até concluir.
              </p>

              <Button
                onClick={() => handleNormalizarValoresAprovados(true)}
                disabled={normalizandoValores}
                className="bg-teal-700 text-white hover:bg-teal-800 gap-2"
              >
                {normalizandoValores ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    Normalizando...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Normalizar agora
                  </>
                )}
              </Button>

              {normalizacaoValoresResult && !normalizacaoValoresResult.erro && (
                <div className="mt-6 p-4 border border-teal-300 rounded-lg bg-white">
                  <p className="font-semibold text-gray-800 mb-3">✅ Normalização concluída ({normalizacaoValoresResult.lotes || 0} lotes)</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>🔎 NFs varridas: {normalizacaoValoresResult.total_varridas || 0}</li>
                    <li>✅ NFs corrigidas: <strong>{normalizacaoValoresResult.corrigidas || 0}</strong></li>
                    <li>🔁 Rubricas recalculadas: <strong>{normalizacaoValoresResult.rubricas_recalculadas || 0}</strong></li>
                    {normalizacaoValoresResult.erros > 0 && (
                      <li className="text-red-700">❌ Erros pontuais: {normalizacaoValoresResult.erros}</li>
                    )}
                  </ul>
                </div>
              )}

              {normalizacaoValoresResult?.erro && (
                <div className="mt-6 p-4 border border-red-300 rounded-lg bg-white text-red-700 text-sm">
                  ❌ {normalizacaoValoresResult.erro}
                </div>
              )}
            </div>

            {/* Sincronização DEFINITIVA do valor_utilizado das rubricas */}
            <div className="border-2 border-cyan-600 rounded-lg p-6 bg-cyan-50">
              <h2 className="text-lg font-bold text-cyan-900 mb-1 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Sincronizar valor_utilizado das Rubricas (definitivo)
              </h2>
              <p className="text-sm text-cyan-800 mb-4">
                Recalcula o <code className="bg-cyan-100 px-1 rounded">valor_utilizado</code> de
                <strong> TODAS as rubricas</strong> lendo diretamente o total real das NFs aprovadas/pagas
                vinculadas (cadeia <code>valor_pago</code> &rarr; <code>valor_aprovado_admin</code> &rarr;
                <code>nf_valor_total</code> &rarr; <code>valor_total</code> &rarr; <code>valor_aprovado</code> &rarr;
                <code>valor_solicitado</code>). Garante que o painel de metas reflita os números reais —
                executa em loop automático até percorrer todas as rubricas. Idempotente: só escreve
                quando o valor muda.
              </p>

              <Button
                onClick={handleSincronizarValorUtilizadoRubricas}
                disabled={sincronizandoRubricas}
                className="bg-cyan-700 text-white hover:bg-cyan-800 gap-2"
              >
                {sincronizandoRubricas ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Sincronizar agora
                  </>
                )}
              </Button>

              {sincronizacaoRubricasResult && !sincronizacaoRubricasResult.erro && (
                <div className="mt-6 p-4 border border-cyan-300 rounded-lg bg-white">
                  <p className="font-semibold text-gray-800 mb-3">
                    ✅ Sincronização concluída ({sincronizacaoRubricasResult.lotes || 0} lotes)
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>🔎 Rubricas verificadas: {sincronizacaoRubricasResult.total_rubricas || 0}</li>
                    <li>🔁 Rubricas atualizadas: <strong>{sincronizacaoRubricasResult.atualizadas || 0}</strong></li>
                    <li>⏭️ Sem NFs aprovadas: {sincronizacaoRubricasResult.sem_nfs_aprovadas || 0}</li>
                    <li>⏭️ Sem valor nas NFs: {sincronizacaoRubricasResult.sem_valor || 0}</li>
                    {sincronizacaoRubricasResult.erros > 0 && (
                      <li className="text-red-700">❌ Erros pontuais: {sincronizacaoRubricasResult.erros}</li>
                    )}
                  </ul>
                </div>
              )}

              {sincronizacaoRubricasResult?.erro && (
                <div className="mt-6 p-4 border border-red-300 rounded-lg bg-white text-red-700 text-sm">
                  ❌ {sincronizacaoRubricasResult.erro}
                </div>
              )}
            </div>

            {/* Sincronizar NFs do Drive */}
            <div className="border-2 border-emerald-500 rounded-lg p-6 bg-emerald-50">
              <h2 className="text-lg font-bold text-emerald-900 mb-1 flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Sincronizar NFs do Drive
              </h2>
              <p className="text-sm text-emerald-800 mb-4">
                Varre a pasta raiz do Google Drive e cria DocumentIntakes para PDFs/XMLs/comprovantes ainda
                não representados no banco (sem IA, sem PurchaseRequest automático, sem fila de notificações).
                Útil para recuperar arquivos cujos registros foram apagados. Envia e-mail ao admin ao concluir.
              </p>

              <Button
                onClick={handleSincronizarNFsDrive}
                disabled={sincronizandoNFs}
                className="bg-emerald-700 text-white hover:bg-emerald-800 gap-2"
              >
                {sincronizandoNFs ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    Sincronizando arquivos do Drive...
                  </>
                ) : (
                  <>
                    <HardDrive className="w-4 h-4" />
                    Sincronizar NFs do Drive
                  </>
                )}
              </Button>

              {sincronizacaoNFsResult && !sincronizacaoNFsResult.erro && (
                <div className="mt-6 p-4 border border-emerald-300 rounded-lg bg-white">
                  <p className="font-semibold text-gray-800 mb-3">📋 Resumo da sincronização</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>📂 Total no Drive (raiz + nível 1): {sincronizacaoNFsResult.total_arquivos_drive ?? 0}</li>
                    <li>➕ DocumentIntakes criados: {sincronizacaoNFsResult.total_criados ?? 0}</li>
                    <li>⏭️ Pulados (já existentes / duplicatas): {sincronizacaoNFsResult.total_pulados ?? 0}</li>
                    <li>🎯 Cobertura: {typeof sincronizacaoNFsResult.cobertura_percentual === 'number' ? sincronizacaoNFsResult.cobertura_percentual.toFixed(1) : '0'}%</li>
                    {sincronizacaoNFsResult.total_pendentes > 0 && (
                      <li className="text-amber-700">⚠️ Pendentes para próxima execução: {sincronizacaoNFsResult.total_pendentes}</li>
                    )}
                    {sincronizacaoNFsResult.email_enviado && (
                      <li className="text-blue-700">📧 E-mail enviado ao admin.</li>
                    )}
                    <li>⏱️ Tempo: {((sincronizacaoNFsResult.execution_ms || 0) / 1000).toFixed(1)}s</li>
                  </ul>
                </div>
              )}

              {sincronizacaoNFsResult?.erro && (
                <div className="mt-6 p-4 border border-red-300 rounded-lg bg-white text-red-700 text-sm">
                  ❌ {sincronizacaoNFsResult.erro}
                </div>
              )}
            </div>
            {/* Enviar Link do App para Todos */}
            <div className="border-2 border-blue-500 rounded-lg p-6 bg-blue-50">
              <h2 className="text-lg font-bold text-blue-900 mb-1 flex items-center gap-2">
                <Send className="w-5 h-5" />
                Enviar Link do App para Todos
              </h2>
              <p className="text-sm text-blue-800 mb-4">
                Dispara um e-mail institucional único para toda a base de usuários (membros ativos da equipe e usuários com permissão cadastrada)
                informando o endereço oficial de acesso à plataforma: <span className="font-semibold">periniprojetos.com.br</span>.
              </p>

              <Button
                onClick={handleSendLinkApp}
                disabled={sendingLink}
                className="bg-blue-700 text-white hover:bg-blue-800 gap-2"
              >
                {sendingLink ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Enviar Link do App para Todos
                  </>
                )}
              </Button>

              {linkResult && (
                <div className="mt-6 p-4 border border-blue-300 rounded-lg bg-white">
                  <p className="font-semibold text-gray-800 mb-1">
                    📧 E-mails enviados: {linkResult.enviados} de {linkResult.total}
                  </p>
                  {linkResult.link && (
                    <p className="text-xs text-gray-500 mb-2">Link compartilhado: {linkResult.link}</p>
                  )}
                  {linkResult.erros && linkResult.erros.length > 0 && (
                    <div className="mt-2 text-sm text-red-700">
                      <p className="font-medium mb-1">⚠️ Falhas de envio ({linkResult.erros.length}):</p>
                      <ul className="list-disc list-inside space-y-1 text-xs max-h-40 overflow-y-auto">
                        {linkResult.erros.map((e, i) => (
                          <li key={i}>{e.email}: {e.erro}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Higienização da Entrada Única */}
            <div className="border-2 border-purple-500 rounded-lg p-6 bg-purple-50">
              <h2 className="text-lg font-bold text-purple-900 mb-1 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Higienização da Entrada Única
              </h2>
              <p className="text-sm text-purple-800 mb-4">
                Executa quatro frentes de saneamento automático:(1) <strong>deleta definitivamente</strong> NFs
                duplicadas com mesma combinação de CNPJ + número + data + valor + emissor;(2) <strong>deleta
                definitivamente</strong> registros com nome de arquivo idêntico (mesmo tipo); (3) <strong>marca
                como suspeitas</strong> para revisão manual registros com nome de arquivo similar (≥85%); (4)
                vincula XMLs faltantes automaticamente. Operação idempotente.
              </p>

              <Button
                onClick={handleHigienizarEntradaUnica}
                disabled={higienizando}
                className="bg-purple-700 text-white hover:bg-purple-800 gap-2"
              >
                {higienizando ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    Higienizando...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Executar higienização
                  </>
                )}
              </Button>

              {higienizacaoResult && (
                <div className="mt-6 p-4 border border-purple-300 rounded-lg bg-white">
                  <p className="font-semibold text-gray-800 mb-3">📋 Relatório de higienização</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>🔎 NFs verificadas: {higienizacaoResult.total_nf_verificadas || 0}</li>
                    <li>🗑️ <strong>Frente 1</strong> — Deletadas (estrutural): {higienizacaoResult.deletadas_estrutural || 0}</li>
                    <li>🗑️ <strong>Frente 2</strong> — Deletadas (nome idêntico): {higienizacaoResult.deletadas_nome_idêntico || 0}</li>
                    <li>⚠️ <strong>Frente 3</strong> — Suspeitas para revisão: {higienizacaoResult.suspeitas_marcadas || 0}</li>
                    <li>🔁 Grupos duplicados (estrutural): {higienizacaoResult.grupos_duplicados || 0}</li>
                    <li>🔗 <strong>Frente 4</strong> — XMLs vinculados: {higienizacaoResult.xmls_vinculados || 0}</li>
                    <li>📄 PDFs sem XML: {higienizacaoResult.pdfs_sem_xml || 0}</li>
                    <li>❌ XMLs não encontrados: {higienizacaoResult.xmls_nao_encontrados || 0}</li>
                    <li>⏱️ Tempo: {(higienizacaoResult.execution_ms / 1000).toFixed(1)}s</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Organização automática de NFs com IA (lerNotaFiscalGPT em lote) */}
            <div className="border-2 border-indigo-500 rounded-lg p-6 bg-indigo-50">
              <h2 className="text-lg font-bold text-indigo-900 mb-1 flex items-center gap-2">
                <Database className="w-5 h-5" />
                Organizar todas as NFs com IA 🤖
              </h2>
              <p className="text-sm text-indigo-800 mb-4">
                Reprocessa até 50 NFs em lote usando a leitura integral (GPT-4o + Structured Outputs),
                preenchendo automaticamente centro_custo, rubrica, meta, valor, data e fornecedor
                quando ausentes. Pulamos NFs já organizadas com alta confiança (score ≥ 9) e
                respeitamos registros revisados manualmente e compras <strong>APROVADO_ADMIN/PAGO</strong>.
                Idempotente — pode rodar várias vezes. Ao final, envia resumo por e-mail para
                danielperini.mc@viadutodasartes.org.br.
              </p>

              <Button
                onClick={handleOrganizarNFsIA}
                disabled={organizandoNFsIA}
                className="bg-indigo-700 text-white hover:bg-indigo-800 gap-2"
              >
                {organizandoNFsIA ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    Organizando com IA...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Organizar NFs com IA 🤖
                  </>
                )}
              </Button>

              {organizacaoNFsIAResult && (
                <div className="mt-6 p-4 border border-indigo-300 rounded-lg bg-white">
                  <p className="font-semibold text-gray-800 mb-3">📋 Resumo da organização com IA</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>🔎 Total processado: {organizacaoNFsIAResult.stats?.total || 0}</li>
                    <li>⏭️ Puladas (score ≥ 9): {organizacaoNFsIAResult.stats?.pulado || 0}</li>
                    <li>✅ Atualizadas: {organizacaoNFsIAResult.stats?.atualizado || 0}</li>
                    <li>❌ Erros: {organizacaoNFsIAResult.stats?.erro || 0}</li>
                    <li>⭐ Score médio: {organizacaoNFsIAResult.score_medio || '0.00'}</li>
                    <li>⏱️ Tempo: {((organizacaoNFsIAResult.duration_ms || 0) / 1000).toFixed(1)}s</li>
                    {organizacaoNFsIAResult.has_more && (
                      <li className="text-amber-700 font-medium">
                        ⚠️ Ainda há mais NFs — execute novamente para continuar.
                      </li>
                    )}
                  </ul>
                  {organizacaoNFsIAResult.stats?.erros?.length > 0 && (
                    <div className="mt-3 text-red-700">
                      <p className="font-medium mb-1">⚠️ Erros detalhados:</p>
                      <ul className="list-disc list-inside space-y-1 text-xs max-h-40 overflow-y-auto">
                        {organizacaoNFsIAResult.stats.erros.map((e, i) => (
                          <li key={i}>{e.intake_id || 's/id'}: {e.erro}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Boletim Semanal da Agenda */}
            <BoletimSemanalAgendaPanel />

            {/* Fusão de Metas Educativas */}
            <div className="border-2 border-amber-400 rounded-lg p-6 bg-amber-50">
              <h2 className="text-lg font-bold text-amber-900 mb-1">Fusão de Metas Educativas</h2>
              <p className="text-sm text-amber-800 mb-4">
                Consolida Meta 5 e Meta 6 na Meta 20 ("Realizar no mínimo 30 ações educativas").
                Migra todos os vínculos em PurchaseRequest, Activity e ReportPhoto, e deleta as metas fundidas.
                A operação é idempotente — pode ser executada mais de uma vez com segurança.
              </p>

              <Button
                onClick={handleFundirMetas}
                disabled={fundindoMetas}
                className="bg-amber-700 text-white hover:bg-amber-800 gap-2"
              >
                {fundindoMetas ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    Executando fusão...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Executar fusão de metas educativas
                  </>
                )}
              </Button>

              {fusaoResult && (
                <div className="mt-6 p-4 border border-amber-300 rounded-lg bg-white">
                  <p className="font-semibold text-gray-800 mb-3">📋 Relatório de execução</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>✅ Meta 20 renomeada: {fusaoResult.report?.meta20_renomeada ? 'Sim' : 'Não'}</li>
                    <li>📦 PurchaseRequests migradas (Meta 6): {fusaoResult.report?.purchaseRequests_meta6_migradas ?? 0}</li>
                    <li>📦 PurchaseRequests migradas (Meta 5): {fusaoResult.report?.purchaseRequests_meta5_migradas ?? 0}</li>
                    <li>🎯 Atividades migradas (Meta 5): {fusaoResult.report?.activities_meta5_migradas ?? 0}</li>
                    <li>🎯 Atividades migradas (Meta 6): {fusaoResult.report?.activities_meta6_migradas ?? 0}</li>
                    <li>📸 Fotos migradas (Meta 5): {fusaoResult.report?.reportPhotos_meta5_migradas ?? 0}</li>
                    <li>📸 Fotos migradas (Meta 6): {fusaoResult.report?.reportPhotos_meta6_migradas ?? 0}</li>
                    <li>🗑️ Meta 5 deletada: {fusaoResult.report?.meta5_deletada ? 'Sim' : 'Não'}</li>
                    <li>🗑️ Meta 6 deletada: {fusaoResult.report?.meta6_deletada ? 'Sim' : 'Não'}</li>
                  </ul>
                  {fusaoResult.report?.erros?.length > 0 && (
                    <div className="mt-3 text-red-700">
                      <p className="font-medium mb-1">⚠️ Erros encontrados:</p>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        {fusaoResult.report.erros.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

export default function PlataformaAdmin() {
  return <RequireAuth requireRole="COORDENADOR"><PlataformaAdminInner /></RequireAuth>;
}