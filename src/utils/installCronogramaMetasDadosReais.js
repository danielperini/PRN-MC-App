import { base44 } from '@/api/base44Client';

const STATUS_OK = new Set(['aprovado', 'aprovado_admin', 'aprovado_coord', 'pago', 'publicado', 'finalizado', 'concluido']);
const META_ID_FIELDS = ['meta_id', 'project_meta_id', 'meta_projeto_id', 'meta_codigo', 'codigo_meta', 'meta_vinculada_id'];
const PUBLIC_FIELDS = ['publico_total', 'total_publico', 'publico_realizado', 'publico_presente', 'quantidade_publico', 'participantes', 'visitantes', 'presentes', 'attendance_count', 'total_participantes'];
const PHOTO_FIELDS = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url', 'drive_url', 'gallery_url'];

const text = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : [];
const normalize = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function unique(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key && !map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

async function safeList(name, sort = '-created_date', limit = 10000) {
  try {
    const entity = base44?.entities?.[name];
    if (!entity?.list) return [];
    const result = await entity.list(sort, limit);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    const status = Number(error?.response?.status || error?.status || 0);
    if (status !== 403 && status !== 404) console.warn(`[Cronograma] Falha ao consultar ${name}.`, error);
    return [];
  }
}

function metaId(meta = {}) {
  return text(meta.id || meta.meta_id || meta.project_meta_id || meta.codigo || meta.meta_codigo || meta.chave_logica);
}

function metaCode(meta = {}) {
  return text(meta.codigo || meta.meta_codigo || meta.numero || meta.ordem || meta.chave_logica || meta.id);
}

function metaName(meta = {}) {
  return text(meta.meta_nome || meta.nome || meta.titulo || meta.resultado_esperado || meta.descricao || `Meta ${metaCode(meta)}`);
}

function isOfficialMeta(meta = {}) {
  if (!metaId(meta) || meta?.ativo === false) return false;
  const source = normalize(`${meta.tipo || ''} ${meta.entidade_origem || ''} ${meta.source_entity || ''}`);
  if (source.includes('rubrica') || source.includes('budget')) return false;
  const name = normalize(metaName(meta));
  return !/(analista|assistente administrativo|coordenador geral|coordenador de comunicacao|designer|fotografo|assessor de imprensa|rede social|material de escritorio|contador|assessoria juridica|energia eletrica|transporte|alimentacao|lanches buffet)$/.test(name);
}

function activityId(item = {}) {
  return text(item.id || item.activity_id || item.atividade_id || item.agenda_id || item.evento_id || item.programacao_id);
}

function activityTitle(item = {}) {
  return text(item.titulo || item.nome_acao || item.nome || item.atividade || item.descricao || item.description || item.relato || item.resumo);
}

function activityDate(item = {}) {
  return text(item.data || item.data_atividade || item.data_inicio || item.start_date || item.created_date || item.updated_date);
}

function activityMetaId(item = {}) {
  for (const field of META_ID_FIELDS) if (text(item?.[field])) return text(item[field]);
  return text(item.meta_chave || item.chave_logica);
}

function activityPublic(item = {}) {
  for (const field of PUBLIC_FIELDS) {
    const value = item?.[field];
    if (Array.isArray(value)) return value.length;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (Array.isArray(item.lista_presenca)) return item.lista_presenca.length;
  if (Array.isArray(item.participantes_lista)) return item.participantes_lista.length;
  return 0;
}

function photoUrl(item = {}) {
  for (const field of PHOTO_FIELDS) if (text(item?.[field])) return text(item[field]);
  return '';
}

function reportApproved(report = {}) {
  return STATUS_OK.has(normalize(report.status || report.situacao || report.workflow_status).replace(/\s+/g, '_'));
}

function reportActivities(report = {}) {
  return [report.atividades, report.activities, report.atividades_realizadas, report._atividades_periodo, report._agenda_periodo, report.descricao_acoes?.atividades, report.tabelas_estruturadas?.atividades, report.tabelas_estruturadas?.agenda]
    .flatMap(asArray)
    .map((item, index) => ({
      ...item,
      id: item?.id || `${report.id || 'report'}-atividade-${index}`,
      report_id: report.id,
      source_entity: 'Report',
      museu: item?.museu || report.museu || report.filtro_museu,
      data: activityDate(item) || report.mes_referencia || report.data_inicio || report.created_date,
    }));
}

function reportPhotos(report = {}) {
  return [report.fotos, report.photos, report.anexos_evidencias, report.anexos_fotograficos, report.galeria_fotos]
    .flatMap(asArray)
    .map((item, index) => ({ ...item, id: item?.id || `${report.id || 'report'}-foto-${index}`, report_id: report.id, source_entity: 'Report' }));
}

function semanticScore(meta, activity) {
  const m = normalize(`${metaName(meta)} ${meta.resultado_esperado || ''} ${meta.descricao || ''}`);
  const a = normalize(`${activityTitle(activity)} ${activity.tipo || ''} ${activity.categoria || ''} ${activity.museu || ''} ${activity.local || ''}`);
  if (!m || !a) return 0;
  let score = 0;
  const tokens = new Set(a.split(' ').filter((token) => token.length >= 4));
  for (const token of m.split(' ').filter((value) => value.length >= 4)) if (tokens.has(token)) score += 2;
  const rules = [
    ['noturno pampulha', ['pampulha', 'casa do baile', 'map', 'mck', 'kubitschek']],
    ['noturno', ['noturno', 'apresentacao', 'show', 'evento']],
    ['educativ', ['oficina', 'visita', 'mediacao', 'educativ']],
    ['manutencao', ['manutencao', 'reparo', 'conservacao']],
    ['mostra', ['mostra', 'exposicao']],
    ['publicacao', ['catalogo', 'pesquisa', 'texto', 'revisao', 'traducao', 'impressao']],
    ['comunicacao', ['divulgacao', 'imprensa', 'rede social', 'marketing']],
    ['consultoria', ['consultoria', 'formacao', 'capacitacao', 'ambiente seguro']],
  ];
  for (const [needle, related] of rules) if (m.includes(needle) && related.some((term) => a.includes(term))) score += 5;
  return score;
}

function belongsToMeta(meta, activity) {
  const explicit = activityMetaId(activity);
  const ids = new Set([metaId(meta), metaCode(meta), text(meta.meta_id), text(meta.project_meta_id), text(meta.chave_logica)].filter(Boolean));
  if (explicit && ids.has(explicit)) return true;
  return semanticScore(meta, activity) >= 5;
}

function expectedQuantity(meta = {}) {
  const direct = Number(meta.quantidade_prevista || meta.meta_quantidade || meta.quantidade || meta.total_previsto || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = `${metaName(meta)} ${meta.resultado_esperado || ''} ${meta.descricao || ''}`.match(/\b(\d{1,4})\s+(?:atividade|acao|ações|acoes|evento|oficina|visita|mostra|apresentacao|apresentação|diaria|diária)/i);
  return match ? Number(match[1]) : 0;
}

function buildCronograma(metas, context) {
  const activities = unique(context.activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`);
  const photos = unique(context.photos.filter((item) => photoUrl(item)), (item) => photoUrl(item).split('?')[0]);
  const period = `${context.start || ''} a ${context.end || ''}`.replace(/^ a | a $/g, '') || 'Período total do projeto';

  return metas.map((meta) => {
    const relatedActivities = activities.filter((item) => belongsToMeta(meta, item));
    const activityIds = new Set(relatedActivities.map(activityId).filter(Boolean));
    const reportIds = new Set(relatedActivities.map((item) => text(item.report_id)).filter(Boolean));
    const ids = new Set([metaId(meta), metaCode(meta), text(meta.meta_id), text(meta.chave_logica)].filter(Boolean));
    const relatedPhotos = photos.filter((item) => {
      const photoMeta = text(item.meta_id || item.project_meta_id || item.meta_chave || item.codigo_meta);
      const linkedActivity = text(item.activity_id || item.atividade_id || item.evento_id || item.programacao_id);
      const reportId = text(item.report_id || item.relatorio_id);
      return (photoMeta && ids.has(photoMeta)) || (linkedActivity && activityIds.has(linkedActivity)) || (reportId && reportIds.has(reportId));
    });

    const expected = expectedQuantity(meta);
    const performed = relatedActivities.length;
    const publicReached = relatedActivities.reduce((sum, item) => sum + activityPublic(item), 0);
    const percentage = expected > 0 ? Math.min(100, Math.round((performed / expected) * 1000) / 10) : performed > 0 ? 100 : 0;
    const documents = relatedPhotos.map((item, index) => ({
      tipo: 'fotografia',
      titulo: text(item.atividade_nome || item.legenda || item.titulo || item.file_name_original) || `Registro fotográfico ${index + 1}`,
      url: photoUrl(item),
      atividade_id: text(item.activity_id || item.atividade_id),
      origem: item.source_entity || 'Galeria',
    }));

    return {
      ...meta,
      meta_id: metaId(meta),
      meta_codigo: metaCode(meta),
      meta_nome: metaName(meta),
      resultado_esperado: text(meta.resultado_esperado || meta.finalidade || meta.objetivo_especifico) || `Execução integral da meta “${metaName(meta)}”.`,
      agenda_atividades: relatedActivities.map((item) => ({
        id: activityId(item),
        data: activityDate(item) || 'Data não informada',
        atividade: activityTitle(item) || 'Atividade registrada',
        museu: text(item.museu || item.unidade || item.local || item.centro_custo) || 'Não informado',
        publico: activityPublic(item),
        origem: item.source_entity || (item.report_id ? 'Relatório Mensal' : 'Agenda'),
        relatorio_id: item.report_id || '',
      })),
      atividades_vinculadas: relatedActivities,
      quantidade_prevista: expected,
      quantidade_realizada: performed,
      publico_realizado: publicReached,
      periodo: text(meta.periodo_execucao || meta.periodo_previsto) || period,
      documentos_verificacao: documents,
      fotos_verificacao: relatedPhotos,
      resultado_alcancado: performed > 0 ? `${performed} atividade(s) vinculada(s), público de ${publicReached.toLocaleString('pt-BR')} pessoa(s) e ${documents.length} evidência(s).` : 'Não foram localizados registros suficientes no período.',
      percentual_execucao: percentage,
      status_meta: percentage >= 100 ? 'Realizada integralmente' : percentage > 0 ? `Realizada parcialmente — ${percentage}%` : 'Não realizada',
      justificativa: percentage >= 100 ? 'Execução comprovada pela Agenda, Relatórios Mensais aprovados, público consolidado e evidências vinculadas.' : percentage > 0 ? 'A meta permanece em execução, com atividades, público e evidências já vinculados.' : 'Não foram encontradas evidências suficientes no período selecionado.',
      origem_meta: 'ProjectMeta',
      editavel: true,
    };
  });
}

export function installCronogramaMetasDadosReais() {
  if (typeof window === 'undefined' || window.__cronogramaMetasDadosReaisInstalled) return;
  window.__cronogramaMetasDadosReaisInstalled = true;
  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entity?.update || entity.__cronogramaDadosReaisWrapped) return;

  const originalUpdate = entity.update.bind(entity);
  entity.update = async (id, payload = {}) => {
    if (!Array.isArray(payload.cronograma_metas)) return originalUpdate(id, payload);
    let current = {};
    try { current = await entity.get(id); } catch (_) {}

    const [projectMetas, agendas, atividades, programacoes, reportsRaw, reportPhotos, documentIntakes] = await Promise.all([
      safeList('ProjectMeta', 'ordem'),
      safeList('Agenda'),
      safeList('Atividade'),
      safeList('Programacao'),
      safeList('Report'),
      safeList('ReportPhoto'),
      safeList('DocumentIntake'),
    ]);

    const reports = reportsRaw.filter(reportApproved);
    const officialMetas = unique(projectMetas.filter(isOfficialMeta), (meta) => normalize(metaCode(meta)) || normalize(metaName(meta)) || metaId(meta));
    const sourceMetas = officialMetas.length ? officialMetas : unique(payload.cronograma_metas.filter(isOfficialMeta), (meta) => normalize(metaCode(meta)) || normalize(metaName(meta)) || metaId(meta));
    const reportActivityRows = reports.flatMap(reportActivities);
    const reportImageRows = reports.flatMap(reportPhotos);
    const intakePhotos = documentIntakes.filter((item) => /foto|imagem|image/i.test(`${item.tipo_detectado || ''} ${item.file_name_original || ''} ${item.mime_type || ''}`));

    const context = {
      activities: [
        ...asArray(payload._atividades_periodo),
        ...asArray(payload._agenda_periodo),
        ...asArray(current?._atividades_periodo),
        ...asArray(current?._agenda_periodo),
        ...agendas,
        ...atividades,
        ...programacoes,
        ...reportActivityRows,
      ],
      photos: [
        ...asArray(payload.anexos_evidencias),
        ...asArray(payload.anexos_fotograficos),
        ...asArray(payload._fotos_atividades),
        ...asArray(current?.anexos_evidencias),
        ...asArray(current?.anexos_fotograficos),
        ...asArray(current?._fotos_atividades),
        ...reportPhotos,
        ...reportImageRows,
        ...intakePhotos,
      ],
      start: payload.data_inicio || current?.data_inicio,
      end: payload.data_fim || current?.data_fim,
    };

    const cronograma = buildCronograma(sourceMetas, context);
    payload = {
      ...payload,
      cronograma_metas: cronograma,
      tabela_metas_atividades: cronograma.map((meta) => ({
        meta_id: meta.meta_id,
        meta_nome: meta.meta_nome,
        quantidade_prevista: meta.quantidade_prevista,
        quantidade_realizada: meta.quantidade_realizada,
        publico_realizado: meta.publico_realizado,
        percentual_execucao: meta.percentual_execucao,
        status_meta: meta.status_meta,
        atividades: meta.agenda_atividades,
        fotos: meta.documentos_verificacao,
        justificativa: meta.justificativa,
      })),
      _atividades_periodo: unique(context.activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`),
      _agenda_periodo: unique(context.activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`),
      anexos_evidencias: unique(context.photos.filter((item) => photoUrl(item)), (item) => photoUrl(item).split('?')[0]),
      dados_atualizados_em: new Date().toISOString(),
    };

    return originalUpdate(id, payload);
  };
  entity.__cronogramaDadosReaisWrapped = true;
}
