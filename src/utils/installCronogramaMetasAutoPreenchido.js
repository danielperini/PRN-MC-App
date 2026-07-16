import { base44 } from '@/api/base44Client';

const APPROVED_REPORT_STATUS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PUBLICADO', 'FINALIZADO']);
const META_CODE_PATTERN = /^(?:META\s*)?(\d{1,2})([A-Z])?\b/i;
const PHOTO_FIELDS = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url'];
const PUBLIC_FIELDS = ['publico_total', 'total_publico', 'publico_realizado', 'publico_presente', 'quantidade_publico', 'participantes', 'visitantes', 'presentes', 'attendance_count', 'total_participantes'];

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(items, keyFn) {
  const result = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key && !result.has(key)) result.set(key, item);
  }
  return [...result.values()];
}

async function safeList(entityName, limit = 10000) {
  try {
    const entity = base44?.entities?.[entityName];
    if (!entity?.list) return [];
    const response = await entity.list('-created_date', limit);
    return Array.isArray(response) ? response : [];
  } catch (error) {
    const status = Number(error?.response?.status || error?.status || 0);
    if (status !== 403 && status !== 404) {
      console.warn(`[Cronograma automático] Falha ao consultar ${entityName}.`, error);
    }
    return [];
  }
}

function metaCode(meta = {}) {
  const direct = text(meta.meta_codigo || meta.codigo_meta || meta.codigo || meta.numero_meta || meta.numero || meta.meta_id);
  const source = direct || text(meta.meta_nome || meta.nome || meta.titulo || meta.descricao);
  const match = source.toUpperCase().match(META_CODE_PATTERN);
  if (!match) return '';
  return `${Number(match[1])}${match[2] || ''}`;
}

function metaName(meta = {}) {
  return text(meta.meta_nome || meta.nome || meta.titulo || meta.descricao || meta.resultado_esperado || 'Meta');
}

function metaIdentity(meta = {}) {
  return text(meta.id || meta.project_meta_id || meta.meta_id || meta.chave_logica || metaCode(meta) || normalize(metaName(meta)));
}

function isRubricaLike(row = {}) {
  const source = normalize(`${metaName(row)} ${row.grupo || ''} ${row.rubrica || ''} ${row.centro_custo || ''}`);
  const hasFinancialFields = [
    row.valor_previsto,
    row.valor_total,
    row.valor_rubrica,
    row.valor_utilizado,
    row.saldo,
    row.natureza_despesa,
  ].some((value) => value !== undefined && value !== null && text(value));
  const expenseTerms = /(analista adm|assistente administrativo|coordenador de comunicacao|coordenador geral|assessor de imprensa|designer|fotografo|contador|assessoria juridica|energia eletrica|material de escritorio|alimentacao|lanches|transporte|producao mis|educador mis|consultoria de programacao)/;
  return !metaCode(row) && (hasFinancialFields || expenseTerms.test(source));
}

function isOfficialMeta(row = {}) {
  const code = metaCode(row);
  if (code) return true;
  if (row.project_meta_id || row.chave_logica || row.tipo_registro === 'META' || row.entity_type === 'ProjectMeta') return true;
  return !isRubricaLike(row) && /\bmeta\b/i.test(`${row.meta_nome || ''} ${row.nome || ''} ${row.titulo || ''}`);
}

function mergeMeta(official, existing = {}) {
  return {
    ...official,
    ...existing,
    id: official.id || existing.id,
    meta_id: official.meta_id || official.id || existing.meta_id,
    project_meta_id: official.id || official.project_meta_id || existing.project_meta_id,
    meta_codigo: official.meta_codigo || official.codigo || official.numero_meta || existing.meta_codigo || metaCode(official),
    meta_nome: metaName(official) || metaName(existing),
    resultado_esperado: text(official.resultado_esperado || official.objetivo || official.descricao || existing.resultado_esperado),
  };
}

function canonicalizeSchedule(existingRows, projectMetas) {
  const existing = asArray(existingRows).filter(isOfficialMeta);
  const official = asArray(projectMetas).filter((meta) => meta?.ativo !== false && isOfficialMeta(meta));

  if (official.length) {
    const existingByCode = new Map();
    const existingById = new Map();
    for (const row of existing) {
      const code = metaCode(row);
      if (code && !existingByCode.has(code)) existingByCode.set(code, row);
      const id = metaIdentity(row);
      if (id && !existingById.has(id)) existingById.set(id, row);
    }

    return unique(
      official.map((meta) => {
        const code = metaCode(meta);
        const prior = existingById.get(metaIdentity(meta)) || (code ? existingByCode.get(code) : null) || {};
        return mergeMeta(meta, prior);
      }),
      (meta) => metaCode(meta) || metaIdentity(meta),
    ).sort((a, b) => {
      const aMatch = metaCode(a).match(/(\d+)([A-Z]?)/);
      const bMatch = metaCode(b).match(/(\d+)([A-Z]?)/);
      const aNumber = Number(aMatch?.[1] || 999);
      const bNumber = Number(bMatch?.[1] || 999);
      if (aNumber !== bNumber) return aNumber - bNumber;
      return text(aMatch?.[2]).localeCompare(text(bMatch?.[2]));
    });
  }

  return unique(existing, (meta) => metaCode(meta) || metaIdentity(meta));
}

function activityTitle(activity = {}) {
  return text(activity.titulo || activity.nome_acao || activity.nome || activity.atividade || activity.descricao || activity.description || activity.relato || activity.resumo);
}

function activityId(activity = {}) {
  return text(activity.id || activity.activity_id || activity.atividade_id || activity.evento_id || activity.programacao_id);
}

function activityDate(activity = {}) {
  return text(activity.data || activity.data_atividade || activity.data_inicio || activity.start_date || activity.created_date);
}

function activityPublic(activity = {}) {
  for (const field of PUBLIC_FIELDS) {
    const value = activity?.[field];
    if (Array.isArray(value)) return value.length;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return asArray(activity.lista_presenca).length || asArray(activity.participantes_lista).length || 0;
}

function photoUrl(photo = {}) {
  for (const field of PHOTO_FIELDS) {
    if (text(photo?.[field])) return text(photo[field]);
  }
  return '';
}

function extractReportActivities(report = {}) {
  const candidates = [
    report.atividades,
    report.activities,
    report._atividades_periodo,
    report._agenda_periodo,
    report.atividades_realizadas,
    report.descricao_acoes?.atividades,
    report.tabelas_estruturadas?.atividades,
    report.tabelas_estruturadas?.agenda,
  ];
  return candidates.flatMap(asArray).map((activity, index) => ({
    ...activity,
    id: activity?.id || `${report.id || 'report'}-atividade-${index}`,
    report_id: report.id,
    source_entity: 'Relatório Mensal',
    museu: activity?.museu || report.museu || report.filtro_museu,
    data: activityDate(activity) || report.mes_referencia || report.data_inicio || report.created_date,
  }));
}

function extractReportPhotos(report = {}) {
  return [report.fotos, report.photos, report.anexos_evidencias, report.anexos_fotograficos, report.galeria_fotos]
    .flatMap(asArray)
    .map((photo, index) => ({
      ...photo,
      id: photo?.id || `${report.id || 'report'}-foto-${index}`,
      report_id: report.id,
      source_entity: 'Relatório Mensal',
      file_url: photoUrl(photo),
    }));
}

function significantTokens(value) {
  const stop = new Set(['meta', 'projeto', 'museus', 'centro', 'atividade', 'atividades', 'realizar', 'execucao', 'para', 'com', 'dos', 'das', '2024', '2025', '2026']);
  return normalize(value).split(' ').filter((token) => token.length >= 4 && !stop.has(token));
}

function semanticScore(meta, activity) {
  const metaText = normalize(`${metaName(meta)} ${meta.resultado_esperado || ''} ${meta.descricao || ''} ${meta.objetivo || ''}`);
  const activityText = normalize(`${activityTitle(activity)} ${activity.tipo || ''} ${activity.categoria || ''} ${activity.museu || ''} ${activity.local || ''} ${activity.descricao || ''}`);
  if (!metaText || !activityText) return 0;

  const explicitMeta = text(activity.meta_id || activity.project_meta_id || activity.meta_codigo || activity.codigo_meta || activity.meta_chave);
  const code = metaCode(meta);
  if (explicitMeta && [meta.id, meta.meta_id, meta.project_meta_id, meta.chave_logica, code].filter(Boolean).map(String).includes(explicitMeta)) return 100;

  let score = 0;
  const activityTokens = new Set(significantTokens(activityText));
  for (const token of significantTokens(metaText)) if (activityTokens.has(token)) score += 2;

  const patterns = [
    ['noturno pampulha', ['noturno pampulha', 'casa do baile', 'map', 'mck', 'kubitschek']],
    ['noturno 2026', ['noturno', 'mis', 'mumo', 'mhab']],
    ['educativ', ['oficina', 'visita', 'mediacao', 'educativ']],
    ['manutencao', ['manutencao', 'reparo', 'conservacao']],
    ['mostra', ['mostra', 'exposicao', 'montagem']],
    ['comunicacao', ['divulgacao', 'imprensa', 'rede social', 'comunicacao']],
    ['publicacao', ['catalogo', 'pesquisa', 'texto', 'publicacao']],
    ['consultoria', ['formacao', 'capacitacao', 'consultoria', 'ambiente seguro']],
  ];
  for (const [needle, related] of patterns) {
    if (metaText.includes(needle) && related.some((term) => activityText.includes(term))) score += 6;
  }
  return score;
}

function enrichRows(rows, activities, photos, start, end) {
  const cleanActivities = unique(activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`);
  const cleanPhotos = unique(photos.filter((item) => photoUrl(item)), (item) => photoUrl(item).split('?')[0]);
  const period = `${start || ''} a ${end || ''}`.replace(/^ a | a $/g, '') || 'Período total do projeto';

  return rows.map((meta) => {
    const relatedActivities = cleanActivities.filter((activity) => semanticScore(meta, activity) >= 6);
    const relatedIds = new Set(relatedActivities.map(activityId).filter(Boolean));
    const relatedReports = new Set(relatedActivities.map((item) => text(item.report_id)).filter(Boolean));
    const relatedPhotos = cleanPhotos.filter((photo) => {
      const linked = text(photo.activity_id || photo.atividade_id || photo.evento_id || photo.programacao_id);
      const reportId = text(photo.report_id || photo.relatorio_id);
      const photoMeta = text(photo.meta_id || photo.project_meta_id || photo.meta_codigo || photo.meta_chave);
      if (relatedIds.has(linked) || relatedReports.has(reportId)) return true;
      if (photoMeta && [meta.id, meta.meta_id, meta.project_meta_id, meta.chave_logica, metaCode(meta)].filter(Boolean).map(String).includes(photoMeta)) return true;
      const caption = normalize(`${photo.atividade_nome || ''} ${photo.legenda || ''} ${photo.titulo || ''}`);
      return relatedActivities.some((activity) => {
        const title = normalize(activityTitle(activity));
        return title.length >= 6 && caption.includes(title);
      });
    });

    const agenda = relatedActivities.map((activity) => ({
      id: activityId(activity),
      data: activityDate(activity) || 'Data não informada',
      atividade: activityTitle(activity) || 'Atividade registrada',
      museu: text(activity.museu || activity.unidade || activity.local || activity.centro_custo) || 'Não informado',
      publico: activityPublic(activity),
      origem: activity.source_entity || (activity.report_id ? 'Relatório Mensal' : 'Agenda'),
      relatorio_id: activity.report_id || '',
    }));

    const publicReached = relatedActivities.reduce((sum, activity) => sum + activityPublic(activity), 0);
    const expected = Number(meta.quantidade_prevista || meta.meta_quantidade || meta.quantidade || 0);
    const percentage = expected > 0
      ? Math.min(100, Math.round((relatedActivities.length / expected) * 1000) / 10)
      : relatedActivities.length > 0 ? 100 : Number(meta.percentual_execucao || 0);

    return {
      ...meta,
      meta_nome: metaName(meta),
      agenda_atividades: agenda,
      atividades_vinculadas: relatedActivities,
      quantidade_realizada: relatedActivities.length,
      publico_realizado: publicReached,
      periodo: text(meta.periodo_execucao || meta.periodo_previsto) || period,
      documentos_verificacao: relatedPhotos.map((photo, index) => ({
        tipo: 'fotografia',
        titulo: text(photo.atividade_nome || photo.legenda || photo.titulo) || `Registro fotográfico ${index + 1}`,
        url: photoUrl(photo),
        atividade_id: text(photo.activity_id || photo.atividade_id),
        origem: photo.source_entity || 'Galeria',
      })),
      fotos_verificacao: relatedPhotos,
      percentual_execucao: Number.isFinite(percentage) ? percentage : 0,
      status_meta: percentage >= 100 ? 'Realizada integralmente' : percentage > 0 ? `Realizada parcialmente — ${percentage}%` : 'Sem execução comprovada no período',
      resultado_alcancado: relatedActivities.length
        ? `${relatedActivities.length} atividade(s) comprovada(s), com público consolidado de ${publicReached.toLocaleString('pt-BR')} pessoa(s).`
        : 'Não foram localizados registros suficientes no período selecionado.',
      justificativa: relatedActivities.length
        ? 'Preenchimento automático realizado com dados reais da Agenda, dos Relatórios Mensais aprovados e da galeria de fotos.'
        : 'Não foram localizados vínculos suficientes na Agenda, nos Relatórios Mensais aprovados ou na galeria de fotos.',
    };
  });
}

export function installCronogramaMetasAutoPreenchido() {
  if (typeof window === 'undefined' || window.__cronogramaMetasAutoPreenchidoInstalled) return;
  window.__cronogramaMetasAutoPreenchidoInstalled = true;

  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entity?.update || entity.__cronogramaAutoPreenchidoWrapped) return;

  const originalUpdate = entity.update.bind(entity);
  entity.update = async (id, payload = {}) => {
    if (!Array.isArray(payload.cronograma_metas)) return originalUpdate(id, payload);

    let current = {};
    try {
      current = await entity.get(id);
    } catch (_) {}

    const [projectMetas, programacoes, reports, attachments, reportPhotos, documentIntakes] = await Promise.all([
      safeList('ProjectMeta'),
      safeList('Programacao'),
      safeList('Report'),
      safeList('Attachment'),
      safeList('ReportPhoto'),
      safeList('DocumentIntake'),
    ]);

    const approvedReports = reports.filter((report) => {
      const status = text(report.status || report.situacao || report.estado).toUpperCase();
      return !status || APPROVED_REPORT_STATUS.has(status);
    });

    const canonical = canonicalizeSchedule(payload.cronograma_metas, projectMetas);
    const reportActivities = approvedReports.flatMap(extractReportActivities);
    const reportPhotosEmbedded = approvedReports.flatMap(extractReportPhotos);
    const existingActivities = [
      ...asArray(payload._atividades_periodo),
      ...asArray(payload._agenda_periodo),
      ...asArray(current?._atividades_periodo),
      ...asArray(current?._agenda_periodo),
    ];
    const existingPhotos = [
      ...asArray(payload.anexos_evidencias),
      ...asArray(payload.anexos_fotograficos),
      ...asArray(payload._fotos_atividades),
      ...asArray(current?.anexos_evidencias),
      ...asArray(current?.anexos_fotograficos),
      ...asArray(current?._fotos_atividades),
    ];
    const intakePhotos = documentIntakes.filter((item) => /foto|imagem|image/i.test(`${item.tipo_detectado || ''} ${item.file_name_original || ''}`));

    const activities = [...existingActivities, ...programacoes, ...reportActivities];
    const photos = [...existingPhotos, ...attachments, ...reportPhotos, ...reportPhotosEmbedded, ...intakePhotos];
    const enriched = enrichRows(
      canonical,
      activities,
      photos,
      payload.data_inicio || current?.data_inicio,
      payload.data_fim || current?.data_fim,
    );

    payload = {
      ...payload,
      cronograma_metas: enriched,
      tabela_metas_atividades: enriched.map((meta) => ({
        meta_id: meta.meta_id || meta.id || meta.chave_logica,
        meta_codigo: meta.meta_codigo || metaCode(meta),
        meta_nome: meta.meta_nome,
        resultado_esperado: meta.resultado_esperado,
        atividades: meta.agenda_atividades || [],
        publico_realizado: meta.publico_realizado || 0,
        fotos: meta.documentos_verificacao || [],
        percentual_execucao: meta.percentual_execucao || 0,
        status_meta: meta.status_meta,
        justificativa: meta.justificativa,
      })),
      _atividades_periodo: unique(activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`),
      _agenda_periodo: unique(activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`),
      anexos_evidencias: unique(photos.filter((item) => photoUrl(item)), (item) => photoUrl(item).split('?')[0]),
      cronograma_metas_auto_preenchido_em: new Date().toISOString(),
    };

    return originalUpdate(id, payload);
  };

  entity.__cronogramaAutoPreenchidoWrapped = true;
}
