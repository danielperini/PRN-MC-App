import { base44 } from '@/api/base44Client';

const STATUS_OK = new Set(['aprovado', 'aprovado_admin', 'aprovado_coord', 'publicado', 'finalizado', 'concluido']);
const PHOTO_FIELDS = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url', 'drive_url', 'gallery_url'];
const PUBLIC_FIELDS = ['publico_total', 'total_publico', 'publico_realizado', 'publico_presente', 'quantidade_publico', 'participantes', 'visitantes', 'presentes', 'attendance_count', 'total_participantes'];

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

async function safeList(name, limit = 10000) {
  try {
    const entity = base44?.entities?.[name];
    if (!entity?.list) return [];
    const result = await entity.list('-created_date', limit);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    const status = Number(error?.response?.status || error?.status || 0);
    if (status !== 403 && status !== 404) console.warn(`[Relatório de execução] Falha ao consultar ${name}.`, error);
    return [];
  }
}

function activityId(item = {}) {
  return text(item.id || item.activity_id || item.atividade_id || item.evento_id || item.programacao_id || item.agenda_id);
}

function activityTitle(item = {}) {
  return text(item.titulo || item.nome_acao || item.nome || item.atividade || item.descricao || item.description || item.relato || item.resumo);
}

function activityDate(item = {}) {
  return text(item.data || item.data_atividade || item.data_inicio || item.start_date || item.created_date);
}

function activityPublic(item = {}) {
  for (const field of PUBLIC_FIELDS) {
    const value = item?.[field];
    if (Array.isArray(value)) return value.length;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return asArray(item.lista_presenca).length || asArray(item.participantes_lista).length || 0;
}

function photoUrl(item = {}) {
  for (const field of PHOTO_FIELDS) if (text(item?.[field])) return text(item[field]);
  return '';
}

function reportApproved(report = {}) {
  const status = normalize(report.status || report.situacao || report.estado);
  return !status || STATUS_OK.has(status);
}

function reportActivities(report = {}) {
  return [
    report.atividades,
    report.activities,
    report.atividades_realizadas,
    report._atividades_periodo,
    report._agenda_periodo,
    report.descricao_acoes?.atividades,
    report.tabelas_estruturadas?.atividades,
    report.tabelas_estruturadas?.agenda,
  ].flatMap(asArray).map((activity, index) => ({
    ...activity,
    id: activity?.id || `${report.id || 'report'}-atividade-${index}`,
    report_id: report.id,
    relatorio_titulo: report.titulo || report.nome || report.mes_referencia || 'Relatório Mensal',
    source_entity: 'Report',
    museu: activity?.museu || report.museu || report.filtro_museu,
    data: activityDate(activity) || report.mes_referencia || report.data_inicio || report.created_date,
  }));
}

function reportImages(report = {}) {
  return [report.fotos, report.photos, report.anexos_evidencias, report.anexos_fotograficos, report.galeria_fotos]
    .flatMap(asArray)
    .map((photo, index) => ({
      ...photo,
      id: photo?.id || `${report.id || 'report'}-foto-${index}`,
      report_id: report.id,
      source_entity: 'Report',
      file_url: photoUrl(photo),
    }));
}

function sameActivity(activity, photo) {
  const id = activityId(activity);
  const linked = text(photo.activity_id || photo.atividade_id || photo.evento_id || photo.programacao_id || photo.agenda_id);
  if (id && linked && id === linked) return true;
  if (activity.report_id && text(photo.report_id || photo.relatorio_id) === text(activity.report_id)) return true;
  const title = normalize(activityTitle(activity));
  const caption = normalize(`${photo.atividade_nome || ''} ${photo.legenda || ''} ${photo.titulo || ''} ${photo.descricao || ''}`);
  return title.length >= 6 && caption.includes(title);
}

function buildActivityTable(activities, photos) {
  const cleanActivities = unique(activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}|${normalize(item.museu || item.local)}`);
  const cleanPhotos = unique(photos.filter((item) => photoUrl(item)), (item) => photoUrl(item).split('?')[0]);

  return cleanActivities.map((activity) => {
    const relatedPhotos = cleanPhotos.filter((photo) => sameActivity(activity, photo));
    return {
      atividade_id: activityId(activity),
      relatorio_id: text(activity.report_id),
      agenda_id: text(activity.agenda_id || activity.id),
      meta_id: text(activity.meta_id || activity.project_meta_id || activity.meta_codigo || activity.codigo_meta),
      atividade: activityTitle(activity) || 'Atividade registrada',
      data: activityDate(activity) || 'Data não informada',
      museu: text(activity.museu || activity.unidade || activity.local || activity.centro_custo) || 'Não informado',
      publico_total: activityPublic(activity),
      origem: activity.source_entity || (activity.report_id ? 'Relatório Mensal' : 'Agenda'),
      relatorio_titulo: text(activity.relatorio_titulo),
      fotos_total: relatedPhotos.length,
      fotos: relatedPhotos.map((photo, index) => ({
        titulo: text(photo.atividade_nome || photo.legenda || photo.titulo) || `Registro fotográfico ${index + 1}`,
        url: photoUrl(photo),
        origem: photo.source_entity || 'Galeria',
      })),
      documentos: unique([
        ...asArray(activity.documentos),
        ...asArray(activity.anexos),
        ...asArray(activity.arquivos),
      ], (item) => text(item?.url || item?.file_url || item?.id || item)).map((item) => ({
        titulo: text(item?.titulo || item?.nome || item?.file_name || item),
        url: text(item?.url || item?.file_url || item?.arquivo_url),
      })),
    };
  });
}

function buildSummary(rows) {
  const porMuseu = {};
  for (const row of rows) {
    const museu = row.museu || 'Não informado';
    if (!porMuseu[museu]) porMuseu[museu] = { atividades: 0, publico: 0, fotos: 0 };
    porMuseu[museu].atividades += 1;
    porMuseu[museu].publico += Number(row.publico_total || 0);
    porMuseu[museu].fotos += Number(row.fotos_total || 0);
  }
  return {
    total_atividades: rows.length,
    publico_total: rows.reduce((sum, row) => sum + Number(row.publico_total || 0), 0),
    fotos_total: rows.reduce((sum, row) => sum + Number(row.fotos_total || 0), 0),
    documentos_total: rows.reduce((sum, row) => sum + asArray(row.documentos).length, 0),
    por_museu: porMuseu,
  };
}

export function installRelatorioExecucaoActivityEvidence() {
  if (typeof window === 'undefined' || window.__relatorioExecucaoActivityEvidenceInstalled) return;
  window.__relatorioExecucaoActivityEvidenceInstalled = true;

  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entity?.update || entity.__activityEvidenceWrapped) return;

  const originalUpdate = entity.update.bind(entity);
  entity.update = async (id, payload = {}) => {
    let current = {};
    try { current = await entity.get(id); } catch (_) {}

    const [agendas, atividades, programacoes, reports, reportPhotos, documentIntakes] = await Promise.all([
      safeList('Agenda'),
      safeList('Atividade'),
      safeList('Programacao'),
      safeList('Report'),
      safeList('ReportPhoto'),
      safeList('DocumentIntake'),
    ]);

    const approvedReports = reports.filter(reportApproved);
    const activities = [
      ...asArray(payload._atividades_periodo),
      ...asArray(payload._agenda_periodo),
      ...asArray(current?._atividades_periodo),
      ...asArray(current?._agenda_periodo),
      ...agendas.map((item) => ({ ...item, source_entity: 'Agenda' })),
      ...atividades.map((item) => ({ ...item, source_entity: 'Atividade' })),
      ...programacoes.map((item) => ({ ...item, source_entity: 'Programacao' })),
      ...approvedReports.flatMap(reportActivities),
    ];

    const intakePhotos = documentIntakes.filter((item) => /foto|imagem|image/i.test(`${item.tipo_detectado || ''} ${item.file_name_original || ''}`));
    const photos = [
      ...asArray(payload.anexos_evidencias),
      ...asArray(payload.anexos_fotograficos),
      ...asArray(payload._fotos_atividades),
      ...asArray(current?.anexos_evidencias),
      ...asArray(current?.anexos_fotograficos),
      ...asArray(current?._fotos_atividades),
      ...reportPhotos,
      ...approvedReports.flatMap(reportImages),
      ...intakePhotos,
    ];

    const tabela = buildActivityTable(activities, photos);
    const resumo = buildSummary(tabela);

    payload = {
      ...payload,
      tabela_atividades_evidencias: tabela,
      resumo_atividades_ia: resumo,
      fontes_ia_relatorio_execucao: {
        entidades: ['Agenda', 'Atividade', 'Programacao', 'Report', 'ReportPhoto', 'DocumentIntake'],
        relatorios_aprovados_ids: approvedReports.map((report) => report.id).filter(Boolean),
        atualizado_em: new Date().toISOString(),
      },
      _atividades_periodo: unique(activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`),
      _agenda_periodo: unique(activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`),
      anexos_evidencias: unique(photos.filter((item) => photoUrl(item)), (item) => photoUrl(item).split('?')[0]),
      fotos_por_atividade: tabela.reduce((acc, row) => {
        if (row.atividade_id && row.fotos.length) acc[row.atividade_id] = row.fotos;
        return acc;
      }, {}),
      contexto_ia_atividades: tabela.map((row) => ({
        atividade_id: row.atividade_id,
        meta_id: row.meta_id,
        atividade: row.atividade,
        data: row.data,
        museu: row.museu,
        publico_total: row.publico_total,
        fotos_total: row.fotos_total,
        documentos_total: row.documentos.length,
        origem: row.origem,
      })),
      dados_atualizados_em: new Date().toISOString(),
    };

    return originalUpdate(id, payload);
  };

  entity.__activityEvidenceWrapped = true;
}
