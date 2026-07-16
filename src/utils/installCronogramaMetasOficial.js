import { base44 } from '@/api/base44Client';

const META_FIELDS = ['meta_id', 'id', 'meta_codigo', 'codigo'];
const PHOTO_FIELDS = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url'];
const DATE_FIELDS = ['data', 'data_atividade', 'data_inicio', 'start_date', 'created_date', 'updated_date'];
const PUBLIC_FIELDS = ['publico_total', 'total_publico', 'publico_realizado', 'publico_presente', 'quantidade_publico', 'participantes', 'visitantes', 'presentes', 'attendance_count', 'total_participantes'];

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function first(obj, fields) {
  for (const field of fields) {
    if (obj?.[field] !== undefined && obj?.[field] !== null && text(obj[field])) return obj[field];
  }
  return '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key && !map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

async function safeList(entityName, limit = 10000) {
  try {
    const entity = base44?.entities?.[entityName];
    if (!entity?.list) return [];
    const result = await entity.list('-created_date', limit);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    const status = Number(error?.response?.status || error?.status || 0);
    if (status !== 404 && status !== 403) console.warn(`[Cronograma de metas] Falha ao consultar ${entityName}.`, error);
    return [];
  }
}

function metaIds(meta = {}) {
  return new Set([
    ...(Array.isArray(meta.aliases) ? meta.aliases : []),
    ...META_FIELDS.map((field) => meta?.[field]),
    meta?.chave_logica,
  ].filter(Boolean).map(String));
}

function activityMetaId(activity = {}) {
  return text(activity.meta_chave || activity.meta_id || activity.project_meta_id || activity.meta_projeto_id || activity.meta_codigo || activity.codigo_meta || activity.meta_vinculada_id);
}

function activityId(activity = {}) {
  return text(activity.id || activity.activity_id || activity.atividade_id || activity.evento_id || activity.programacao_id);
}

function activityTitle(activity = {}) {
  return text(activity.titulo || activity.nome_acao || activity.nome || activity.atividade || activity.descricao || activity.description || activity.relato || activity.resumo);
}

function activityDate(activity = {}) {
  return text(first(activity, DATE_FIELDS));
}

function activityPublic(activity = {}) {
  for (const field of PUBLIC_FIELDS) {
    const value = activity?.[field];
    if (Array.isArray(value)) return value.length;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  if (Array.isArray(activity?.lista_presenca)) return activity.lista_presenca.length;
  if (Array.isArray(activity?.participantes_lista)) return activity.participantes_lista.length;
  return 0;
}

function photoUrl(photo = {}) {
  return text(first(photo, PHOTO_FIELDS));
}

function expectedQuantity(meta = {}) {
  const direct = Number(meta.quantidade_prevista || meta.meta_quantidade || meta.quantidade || meta.total_previsto || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const source = `${meta.meta_nome || meta.nome || ''} ${meta.resultado_esperado || ''} ${meta.descricao || ''}`;
  const match = source.match(/\b(\d{1,4})\s+(?:atividade|acao|ações|acoes|evento|oficina|visita|mostra|apresentacao|apresentação|diaria|diária)/i);
  return match ? Number(match[1]) : 0;
}

function isTeamMeta(meta = {}) {
  return /(equipe|coorden|educador|designer|produtor|producao|produção|assessor|consultor|analista|assistente|fotograf|contador|juridic)/i.test(
    `${meta.meta_nome || meta.nome || ''} ${meta.resultado_esperado || ''}`,
  );
}

function metaName(meta = {}) {
  return text(meta.meta_nome || meta.nome || meta.titulo || meta.descricao || meta.meta_id || 'Meta');
}

function plannedActions(meta = {}) {
  const value = meta.acoes_previstas || meta.acoes_plano || meta.acoes || meta.tarefas || meta.descricao_acao;
  if (Array.isArray(value)) return value.map((item) => text(item?.titulo || item?.nome || item)).filter(Boolean).join('; ');
  return text(value);
}

function expectedResult(meta = {}, teamMeta = false) {
  const existing = text(meta.resultado_esperado || meta.finalidade || meta.objetivo_especifico);
  if (existing && existing !== metaName(meta)) return existing;
  if (teamMeta) return 'Equipe contratada e mobilizada para assegurar a gestão do projeto e a implementação continuada das ações previstas no plano de trabalho.';
  return `Execução integral da meta “${metaName(meta)}”, com alcance do público e dos objetivos culturais, educativos e sociais previstos.`;
}

function significantTokens(value) {
  const stop = new Set(['meta', 'mes', 'mês', 'projeto', 'museus', 'centro', 'realizar', 'execucao', 'execução', 'atividade', 'atividades', 'acao', 'acoes', 'ação', 'ações', 'para', 'com', 'dos', 'das', 'uma', '2026', '2025', '2024']);
  return normalize(value).split(' ').filter((token) => token.length >= 4 && !stop.has(token));
}

function semanticScore(meta, activity) {
  const metaText = `${metaName(meta)} ${meta.resultado_esperado || ''} ${plannedActions(meta)} ${meta.rubrica || ''} ${(meta.rubricas || []).join(' ')}`;
  const activityText = `${activityTitle(activity)} ${activity.tipo || ''} ${activity.categoria || ''} ${activity.museu || ''} ${activity.local || ''} ${activity.descricao || ''}`;
  const m = normalize(metaText);
  const a = normalize(activityText);
  if (!m || !a) return 0;

  const patterns = [
    ['educador', ['educativ', 'oficina', 'visita', 'mediacao', 'mediação']],
    ['mostra', ['mostra', 'exposicao', 'exposição']],
    ['manutencao', ['manutencao', 'manutenção', 'reparo', 'conservacao', 'conservação']],
    ['noturno', ['noturno', 'apresentacao', 'apresentação', 'show', 'evento']],
    ['comunicacao', ['comunicacao', 'comunicação', 'divulgacao', 'divulgação', 'imprensa', 'rede social']],
    ['publicacao', ['publicacao', 'publicação', 'catalogo', 'catálogo', 'pesquisa', 'texto']],
    ['formacao', ['formacao', 'formação', 'capacitacao', 'capacitação', 'ambiente seguro']],
  ];

  let score = 0;
  const activityTokens = new Set(significantTokens(activityText));
  for (const token of significantTokens(metaText)) if (activityTokens.has(token)) score += 2;
  for (const [needle, related] of patterns) {
    if (m.includes(normalize(needle)) && related.some((term) => a.includes(normalize(term)))) score += 5;
  }
  if (normalize(meta.museu || meta.centro_custo) && a.includes(normalize(meta.museu || meta.centro_custo))) score += 2;
  return score;
}

function belongsToMeta(meta, activity) {
  const ids = metaIds(meta);
  const key = text(meta.chave_logica);
  const explicit = activityMetaId(activity);
  if (explicit && ((key && explicit === key) || ids.has(explicit))) return true;
  return semanticScore(meta, activity) >= 5;
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
    source_entity: activity?.source_entity || 'Report',
    museu: activity?.museu || report.museu || report.filtro_museu,
    data: activityDate(activity) || report.mes_referencia || report.data_inicio || report.created_date,
  }));
}

function extractReportPhotos(report = {}) {
  const candidates = [report.fotos, report.photos, report.anexos_evidencias, report.anexos_fotograficos, report.galeria_fotos];
  return candidates.flatMap(asArray).map((photo, index) => ({
    ...photo,
    id: photo?.id || `${report.id || 'report'}-foto-${index}`,
    report_id: report.id,
    source_entity: photo?.source_entity || 'Report',
    file_url: photoUrl(photo),
  }));
}

function enrichSchedule(schedule, context) {
  const activities = unique(Array.isArray(context.activities) ? context.activities : [], (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`);
  const photos = unique(Array.isArray(context.photos) ? context.photos : [], (item) => photoUrl(item).split('?')[0] || item.id);
  const team = Array.isArray(context.team) ? context.team : [];
  const projectPeriod = `${context.start || ''} a ${context.end || ''}`.replace(/^ a | a $/g, '') || 'Período total do projeto';

  return schedule.map((meta) => {
    const ids = metaIds(meta);
    const key = text(meta.chave_logica);
    const relatedActivities = activities.filter((activity) => belongsToMeta(meta, activity));
    const activityIds = new Set(relatedActivities.map(activityId).filter(Boolean));
    const relatedPhotos = photos.filter((photo) => {
      const photoMeta = text(photo.meta_chave || photo.meta_id || photo.project_meta_id);
      const linkedActivity = text(photo.activity_id || photo.atividade_id || photo.evento_id || photo.programacao_id || photo.report_id);
      if ((key && photoMeta === key) || ids.has(photoMeta) || activityIds.has(linkedActivity)) return true;
      return relatedActivities.some((activity) => normalize(activityTitle(activity)) && normalize(photo.atividade_nome || photo.legenda || photo.titulo).includes(normalize(activityTitle(activity))));
    }).filter((photo) => photoUrl(photo));

    const teamMeta = isTeamMeta(meta);
    const normalizedMeta = normalize(metaName(meta));
    const relatedTeam = team.filter((person) => {
      const role = normalize(person.cargo || person.funcao || person.meta_nome || person.rubrica_nome);
      return role && (normalizedMeta.includes(role) || role.includes(normalizedMeta.split(' ')[0]));
    });
    const expected = expectedQuantity(meta);
    const performed = relatedActivities.length;
    const publicReached = relatedActivities.reduce((sum, activity) => sum + activityPublic(activity), 0);
    let percentage = Number(meta.percentual_execucao);

    if (teamMeta && relatedTeam.length > 0) percentage = 100;
    else if (expected > 0) percentage = Math.min(100, Math.round((performed / expected) * 1000) / 10);
    else if (performed > 0) percentage = 100;
    else if (!Number.isFinite(percentage)) percentage = 0;

    const status = percentage >= 100
      ? 'Realizada integralmente'
      : percentage > 0
        ? `Realizada parcialmente — ${percentage}%`
        : 'Não realizada';

    const agendaRows = relatedActivities.map((activity) => ({
      id: activityId(activity),
      data: activityDate(activity) || 'Data não informada',
      atividade: activityTitle(activity) || 'Atividade registrada',
      museu: text(activity.museu || activity.unidade || activity.local || activity.centro_custo) || 'Não informado',
      publico: activityPublic(activity),
      origem: activity.source_entity || (activity.report_id ? 'Relatório Mensal' : 'Agenda'),
      relatorio_id: activity.report_id || '',
    }));

    const actionsFromActivities = relatedActivities.map(activityTitle).filter(Boolean);
    const actions = actionsFromActivities.length
      ? [...new Set(actionsFromActivities)].join('; ')
      : plannedActions(meta) || (teamMeta ? 'Contratar, mobilizar e acompanhar a equipe prevista no plano de trabalho.' : 'Executar as ações previstas para o cumprimento da meta.');

    const achieved = teamMeta && relatedTeam.length > 0
      ? 'A equipe prevista foi contratada e mobilizada, garantindo a gestão do projeto e a implementação das ações no período.'
      : performed > 0
        ? `${performed} atividade(s) vinculada(s) à meta, com público registrado de ${publicReached.toLocaleString('pt-BR')} pessoa(s). A consolidação considera Agenda, Relatórios Mensais, registros de público e evidências fotográficas.`
        : 'Não foram localizados registros físicos suficientes para confirmar resultado alcançado no período.';

    const justificativa = percentage >= 100
      ? 'A execução foi comprovada por atividades, registros de público e documentos vinculados, conforme os cronogramas acompanhados pela OSC e pelas coordenações dos equipamentos culturais.'
      : percentage > 0
        ? 'A meta permanece em execução. As atividades já realizadas, o público registrado e as evidências disponíveis foram vinculados; as ações pendentes permanecem previstas dentro da vigência pactuada.'
        : 'Não foram localizadas evidências suficientes no recorte selecionado. É necessária revisão dos vínculos de Agenda, Relatórios Mensais, registros de público e galeria antes da exportação.';

    return {
      ...meta,
      meta_nome: metaName(meta),
      resultado_esperado: expectedResult(meta, teamMeta),
      acoes: actions,
      agenda_atividades: agendaRows,
      atividades_vinculadas: relatedActivities,
      quantidade_prevista: expected || meta.quantidade_prevista || 0,
      quantidade_realizada: performed,
      publico_realizado: publicReached,
      periodo: text(meta.periodo_execucao || meta.periodo_previsto) || projectPeriod,
      documentos_verificacao: relatedPhotos.map((photo, index) => ({
        tipo: 'fotografia',
        titulo: text(photo.atividade_nome || photo.legenda || photo.titulo) || `Registro fotográfico ${index + 1}`,
        url: photoUrl(photo),
        atividade_id: text(photo.activity_id || photo.atividade_id),
        origem: photo.source_entity || 'Galeria',
      })),
      fotos_verificacao: relatedPhotos,
      resultado_alcancado: achieved,
      percentual_execucao: percentage,
      status_meta: status,
      justificativa,
      metodologia_complementar: 'Vinculação determinística e semântica por identificador de meta, título, descrição, rubrica, museu e natureza da atividade. A análise consulta Agenda, Relatórios Mensais, público e links de fotos disponíveis no app.',
      editavel: true,
    };
  });
}

function cellText(value) {
  if (Array.isArray(value)) {
    if (!value.length) return 'Sem registro vinculado';
    return value.map((item) => {
      if (typeof item === 'string') return item;
      if (item?.atividade) return `${item.data || '—'} — ${item.atividade} — ${item.museu || '—'} — público: ${Number(item.publico || 0).toLocaleString('pt-BR')}`;
      return text(item?.titulo || item?.nome || item);
    }).filter(Boolean).join('\n');
  }
  return text(value) || '—';
}

function buildTable(rows) {
  const wrapper = document.createElement('div');
  wrapper.dataset.cronogramaOficial = 'true';
  wrapper.className = 'overflow-x-auto rounded-lg border';
  const table = document.createElement('table');
  table.className = 'min-w-[1800px] w-full border-collapse text-xs';
  const labels = ['1) Metas', '2) Resultados esperados', '3) Agenda e atividades vinculadas', '4) Período de execução', '5) Público realizado', '6) Documentos para verificação', '7) Resultados alcançados', '8) Execução', '9) Justificativa'];
  const keys = ['meta_nome', 'resultado_esperado', 'agenda_atividades', 'periodo', 'publico_realizado', 'documentos_verificacao', 'resultado_alcancado', 'status_meta', 'justificativa'];
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  labels.forEach((label) => {
    const th = document.createElement('th');
    th.className = 'border bg-slate-100 p-2 text-left align-top font-semibold text-slate-700';
    th.textContent = label;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    keys.forEach((key) => {
      const td = document.createElement('td');
      td.className = 'border p-2 align-top text-slate-700 whitespace-pre-wrap';
      if (key === 'documentos_verificacao' && Array.isArray(row[key]) && row[key].some((item) => item?.url)) {
        row[key].forEach((item, index) => {
          const link = document.createElement('a');
          link.href = item.url;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.className = 'block text-blue-700 underline mb-1';
          link.textContent = item.titulo || `Fotografia ${index + 1}`;
          td.appendChild(link);
        });
      } else if (key === 'status_meta') {
        td.textContent = `${cellText(row[key])}${Number.isFinite(Number(row.percentual_execucao)) ? ` (${Number(row.percentual_execucao).toLocaleString('pt-BR')}%)` : ''}`;
      } else if (key === 'publico_realizado') {
        td.textContent = Number(row[key] || 0).toLocaleString('pt-BR');
      } else {
        td.textContent = cellText(row[key]);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function renderOfficialTable() {
  if (!/RelatorioExecucaoObjeto/i.test(window.location.pathname)) return;
  document.querySelectorAll('h3').forEach((heading) => {
    if (!normalize(heading.textContent).includes('7 cronograma')) return;
    const section = heading.closest('.rounded-xl.border');
    if (!section || section.querySelector('[data-cronograma-oficial="true"]')) return;
    const content = Array.from(section.children).find((child) => child.classList?.contains('text-sm'));
    if (!content) return;
    try {
      const rows = JSON.parse(content.textContent || '[]');
      if (!Array.isArray(rows)) return;
      content.replaceWith(buildTable(rows));
    } catch (_) {}
  });
}

export function installCronogramaMetasOficial() {
  if (typeof window === 'undefined' || window.__cronogramaMetasOficialInstalled) return;
  window.__cronogramaMetasOficialInstalled = true;

  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (entity?.update && !entity.__cronogramaOficialWrapped) {
    const originalUpdate = entity.update.bind(entity);
    entity.update = async (id, payload = {}) => {
      if (Array.isArray(payload.cronograma_metas)) {
        let current = {};
        try { current = await entity.get(id); } catch (_) {}

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

        const [programacoes, reports, attachments, reportPhotos, documentIntakes] = await Promise.all([
          safeList('Programacao'),
          safeList('Report'),
          safeList('Attachment'),
          safeList('ReportPhoto'),
          safeList('DocumentIntake'),
        ]);

        const reportActivities = reports.flatMap(extractReportActivities);
        const reportImages = reports.flatMap(extractReportPhotos);
        const intakePhotos = documentIntakes.filter((item) => /foto|imagem|image/i.test(`${item.tipo_detectado || ''} ${item.file_name_original || ''}`));
        const context = {
          activities: [...existingActivities, ...programacoes, ...reportActivities],
          photos: [...existingPhotos, ...attachments, ...reportPhotos, ...reportImages, ...intakePhotos],
          team: payload._equipe_real || payload.equipe_trabalho || current?._equipe_real || current?.equipe_trabalho || [],
          start: payload.data_inicio || current?.data_inicio,
          end: payload.data_fim || current?.data_fim,
        };

        const cronograma = enrichSchedule(payload.cronograma_metas, context);
        payload = {
          ...payload,
          cronograma_metas: cronograma,
          tabela_metas_atividades: cronograma.map((meta) => ({
            meta_id: meta.meta_id || meta.id || meta.chave_logica,
            meta_nome: meta.meta_nome,
            quantidade_prevista: meta.quantidade_prevista || 0,
            quantidade_realizada: meta.quantidade_realizada || 0,
            publico_realizado: meta.publico_realizado || 0,
            percentual_execucao: meta.percentual_execucao || 0,
            status_meta: meta.status_meta,
            atividades: meta.agenda_atividades || [],
            fotos: meta.documentos_verificacao || [],
            justificativa: meta.justificativa,
          })),
          _atividades_periodo: unique(context.activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`),
          _agenda_periodo: unique(context.activities, (item) => activityId(item) || `${activityDate(item)}|${normalize(activityTitle(item))}`),
          anexos_evidencias: unique(context.photos.filter((item) => photoUrl(item)), (item) => photoUrl(item).split('?')[0]),
          dados_atualizados_em: new Date().toISOString(),
        };
      }
      return originalUpdate(id, payload);
    };
    entity.__cronogramaOficialWrapped = true;
  }

  const run = () => window.requestAnimationFrame(renderOfficialTable);
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  run();
}
