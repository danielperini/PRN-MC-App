import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, FileText, Activity, Image, Wallet, CalendarDays } from 'lucide-react';
import GaleriaTickerCarousel from '../components/dashboard/GaleriaTickerCarousel';
import NewsCarousel from '../components/dashboard/NewsCarousel';
import DiariamenteNosMuseus from '../components/dashboard/DiariamenteNosMuseus';
import ProfessionalStats from '../components/dashboard/ProfessionalStats';
import RecentReportsCard from '../components/dashboard/RecentReportsCard';
import ProfessionalGeneralCharts from '../components/dashboard/ProfessionalGeneralCharts';
import MetasAditivoSection from '../components/dashboard/MetasAditivoSection';
import { consolidateOfficialDashboardMetrics } from '@/utils/auditoria/institutionalMetrics';

const APPROVED = new Set(['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN']);
const SUBMITTED = new Set(['SUBMITTED', 'ENVIADO', 'ENVIADO_REVISAO', 'AGUARDANDO_REVISAO', 'SOLICITADO']);
const RETURNED = new Set(['DEVOLVIDO', 'RETURNED']);
const PAID = new Set(['PAGO', 'PAID']);

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeMuseu(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';
  if (text.includes('mhab') || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem') || text.includes('som')) return 'MIS';
  return '';
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
}

function getUserMuseu(user) {
  const text = normalizeText([user?.full_name, user?.name, user?.display_name, user?.email].filter(Boolean).join(' '));
  if (text.includes('clara')) return 'MUMO';
  if (text.includes('juliana') || text.includes('isabella') || text.includes('isabela')) return 'MIS';
  if (text.includes('lara') || text.includes('wanda')) return 'MHAB';
  return normalizeMuseu(user?.museu || user?.centro_custo || '');
}

function isApprovedReport(report) {
  return APPROVED.has(normalize(report?.status));
}

function isMine(item, email) {
  const target = normalizeEmail(email);
  if (!target) return false;
  return [item?.created_by, item?.user_email, item?.solicitante_email, item?.profissional_email, item?.responsavel_email, item?.email]
    .some((value) => normalizeEmail(value) === target);
}

function getActivityPublic(activity) {
  const direct = toNumber(activity?.publico_total ?? activity?.publico_estimado ?? activity?.publico ?? 0);
  if (direct > 0) return Math.round(direct);
  const medio = toNumber(activity?.publico_medio_por_sessao ?? activity?.publico_medio_sessao ?? activity?.publico_medio ?? activity?.publico_por_sessao ?? 0);
  const vezes = toNumber(activity?.quantas_vezes_ocorreu ?? activity?.qtd_ocorrencias ?? activity?.ocorrencias ?? activity?.quantidade_ocorrencias ?? 1);
  return Math.round(medio) * Math.max(Math.round(vezes), 1);
}

function getReportMuseu(report) {
  return normalizeMuseu([
    report?.museu,
    report?.museu_secundario,
    report?.museu_principal,
    report?.instituicao,
    report?.unidade,
    report?.centro_custo,
    report?.local,
    report?.titulo,
    report?.descricao,
  ].filter(Boolean).join(' '));
}

function getActivityMuseu(activity, report) {
  return normalizeMuseu([
    activity?.museu,
    activity?.centro_custo,
    activity?.unidade,
    activity?.instituicao,
    activity?.local,
    activity?.nome_atividade,
    activity?.titulo,
    activity?.descricao,
  ].filter(Boolean).join(' ')) || getReportMuseu(report);
}

function getReportActivities(report) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
  return atividades.map((activity, index) => ({
    ...activity,
    report_id: report?.id,
    _activityIndex: index,
    _publico: getActivityPublic(activity),
    _museu: getActivityMuseu(activity, report),
    _auditKey: [activity?.programacao_id || activity?.id || activity?.titulo || activity?.nome_atividade || index, activity?.data || report?.mes_referencia, getActivityMuseu(activity, report)].filter(Boolean).join('|'),
  }));
}

function getReportsActivities(reports) {
  return (Array.isArray(reports) ? reports : []).flatMap(getReportActivities);
}

function deduplicateActivities(activities) {
  const unique = new Map();
  (activities || []).forEach((activity) => {
    const key = activity?._auditKey;
    if (!key) return;
    if (!unique.has(key) || toNumber(activity?._publico) > toNumber(unique.get(key)?._publico)) unique.set(key, activity);
  });
  return Array.from(unique.values());
}

function getApprovedMetrics(reports) {
  const approvedReports = (Array.isArray(reports) ? reports : []).filter(isApprovedReport);
  const approvedActivities = deduplicateActivities(approvedReports.flatMap(getReportActivities));
  const byMuseum = { MHAB: { publicoTotal: 0, atividades: 0 }, MIS: { publicoTotal: 0, atividades: 0 }, MUMO: { publicoTotal: 0, atividades: 0 } };

  approvedActivities.forEach((activity) => {
    const museu = normalizeMuseu(activity?._museu);
    if (!byMuseum[museu]) return;
    byMuseum[museu].publicoTotal += toNumber(activity?._publico);
    byMuseum[museu].atividades += 1;
  });

  return {
    approvedReports,
    approvedActivities,
    publicoTotal: approvedActivities.reduce((sum, activity) => sum + toNumber(activity?._publico), 0),
    byMuseum,
  };
}

function StatCard({ title, value, helper, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 text-black shadow-sm transition-all hover:shadow-md">
      <div className="mb-3 flex items-center gap-2 text-gray-500">
        {Icon && <Icon className="h-4 w-4 text-black" />}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{title}</span>
      </div>
      <div className="text-2xl font-bold text-black">{value}</div>
      {helper && <div className="mt-1 text-xs text-gray-500">{helper}</div>}
    </div>
  );
}

function PersonalCards({ myReports, myActivities, myAttachments, myRequests, myProgramacao, userMuseu }) {
  const cards = useMemo(() => {
    const reports = Array.isArray(myReports) ? myReports : [];
    const activities = Array.isArray(myActivities) ? myActivities : [];
    const attachments = Array.isArray(myAttachments) ? myAttachments : [];
    const requests = Array.isArray(myRequests) ? myRequests : [];
    const programacao = Array.isArray(myProgramacao) ? myProgramacao : [];
    const photos = attachments.filter((a) => String(a?.file_type || a?.mime_type || '').toLowerCase().startsWith('image/'));
    const docs = attachments.filter((a) => !photos.includes(a));
    const activitiesWithPublic = activities.filter((a) => getActivityPublic(a) > 0);
    return {
      reports: { total: reports.length, returned: reports.filter((r) => RETURNED.has(normalize(r.status))).length },
      activities: { total: activities.length, withPublic: activitiesWithPublic.length, publicActivities: activitiesWithPublic.reduce((sum, a) => sum + getActivityPublic(a), 0), publicGeneral: reports.reduce((sum, r) => sum + toNumber(r.publico_geral_declarado || r.publico_geral || 0), 0) },
      evidence: { photos: photos.length, docs: docs.length, attachments: attachments.length },
      requests: { total: requests.length, approved: requests.filter((r) => APPROVED.has(normalize(r.status))).length, paid: requests.filter((r) => PAID.has(normalize(r.status)) || r.pago === true).length, pending: requests.filter((r) => SUBMITTED.has(normalize(r.status))).length },
      programacao: { total: programacao.length },
    };
  }, [myReports, myActivities, myAttachments, myRequests, myProgramacao]);

  return (
    <section className="mb-8 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Resumo pessoal</h2>
        <p className="mt-1 text-sm text-muted-foreground">Relatórios, atividades, evidências, solicitações e programação vinculados ao usuário logado{userMuseu ? ` · Museu vinculado: ${userMuseu}` : ''}.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Meus Relatórios" value={fmtInt(cards.reports.total)} helper={`${cards.reports.returned} devolvidos`} icon={FileText} />
        <StatCard title="Minhas Atividades" value={fmtInt(cards.activities.total)} helper={`${cards.activities.withPublic} com público · ${fmtInt(cards.activities.publicActivities)} participantes`} icon={Activity} />
        <StatCard title="Minhas Evidências" value={fmtInt(cards.evidence.attachments)} helper={`${cards.evidence.photos} fotos · ${cards.evidence.docs} documentos`} icon={Image} />
        <StatCard title="Solicitações/Pagamentos" value={fmtInt(cards.requests.total)} helper={`${cards.requests.approved} aprovadas · ${cards.requests.paid} pagas · ${cards.requests.pending} pendentes`} icon={Wallet} />
        <StatCard title="Minha Programação" value={fmtInt(cards.programacao.total)} helper={cards.programacao.total > 0 ? 'programações vinculadas' : 'sem programação vinculada'} icon={CalendarDays} />
      </div>
      {cards.activities.publicGeneral > 0 && <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500">Público geral declarado nos relatórios: <span className="font-semibold text-black">{fmtInt(cards.activities.publicGeneral)}</span>.</div>}
    </section>
  );
}

function ProfessionalDataSection({ myReports, myActivities, isLoadingActivities }) {
  const atividades = Array.isArray(myActivities) ? myActivities : [];
  return (
    <div className="space-y-6">
      <div className="border-t border-border pt-6">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-foreground">Meus Dados e Atividades</h2>
          <p className="mt-1 text-sm text-muted-foreground">Visualize suas atividades, relatórios e documentos.</p>
        </div>
        {!isLoadingActivities && atividades.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Atividades Registradas</h3>
            <div className="grid max-h-96 gap-3 overflow-y-auto">
              {atividades.slice(0, 10).map((activity, index) => {
                const report = myReports.find((r) => r.id === activity.report_id);
                return <div key={activity.id || `${activity.titulo}-${index}`} className="rounded-lg border border-border bg-card/50 p-3 transition-colors hover:bg-card"><div className="text-sm font-medium text-foreground">{activity.titulo || activity.nome || activity.nome_atividade || 'Atividade sem título'}</div><div className="mt-1 text-xs text-muted-foreground">{getReportMuseu(report) || 'Geral'} • {report?.mes_referencia || ''} {report?.ano || ''}</div></div>;
              })}
            </div>
          </div>
        )}
        {!isLoadingActivities && atividades.length === 0 && <div className="rounded-lg border border-dashed border-border p-8 text-center"><p className="text-muted-foreground">Nenhuma atividade encontrada.</p></div>}
      </div>
    </div>
  );
}

function DashboardProfissionalInner() {
  const { user: currentUser } = useCurrentUser();
  const userMuseu = getUserMuseu(currentUser);

  const { data: myReports = [], isLoading } = useQuery({ queryKey: ['my-reports-prof', currentUser?.email], queryFn: () => base44.entities.Report.filter({ created_by: currentUser?.email }, '-created_date', 100), enabled: !!currentUser?.email });
  const { data: myActivities = [], isLoading: isLoadingActivities } = useQuery({ queryKey: ['my-activities-prof', currentUser?.email, myReports], queryFn: async () => getReportsActivities(myReports), enabled: !!currentUser?.email && myReports.length > 0 });
  const { data: myAttachments = [] } = useQuery({ queryKey: ['my-attachments-prof', myReports], queryFn: async () => { const attachments = []; for (const report of myReports) { try { attachments.push(...await base44.entities.Attachment.filter({ report_id: report.id }, '-created_date')); } catch {} } return attachments; }, enabled: myReports.length > 0 });
  const { data: myRequests = [] } = useQuery({ queryKey: ['my-purchase-requests-prof', currentUser?.email], queryFn: async () => { try { const list = await base44.entities.PurchaseRequest.list('-created_date', 300); return (Array.isArray(list) ? list : []).filter((item) => isMine(item, currentUser?.email)); } catch { return []; } }, enabled: !!currentUser?.email });
  const { data: myProgramacao = [] } = useQuery({ queryKey: ['my-programacao-prof', currentUser?.email], queryFn: async () => { try { const list = await base44.entities.Programacao.list('-data_realizacao', 200); return (Array.isArray(list) ? list : []).filter((item) => isMine(item, currentUser?.email)); } catch { return []; } }, enabled: !!currentUser?.email });
  const { data: allReports = [], isLoading: isLoadingAllReports } = useQuery({ queryKey: ['all-reports-prof-general'], queryFn: () => base44.entities.Report.list('-created_date', 500), enabled: !!currentUser?.email });
  const { data: allProgramacao = [], isLoading: isLoadingAllProgramacao } = useQuery({ queryKey: ['all-programacao-prof-general'], queryFn: () => base44.entities.Programacao.list('-data_realizacao', 500), enabled: !!currentUser?.email });
  const { data: rubricas = [] } = useQuery({ queryKey: ['dashboard-profissional-rubricas'], queryFn: async () => { try { const data = await base44.entities.Rubrica.list('rubrica', 1000); return Array.isArray(data) ? data.filter((r) => r.ativo !== false) : []; } catch { return []; } }, enabled: !!currentUser?.email });

  const approvedMetrics = useMemo(() => consolidateOfficialDashboardMetrics({ reports: allReports, programacao: allProgramacao, rubricas }), [allReports, allProgramacao, rubricas]);
  const publicByMuseum = useMemo(() => Object.fromEntries((approvedMetrics.audience?.byMuseum || []).map((item) => [item.museu, item.total])), [approvedMetrics]);
  const museuAtualPublico = userMuseu ? toNumber(publicByMuseum[userMuseu]) : myActivities.reduce((sum, a) => sum + getActivityPublic(a), 0);
  const recentReports = myReports.slice(0, 5);
  const stats = { publico: museuAtualPublico, publicoTodosMuseus: approvedMetrics.audience?.publicoTotal || 0, atividadesTresMuseus: approvedMetrics.activities?.total || 0 };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-3xl font-semibold text-foreground">Painel</h1><p className="mt-1 text-sm text-muted-foreground">Bem-vindo, {currentUser?.full_name || ''}! Sua atuação nas instituições{userMuseu ? ` · ${userMuseu}` : ''}</p></div>
          <Link to="/ReportEditor?novo=1"><Button className="gap-2"><Plus className="h-4 w-4" />Novo Relatório</Button></Link>
        </div>
        <div className="mb-6 space-y-6"><GaleriaTickerCarousel /><NewsCarousel /><DiariamenteNosMuseus /><MetasAditivoSection rubricas={rubricas} /></div>
        {!isLoadingAllReports && !isLoadingAllProgramacao && <ProfessionalGeneralCharts reports={allReports} programacao={allProgramacao} />}
        {!isLoading && <PersonalCards myReports={myReports} myActivities={myActivities} myAttachments={myAttachments} myRequests={myRequests} myProgramacao={myProgramacao} userMuseu={userMuseu} />}
        {!isLoading && <div className="mb-8"><h2 className="mb-4 text-xl font-semibold text-foreground">Dados</h2><ProfessionalStats stats={stats} /></div>}
        {recentReports.length > 0 && <div className="mb-8"><h2 className="mb-4 text-xl font-semibold text-foreground">Relatórios Recentes</h2><RecentReportsCard reports={recentReports} /></div>}
        <ProfessionalDataSection myReports={myReports} myActivities={myActivities} isLoadingActivities={isLoadingActivities} />
        {!isLoading && myReports.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center"><p className="font-medium text-foreground">Você ainda não tem relatórios</p><p className="mt-2 text-sm text-muted-foreground">Comece criando um novo relatório mensal para registrar suas atividades e atuação.</p><Link to="/ReportEditor?novo=1"><Button className="mt-6 gap-2"><Plus className="h-4 w-4" />Criar Primeiro Relatório</Button></Link></div>}
      </div>
    </div>
  );
}

export default function DashboardProfissional() {
  return <RequireAuth><DashboardProfissionalInner /></RequireAuth>;
}
