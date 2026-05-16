import React, { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertCircle, Target, X, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'museus_centro_metas_rubricas_override_v1';

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
  { numero: 'META 01', titulo: 'Equipe principal', percentual: 100, detalhe: 'Cargos previstos e cargos ocupados na equipe', indicador: '100% concluído · contagem de cargos ativa', status: 'CONCLUÍDA', editableRubricas: false },
  { numero: 'META 02', titulo: 'Plano de comunicação', percentual: 20, detalhe: 'Indicador composto: releases 70%, posts 20% e fotos válidas 10%', indicador: '20% concluído · média operacional dos últimos 3 meses', status: 'EM EXECUÇÃO', editableRubricas: false, curva: COMMUNICATION_CURVE, subindicadores: [{ label: 'Releases', peso: '70%' }, { label: 'Posts', peso: '20%' }, { label: 'Fotos válidas', peso: '10%' }] },
  { numero: 'META 03', titulo: 'Manutenção das exposições', percentual: 0, detalhe: 'Execução financeira da rubrica de manutenção e disposição, sem educadoras', indicador: 'Percentual da rubrica utilizada', status: 'EM EXECUÇÃO' },
  { numero: 'META 04', titulo: 'Alteração de núcleos e salas expositivas', percentual: 0, detalhe: 'Rubricas de núcleos, salas expositivas, montagem, expografia e ambientação', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 05', titulo: '30 atividades culturais ou educativas', percentual: 0, detalhe: 'Atividades únicas da Programação/Agenda, filtradas mensalmente desde março/2026', indicador: '0/30 atividades da programação validadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 07', titulo: 'Contratação de educadores', percentual: 100, detalhe: 'Educadores contratados para MIS, MUMO e MHAB', indicador: '100% concluído', status: 'CONCLUÍDA', editableRubricas: false },
  { numero: 'META 10', titulo: 'Mostras e exposições', percentual: 0, detalhe: 'MIS pequeno + MHAB + MUMO grande', indicador: 'MUMO = 70% · MIS + MHAB = 30%', status: 'EM EXECUÇÃO' },
  { numero: 'META 11', titulo: 'Noturno nos Museus', percentual: 0, detalhe: 'Execução vinculada ao grupo/rubrica Noturno nos Museus', indicador: 'Percentual do custeio Noturno utilizado', status: 'EM EXECUÇÃO' },
  { numero: 'META 12', titulo: 'Exposição MHAB', percentual: 0, detalhe: 'Rubricas relacionadas à exposição MHAB/MAB', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 12B', titulo: 'Exposição MUMO', percentual: 0, detalhe: 'Rubricas relacionadas à exposição MUMO', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 14', titulo: 'Acessibilidade', percentual: 100, detalhe: 'Entrega de dispositivos acessíveis', indicador: '100% entregue', status: 'CONCLUÍDA', editableRubricas: false },
  { numero: 'META 15', titulo: 'Diárias de educadores', percentual: 0, detalhe: 'Execução financeira da rubrica Diários Educadores', indicador: 'Percentual da rubrica utilizada', status: 'EM EXECUÇÃO' },
  { numero: 'META 16', titulo: 'Publicações e catálogos', percentual: 0, detalhe: 'Rubricas de catálogo, publicação, revisão, tradução, impressão, fotógrafo, pesquisa e texto', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 17', titulo: 'Custeio das atividades educativas e culturais', percentual: 0, detalhe: 'Materiais, lanches e apoio pedagógico', indicador: 'Percentual das rubricas de custeio utilizadas', status: 'EM EXECUÇÃO' },
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
  return toNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function getRubricaId(rubrica = {}, index = 0) {
  return String(rubrica?.id || rubrica?._id || rubrica?.uuid || `${rubrica?.rubrica || rubrica?.nome || 'rubrica'}-${index}`);
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

function getRubricaName(rubrica = {}) {
  return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || 'Rubrica sem nome';
}

function getRubricaPrevisto(rubrica = {}) {
  return toNumber(rubrica?.valor_total ?? rubrica?.valor_rubrica ?? rubrica?.totalOrcado ?? rubrica?.valorOrcado ?? rubrica?.orcado ?? rubrica?.previsto ?? rubrica?.valor_previsto);
}

function getRubricaUtilizado(rubrica = {}) {
  return toNumber(rubrica?.valor_utilizado ?? rubrica?.valorUtilizado ?? rubrica?.utilizado ?? rubrica?.realizado ?? rubrica?.valor_pago ?? rubrica?.valorPago);
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function isRubricaMeta03(rubrica = {}) {
  const text = getRubricaText(rubrica);
  const includesMeta = containsAny(text, ['manutencao', 'disposicao']);
  const excluded = containsAny(text, ['educador', 'educadora', 'educadores', 'educadoras', 'mediacao', 'diaria', 'diarias']);
  return includesMeta && !excluded;
}

function isRubricaMeta04(rubrica = {}) {
  const text = getRubricaText(rubrica);
  return containsAny(text, ['nucleo', 'nucleos', 'sala expositiva', 'salas expositivas', 'expografia', 'montagem', 'ambientacao', 'disposicao']);
}

function isRubricaMeta12Mhab(rubrica = {}) {
  const text = getRubricaText(rubrica);
  const isMhab = containsAny(text, ['mhab', 'mab', 'abilio', 'abílio']);
  const isExpo = containsAny(text, ['exposicao', 'mostra', 'curadoria', 'expografia', 'identidade visual', 'producao', 'montagem', 'impressao', 'catalogo']);
  return isMhab && isExpo;
}

function isRubricaMeta12Mumo(rubrica = {}) {
  const text = getRubricaText(rubrica);
  const isMumo = containsAny(text, ['mumo', 'moda']);
  const isExpo = containsAny(text, ['exposicao', 'mostra', 'curadoria', 'expografia', 'identidade visual', 'producao', 'montagem', 'impressao', 'catalogo']);
  return isMumo && isExpo;
}

function isRubricaCusteioAtividades(rubrica = {}) {
  const text = getRubricaText(rubrica);
  return containsAny(text, ['material', 'materiais', 'lanche', 'lanches', 'alimentacao', 'apoio pedagogico', 'pedagogico', 'atividade cultural', 'atividades culturais', 'atividade educativa', 'atividades educativas']);
}

function isRubricaDiariosEducadores(rubrica = {}) {
  const text = getRubricaText(rubrica);
  return containsAny(text, ['diaria', 'diarias', 'diario']) && text.includes('educador');
}

function isRubricaPublicacoes(rubrica = {}) {
  const text = getRubricaText(rubrica);
  return containsAny(text, ['catalogo', 'catálogo', 'publicacao', 'publicação', 'revisao', 'revisão', 'traducao', 'tradução', 'impressao', 'impressão', 'fotografo', 'fotógrafo', 'pesquisa e texto']);
}

function isRubricaNoturno(rubrica = {}) {
  const text = getRubricaText(rubrica);
  return text.includes('noturno') && text.includes('muse');
}

function isRubricaMeta10(rubrica = {}) {
  const text = getRubricaText(rubrica);
  return containsAny(text, ['mostra', 'exposicao', 'exposição']) && containsAny(text, ['mis', 'mhab', 'mab', 'abilio', 'mumo', 'moda']);
}

const META_RUBRICA_PREDICATES = {
  'META 03': isRubricaMeta03,
  'META 04': isRubricaMeta04,
  'META 05': isRubricaCusteioAtividades,
  'META 10': isRubricaMeta10,
  'META 11': isRubricaNoturno,
  'META 12': isRubricaMeta12Mhab,
  'META 12B': isRubricaMeta12Mumo,
  'META 15': isRubricaDiariosEducadores,
  'META 16': isRubricaPublicacoes,
  'META 17': isRubricaCusteioAtividades,
};

function calculateRubricaPercentFromSelected(selected = []) {
  const previsto = selected.reduce((sum, rubrica) => sum + getRubricaPrevisto(rubrica), 0);
  const utilizado = selected.reduce((sum, rubrica) => sum + getRubricaUtilizado(rubrica), 0);
  const percentual = previsto > 0 ? clampPercent((utilizado / previsto) * 100) : 0;
  return { selected, quantidade: selected.length, previsto, utilizado, percentual };
}

function getAutomaticRubricasForMeta(metaNumero, rubricas = []) {
  const predicate = META_RUBRICA_PREDICATES[metaNumero];
  if (!predicate) return [];
  return rubricas.filter(predicate);
}

function getSelectedRubricasForMeta(metaNumero, rubricas = [], overrides = {}) {
  const ids = overrides?.[metaNumero];
  if (Array.isArray(ids)) {
    const idSet = new Set(ids.map(String));
    return rubricas.filter((rubrica, index) => idSet.has(getRubricaId(rubrica, index)));
  }
  return getAutomaticRubricasForMeta(metaNumero, rubricas);
}

function getProgramacaoTitle(item = {}) {
  return item?.titulo || item?.nome_acao || item?.nome || item?.atividade || item?.acao || '';
}

function getProgramacaoDate(item = {}) {
  return item?.data_inicio || item?.data_realizacao || item?.data || item?.inicio || '';
}

function parseProgramacaoDate(item = {}) {
  const raw = getProgramacaoDate(item);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(raw))) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const br = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
  if (br) {
    const date = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isMeta05Period(item = {}) {
  const date = parseProgramacaoDate(item);
  if (!date) return false;
  const start = new Date(2026, 2, 1);
  const now = new Date();
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return date >= start && date <= currentMonthEnd;
}

function getActivityKey(title = '', date = '', museu = '') {
  return normalizeText([title, date, museu].filter(Boolean).join('|'));
}

function isRoutineActivity(text = '') {
  return containsAny(text, ['visita mediada', 'visitas mediadas', 'visita orientada', 'agendamento', 'reuniao', 'plantao', 'rotina', 'mediacao ao publico espontaneo']);
}

function isCulturalEducationalActivity(item = {}) {
  const text = normalizeText([getProgramacaoTitle(item), item?.sinopse, item?.descricao, item?.tipo, item?.tipo_atividade, item?.categoria].filter(Boolean).join(' '));
  if (!text || isRoutineActivity(text)) return false;
  return containsAny(text, ['oficina', 'show', 'apresentacao', 'performance', 'roda', 'samba', 'cinema', 'cine', 'palestra', 'workshop', 'mostra', 'exposicao', 'noturno', 'atividade cultural', 'atividade educativa', 'acao cultural', 'acao educativa']);
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
    return candidateText && (text.includes(candidateText) || candidateText.includes(text));
  });
}

function calculateMeta05(programacao = [], reports = [], purchaseRequests = []) {
  const reportActivities = flattenReportActivities(reports);
  const reportTitles = reportActivities.map((item) => item?.titulo || item?.nome || item?.nome_atividade || item?.atividade || item?.acao || '').filter(Boolean);
  const nfTexts = (Array.isArray(purchaseRequests) ? purchaseRequests : []).map(getAnyText);
  const candidates = new Map();

  (Array.isArray(programacao) ? programacao : []).forEach((item) => {
    if (!isMeta05Period(item) || !isCulturalEducationalActivity(item)) return;
    const title = getProgramacaoTitle(item);
    const date = getProgramacaoDate(item);
    const museu = item?.museu || item?.centro_custo || item?.unidade || '';
    const key = getActivityKey(title, date, museu);
    if (!key) return;

    const itemText = normalizeText([title, item?.sinopse, item?.descricao, item?.museu, item?.centro_custo].filter(Boolean).join(' '));
    const hasReport = hasTextMatch(title, reportTitles) || reportTitles.some((reportTitle) => itemText.includes(normalizeText(reportTitle)));
    const hasNF = nfTexts.some((nfText) => {
      const isCulturalNF = containsAny(nfText, ['atividade cultural', 'atividade educativa', 'acao cultural', 'acao educativa', 'meta 05', 'meta 5']);
      const sameActivity = title && nfText.includes(normalizeText(title));
      const sameMuseum = museu && nfText.includes(normalizeText(museu));
      return sameActivity || (isCulturalNF && sameMuseum) || isCulturalNF;
    });

    candidates.set(key, { title, date, museu, hasReport, hasNF });
  });

  const atividades = Array.from(candidates.values());
  return {
    count: atividades.length,
    withNF: atividades.filter((item) => item.hasNF).length,
    withReport: atividades.filter((item) => item.hasReport).length,
    percentual: clampPercent((atividades.length / 30) * 100),
  };
}

function calculateMeta10ByRubricas(rubricas = []) {
  const text = normalizeText(rubricas.map(getRubricaText).join(' '));
  const mis = text.includes('mis');
  const mhab = text.includes('mhab') || text.includes('mab') || text.includes('abilio');
  const mumo = text.includes('mumo') || text.includes('moda');
  const percentual = (mumo ? 70 : 0) + (mis ? 15 : 0) + (mhab ? 15 : 0);
  return { mis, mhab, mumo, percentual: clampPercent(percentual) };
}

function buildMetas({ rubricas = [], reports = [], programacao = [], purchaseRequests = [], overrides = {} }) {
  const meta05 = calculateMeta05(programacao, reports, purchaseRequests);
  const rubricasByMeta = {};
  BASE_METAS_ADITIVO.forEach((meta) => {
    rubricasByMeta[meta.numero] = getSelectedRubricasForMeta(meta.numero, rubricas, overrides);
  });

  const calc = (metaNumero) => calculateRubricaPercentFromSelected(rubricasByMeta[metaNumero] || []);
  const meta03 = calc('META 03');
  const meta04 = calc('META 04');
  const meta10Rubricas = rubricasByMeta['META 10'] || [];
  const meta10 = calculateMeta10ByRubricas(meta10Rubricas);
  const meta11 = calc('META 11');
  const meta12Mhab = calc('META 12');
  const meta12Mumo = calc('META 12B');
  const meta15 = calc('META 15');
  const meta16 = calc('META 16');
  const meta17 = calc('META 17');

  return BASE_METAS_ADITIVO.map((meta) => {
    const selected = rubricasByMeta[meta.numero] || [];
    const withRubricaPayload = (payload) => ({ ...payload, _rubricas: selected, _editableRubricas: meta.editableRubricas !== false });

    if (meta.numero === 'META 03') return withRubricaPayload({ ...meta, percentual: meta03.percentual, indicador: `${formatCurrency(meta03.utilizado)} utilizados de ${formatCurrency(meta03.previsto)} previstos`, detalhe: `${meta03.quantidade} rubrica${meta03.quantidade === 1 ? '' : 's'} de manutenção/disposição consideradas`, status: meta03.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });
    if (meta.numero === 'META 04') return withRubricaPayload({ ...meta, percentual: meta04.percentual, indicador: `${formatCurrency(meta04.utilizado)} utilizados de ${formatCurrency(meta04.previsto)} previstos`, detalhe: `${meta04.quantidade} rubrica${meta04.quantidade === 1 ? '' : 's'} vinculada${meta04.quantidade === 1 ? '' : 's'} a núcleos/salas expositivas`, status: meta04.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });
    if (meta.numero === 'META 05') return withRubricaPayload({ ...meta, percentual: meta05.percentual, indicador: `${meta05.count}/30 atividades da Programação/Agenda · ${meta05.withNF} com NF · ${meta05.withReport} com relatório`, detalhe: 'Fonte inicial: Programação/Agenda · recorte automático de março/2026 até o mês atual', status: meta05.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });
    if (meta.numero === 'META 10') return withRubricaPayload({ ...meta, percentual: meta10.percentual, indicador: `MIS ${meta10.mis ? '✓' : '—'} · MHAB ${meta10.mhab ? '✓' : '—'} · MUMO ${meta10.mumo ? '✓' : '—'}`, detalhe: `${selected.length} rubrica${selected.length === 1 ? '' : 's'} vinculada${selected.length === 1 ? '' : 's'} · MUMO 70%; MIS e MHAB 30%`, status: meta10.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });
    if (meta.numero === 'META 11') return withRubricaPayload({ ...meta, percentual: meta11.percentual, indicador: `${formatCurrency(meta11.utilizado)} utilizados de ${formatCurrency(meta11.previsto)} previstos`, detalhe: `${meta11.quantidade} rubrica${meta11.quantidade === 1 ? '' : 's'} vinculada${meta11.quantidade === 1 ? '' : 's'} ao Noturno nos Museus`, status: meta11.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });
    if (meta.numero === 'META 12') return withRubricaPayload({ ...meta, percentual: meta12Mhab.percentual, indicador: `${formatCurrency(meta12Mhab.utilizado)} utilizados de ${formatCurrency(meta12Mhab.previsto)} previstos`, detalhe: `${meta12Mhab.quantidade} rubrica${meta12Mhab.quantidade === 1 ? '' : 's'} relacionada${meta12Mhab.quantidade === 1 ? '' : 's'} à exposição MHAB/MAB`, status: meta12Mhab.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });
    if (meta.numero === 'META 12B') return withRubricaPayload({ ...meta, percentual: meta12Mumo.percentual, indicador: `${formatCurrency(meta12Mumo.utilizado)} utilizados de ${formatCurrency(meta12Mumo.previsto)} previstos`, detalhe: `${meta12Mumo.quantidade} rubrica${meta12Mumo.quantidade === 1 ? '' : 's'} relacionada${meta12Mumo.quantidade === 1 ? '' : 's'} à exposição MUMO`, status: meta12Mumo.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });
    if (meta.numero === 'META 15') return withRubricaPayload({ ...meta, percentual: meta15.percentual, indicador: `${formatCurrency(meta15.utilizado)} utilizados de ${formatCurrency(meta15.previsto)} previstos`, detalhe: `${meta15.quantidade} rubrica${meta15.quantidade === 1 ? '' : 's'} Diários Educadores`, status: meta15.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });
    if (meta.numero === 'META 16') return withRubricaPayload({ ...meta, percentual: meta16.percentual, indicador: `${formatCurrency(meta16.utilizado)} utilizados de ${formatCurrency(meta16.previsto)} previstos`, detalhe: `${meta16.quantidade} rubrica${meta16.quantidade === 1 ? '' : 's'} de publicações/catálogos`, status: meta16.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });
    if (meta.numero === 'META 17') return withRubricaPayload({ ...meta, percentual: meta17.percentual, indicador: `${formatCurrency(meta17.utilizado)} utilizados de ${formatCurrency(meta17.previsto)} previstos`, detalhe: `${meta17.quantidade} rubrica${meta17.quantidade === 1 ? '' : 's'} de materiais, lanches e apoio pedagógico`, status: meta17.percentual >= 100 ? 'CONCLUÍDA' : 'EM EXECUÇÃO' });

    return withRubricaPayload(meta);
  });
}

function getStatusClass(status) {
  if (status === 'CONCLUÍDA') return 'border-black bg-black text-white';
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
            <div><p className="text-[10px] font-semibold text-neutral-700">{item.esperado}%</p><p className="text-[10px] text-neutral-400">{item.mes}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetaCard({ meta, onOpen }) {
  const percentual = clampPercent(meta.percentual);
  return (
    <button type="button" onClick={() => onOpen(meta)} className="text-left rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{meta.numero}</p><h3 className="mt-1 text-sm font-semibold leading-snug text-black">{meta.titulo}</h3></div>
        <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${getStatusClass(meta.status)}`}><StatusIcon status={meta.status} />{meta.status}</div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0"><p className="text-xs text-neutral-500">{meta.detalhe}</p><p className="mt-1 text-xs font-medium text-neutral-700">{meta.indicador}</p></div>
        <p className="shrink-0 text-2xl font-bold text-black">{percentual}%</p>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-200"><div className="h-full rounded-full bg-black transition-all" style={{ width: `${percentual}%` }} /></div>
      {meta._editableRubricas && <p className="mt-3 text-[11px] font-medium text-neutral-400">Clique para ver, adicionar ou retirar rubricas.</p>}
      {Array.isArray(meta.subindicadores) && meta.subindicadores.length > 0 && <div className="mt-4 grid grid-cols-3 gap-2">{meta.subindicadores.map((item) => <div key={item.label} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{item.label}</p><p className="mt-1 text-sm font-bold text-black">{item.peso}</p></div>)}</div>}
      <CommunicationCurve curva={meta.curva} />
    </button>
  );
}

function RubricasModal({ meta, rubricas, overrides, onToggle, onReset, onClose }) {
  const [query, setQuery] = useState('');
  if (!meta) return null;
  const selectedIds = new Set((overrides?.[meta.numero] || (meta._rubricas || []).map((r, index) => getRubricaId(r, index))).map(String));
  const filtered = rubricas.filter((rubrica) => getRubricaText(rubrica).includes(normalizeText(query)));
  const selected = rubricas.filter((rubrica, index) => selectedIds.has(getRubricaId(rubrica, index)));
  const totals = calculateRubricaPercentFromSelected(selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 p-5">
          <div><p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{meta.numero}</p><h3 className="text-lg font-semibold text-black">{meta.titulo}</h3><p className="mt-1 text-sm text-neutral-500">{selected.length} rubrica{selected.length === 1 ? '' : 's'} selecionada{selected.length === 1 ? '' : 's'} · {formatCurrency(totals.utilizado)} de {formatCurrency(totals.previsto)} · {totals.percentual}%</p></div>
          <button type="button" onClick={onClose} className="rounded-full border border-neutral-200 p-2 hover:bg-neutral-50"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b border-neutral-100 p-4">
          <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 px-3 py-2"><Search className="h-4 w-4 text-neutral-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar rubrica..." className="w-full bg-transparent text-sm outline-none" /></div>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-2">
            {filtered.map((rubrica, index) => {
              const id = getRubricaId(rubrica, index);
              const checked = selectedIds.has(id);
              return (
                <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm ${checked ? 'border-black bg-neutral-50' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
                  <input type="checkbox" checked={checked} onChange={() => onToggle(meta.numero, id, checked)} className="mt-1" />
                  <div className="min-w-0 flex-1"><p className="font-semibold text-black">{getRubricaName(rubrica)}</p><p className="text-xs text-neutral-500">{rubrica?.grupo || rubrica?.categoria || rubrica?.centro_custo || 'Sem grupo informado'}</p></div>
                  <div className="shrink-0 text-right text-xs text-neutral-600"><p>{formatCurrency(getRubricaUtilizado(rubrica))}</p><p className="text-neutral-400">de {formatCurrency(getRubricaPrevisto(rubrica))}</p></div>
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex justify-between gap-3 border-t border-neutral-200 p-4">
          <button type="button" onClick={() => onReset(meta.numero)} className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Restaurar automático</button>
          <button type="button" onClick={onClose} className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">Concluir</button>
        </div>
      </div>
    </div>
  );
}

export default function MetasAditivoSection({ rubricas: rubricasProp = [], reports: reportsProp = [], programacao: programacaoProp = [], purchaseRequests: purchaseRequestsProp = [] }) {
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [overrides, setOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch {}
  }, [overrides]);

  const { data: rubricasFetched = [] } = useQuery({ queryKey: ['metas-aditivo-rubricas'], queryFn: async () => { try { const data = await base44.entities.Rubrica.list('rubrica', 1000); return Array.isArray(data) ? data.filter((item) => item?.ativo !== false) : []; } catch { return []; } } });
  const { data: reportsFetched = [] } = useQuery({ queryKey: ['metas-aditivo-reports'], queryFn: async () => { try { const data = await base44.entities.Report.list('-created_date', 500); return Array.isArray(data) ? data : []; } catch { return []; } } });
  const { data: programacaoFetched = [] } = useQuery({ queryKey: ['metas-aditivo-programacao'], queryFn: async () => { try { const data = await base44.entities.Programacao.list('-data_inicio', 1000); return Array.isArray(data) ? data : []; } catch { return []; } } });
  const { data: purchaseRequestsFetched = [] } = useQuery({ queryKey: ['metas-aditivo-purchase-requests'], queryFn: async () => { try { const data = await base44.entities.PurchaseRequest.list('-created_date', 1000); return Array.isArray(data) ? data : []; } catch { return []; } } });

  const rubricas = rubricasProp.length > 0 ? rubricasProp : rubricasFetched;
  const reports = reportsProp.length > 0 ? reportsProp : reportsFetched;
  const programacao = programacaoProp.length > 0 ? programacaoProp : programacaoFetched;
  const purchaseRequests = purchaseRequestsProp.length > 0 ? purchaseRequestsProp : purchaseRequestsFetched;
  const metas = useMemo(() => buildMetas({ rubricas, reports, programacao, purchaseRequests, overrides }), [rubricas, reports, programacao, purchaseRequests, overrides]);
  const metasValidas = metas.filter((meta) => meta.status !== 'NÃO CONSIDERAR');
  const concluidas = metasValidas.filter((meta) => clampPercent(meta.percentual) >= 100).length;
  const andamento = metasValidas.filter((meta) => meta.status === 'EM EXECUÇÃO').length;
  const media = metasValidas.length ? Math.round(metasValidas.reduce((sum, meta) => sum + clampPercent(meta.percentual), 0) / metasValidas.length) : 0;

  const handleToggleRubrica = (metaNumero, rubricaId, checked) => {
    setOverrides((prev) => {
      const current = Array.isArray(prev[metaNumero]) ? prev[metaNumero] : getAutomaticRubricasForMeta(metaNumero, rubricas).map((rubrica, index) => getRubricaId(rubrica, index));
      const set = new Set(current.map(String));
      if (checked) set.delete(String(rubricaId)); else set.add(String(rubricaId));
      return { ...prev, [metaNumero]: Array.from(set) };
    });
  };

  const handleResetRubricas = (metaNumero) => {
    setOverrides((prev) => { const next = { ...prev }; delete next[metaNumero]; return next; });
  };

  return (
    <section className="space-y-5 rounded-3xl border border-neutral-200 bg-neutral-50/60 p-4 md:p-6">
      <div><div className="flex items-center gap-2"><Target className="h-5 w-5 text-black" /><h2 className="text-xl font-semibold text-black">Metas do 3º Aditivo</h2></div><p className="mt-1 text-sm text-neutral-500">Acompanhamento executivo das metas de 2026, mantendo a numeração oficial para prestação de contas.</p></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3"><ResumoCard label="Metas concluídas" value={`${concluidas}/${metasValidas.length}`} helper="metas com execução integral" /><ResumoCard label="Média de execução" value={`${media}%`} helper="média simples dos indicadores" /><ResumoCard label="Em andamento" value={andamento} helper="metas com acompanhamento ativo" /></div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{metas.map((meta) => <MetaCard key={meta.numero} meta={meta} onOpen={setSelectedMeta} />)}</div>
      <RubricasModal meta={selectedMeta} rubricas={rubricas} overrides={overrides} onToggle={handleToggleRubrica} onReset={handleResetRubricas} onClose={() => setSelectedMeta(null)} />
    </section>
  );
}
