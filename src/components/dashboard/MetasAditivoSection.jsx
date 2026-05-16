import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertCircle, Target } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const COMMUNICATION_CURVE = [
  { mes: 'Mai/26', esperado: 20 },
  { mes: 'Jun/26', esperado: 32 },
  { mes: 'Jul/26', esperado: 44 },
  { mes: 'Ago/26', esperado: 58 },
  { mes: 'Set/26', esperado: 72 },
  { mes: 'Out/26', esperado: 86 },
  { mes: 'Nov/26', esperado: 100 },
];

const BASE_METAS_ADITIVO = [
  {
    numero: 'META 01',
    titulo: 'Equipe principal',
    percentual: 100,
    detalhe: 'Cargos previstos e cargos ocupados na equipe',
    indicador: '100% concluído · contagem de cargos ativa',
    status: 'CONCLUÍDA',
  },
  {
    numero: 'META 02',
    titulo: 'Plano de comunicação',
    percentual: 20,
    detalhe: 'Indicador composto: releases 70%, posts 20% e fotos válidas 10%',
    indicador: '20% concluído · média operacional dos últimos 3 meses',
    status: 'EM EXECUÇÃO',
    curva: COMMUNICATION_CURVE,
    subindicadores: [
      { label: 'Releases', peso: '70%' },
      { label: 'Posts', peso: '20%' },
      { label: 'Fotos válidas', peso: '10%' },
    ],
  },
  {
    numero: 'META 03',
    titulo: 'Manutenção das exposições',
    percentual: 0,
    detalhe: 'Execução financeira da rubrica de manutenção e disposição, sem educadoras',
    indicador: 'Percentual da rubrica utilizada',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 04',
    titulo: 'Alteração de núcleos e salas expositivas',
    percentual: 0,
    detalhe: 'Duas atividades previstas, 50% cada',
    indicador: 'Atividade 1 + Atividade 2',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 05',
    titulo: '30 atividades culturais ou educativas',
    percentual: 0,
    detalhe: 'Atividades únicas confirmadas por programação, relatórios, custeio e notas fiscais',
    indicador: '0/30 atividades validadas',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 07',
    titulo: 'Contratação de educadores',
    percentual: 100,
    detalhe: 'Educadores contratados para MIS, MUMO e MHAB',
    indicador: '100% concluído',
    status: 'CONCLUÍDA',
  },
  {
    numero: 'META 10',
    titulo: 'Mostras e exposições',
    percentual: 0,
    detalhe: 'MIS pequeno + MHAB + MUMO grande',
    indicador: 'MUMO = 70% · MIS + MHAB = 30%',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 11',
    titulo: 'Noturno nos Museus',
    percentual: 0,
    detalhe: 'Execução vinculada ao grupo/rubrica Noturno nos Museus',
    indicador: 'Percentual do custeio Noturno utilizado',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 12',
    titulo: 'Exposição MHAB',
    percentual: 0,
    detalhe: 'Pesquisa, identidade visual, curadoria e expografia do MHAB',
    indicador: 'Andamento identificado em relatórios, NFs e evidências',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 12B',
    titulo: 'Exposição MUMO',
    percentual: 0,
    detalhe: 'Mostra grande do MUMO, com peso próprio no acompanhamento',
    indicador: 'Andamento identificado em relatórios, NFs e evidências',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 14',
    titulo: 'Acessibilidade',
    percentual: 100,
    detalhe: 'Entrega de dispositivos acessíveis',
    indicador: '100% entregue',
    status: 'CONCLUÍDA',
  },
  {
    numero: 'META 15',
    titulo: 'Diárias de educadores',
    percentual: 0,
    detalhe: 'Execução financeira da rubrica Diários Educadores',
    indicador: 'Percentual da rubrica utilizada',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 16',
    titulo: 'Publicações e catálogos',
    percentual: 0,
    detalhe: 'Catálogo MHAB desta edição',
    indicador: '1 catálogo = 100%',
    status: 'EM EXECUÇÃO',
  },
  {
    numero: 'META 17',
    titulo: 'Custeio das atividades educativas e culturais',
    percentual: 0,
    detalhe: 'Materiais, lanches e apoio pedagógico',
    indicador: 'Percentual das rubricas de custeio utilizadas',
    status: 'EM EXECUÇÃO',
  },
];

function clampPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCurrency(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function getAnyText(item = {}) {
  return normalizeText(Object.values(item).filter((value) => typeof value === 'string' || typeof value === 'number').join(' '));
}

function getRubricaText(rubrica = {}) {
  return normalizeText([
    rubrica?.rubrica,
    rubrica?.nome,
    rubrica?.descricao,
    rubrica?.grupo,
    rubrica?.categoria,
    rubrica?.categoria_key,
    rubrica?.meta,
    rubrica?.centro_custo,
  ].filter(Boolean).join(' '));
}

function getRubricaPrevisto(rubrica = {}) {
  return toNumber(
    rubrica?.valor_total ??
      rubrica?.valor_rubrica ??
      rubrica?.totalOrcado ??
      rubrica?.valorOrcado ??
      rubrica?.orcado ??
      rubrica?.previsto ??
      rubrica?.valor_previsto
  );
}

function getRubricaUtilizado(rubrica = {}) {
  return toNumber(
    rubrica?.valor_utilizado ??
      rubrica?.valorUtilizado ??
      rubrica?.utilizado ??
      rubrica?.realizado ??
      rubrica?.valor_pago ??
      rubrica?.valorPago
  );
}

function calculateRubricaPercent(rubricas = [], predicate) {
  const selected = (Array.isArray(rubricas) ? rubricas : []).filter(predicate);
  const previsto = selected.reduce((sum, rubrica) => sum + getRubricaPrevisto(rubrica), 0);
  const utilizado = selected.reduce((sum, rubrica) => sum + getRubricaUtilizado(rubrica), 0);
  const percentual = previsto > 0 ? clampPercent((utilizado / previsto) * 100) : 0;

  return { selected, quantidade: selected.length, previsto, utilizado, percentual };
}

function isRubricaMeta03(rubrica = {}) {
  const text = getRubricaText(rubrica);
  const includesMeta = text.includes('manutencao') || text.includes('disposicao');
  const excluded =
    text.includes('educador') ||
    text.includes('educadora') ||
    text.includes('educadores') ||
    text.includes('educadoras') ||
    text.includes('mediacao') ||
    text.includes('diaria') ||
    text.includes('diarias');

  return includesMeta && !excluded;
}

function isRubricaCusteioAtividades(rubrica = {}) {
  const text = getRubricaText(rubrica);
  return (
    text.includes('material') ||
    text.includes('materiais') ||
    text.includes('lanche') ||
    text.includes('lanches') ||
    text.includes('alimentacao') ||
    text.includes('apoio pedagogico') ||
    text.includes('pedagogico') ||
    text.includes('atividade cultural') ||
    text.includes('atividades culturais') ||
    text.includes('atividade educativa') ||
    text.includes('atividades educativas')
  );
}

function isRubricaDiariosEducadores(rubrica = {}) {
  const text = getRubricaText(rubrica);
  return (text.includes('diaria') || text.includes('diarias') || text.includes('diario')) && text.includes('educador');
}

function isRubricaNoturno(rubrica = {}) {
  const text = getRubricaText(rubrica);
  return text.includes('noturno') && text.includes('muse');
}

function getProgramacaoTitle(item = {}) {
  return item?.titulo || item?.nome_acao || item?.nome || item?.atividade || item?.acao || '';
}

function getProgramacaoDate(item = {}) {
  return item?.data_inicio || item?.data_realizacao || item?.data || item?.inicio || '';
}

function getActivityKey(title = '', date = '', museu = '') {
  return normalizeText([title, date, museu].filter(Boolean).join('|'));
}

function isRoutineActivity(text = '') {
  return (
    text.includes('visita mediada') ||
    text.includes('visitas mediadas') ||
    text.includes('visita orientada') ||
    text.includes('agendamento') ||
    text.includes('reuniao') ||
    text.includes('plantao') ||
    text.includes('rotina') ||
    text.includes('mediação ao publico espontaneo') ||
    text.includes('mediacao ao publico espontaneo')
  );
}

function isCulturalEducationalActivity(item = {}) {
  const text = normalizeText([
    getProgramacaoTitle(item),
    item?.sinopse,
    item?.descricao,
    item?.tipo,
    item?.tipo_atividade,
    item?.categoria,
  ].filter(Boolean).join(' '));

  if (!text || isRoutineActivity(text)) return false;

  return (
    text.includes('oficina') ||
    text.includes('show') ||
    text.includes('apresentacao') ||
    text.includes('performance') ||
    text.includes('roda') ||
    text.includes('samba') ||
    text.includes('cinema') ||
    text.includes('cine') ||
    text.includes('palestra') ||
    text.includes('workshop') ||
    text.includes('mostra') ||
    text.includes('exposicao') ||
    text.includes('noturno') ||
    text.includes('atividade cultural') ||
    text.includes('atividade educativa') ||
    text.includes('acao cultural') ||
    text.includes('acao educativa')
  );
}

function flattenReportActivities(reports = []) {
  return (Array.isArray(reports) ? reports : []).flatMap((report) => {
    const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
    return atividades.map((activity) => ({ ...activity, _report: report }));
  });
}

function hasTextMatch(base = '', candidates = []) {
  const text = normalizeText(base);
  if (!text) return false;
  return candidates.some((candidate) => {
    const candidateText = normalizeText(candidate);
    if (!candidateText) return false;
    return text.includes(candidateText) || candidateText.includes(text);
  });
}

function calculateMeta05(programacao = [], reports = [], purchaseRequests = []) {
  const reportActivities = flattenReportActivities(reports);
  const reportTitles = reportActivities.map((item) => item?.titulo || item?.nome || item?.nome_atividade || item?.atividade || item?.acao || '').filter(Boolean);
  const nfTexts = (Array.isArray(purchaseRequests) ? purchaseRequests : []).map(getAnyText);
  const validated = new Map();

  (Array.isArray(programacao) ? programacao : []).forEach((item) => {
    if (!isCulturalEducationalActivity(item)) return;

    const title = getProgramacaoTitle(item);
    const date = getProgramacaoDate(item);
    const museu = item?.museu || item?.centro_custo || item?.unidade || '';
    const key = getActivityKey(title, date, museu);
    if (!key) return;

    const itemText = normalizeText([title, item?.sinopse, item?.descricao, item?.museu, item?.centro_custo].filter(Boolean).join(' '));
    const hasReport = hasTextMatch(title, reportTitles) || reportTitles.some((reportTitle) => itemText.includes(normalizeText(reportTitle)));
    const hasNF = nfTexts.some((nfText) => {
      const isCulturalNF = nfText.includes('atividade cultural') || nfText.includes('atividade educativa') || nfText.includes('acao cultural') || nfText.includes('acao educativa') || nfText.includes('meta 05') || nfText.includes('meta 5');
      const sameActivity = title && nfText.includes(normalizeText(title));
      const sameMuseum = museu && nfText.includes(normalizeText(museu));
      return sameActivity || (isCulturalNF && sameMuseum) || isCulturalNF;
    });

    if (hasReport || hasNF) {
      validated.set(key, { title, date, museu, hasReport, hasNF });
    }
  });

  const count = validated.size;
  return {
    count,
    withNF: Array.from(validated.values()).filter((item) => item.hasNF).length,
    withReport: Array.from(validated.values()).filter((item) => item.hasReport).length,
    percentual: clampPercent((count / 30) * 100),
  };
}

function calculateMeta10(reports = [], purchaseRequests = []) {
  const text = normalizeText([...(reports || []).map(getAnyText), ...(purchaseRequests || []).map(getAnyText)].join(' '));
  const mis = text.includes('mis') && (text.includes('mostra') || text.includes('exposicao'));
  const mhab = (text.includes('mhab') || text.includes('abilio')) && (text.includes('mostra') || text.includes('exposicao'));
  const mumo = (text.includes('mumo') || text.includes('moda')) && (text.includes('mostra') || text.includes('exposicao'));
  const percentual = (mumo ? 70 : 0) + (mis ? 15 : 0) + (mhab ? 15 : 0);

  return { mis, mhab, mumo, percentual: clampPercent(percentual) };
}

function calculateTextEvidencePercent(text, terms = []) {
  const normalized = normalizeText(text);
  const found = terms.some((term) => normalized.includes(normalizeText(term)));
  return found ? 100 : 0;
}

function buildMetas({ rubricas = [], reports = [], programacao = [], purchaseRequests = [] }) {
  const meta03 = calculateRubricaPercent(rubricas, isRubricaMeta03);
  const meta05 = calculateMeta05(programacao, reports, purchaseRequests);
  const meta10 = calculateMeta10(reports, purchaseRequests);
  const meta11 = calculateRubricaPercent(rubricas, isRubricaNoturno);
  const meta15 = calculateRubricaPercent(rubricas, isRubricaDiariosEducadores);
  const meta17 = calculateRubricaPercent(rubricas, isRubricaCusteioAtividades);
  const evidenceText = normalizeText([...(reports || []).map(getAnyText), ...(purchaseRequests || []).map(getAnyText)].join(' '));
  const meta12Mhab = calculateTextEvidencePercent(evidenceText, ['mhab exposicao', 'abilio barreto exposicao', 'curadoria mhab', 'expografia mhab', 'catalogo mhab']);
  const meta12Mumo = calculateTextEvidencePercent(evidenceText, ['mumo exposicao', 'museu da moda exposicao', 'curadoria mumo', 'expografia mumo', 'mostra mumo']);
  const meta16 = calculateTextEvidencePercent(evidenceText, ['catalogo mhab', 'publicacao mhab', 'catálogo mhab']);

  return BASE_METAS_ADITIVO.map((meta) => {
    if (meta.numero === 'META 03') {
      return {
        ...meta,
        percentual: meta03.percentual,
        indicador: `${formatCurrency(meta03.utilizado)} utilizados de ${formatCurrency(meta03.previsto)} previstos`,
        detalhe: `${meta03.quantidade} rubrica${meta03.quantidade === 1 ? '' : 's'} de manutenção/disposição consideradas`,
        status: meta03.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO',
      };
    }

    if (meta.numero === 'META 05') {
      return {
        ...meta,
        percentual: meta05.percentual,
        indicador: `${meta05.count}/30 atividades validadas · ${meta05.withNF} com NF · ${meta05.withReport} com relatório`,
        detalhe: 'Programação + relatório da equipe + custeio/nota fiscal vinculada à atividade cultural ou educativa',
        status: meta05.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO',
      };
    }

    if (meta.numero === 'META 10') {
      return {
        ...meta,
        percentual: meta10.percentual,
        indicador: `MIS ${meta10.mis ? '✓' : '—'} · MHAB ${meta10.mhab ? '✓' : '—'} · MUMO ${meta10.mumo ? '✓' : '—'}`,
        detalhe: 'MUMO grande vale 70%; MIS e MHAB somam 30%',
        status: meta10.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO',
      };
    }

    if (meta.numero === 'META 11') {
      return {
        ...meta,
        percentual: meta11.percentual,
        indicador: `${formatCurrency(meta11.utilizado)} utilizados de ${formatCurrency(meta11.previsto)} previstos`,
        detalhe: `${meta11.quantidade} rubrica${meta11.quantidade === 1 ? '' : 's'} vinculada${meta11.quantidade === 1 ? '' : 's'} ao Noturno nos Museus`,
        status: meta11.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO',
      };
    }

    if (meta.numero === 'META 12') {
      return {
        ...meta,
        percentual: meta12Mhab,
        indicador: meta12Mhab >= 100 ? 'Evidência de exposição MHAB identificada' : 'Aguardando evidência vinculada à exposição MHAB',
        status: meta12Mhab >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO',
      };
    }

    if (meta.numero === 'META 12B') {
      return {
        ...meta,
        percentual: meta12Mumo,
        indicador: meta12Mumo >= 100 ? 'Evidência de exposição MUMO identificada' : 'Aguardando evidência vinculada à exposição MUMO',
        status: meta12Mumo >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO',
      };
    }

    if (meta.numero === 'META 15') {
      return {
        ...meta,
        percentual: meta15.percentual,
        indicador: `${formatCurrency(meta15.utilizado)} utilizados de ${formatCurrency(meta15.previsto)} previstos`,
        detalhe: `${meta15.quantidade} rubrica${meta15.quantidade === 1 ? '' : 's'} Diários Educadores`,
        status: meta15.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO',
      };
    }

    if (meta.numero === 'META 16') {
      return {
        ...meta,
        percentual: meta16,
        indicador: meta16 >= 100 ? 'Catálogo/publicação MHAB identificado' : 'Aguardando evidência do catálogo MHAB',
        status: meta16 >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO',
      };
    }

    if (meta.numero === 'META 17') {
      return {
        ...meta,
        percentual: meta17.percentual,
        indicador: `${formatCurrency(meta17.utilizado)} utilizados de ${formatCurrency(meta17.previsto)} previstos`,
        detalhe: `${meta17.quantidade} rubrica${meta17.quantidade === 1 ? '' : 's'} de materiais, lanches e apoio pedagógico`,
        status: meta17.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO',
      };
    }

    return meta;
  });
}

function getStatusClass(status) {
  if (status === 'CONCLUÍDA') return 'border-black bg-black text-white';
  if (status === 'NÃO CONSIDERAR') return 'border-neutral-200 bg-neutral-100 text-neutral-500';
  if (status === 'DOCUMENTAL') return 'border-neutral-300 bg-white text-neutral-600';
  return 'border-neutral-300 bg-neutral-50 text-neutral-700';
}

function StatusIcon({ status }) {
  if (status === 'CONCLUÍDA') return <CheckCircle2 className="w-4 h-4" />;
  return <AlertCircle className="w-4 h-4" />;
}

function ResumoCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-black">{value}</p>
      {helper && <p className="mt-1 text-xs text-neutral-500">{helper}</p>}
    </div>
  );
}

function CommunicationCurve({ curva }) {
  if (!Array.isArray(curva) || curva.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Curva esperada até novembro/2026</p>
      <div className="grid grid-cols-7 gap-2">
        {curva.map((item) => (
          <div key={item.mes} className="space-y-2 text-center">
            <div className="mx-auto flex h-20 w-full max-w-8 items-end overflow-hidden rounded-full bg-neutral-200">
              <div className="w-full rounded-full bg-black" style={{ height: `${clampPercent(item.esperado)}%` }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-neutral-700">{item.esperado}%</p>
              <p className="text-[10px] text-neutral-400">{item.mes}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetaCard({ meta }) {
  const percentual = clampPercent(meta.percentual);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{meta.numero}</p>
          <h3 className="mt-1 text-sm font-semibold leading-snug text-black">{meta.titulo}</h3>
        </div>

        <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${getStatusClass(meta.status)}`}>
          <StatusIcon status={meta.status} />
          {meta.status}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-neutral-500">{meta.detalhe}</p>
          <p className="mt-1 text-xs font-medium text-neutral-700">{meta.indicador}</p>
        </div>
        <p className="shrink-0 text-2xl font-bold text-black">{percentual}%</p>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full rounded-full bg-black transition-all" style={{ width: `${percentual}%` }} />
      </div>

      {Array.isArray(meta.subindicadores) && meta.subindicadores.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {meta.subindicadores.map((item) => (
            <div key={item.label} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{item.label}</p>
              <p className="mt-1 text-sm font-bold text-black">{item.peso}</p>
            </div>
          ))}
        </div>
      )}

      <CommunicationCurve curva={meta.curva} />
    </div>
  );
}

export default function MetasAditivoSection({ rubricas: rubricasProp = [], reports: reportsProp = [], programacao: programacaoProp = [], purchaseRequests: purchaseRequestsProp = [] }) {
  const { data: rubricasFetched = [] } = useQuery({
    queryKey: ['metas-aditivo-rubricas'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Rubrica.list('rubrica', 1000);
        return Array.isArray(data) ? data.filter((item) => item?.ativo !== false) : [];
      } catch {
        return [];
      }
    },
  });

  const { data: reportsFetched = [] } = useQuery({
    queryKey: ['metas-aditivo-reports'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Report.list('-created_date', 500);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
  });

  const { data: programacaoFetched = [] } = useQuery({
    queryKey: ['metas-aditivo-programacao'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Programacao.list('-data_inicio', 1000);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
  });

  const { data: purchaseRequestsFetched = [] } = useQuery({
    queryKey: ['metas-aditivo-purchase-requests'],
    queryFn: async () => {
      try {
        const data = await base44.entities.PurchaseRequest.list('-created_date', 1000);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
  });

  const rubricas = rubricasProp.length > 0 ? rubricasProp : rubricasFetched;
  const reports = reportsProp.length > 0 ? reportsProp : reportsFetched;
  const programacao = programacaoProp.length > 0 ? programacaoProp : programacaoFetched;
  const purchaseRequests = purchaseRequestsProp.length > 0 ? purchaseRequestsProp : purchaseRequestsFetched;

  const metas = useMemo(() => buildMetas({ rubricas, reports, programacao, purchaseRequests }), [rubricas, reports, programacao, purchaseRequests]);
  const metasValidas = metas.filter((meta) => meta.status !== 'NÃO CONSIDERAR');
  const concluidas = metasValidas.filter((meta) => clampPercent(meta.percentual) >= 100).length;
  const andamento = metasValidas.filter((meta) => meta.status === 'EM EXECUÇÃO').length;
  const media = metasValidas.length
    ? Math.round(metasValidas.reduce((sum, meta) => sum + clampPercent(meta.percentual), 0) / metasValidas.length)
    : 0;

  return (
    <section className="space-y-5 rounded-3xl border border-neutral-200 bg-neutral-50/60 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-black" />
            <h2 className="text-xl font-semibold text-black">Metas do 3º Aditivo</h2>
          </div>
          <p className="mt-1 text-sm text-neutral-500">Acompanhamento executivo das metas de 2026, mantendo a numeração oficial para prestação de contas.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ResumoCard label="Metas concluídas" value={`${concluidas}/${metasValidas.length}`} helper="metas com execução integral" />
        <ResumoCard label="Média de execução" value={`${media}%`} helper="média simples dos indicadores" />
        <ResumoCard label="Em andamento" value={andamento} helper="metas com acompanhamento ativo" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {metas.map((meta) => (
          <MetaCard key={meta.numero} meta={meta} />
        ))}
      </div>
    </section>
  );
}
