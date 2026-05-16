import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Filter, FileText, Activity, Image, Wallet, CalendarDays } from 'lucide-react';
import GaleriaTickerCarousel from '../components/dashboard/GaleriaTickerCarousel';
import NewsCarousel from '../components/dashboard/NewsCarousel';
import DiariamenteNosMuseus from '../components/dashboard/DiariamenteNosMuseus';
import ProfessionalStats from '../components/dashboard/ProfessionalStats';
import RecentReportsCard from '../components/dashboard/RecentReportsCard';
import ProfessionalGeneralCharts from '../components/dashboard/ProfessionalGeneralCharts';
import MetasAditivoSection from '../components/dashboard/MetasAditivoSection';

const APPROVED = new Set(['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN']);
const SUBMITTED = new Set(['SUBMITTED', 'ENVIADO', 'ENVIADO_REVISAO', 'AGUARDANDO_REVISAO', 'SOLICITADO']);
const RETURNED = new Set(['DEVOLVIDO', 'RETURNED']);
const PAID = new Set(['PAGO', 'PAID']);

const USER_MUSEU_MAP = {
  'claragas@gmail.com': 'MUMO',
};

const USER_NAME_MUSEU_RULES = [
  { match: ['clara'], museu: 'MUMO' },
  { match: ['juliana'], museu: 'MIS' },
  { match: ['isabella', 'isabela'], museu: 'MIS' },
  { match: ['lara'], museu: 'MHAB' },
  { match: ['wanda'], museu: 'MHAB' },
];

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeMuseu(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';
  if (text.includes('mhab') || text.includes('abilio') || text.includes('histórico') || text.includes('historico')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem') || text.includes('som')) return 'MIS';
  return '';
}

function getUserMuseu(user) {
  const email = normalizeEmail(user?.email || user?.created_by || user?.author_email || user?.responsavel_email);
  if (USER_MUSEU_MAP[email]) return USER_MUSEU_MAP[email];

  const text = normalizeText([
    user?.full_name,
    user?.name,
    user?.display_name,
    user?.author_name,
    user?.responsavel_nome,
    user?.created_by_name,
    user?.email,
    user?.created_by,
  ].filter(Boolean).join(' '));

  const rule = USER_NAME_MUSEU_RULES.find(({ match }) => match.some((term) => text.includes(term)));
  return rule?.museu || '';
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
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

  const publicoMedio = toNumber(activity?.publico_medio_por_sessao ?? activity?.publico_medio_sessao ?? activity?.publico_medio ?? activity?.publico_por_sessao ?? 0);
  const ocorrencias = toNumber(activity?.quantas_vezes_ocorreu ?? activity?.qtd_ocorrencias ?? activity?.ocorrencias ?? activity?.quantidade_ocorrencias ?? 1);

  return Math.round(publicoMedio) * Math.max(Math.round(ocorrencias), 1);
}

function getReportMuseu(report) {
  const direct = normalizeMuseu([
    report?.museu,
    report?.museu_secundario,
    report?.museu_principal,
    report?.museu_nome,
    report?.instituicao,
    report?.unidade,
    report?.unidade_museu,
    report?.centro_custo,
    report?.local,
    report?.espaco,
    report?.titulo,
    report?.nome,
    report?.descricao,
  ].filter(Boolean).join(' '));

  if (direct) return direct;

  return getUserMuseu({
    email: report?.created_by || report?.user_email || report?.author_email || report?.responsavel_email,
    full_name: report?.author_name || report?.responsavel_nome || report?.created_by_name || report?.nome_responsavel,
    created_by: report?.created_by,
    author_name: report?.author_name,
    responsavel_nome: report?.responsavel_nome,
  });
}

function getActivityMuseu(activity, report) {
  const direct = normalizeMuseu([
    activity?.museu,
    activity?.centro_custo,
    activity?.unidade,
    activity?.unidade_museu,
    activity?.instituicao,
    activity?.local,
    activity?.espaco,
    activity?.nome_atividade,
    activity?.nome,
    activity?.titulo,
    activity?.acao,
    activity?.atividade,
    activity?.descricao,
  ].filter(Boolean).join(' '));

  return direct || getReportMuseu(report);
}

function getActivityAuditKey(activity, report, index = 0) {
  const explicitProgramacaoId = activity?.programacao_id || activity?.programacaoId || activity?.id_programacao || activity?.agenda_id;
  if (explicitProgramacaoId) return `programacao:${explicitProgramacaoId}`;

  const nome = normalizeText(activity?.nome_atividade || activity?.nome || activity?.titulo || activity?.acao || activity?.atividade || '');
  const data = activity?.data_realizacao || activity?.data_inicio || activity?.data || activity?.inicio || '';
  const museu = normalizeText(getActivityMuseu(activity, report));
  const periodo = data || `${report?.ano || ''}-${report?.mes_referencia || report?.mes || ''}`;

  return [nome || `atividade-${index}`, periodo, museu].filter(Boolean).join('|');
}

function getReportActivities(report) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
  return atividades.map((activity, index) => ({
    ...activity,
    report_id: report?.id,
    _activityIndex: index,
    _publico: getActivityPublic(activity),
    _museu: getActivityMuseu(activity, report),
    _auditKey: getActivityAuditKey(activity, report, index),
  }));
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

function getReportsActivities(reports) {
  return (Array.isArray(reports) ? reports : []).flatMap(getReportActivities);
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

    const activitiesWithPublic = activities.filter((a) => getActivityPublic(a) > 0);
    const publicActivities = activitiesWithPublic.reduce((sum, a) => sum + getActivityPublic(a), 0);
    const publicGeneral = reports.reduce((sum, r) => sum + toNumber(r.publico_geral_declarado || r.publico_geral || 0), 0);
    const photos = attachments.filter((a) => {
      const type = String(a?.file_type || a?.mime_type || '').toLowerCase();
      const url = String(a?.file_url || a?.url || a?.filename || '').toLowerCase();
      return type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/.test(url);
    });
    const docs = attachments.filter((a) => !photos.includes(a));
    const exported = attachments.filter((a) => /relat[oó]rio|export/i.test(`${a?.filename || ''} ${a?.nome || ''} ${a?.tipo || ''}`));
    const approvedRequests = requests.filter((r) => APPROVED.has(normalize(r.status)));
    const paidRequests = requests.filter((r) => PAID.has(normalize(r.status)) || r.pago === true);
    const pendingRequests = requests.filter((r) => SUBMITTED.has(normalize(r.status)) || ['PENDENTE', 'EM_ANALISE'].includes(normalize(r.status)));

    return {
      reports: { total: reports.length, returned: reports.filter((r) => RETURNED.has(normalize(r.status))).length },
      activities: { total: activities.length, withPublic: activitiesWithPublic.length, publicActivities, publicGeneral },
      evidence: { photos: photos.length, docs: docs.length, attachments: attachments.length, exported: exported.length },
      requests: { total: requests.length, approved: approvedRequests.length, paid: paidRequests.length, pending: pendingRequests.length },
      programacao: { total: programacao.length },
    };
  }, [myReports, myActivities, myAttachments, myRequests, myProgramacao]);

  return (
    <section className="mb-8 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Resumo pessoal</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Relatórios, atividades, evidências, solicitações e programação vinculados ao usuário logado{userMuseu ? ` · Museu vinculado: ${userMuseu}` : ''}.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Meus Relatórios" value={fmtInt(cards.reports.total)} helper={`${cards.reports.returned} devolvidos`} icon={FileText} />
        <StatCard title="Minhas Atividades" value={fmtInt(cards.activities.total)} helper={`${cards.activities.withPublic} com público · ${fmtInt(cards.activities.publicActivities)} participantes`} icon={Activity} />
        <StatCard title="Minhas Evidências" value={fmtInt(cards.evidence.attachments)} helper={`${cards.evidence.photos} fotos · ${cards.evidence.docs} documentos · ${cards.evidence.exported} exportados`} icon={Image} />
        <StatCard title="Solicitações/Pagamentos" value={fmtInt(cards.requests.total)} helper={`${cards.requests.approved} aprovadas · ${cards.requests.paid} pagas · ${cards.requests.pending} pendentes`} icon={Wallet} />
        <StatCard title="Minha Programação" value={fmtInt(cards.programacao.total)} helper={cards.programacao.total > 0 ? 'programações vinculadas' : 'sem programação vinculada'} icon={CalendarDays} />
      </div>
      {cards.activities.publicGeneral > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
          Público geral declarado nos relatórios: <span className="font-semibold text-black">{fmtInt(cards.activities.publicGeneral)}</span>. Esse número é exibido separadamente do público em atividades.
        </div>
      )}
    </section>
  );
}
