export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function fmtInt(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
}

export function fmtBRL(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function splitParagraphs(value, limit = 6) {
  const seen = new Set();
  const paragraphs = String(value || '')
    .split(/\n{2,}|(?<=\.)\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/)
    .map(cleanText)
    .filter((item) => item.length > 70)
    .filter((item) => {
      const key = normalizeText(item).slice(0, 180);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return paragraphs.slice(0, limit);
}

export function pickText(...values) {
  return values.map(cleanText).find((item) => item.length > 0) || '';
}

export function getActivityTitle(activity = {}) {
  return pickText(
    activity.nome,
    activity.titulo,
    activity.nome_acao,
    activity.atividade,
    activity.descricao?.slice?.(0, 90)
  ) || 'Atividade registrada';
}

export function getActivityText(activity = {}) {
  return pickText(
    activity.descricao,
    activity.resumo,
    activity.sinopse_agenda,
    activity.observacoes,
    activity.comentarios
  );
}

export function getActivityDate(activity = {}) {
  return pickText(activity.data, activity.data_inicio, activity.data_realizacao, activity.mes);
}

export function getMuseuLabel(value) {
  const text = normalizeText(value);
  if (text.includes('mhab') || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem') || text.includes('som')) return 'MIS';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';
  if (text.includes('noturno')) return 'Noturno nos Museus';
  return value || 'Atuacao geral';
}

export function uniqueBy(items = [], keyFn = (item) => item?.id || item?.url || JSON.stringify(item)) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractPhotos(contexto = {}, limit = 36) {
  const fromContext = Array.isArray(contexto.fotos) ? contexto.fotos : [];
  const fromActivities = (Array.isArray(contexto.atividades) ? contexto.atividades : [])
    .flatMap((atividade) => [
      ...(Array.isArray(atividade.fotos_destaque) ? atividade.fotos_destaque : []),
      ...(Array.isArray(atividade.fotos) ? atividade.fotos : []),
    ]);
  const fromReports = (Array.isArray(contexto.relatorios_equipe) ? contexto.relatorios_equipe : [])
    .flatMap((report) => Array.isArray(report.fotos) ? report.fotos : []);

  return uniqueBy([...fromContext, ...fromActivities, ...fromReports], (foto) => foto?.url || foto?.file_url || foto?.src)
    .map((foto) => ({
      url: foto?.url || foto?.file_url || foto?.src || foto?.arquivo_url || '',
      legenda: pickText(foto?.legenda, foto?.caption, foto?.descricao, foto?.nome, 'Registro visual do projeto Museus Centro.'),
      museu: getMuseuLabel(foto?.museu || foto?.equipamento || foto?.origem || ''),
      credito: pickText(foto?.credito, foto?.creditos, foto?.author_name),
    }))
    .filter((foto) => /^https?:\/\//.test(foto.url) || foto.url.startsWith('/'))
    .slice(0, limit);
}

export function groupByMuseu(atividades = []) {
  const base = { MHAB: [], MIS: [], MUMO: [], 'Atuacao geral': [] };
  atividades.forEach((atividade) => {
    const museu = getMuseuLabel(atividade?.museu || atividade?.equipamento);
    const key = base[museu] ? museu : 'Atuacao geral';
    base[key].push(atividade);
  });
  return base;
}

export function buildTimelineItems(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  const programacao = Array.isArray(contexto.programacao) ? contexto.programacao : [];

  return uniqueBy([
    ...programacao.map((item) => ({
      data: pickText(item.data, item.data_inicio),
      titulo: pickText(item.titulo, item.nome_acao, 'Programacao registrada'),
      museu: getMuseuLabel(item.museu || item.equipamento),
      tipo: pickText(item.tipo, item.tipo_atividade, item.status, 'Programacao'),
      texto: pickText(item.sinopse, item.descricao),
    })),
    ...atividades.map((item) => ({
      data: getActivityDate(item),
      titulo: getActivityTitle(item),
      museu: getMuseuLabel(item.museu),
      tipo: pickText(item.classificacao, item.categoria_label, 'Atividade'),
      texto: getActivityText(item),
    })),
  ], (item) => `${normalizeText(item.data)}::${normalizeText(item.titulo)}`)
    .filter((item) => item.titulo)
    .slice(0, 28);
}

export function buildMetrics(contexto = {}) {
  const total = toNumber(contexto.valor_utilizado) + toNumber(contexto.saldo);
  return [
    { label: 'Relatorios aprovados', value: fmtInt(contexto.total_relatorios), detail: 'base narrativa consolidada' },
    { label: 'Atividades', value: fmtInt(contexto.total_atividades), detail: 'acoes registradas no app' },
    { label: 'Publico', value: fmtInt(contexto.publico_total), detail: 'somente atividades com publico' },
    { label: 'Programacao', value: fmtInt(contexto.programacao_total), detail: 'agenda recuperada' },
    { label: 'Equipe', value: fmtInt(contexto.equipe_total), detail: 'profissionais com relatorio' },
    { label: 'Execucao', value: `${toNumber(contexto.percentual_execucao).toFixed(1).replace('.', ',')}%`, detail: fmtBRL(total || 1320000) },
  ];
}
