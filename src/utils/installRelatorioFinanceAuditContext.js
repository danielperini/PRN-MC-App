import { base44 } from '@/api/base44Client';
import { auditAditivoTotals } from '@/utils/finance/financeiroUtils';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedContext = null;
let cachedAt = 0;
let loadingPromise = null;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return Number(value) || 0;
  const cleaned = value.replace(/[R$\s.]/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readFirst(obj, fields) {
  for (const field of fields) {
    const value = obj?.[field];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function readArray(obj, fields) {
  for (const field of fields) {
    if (Array.isArray(obj?.[field])) return obj[field];
  }
  return [];
}

function reportStatus(report) {
  return normalizeText(report?.status || report?.review_status || report?.situacao);
}

function isApprovedReport(report) {
  return ['approved', 'aprovado', 'aprovada'].includes(reportStatus(report));
}

function reportMonth(report) {
  return String(
    report?.mes_referencia || report?.month_reference || report?.mes ||
    report?.competencia || report?.periodo || ''
  ).trim();
}

function reportMuseum(report) {
  return String(report?.museu || report?.unidade || report?.centro_custo || 'Não informado').trim();
}

function activityCount(report) {
  const arrays = [
    readArray(report, ['activities', 'atividades', 'atividades_realizadas', 'programacao']),
    readArray(report, ['tabelas_estruturadas.atividades.linhas']),
  ];
  for (const list of arrays) {
    if (list.length) return list.length;
  }
  return toNumber(readFirst(report, [
    'total_atividades', 'quantidade_atividades', 'atividades_total',
    'numero_atividades', 'activity_count'
  ]));
}

function publicCount(report) {
  const direct = toNumber(readFirst(report, [
    'publico_total', 'total_publico', 'publico_realizado', 'numero_participantes',
    'participantes', 'visitantes', 'attendance_count'
  ]));
  if (direct > 0) return direct;

  const dashboard = report?._publico_dashboard || {};
  return toNumber(dashboard.total);
}

function extractReportText(report) {
  const fields = [
    'descricao_atividades', 'descricao_acoes', 'resumo_executivo', 'relato_atividades',
    'resultados_alcancados', 'observacoes', 'texto_relatorio', 'conteudo'
  ];
  const parts = [];

  for (const field of fields) {
    const value = report?.[field];
    if (!value) continue;
    if (typeof value === 'string') parts.push(value);
    else {
      const text = value.texto_editado || value.texto_ia || value.conteudo || value.descricao;
      if (text) parts.push(text);
    }
  }

  const sectionRows = report?.tabelas_estruturadas?.secoes?.linhas || [];
  for (const row of sectionRows) {
    const text = row?.celulas?.conteudo;
    if (text) parts.push(text);
  }

  return [...new Set(parts.map((item) => String(item).trim()).filter(Boolean))].join('\n').slice(0, 12000);
}

function summarizeMonthlyReports(reports = []) {
  const approved = reports.filter(isApprovedReport);
  const byMonth = {};
  const byMuseum = {};
  let activities = 0;
  let publicTotal = 0;

  const records = approved.map((report) => {
    const month = reportMonth(report) || 'Não informado';
    const museum = reportMuseum(report);
    const reportActivities = activityCount(report);
    const reportPublic = publicCount(report);

    activities += reportActivities;
    publicTotal += reportPublic;

    byMonth[month] ||= { relatorios: 0, atividades: 0, publico: 0 };
    byMonth[month].relatorios += 1;
    byMonth[month].atividades += reportActivities;
    byMonth[month].publico += reportPublic;

    byMuseum[museum] ||= { relatorios: 0, atividades: 0, publico: 0 };
    byMuseum[museum].relatorios += 1;
    byMuseum[museum].atividades += reportActivities;
    byMuseum[museum].publico += reportPublic;

    return {
      id: report.id,
      mes: month,
      museu: museum,
      atividades: reportActivities,
      publico: reportPublic,
      texto_fonte: extractReportText(report),
      atualizado_em: report.updated_date || report.created_date || '',
    };
  });

  return {
    total_relatorios_aprovados: approved.length,
    total_atividades: activities,
    publico_total: publicTotal,
    por_mes: byMonth,
    por_museu: byMuseum,
    registros: records,
  };
}

async function safeList(entityName, order, limit) {
  const entity = base44?.entities?.[entityName];
  if (!entity?.list) return [];
  try {
    const result = await entity.list(order, limit);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn(`[Relatório] Fonte ${entityName} indisponível para auditoria.`, error);
    return [];
  }
}

async function loadAuditContext() {
  if (cachedContext && Date.now() - cachedAt < CACHE_TTL_MS) return cachedContext;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const [reports, purchases, rubricas] = await Promise.all([
      safeList('Report', '-created_date', 300),
      safeList('PurchaseRequest', '-created_date', 5000),
      safeList('Rubrica', 'ordem_exibicao', 1000),
    ]);

    const context = {
      auditoria_financeira: auditAditivoTotals(purchases, rubricas),
      fonte_relatorios_mensais: summarizeMonthlyReports(reports),
      regras_redacao: [
        'Usar os Relatórios Mensais aprovados como fonte principal da narrativa operacional.',
        'Totalizar atividades e público sem repetir o mesmo relatório ou atividade.',
        'Usar somente solicitações financeiramente ativas e deduplicadas.',
        'O 4º Aditivo de R$ 81.719,85 corresponde ao conjunto Noturno Pampulha.',
        'As rubricas Noturno 2026 permanecem no 3º Aditivo, salvo campo explícito de aditivo.',
        'Não inventar dados ausentes; registrar divergências entre rubricas e solicitações.',
        'Redigir texto descritivo, consolidado por mês, museu, meta e grupo orçamentário.',
      ],
      consultado_em: new Date().toISOString(),
    };

    cachedContext = context;
    cachedAt = Date.now();
    return context;
  })().finally(() => {
    loadingPromise = null;
  });

  return loadingPromise;
}

function isReportGenerationFunction(name) {
  const normalized = normalizeText(name);
  return normalized.includes('relatorio') && (
    normalized.includes('gerar') ||
    normalized.includes('secao') ||
    normalized.includes('execucao') ||
    normalized.includes('consolidado')
  );
}

export function installRelatorioFinanceAuditContext() {
  const functions = base44?.functions;
  if (!functions?.invoke || functions.__financeAuditContextInstalled) return;

  const originalInvoke = functions.invoke.bind(functions);

  functions.invoke = async (name, payload = {}, ...rest) => {
    if (!isReportGenerationFunction(name)) {
      return originalInvoke(name, payload, ...rest);
    }

    let context = null;
    try {
      context = await loadAuditContext();
    } catch (error) {
      console.warn('[Relatório] Falha ao montar contexto financeiro cumulativo.', error);
    }

    const enrichedPayload = context ? {
      ...payload,
      auditoria_financeira: context.auditoria_financeira,
      fonte_relatorios_mensais: context.fonte_relatorios_mensais,
      regras_redacao_financeira: context.regras_redacao,
      instrucao_fonte_relatorios_mensais: [
        'Consulte fonte_relatorios_mensais antes de redigir.',
        'Produza totais e texto descritivo por mês, museu, meta e grupo.',
        'Elimine duplicidades sem apagar registros originais.',
        'Diferencie claramente dados confirmados, divergências e itens pendentes de revisão.',
      ].join(' '),
    } : payload;

    const result = await originalInvoke(name, enrichedPayload, ...rest);

    const relatorioId = payload?.relatorio_id || payload?.relatorioId;
    if (relatorioId && context && base44?.entities?.RelatorioExecucaoObjeto?.update) {
      try {
        await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
          auditoria_financeira: context.auditoria_financeira,
          fonte_relatorios_mensais: context.fonte_relatorios_mensais,
          auditoria_financeira_atualizada_em: context.consultado_em,
        });
      } catch (error) {
        console.warn('[Relatório] Não foi possível gravar a auditoria cumulativa.', error);
      }
    }

    return result;
  };

  functions.__financeAuditContextInstalled = true;
}
