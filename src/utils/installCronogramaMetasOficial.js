import { base44 } from '@/api/base44Client';

const META_FIELDS = ['meta_id', 'id', 'meta_codigo', 'codigo'];
const PHOTO_FIELDS = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url'];

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function first(obj, fields) {
  for (const field of fields) {
    if (obj?.[field] !== undefined && obj?.[field] !== null && text(obj[field])) return obj[field];
  }
  return '';
}

function metaIds(meta = {}) {
  return new Set([
    ...(Array.isArray(meta.aliases) ? meta.aliases : []),
    ...META_FIELDS.map((field) => meta?.[field]),
  ].filter(Boolean).map(String));
}

function activityMetaId(activity = {}) {
  return text(activity.meta_chave || activity.meta_id || activity.project_meta_id || activity.meta_projeto_id || activity.meta_codigo || activity.codigo_meta);
}

function activityId(activity = {}) {
  return text(activity.id || activity.activity_id || activity.atividade_id || activity.evento_id || activity.programacao_id);
}

function photoUrl(photo = {}) {
  return text(first(photo, PHOTO_FIELDS));
}

function expectedQuantity(meta = {}) {
  const direct = Number(meta.quantidade_prevista || meta.meta_quantidade || meta.quantidade || meta.total_previsto || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const source = `${meta.meta_nome || meta.nome || ''} ${meta.resultado_esperado || ''} ${meta.descricao || ''}`;
  const match = source.match(/\b(\d{1,4})\s+(?:atividade|acao|ações|acoes|evento|oficina|visita|mostra|apresentacao|apresentação)/i);
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

function enrichSchedule(schedule, context) {
  const activities = Array.isArray(context.activities) ? context.activities : [];
  const photos = Array.isArray(context.photos) ? context.photos : [];
  const team = Array.isArray(context.team) ? context.team : [];
  const projectPeriod = `${context.start || ''} a ${context.end || ''}`.replace(/^ a | a $/g, '') || 'Período total do projeto';

  return schedule.map((meta) => {
    const ids = metaIds(meta);
    const key = text(meta.chave_logica);
    const relatedActivities = activities.filter((activity) => {
      const activityMeta = activityMetaId(activity);
      return (key && activityMeta === key) || ids.has(activityMeta);
    });
    const activityIds = new Set(relatedActivities.map(activityId).filter(Boolean));
    const relatedPhotos = photos.filter((photo) => {
      const photoMeta = text(photo.meta_chave || photo.meta_id || photo.project_meta_id);
      const linkedActivity = text(photo.activity_id || photo.atividade_id || photo.evento_id || photo.programacao_id);
      return (key && photoMeta === key) || ids.has(photoMeta) || activityIds.has(linkedActivity);
    }).filter((photo) => photoUrl(photo));

    const teamMeta = isTeamMeta(meta);
    const normalizedMeta = normalize(metaName(meta));
    const relatedTeam = team.filter((person) => {
      const role = normalize(person.cargo || person.funcao || person.meta_nome || person.rubrica_nome);
      return role && (normalizedMeta.includes(role) || role.includes(normalizedMeta.split(' ')[0]));
    });
    const expected = expectedQuantity(meta);
    const performed = relatedActivities.length;
    let percentage = Number(meta.percentual_execucao);

    if (teamMeta && relatedTeam.length > 0) percentage = 100;
    else if (expected > 0) percentage = Math.min(100, Math.round((performed / expected) * 1000) / 10);
    else if (!Number.isFinite(percentage)) percentage = performed > 0 ? 100 : 0;

    const status = percentage >= 100
      ? 'Realizada integralmente'
      : percentage > 0
        ? `Realizada parcialmente — ${percentage}%`
        : 'Não realizada';

    const actionsFromActivities = relatedActivities
      .map((activity) => text(activity.titulo || activity.nome_acao || activity.nome || activity.descricao))
      .filter(Boolean);
    const actions = actionsFromActivities.length
      ? [...new Set(actionsFromActivities)].join('; ')
      : plannedActions(meta) || (teamMeta ? 'Contratar, mobilizar e acompanhar a equipe prevista no plano de trabalho.' : 'Executar as ações previstas para o cumprimento da meta.');

    const achieved = teamMeta && relatedTeam.length > 0
      ? 'A equipe prevista foi contratada e mobilizada, garantindo a gestão do projeto e a implementação das ações no período.'
      : performed > 0
        ? `${performed} atividade(s) foram realizadas. Os registros dos relatórios de atividades, Agenda e dashboard indicam cumprimento dos objetivos de formação, acesso e fruição cultural associados à meta.`
        : 'Não foram localizados registros físicos suficientes para confirmar resultado alcançado no período.';

    const justificativa = percentage >= 100
      ? 'A execução ocorreu conforme os cronogramas acordados e acompanhados pela OSC, pela Diretoria de Museus e pelas coordenações dos equipamentos culturais.'
      : percentage > 0
        ? 'A meta permanece em execução, conforme cronogramas acordados entre a OSC, a Diretoria de Museus e as coordenações. As ações pendentes serão concluídas dentro da vigência pactuada.'
        : 'Não foram localizadas evidências suficientes no recorte selecionado. É necessária revisão dos vínculos de Agenda, relatórios de atividades e galeria antes da exportação.';

    return {
      ...meta,
      meta_nome: metaName(meta),
      resultado_esperado: expectedResult(meta, teamMeta),
      acoes: actions,
      periodo: text(meta.periodo_execucao || meta.periodo_previsto) || projectPeriod,
      documentos_verificacao: relatedPhotos.map((photo, index) => ({
        tipo: 'fotografia',
        titulo: text(photo.atividade_nome || photo.legenda || photo.titulo) || `Registro fotográfico ${index + 1}`,
        url: photoUrl(photo),
        atividade_id: text(photo.activity_id || photo.atividade_id),
      })),
      fotos_verificacao: relatedPhotos,
      resultado_alcancado: achieved,
      percentual_execucao: percentage,
      status_meta: status,
      justificativa,
      metodologia_complementar: 'A análise considera metas vinculadas às solicitações de Compras, atividades e relatórios cadastrados, Agenda, dashboard de público e fotografias vinculadas às atividades.',
      editavel: true,
    };
  });
}

function cellText(value) {
  if (Array.isArray(value)) {
    if (!value.length) return 'Sem documento vinculado';
    return value.map((item) => text(item?.titulo || item?.nome || item)).filter(Boolean).join('; ');
  }
  return text(value) || '—';
}

function buildTable(rows) {
  const wrapper = document.createElement('div');
  wrapper.dataset.cronogramaOficial = 'true';
  wrapper.className = 'overflow-x-auto rounded-lg border';
  const table = document.createElement('table');
  table.className = 'min-w-[1500px] w-full border-collapse text-xs';
  const labels = ['1) Metas', '2) Resultados esperados', '3) Ações', '4) Período de execução', '5) Documentos para verificação', '6) Resultados alcançados', '7) Status de execução da ação', '8) Justificativa'];
  const keys = ['meta_nome', 'resultado_esperado', 'acoes', 'periodo', 'documentos_verificacao', 'resultado_alcancado', 'status_meta', 'justificativa'];
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
    if (!normalize(heading.textContent).includes('7. cronograma')) return;
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
        const context = {
          activities: payload._atividades_periodo || payload._agenda_periodo || current?._atividades_periodo || current?._agenda_periodo || [],
          photos: payload.anexos_evidencias || payload.anexos_fotograficos || current?.anexos_evidencias || current?.anexos_fotograficos || [],
          team: payload._equipe_real || payload.equipe_trabalho || current?._equipe_real || current?.equipe_trabalho || [],
          start: payload.data_inicio || current?.data_inicio,
          end: payload.data_fim || current?.data_fim,
        };
        payload = { ...payload, cronograma_metas: enrichSchedule(payload.cronograma_metas, context) };
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
