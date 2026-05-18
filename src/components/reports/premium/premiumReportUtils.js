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
    .replace(/[—–]/g, ',')
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
    .replace(/[—–]/g, ',')
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

export function monthLabel(value) {
  const raw = cleanText(value);
  if (!raw) return '';

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^./, (c) => c.toUpperCase());
  }

  return raw;
}

export function cleanFileName(value = '') {
  const raw = String(value || '').split(/[\\/]/).pop().split('?')[0] || '';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {}

  return cleanText(decoded)
    .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
    .replace(/^whatsapp image \d{4}-\d{2}-\d{2} at [\d.]+/i, 'Registro fotográfico')
    .replace(/[_-]+/g, ' ') || 'Registro fotográfico';
}

export function getPhotoCredit(foto = {}) {
  return pickText(
    foto.credito,
    foto.creditos,
    foto.credit,
    foto.credits,
    foto.foto_credito,
    foto.credito_foto,
    foto.creditos_foto,
    foto.fotografo,
    foto.fotografa,
    foto.photographer,
    foto.autor_foto,
    foto.autoria,
    foto.author_name,
    foto.uploaded_by_name
  );
}

export function getPhotoLocation(foto = {}) {
  const nested = foto.localizacao || foto.location || foto.geolocation || {};
  const latitude = pickText(
    foto.latitude,
    foto.lat,
    foto.gps_latitude,
    foto.gps_lat,
    nested.latitude,
    nested.lat
  );
  const longitude = pickText(
    foto.longitude,
    foto.lng,
    foto.lon,
    foto.gps_longitude,
    foto.gps_lng,
    foto.gps_lon,
    nested.longitude,
    nested.lng,
    nested.lon
  );
  const endereco = pickText(
    foto.endereco,
    foto.address,
    foto.localizacao_texto,
    foto.location_name,
    foto.local,
    nested.endereco,
    nested.address,
    nested.label
  );

  const hasCoordinates = latitude && longitude;

  return {
    latitude,
    longitude,
    endereco,
    label: hasCoordinates ? `${latitude}, ${longitude}` : endereco,
    mapUrl: hasCoordinates ? `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}` : '',
  };
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

export function getActivityMeta(activity = {}) {
  return pickText(
    activity.meta,
    activity.meta_relacionada,
    activity.codigo_meta,
    activity.classificacao,
    activity.categoria_label,
    activity.tipo_acao
  );
}

export function getActivityPublico(activity = {}) {
  const n = toNumber(activity.publico ?? activity.publico_total ?? activity.publico_estimado);
  return n > 0 ? n : 0;
}

export function getMuseuLabel(value) {
  const text = normalizeText(value);
  if (text.includes('mhab') || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem') || text.includes('som')) return 'MIS';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';
  if (text.includes('noturno')) return 'Noturno nos Museus';
  return value || 'Atuação geral';
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
    ].map((foto) => ({
      ...foto,
      atividade: getActivityTitle(atividade),
      mes: atividade?.mes || monthLabel(getActivityDate(atividade)),
      museu: atividade?.museu || foto?.museu,
      meta: getActivityMeta(atividade),
    })));
  const fromReports = (Array.isArray(contexto.relatorios_equipe) ? contexto.relatorios_equipe : [])
    .flatMap((report) => Array.isArray(report.fotos) ? report.fotos.map((foto) => ({
      ...foto,
      mes: report?.mes,
      museu: report?.museu || foto?.museu,
    })) : []);

  return uniqueBy([...fromContext, ...fromActivities, ...fromReports], (foto) => foto?.url || foto?.file_url || foto?.src)
    .map((foto) => {
      const url = foto?.url || foto?.file_url || foto?.src || foto?.arquivo_url || '';
      return {
        url,
        legenda: pickText(foto?.legenda, foto?.caption, foto?.descricao, foto?.nome, 'Registro visual do projeto Museus Centro.'),
        museu: getMuseuLabel(foto?.museu || foto?.equipamento || foto?.origem || ''),
        credito: getPhotoCredit(foto),
        localizacao: getPhotoLocation(foto),
        atividade: pickText(foto?.atividade, foto?.atividade_nome, foto?.titulo),
        mes: monthLabel(foto?.mes || foto?.data || foto?.created_date),
        meta: pickText(foto?.meta, foto?.meta_relacionada),
        fileName: cleanFileName(foto?.fileName || foto?.file_name || foto?.name || url),
        link: url,
      };
    })
    .filter((foto) => /^https?:\/\//.test(foto.url) || foto.url.startsWith('/'))
    .slice(0, limit);
}

export function groupByMuseu(atividades = []) {
  const base = { MHAB: [], MIS: [], MUMO: [], 'Atuação geral': [] };
  atividades.forEach((atividade) => {
    const museu = getMuseuLabel(atividade?.museu || atividade?.equipamento);
    const key = base[museu] ? museu : 'Atuação geral';
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
      titulo: pickText(item.titulo, item.nome_acao, 'Programação registrada'),
      museu: getMuseuLabel(item.museu || item.equipamento),
      tipo: pickText(item.tipo, item.tipo_atividade, item.status, 'Programação'),
      texto: pickText(item.sinopse, item.descricao),
      publico: getActivityPublico(item),
      meta: getActivityMeta(item),
    })),
    ...atividades.map((item) => ({
      data: getActivityDate(item),
      titulo: getActivityTitle(item),
      museu: getMuseuLabel(item.museu),
      tipo: pickText(item.classificacao, item.categoria_label, 'Atividade'),
      texto: getActivityText(item),
      publico: getActivityPublico(item),
      meta: getActivityMeta(item),
    })),
  ], (item) => `${normalizeText(item.data)}::${normalizeText(item.titulo)}`)
    .filter((item) => item.titulo)
    .slice(0, 40);
}

export function buildMetrics(contexto = {}) {
  const total = toNumber(contexto.valor_utilizado) + toNumber(contexto.saldo);
  return [
    { label: 'Relatórios aprovados', value: fmtInt(contexto.total_relatorios), detail: 'base narrativa consolidada' },
    { label: 'Atividades', value: fmtInt(contexto.total_atividades), detail: 'ações registradas no app' },
    { label: 'Público', value: fmtInt(contexto.publico_total), detail: 'somente atividades com público' },
    { label: 'Programação', value: fmtInt(contexto.programacao_total), detail: 'agenda recuperada' },
    { label: 'Equipe', value: fmtInt(contexto.equipe_total), detail: 'profissionais com relatório' },
    { label: 'Execução', value: `${toNumber(contexto.percentual_execucao).toFixed(1).replace('.', ',')}%`, detail: fmtBRL(total || 1320000) },
  ];
}
