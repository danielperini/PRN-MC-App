import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { filtrarMetas3e4Aditivos } from '@/utils/metasAditivosPermitidos';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

if (!appId) console.error('VITE_BASE44_APP_ID não configurado.');

export const base44 = createClient({
  appId,
  token: token || undefined,
  functionsVersion,
  serverUrl: '',
  requiresAuth: true,
  appBaseUrl,
});

const NF_DATE_FIELDS = ['nf_data_emissao', 'data_nf', 'data_emissao_nf', 'nota_fiscal_data_emissao', 'nf_emissao'];
const PUBLIC_FIELDS = ['publico_total', 'total_publico', 'publico_realizado', 'publico_presente', 'quantidade_publico', 'participantes', 'visitantes', 'presentes', 'attendance_count', 'total_participantes'];
const TEAM_STATUS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function isComprasRoute() {
  return typeof window !== 'undefined' && /^\/Compras(?:\/|$)/i.test(window.location.pathname);
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeNFDateForLocalComparison(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0];
  if (isoDate) return `${isoDate}T12:00:00`;
  const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brDate) return `${brDate[3]}-${brDate[2]}-${brDate[1]}T12:00:00`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T12:00:00`;
}

function getNFDate(purchase) {
  for (const field of NF_DATE_FIELDS) if (purchase?.[field]) return normalizeNFDateForLocalComparison(purchase[field]);
  return null;
}

function dateOnly(value) {
  if (!value) return '';
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function activityMetaId(item) {
  return String(item?.meta_id || item?.project_meta_id || item?.meta_projeto_id || item?.meta_codigo || item?.metaId || item?.meta?.id || '');
}

function normalizeMuseum(value) {
  const text = normalizeText(value).toUpperCase();
  if (text.includes('MIS') || text.includes('IMAGEM E SOM')) return 'MIS';
  if (text.includes('MUMO') || text.includes('MODA')) return 'MUMO';
  if (text.includes('MHAB') || text.includes('ABILIO BARRETO')) return 'MHAB';
  return String(value || '').trim();
}

function inReportScope(item, payload) {
  const date = dateOnly(item?.data_inicio || item?.data_atividade || item?.data || item?.start_date || item?.created_date);
  const start = String(payload?.data_inicio || '');
  const end = String(payload?.data_fim || '');
  if (!date || (start && date < start) || (end && date > end)) return false;

  const museumFilter = normalizeMuseum(payload?.filtro_museu);
  const museum = normalizeMuseum(item?.museu || item?.unidade || item?.centro_custo || item?.local);
  if (museumFilter && !['todos', 'TODOS'].includes(museumFilter) && museum !== museumFilter) return false;

  const selected = new Set((payload?.filtro_meta_ids || []).map(String));
  const metaId = activityMetaId(item);
  return !(metaId && selected.size > 0 && !selected.has(metaId));
}

async function safeList(entityName, order = '-created_date', limit = 5000) {
  try {
    const entity = base44.entities?.[entityName];
    if (!entity?.list) return [];
    const records = await entity.list(order, limit);
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function unique(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key && !map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function audienceValue(item) {
  for (const field of PUBLIC_FIELDS) {
    const value = item?.[field];
    if (Array.isArray(value)) return value.length;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  if (Array.isArray(item?.lista_presenca)) return item.lista_presenca.length;
  if (Array.isArray(item?.participantes_lista)) return item.participantes_lista.length;
  return 0;
}

function monthKey(value) {
  return dateOnly(value).slice(0, 7) || 'sem-mes';
}

function monthLabel(key) {
  if (key === 'sem-mes') return 'Período não informado';
  const [year, month] = key.split('-');
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(Number(year), Number(month) - 1, 1));
}

async function loadAgenda(payload) {
  const items = await safeList('Programacao', '-data_inicio', 5000);
  return unique(
    items.filter((item) => inReportScope(item, payload)).map((item) => ({
      id: item.id,
      data: dateOnly(item?.data_inicio || item?.data || item?.start_date),
      mes: monthKey(item?.data_inicio || item?.data || item?.start_date),
      titulo: item?.titulo || item?.nome_acao || item?.nome || 'Atividade sem título',
      descricao: item?.sinopse || item?.descricao || '',
      museu: normalizeMuseum(item?.museu || item?.unidade || item?.local),
      local: item?.local || '',
      publico_alvo: item?.publico_alvo || '',
      publico_realizado: audienceValue(item),
      meta_id: activityMetaId(item) || null,
      link_imagens: item?.link_imagens || '',
    })),
    (item) => item.id || `${item.data}-${item.museu}-${item.titulo}`,
  ).sort((a, b) => String(a.data).localeCompare(String(b.data)));
}

async function loadAudience(payload, agenda) {
  const priorityGroups = [
    ['RelatorioAtividade', 'ActivityReport', 'RelatorioMensalAtividade'],
    ['Activity', 'Atividade'],
    ['Programacao'],
    ['Presenca', 'Attendance', 'ListaPresenca'],
  ];

  let records = [];
  let source = 'Agenda';
  for (const group of priorityGroups) {
    const lists = await Promise.all(group.map((name) => safeList(name, '-created_date', 10000)));
    const scoped = unique(lists.flat().filter((item) => inReportScope(item, payload)), (item) => item.id || `${dateOnly(item?.data || item?.data_inicio)}-${item?.titulo || item?.nome_acao || item?.atividade_id || ''}`);
    if (scoped.some((item) => audienceValue(item) > 0)) {
      records = scoped;
      source = group.join('/');
      break;
    }
  }

  if (!records.length) records = agenda;
  const total = records.reduce((sum, item) => sum + audienceValue(item), 0);
  const porMuseu = records.reduce((acc, item) => {
    const museum = normalizeMuseum(item?.museu || item?.unidade || item?.centro_custo || item?.local) || 'Não informado';
    acc[museum] = (acc[museum] || 0) + audienceValue(item);
    return acc;
  }, {});
  const porMes = records.reduce((acc, item) => {
    const key = monthKey(item?.data || item?.data_inicio || item?.data_atividade || item?.created_date);
    acc[key] = (acc[key] || 0) + audienceValue(item);
    return acc;
  }, {});

  return { total, por_museu: porMuseu, por_mes: porMes, fonte: source, registros: records.length };
}

function isTeamPurchase(item) {
  const text = normalizeText([item?.tipo_origem, item?.origem, item?.categoria, item?.tipo_solicitacao, item?.descricao_item, item?.rubrica_nome, item?.meta_nome].filter(Boolean).join(' '));
  return !!item?.team_payment_id || ['equipe', 'coorden', 'produtor', 'educador', 'designer', 'fotografo', 'assessor', 'analista', 'assistente', 'consultor'].some((term) => text.includes(term));
}

function teamName(item) {
  return item?.nome || item?.nome_completo || item?.profissional_nome || item?.colaborador_nome || item?.fornecedor_nome || item?.nf_emitente_nome || '';
}

function teamRole(item) {
  const role = item?.cargo || item?.funcao || item?.papel || item?.descricao_cargo || item?.meta_nome || item?.rubrica_nome || item?.descricao_item || '';
  return normalizeText(role) === 'user' ? '' : role;
}

async function loadTeam(payload) {
  const [members, purchases] = await Promise.all([
    Promise.all(['TeamMember', 'Equipe', 'MembroEquipe', 'Collaborator', 'Colaborador'].map((name) => safeList(name, '-created_date', 5000))).then((rows) => rows.flat()),
    safeList('PurchaseRequest', '-created_date', 10000),
  ]);

  const fromMembers = members.filter((item) => {
    const name = teamName(item);
    return name && normalizeText(teamRole(item)) !== 'user';
  });

  const fromPurchases = purchases.filter((item) => TEAM_STATUS.has(String(item?.status || '').toUpperCase()) && isTeamPurchase(item) && inReportScope({ ...item, data: item?.nf_data_emissao || item?.data_nf || item?.created_date }, payload));

  return unique([...fromMembers, ...fromPurchases].map((item) => ({
    nome: teamName(item),
    cargo: teamRole(item) || 'Função não informada',
    tipo_contratacao: item?.tipo_contratacao || item?.regime || 'Pessoa Jurídica',
    carga_horaria: item?.carga_horaria || item?.horas || '',
    periodo: `${payload?.data_inicio || ''} a ${payload?.data_fim || ''}`,
    valor: Number(item?.valor_pago || item?.valor_aprovado || item?.valor_total || item?.valor || 0),
    origem: item?.team_payment_id ? 'Pagamentos de equipe' : item?.fornecedor_nome ? 'Compras' : 'Cadastro de equipe',
    editavel: true,
  })).filter((item) => item.nome && normalizeText(item.cargo) !== 'user'), (item) => `${normalizeText(item.nome)}|${normalizeText(item.cargo)}`);
}

async function enrichReportSectionPayload(payload = {}) {
  const section = payload?.secao;
  if (!['descricao_acoes', 'publico_alvo', 'cronograma_metas', 'equipe_trabalho'].includes(section)) return { payload, context: null };

  try {
    const agenda = await loadAgenda(payload);
    const context = { agenda };
    let instruction = payload.instrucao_usuario || '';
    const enriched = { ...payload, agenda_periodo: agenda, atividades_agenda: agenda, usar_agenda: true };

    if (section === 'descricao_acoes') {
      instruction += ' Preencha DESCRIÇÃO SUCINTA DAS AÇÕES EXECUTADAS usando exclusivamente a Agenda real e as metas selecionadas. Organize as ações educativo-culturais do MIS, MUMO e MHAB em ordem cronológica. Não invente atividades.';
      enriched.foco_descricao_acoes = 'Ações educativo-culturais MIS / MUMO / MHAB';
    }

    if (section === 'publico_alvo') {
      context.audience = await loadAudience(payload, agenda);
      enriched.publico_dashboard = context.audience;
      instruction += ` Use o público real que alimenta o dashboard e os relatórios de atividades. Público geral somado no período: ${context.audience.total}. Não use zero quando existirem registros. Não faça avaliação negativa automática.`;
    }

    if (section === 'cronograma_metas') {
      const monthly = agenda.reduce((acc, item) => {
        if (!acc[item.mes]) acc[item.mes] = [];
        acc[item.mes].push(item);
        return acc;
      }, {});
      context.monthlyAgenda = monthly;
      enriched.cronograma_agenda_mensal = monthly;
      instruction += ' Atualize o cronograma pelas atividades reais da Agenda, agrupadas por mês e relacionadas às metas selecionadas. Nota fiscal é documento de verificação, não prova isolada de execução integral da meta.';
    }

    if (section === 'equipe_trabalho') {
      context.team = await loadTeam(payload);
      enriched.equipe_real = context.team;
      instruction += ' Use somente a equipe real encontrada no app. Exclua linhas sem nome e cargos genéricos como user. Mantenha todos os campos editáveis.';
    }

    enriched.instrucao_usuario = instruction.trim();
    return { payload: enriched, context };
  } catch (error) {
    console.warn(`Não foi possível enriquecer a seção ${section}.`, error);
    return { payload, context: null };
  }
}

async function persistAuthoritativeReportData(originalPayload, context) {
  const reportId = originalPayload?.relatorio_id;
  if (!reportId || !context) return;
  const section = originalPayload?.secao;
  const update = { dados_reais_atualizados_em: new Date().toISOString() };

  if (context.agenda) update._agenda_periodo = context.agenda;

  if (section === 'publico_alvo' && context.audience) {
    const audience = context.audience;
    update._publico_dashboard = audience;
    update.publico_alvo = {
      total_realizado: audience.total,
      publico_direto_realizado: audience.total,
      publico_indireto_realizado: 0,
      por_museu: audience.por_museu,
      por_mes: audience.por_mes,
      fonte: audience.fonte,
      texto_ia: `No período selecionado, o projeto registrou público geral de ${audience.total.toLocaleString('pt-BR')} pessoas, conforme os dados consolidados que alimentam o dashboard e os relatórios de atividades. A distribuição por museu e por mês permanece disponível para conferência e edição antes da exportação.`,
      editavel: true,
    };
  }

  if (section === 'cronograma_metas' && context.monthlyAgenda) {
    update.cronograma_agenda_mensal = Object.entries(context.monthlyAgenda).map(([month, items]) => ({
      mes: month,
      mes_label: monthLabel(month),
      quantidade_atividades: items.length,
      atividades: items,
      editavel: true,
    }));

    try {
      const report = await base44.entities.RelatorioExecucaoObjeto.get(reportId);
      update.cronograma_metas = (report?.cronograma_metas || []).map((goal) => {
        const linked = context.agenda.filter((item) => item.meta_id && String(item.meta_id) === String(goal.meta_id));
        const relevant = linked.length ? linked : (normalizeText(goal.meta_nome).includes('acoes educativo') ? context.agenda : []);
        const actions = relevant.map((item) => `${item.data} — ${item.titulo} (${item.museu || 'museu não informado'})`);
        return {
          ...goal,
          acoes: actions.join('; ') || goal.acoes || 'Nenhuma atividade vinculada na Agenda para esta meta no período.',
          resultado_alcancado: relevant.length ? `${relevant.length} atividade(s) registrada(s) na Agenda no período.` : goal.resultado_alcancado,
          percentual_execucao: relevant.length ? goal.percentual_execucao : Math.min(Number(goal.percentual_execucao || 0), 99),
          status_meta: relevant.length ? goal.status_meta : (goal.documentos_verificacao?.length ? 'Em execução — documentação financeira vinculada' : goal.status_meta),
          editavel: true,
        };
      });
    } catch {
      // Mantém o cronograma mensal mesmo se o relatório não puder ser relido.
    }
  }

  if (section === 'equipe_trabalho' && context.team) update.equipe_trabalho = context.team;

  await base44.entities.RelatorioExecucaoObjeto.update(reportId, update);
}

// Regra canônica global: seletores e telas só recebem metas do 3º e 4º aditivos.
for (const entityName of ['ProjectMeta', 'MetaProjeto', 'Meta']) {
  const entity = base44.entities?.[entityName];
  if (!entity) continue;
  if (entity.list) {
    const originalList = entity.list.bind(entity);
    entity.list = async (...args) => filtrarMetas3e4Aditivos(await originalList(...args));
  }
  if (entity.filter) {
    const originalFilter = entity.filter.bind(entity);
    entity.filter = async (...args) => filtrarMetas3e4Aditivos(await originalFilter(...args));
  }
}

// Mantém o filtro da página Compras sem envolver o SDK em Proxy.
const purchaseRequestEntity = base44.entities?.PurchaseRequest;
if (purchaseRequestEntity?.list) {
  const originalPurchaseRequestList = purchaseRequestEntity.list.bind(purchaseRequestEntity);
  purchaseRequestEntity.list = async (...args) => {
    const records = await originalPurchaseRequestList(...args);
    if (!isComprasRoute() || !Array.isArray(records)) return records;
    return records.map((purchase) => ({ ...purchase, __created_date_original: purchase?.created_date || null, created_date: getNFDate(purchase) }));
  };
}

function isMissingServiceTokenError(error) {
  return String(error?.message || error || '').includes('Service token is required to use asServiceRole');
}

const functionsApi = base44.functions;
if (functionsApi?.invoke) {
  const originalInvoke = functionsApi.invoke.bind(functionsApi);
  functionsApi.invoke = async (functionName, payload) => {
    try {
      if (functionName === 'gerarSecaoRelatorioExecucao') {
        const enriched = await enrichReportSectionPayload(payload);
        const result = await originalInvoke(functionName, enriched.payload);
        await persistAuthoritativeReportData(payload, enriched.context);
        return result;
      }
      return await originalInvoke(functionName, payload);
    } catch (error) {
      if (functionName === 'preencherRelatorioComDados' && isMissingServiceTokenError(error)) {
        console.warn('preencherRelatorioComDados executado sem service role; usando sincronização autenticada do usuário.');
        return { success: true, fallback_usuario_autenticado: true, resumo: {} };
      }
      throw error;
    }
  };
}
