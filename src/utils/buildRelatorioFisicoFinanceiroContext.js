import { consolidateMetrics } from '@/utils/auditoria/consolidateMetrics';

const TOTAL_OFICIAL = 1320000;

const MESES_ALVO = ['Fevereiro', 'Março', 'Abril'];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(value) {
  return Math.round(toNumber(value));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMuseu(value) {
  const raw = String(value || '').toUpperCase();

  if (raw.includes('MHAB') || raw.includes('ABILIO') || raw.includes('ABÍLIO')) return 'MHAB';
  if (raw.includes('MIS') || raw.includes('IMAGEM E SOM')) return 'MIS';
  if (raw.includes('MUMO') || raw.includes('MODA')) return 'MUMO';

  return value || 'Atuação Geral';
}

function isApprovedReport(report) {
  const status = String(report?.status || '').trim().toUpperCase();

  return [
    'APPROVED',
    'APROVADO',
    'APROVADO_COORD',
    'APROVADO_ADMIN',
    'APROVADO_COORDENACAO',
    'SUBMITTED',
    'ENVIADO',
  ].includes(status);
}

function parseDate(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const br = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateInRange(value, from, to) {
  const d = parseDate(value);
  if (!d) return false;

  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  return d >= start && d <= end;
}

function mesFromDate(value) {
  const d = parseDate(value);
  if (!d) return '';

  const meses = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  return meses[d.getMonth()];
}

function reportMes(report) {
  return (
    report?.mes_referencia ||
    report?.mes ||
    mesFromDate(report?.data_referencia || report?.created_date || report?.updated_date) ||
    ''
  );
}

function getActivityDate(activity, report, agendaItem) {
  return (
    activity?.data_inicio ||
    activity?.data_realizacao ||
    activity?.data_programacao ||
    activity?.data ||
    agendaItem?.data_inicio ||
    agendaItem?.data_realizacao ||
    report?.data_referencia ||
    report?.created_date ||
    report?.updated_date
  );
}

function getActivityDescription(activity) {
  return (
    activity?.descricao ||
    activity?.descricao_atividade ||
    activity?.resumo ||
    activity?.resultado ||
    activity?.resultados ||
    activity?.observacoes ||
    activity?.comentarios ||
    activity?.avaliacao ||
    activity?.impacto ||
    activity?.relato ||
    ''
  );
}

function extractReportTexts(report) {
  const fields = [
    report?.resumo_periodo,
    report?.resumo_executivo,
    report?.avaliacao_pontos_positivos,
    report?.avaliacao_desafios,
    report?.avaliacao_sugestoes,
    report?.comentarios_gerais,
    report?.comentarios_coordenacao,
    report?.historico_observacoes,
    report?.oportunidades_resumo,
  ];

  return fields
    .map((v) => String(v || '').trim())
    .filter((v) => v.length > 20);
}

function detectarCategoriaEditorial(activity = {}, report = {}) {
  const txt = normalizeText([
    activity?.nome,
    activity?.titulo,
    activity?.classificacao,
    activity?.equipe,
    activity?.tipo,
    activity?.categoria,
    activity?.descricao,
    report?.equipe,
    report?.museu,
  ].join(' '));

  if (
    txt.includes('reuniao') ||
    txt.includes('reunião') ||
    txt.includes('alinhamento') ||
    txt.includes('ritual de gestao') ||
    txt.includes('ritual de gestão') ||
    txt.includes('programacao') ||
    txt.includes('programação') ||
    txt.includes('fechamento de relatorio') ||
    txt.includes('fechamento de relatório') ||
    txt.includes('relatorio') ||
    txt.includes('relatório') ||
    txt.includes('demus') ||
    txt.includes('dmus') ||
    txt.includes('dipc') ||
    txt.includes('fmc') ||
    txt.includes('aditivo') ||
    txt.includes('prestacao') ||
    txt.includes('prestação') ||
    txt.includes('coordena')
  ) {
    return 'gestao_governanca';
  }

  if (
    txt.includes('manutencao') ||
    txt.includes('manutenção') ||
    txt.includes('limpeza') ||
    txt.includes('visita tecnica') ||
    txt.includes('visita técnica') ||
    txt.includes('vistoria') ||
    txt.includes('montagem') ||
    txt.includes('desmontagem') ||
    txt.includes('producao') ||
    txt.includes('produção') ||
    txt.includes('fornecedor') ||
    txt.includes('logistica') ||
    txt.includes('logística') ||
    txt.includes('equipamento') ||
    txt.includes('exposicao') ||
    txt.includes('exposição')
  ) {
    return 'producao_operacao';
  }

  if (
    txt.includes('comunicacao') ||
    txt.includes('comunicação') ||
    txt.includes('card') ||
    txt.includes('release') ||
    txt.includes('rede social') ||
    txt.includes('redes sociais') ||
    txt.includes('instagram') ||
    txt.includes('foto') ||
    txt.includes('video') ||
    txt.includes('vídeo') ||
    txt.includes('imprensa') ||
    txt.includes('identidade visual') ||
    txt.includes('designer')
  ) {
    return 'comunicacao_produtos';
  }

  if (
    txt.includes('samba aula') ||
    txt.includes('samba') ||
    txt.includes('oficina') ||
    txt.includes('visita mediada') ||
    txt.includes('visitas mediadas') ||
    txt.includes('visita guiada') ||
    txt.includes('museu criativo') ||
    txt.includes('educativo aberto') ||
    txt.includes('atividade educativa') ||
    txt.includes('acao educativa') ||
    txt.includes('ação educativa') ||
    txt.includes('roda de conversa') ||
    txt.includes('palestra') ||
    txt.includes('simposio') ||
    txt.includes('simpósio') ||
    txt.includes('espetaculo') ||
    txt.includes('espetáculo') ||
    txt.includes('apresentacao') ||
    txt.includes('apresentação')
  ) {
    return 'atividade_publico';
  }

  return 'gestao_governanca';
}

function getActivityPublico(activity, categoria) {
  if (categoria !== 'atividade_publico') return null;

  const n = inteiro(
    activity?.publico_total ??
    activity?.publico_estimado ??
    activity?.publico ??
    0
  );

  return n > 0 ? n : null;
}

function isImageAttachment(attachment) {
  const mime = String(attachment?.mime_type || attachment?.type || '').toLowerCase();
  const name = String(
    attachment?.file_name ||
    attachment?.name ||
    attachment?.url ||
    attachment?.file_url ||
    attachment?.arquivo_url ||
    ''
  ).toLowerCase();

  return mime.includes('image') || /\.(jpg|jpeg|png|webp)$/i.test(name);
}

function attachmentUrl(attachment) {
  return (
    attachment?.url ||
    attachment?.file_url ||
    attachment?.arquivo_url ||
    attachment?.download_url ||
    attachment?.public_url ||
    ''
  );
}

function photoCredit(source) {
  return (
    source?.credito ||
    source?.creditos ||
    source?.credit ||
    source?.credits ||
    source?.foto_credito ||
    source?.credito_foto ||
    source?.creditos_foto ||
    source?.fotografo ||
    source?.fotografa ||
    source?.photographer ||
    source?.autor_foto ||
    source?.autoria ||
    source?.author_name ||
    source?.uploaded_by_name ||
    ''
  );
}

function photoLocation(source, fallback = {}) {
  const latitude = (
    source?.latitude ??
    source?.lat ??
    source?.gps_latitude ??
    source?.gps_lat ??
    source?.location?.latitude ??
    source?.location?.lat ??
    source?.geolocation?.latitude ??
    source?.geolocation?.lat ??
    fallback?.latitude ??
    fallback?.lat ??
    ''
  );
  const longitude = (
    source?.longitude ??
    source?.lng ??
    source?.lon ??
    source?.gps_longitude ??
    source?.gps_lng ??
    source?.gps_lon ??
    source?.location?.longitude ??
    source?.location?.lng ??
    source?.location?.lon ??
    source?.geolocation?.longitude ??
    source?.geolocation?.lng ??
    source?.geolocation?.lon ??
    fallback?.longitude ??
    fallback?.lng ??
    fallback?.lon ??
    ''
  );
  const endereco = (
    source?.endereco ||
    source?.address ||
    source?.localizacao ||
    source?.location_name ||
    source?.local ||
    fallback?.local ||
    fallback?.endereco ||
    ''
  );

  return { latitude, longitude, endereco };
}

function attachmentText(attachment) {
  return normalizeText([
    attachment?.id,
    attachment?.report_id,
    attachment?.activity_id,
    attachment?.atividade_id,
    attachment?.atividade_nome,
    attachment?.titulo,
    attachment?.caption,
    attachment?.legenda,
    attachment?.file_name,
    attachment?.name,
    attachment?.descricao,
  ].filter(Boolean).join(' '));
}

function getReportPhotos(report) {
  const fotos = [];

  (Array.isArray(report?.fotos) ? report.fotos : []).forEach((foto) => {
    const url = foto?.url || foto?.file_url || foto?.arquivo_url || '';
    if (!url) return;

    fotos.push({
      url,
      caption: foto?.caption || foto?.legenda || foto?.descricao || '',
      credito: photoCredit(foto),
      localizacao: photoLocation(foto, report),
      fileName: foto?.fileName || foto?.file_name || foto?.name || 'Foto',
      origem: 'report.fotos',
    });
  });

  (Array.isArray(report?.attachments) ? report.attachments : []).forEach((att) => {
    if (!isImageAttachment(att)) return;

    const url = attachmentUrl(att);
    if (!url) return;

    fotos.push({
      url,
      caption: att?.caption || att?.legenda || att?.descricao || '',
      credito: photoCredit(att),
      localizacao: photoLocation(att, report),
      fileName: att?.file_name || att?.name || 'Foto',
      origem: 'report.attachments',
    });
  });

  return fotos;
}

function matchAgenda(activity, report, programacaoRaw) {
  const title = normalizeText(activity?.nome || activity?.titulo || activity?.nome_atividade || '');
  const museu = normalizeMuseu(report?.museu || activity?.museu);

  if (!title) return null;

  const candidatos = Array.isArray(programacaoRaw) ? programacaoRaw : [];

  let best = null;
  let bestScore = 0;

  candidatos.forEach((item) => {
    const itemTitle = normalizeText(item?.titulo || item?.nome || item?.atividade || '');
    const itemMuseu = normalizeMuseu(item?.museu || item?.equipamento || item?.local);
    let score = 0;

    if (itemTitle && (itemTitle.includes(title) || title.includes(itemTitle))) score += 50;
    title.split(' ').filter((w) => w.length > 3).forEach((w) => {
      if (itemTitle.includes(w)) score += 5;
    });
    if (museu && itemMuseu && museu === itemMuseu) score += 10;

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  });

  return bestScore >= 20 ? best : null;
}

function matchFotosAtividade(activity, report, attachmentsRaw, activityIndex) {
  const activityName = activity?.nome || activity?.titulo || activity?.nome_atividade || '';
  const activityId = activity?.id || activity?._id || activity?.activity_id || '';
  const activityNameNorm = normalizeText(activityName);
  const fotos = [];

  (Array.isArray(activity?.fotos) ? activity.fotos : []).forEach((foto) => {
    const url = foto?.url || foto?.file_url || foto?.arquivo_url || '';
    if (!url) return;

    fotos.push({
      url,
      caption: foto?.caption || foto?.legenda || foto?.descricao || activityName,
      credito: photoCredit(foto),
      localizacao: photoLocation(foto, activity),
      fileName: foto?.fileName || foto?.file_name || foto?.name || 'Foto',
      origem: 'activity.fotos',
    });
  });

  (Array.isArray(activity?.attachments) ? activity.attachments : []).forEach((att) => {
    if (!isImageAttachment(att)) return;

    const url = attachmentUrl(att);
    if (!url) return;

    fotos.push({
      url,
      caption: att?.caption || att?.legenda || att?.descricao || activityName,
      credito: photoCredit(att),
      localizacao: photoLocation(att, activity),
      fileName: att?.file_name || att?.name || 'Foto',
      origem: 'activity.attachments',
    });
  });

  (Array.isArray(attachmentsRaw) ? attachmentsRaw : []).forEach((att) => {
    if (!isImageAttachment(att)) return;

    const url = attachmentUrl(att);
    if (!url) return;

    const text = attachmentText(att);
    const matchesActivityId = activityId && (
      String(att?.activity_id || '') === String(activityId) ||
      String(att?.atividade_id || '') === String(activityId)
    );
    const matchesName = activityNameNorm && text.includes(activityNameNorm);

    if (!matchesActivityId && !matchesName) return;

    fotos.push({
      url,
      caption: att?.caption || att?.legenda || att?.descricao || activityName,
      credito: photoCredit(att),
      localizacao: photoLocation(att, activity),
      fileName: att?.file_name || att?.name || 'Foto',
      origem: 'Attachment',
    });
  });

  const seen = new Set();
  return fotos.filter((foto) => {
    if (!foto.url || seen.has(foto.url)) return false;
    seen.add(foto.url);
    return true;
  });
}

function getCompraValor(compra) {
  return toNumber(
    compra?.valor_total ??
    compra?.valor ??
    compra?.amount ??
    compra?.nf_valor_total ??
    0
  );
}

function groupAtividades(atividades) {
  return atividades.reduce((acc, atividade) => {
    const key = atividade.categoria_editorial || 'gestao_governanca';
    if (!acc[key]) acc[key] = [];
    acc[key].push(atividade);
    return acc;
  }, {});
}

function buildTrechosRelatorios(reports) {
  return reports.flatMap((report) => {
    const mes = reportMes(report);
    const museu = normalizeMuseu(report?.museu);
    return extractReportTexts(report).map((texto) => ({
      mes,
      museu,
      texto,
      autor: report?.author_name || '',
      report_id: report?.id || '',
    }));
  });
}

function conhecimentoTextos(conhecimentoRaw) {
  return (Array.isArray(conhecimentoRaw) ? conhecimentoRaw : [])
    .map((item) => ({
      titulo: item?.titulo || item?.title || item?.nome || '',
      texto: item?.conteudo || item?.content || item?.texto || item?.descricao || '',
    }))
    .filter((item) => item.titulo || item.texto)
    .slice(0, 80);
}

function getPublicoReport(report) {
  const direto = inteiro(
    report?.publico_geral_declarado ??
    report?.publico_total ??
    report?.publico ??
    0
  );

  if (direto > 0) return direto;

  return (Array.isArray(report?.atividades) ? report.atividades : [])
    .reduce((sum, atividade) => {
      const publicoAtividade = inteiro(
        atividade?.publico_total ??
        atividade?.publico_estimado ??
        atividade?.publico ??
        0
      );

      if (publicoAtividade > 0) return sum + publicoAtividade;

      const medio = inteiro(
        atividade?.publico_medio_por_sessao ??
        atividade?.publico_medio ??
        0
      );

      const vezes = Math.max(
        1,
        inteiro(
          atividade?.quantas_vezes_ocorreu ??
          atividade?.ocorrencias ??
          1
        )
      );

      return sum + (medio * vezes);
    }, 0);
}

function getPublicoEspontaneoReport(report) {
  return inteiro(
    report?.publico_espontaneo ??
    report?.publico_livre ??
    report?.publico_geral_declarado ??
    0
  );
}

function getVisitasAgendadasReport(report) {
  const direto = inteiro(
    report?.visitas_agendadas ??
    report?.publico_visitas_agendadas ??
    report?.publico_agendado ??
    report?.publico_escolar ??
    0
  );

  if (direto > 0) return direto;

  return (Array.isArray(report?.atividades) ? report.atividades : []).reduce((sum, atividade) => {
    const text = normalizeText([
      atividade?.nome,
      atividade?.titulo,
      atividade?.classificacao,
      atividade?.tipo,
      atividade?.descricao,
    ].join(' '));

    const isAgendada = text.includes('agendada') ||
      text.includes('agendado') ||
      text.includes('escola') ||
      text.includes('grupo') ||
      text.includes('visita mediada');

    if (!isAgendada) return sum;

    return sum + inteiro(
      atividade?.publico_total ??
      atividade?.publico_estimado ??
      atividade?.publico ??
      atividade?.participantes ??
      0
    );
  }, 0);
}

function getRubricaValorPrevisto(rubrica) {
  return toNumber(
    rubrica?.valor_total ??
    rubrica?.valor_previsto ??
    rubrica?.valor_orcado ??
    rubrica?.valor_original ??
    rubrica?.valor ??
    0
  );
}

function buildProgramacaoDetalhada(programacaoRaw, dateFrom, dateTo, museuFiltro) {
  return (Array.isArray(programacaoRaw) ? programacaoRaw : [])
    .map((item) => {
      const data =
        item?.data_inicio ||
        item?.data_realizacao ||
        item?.data ||
        item?.created_date ||
        item?.updated_date ||
        '';

      return {
        id: item?.id || item?._id || `${item?.titulo || item?.nome || 'programacao'}-${data}`,
        data,
        museu: normalizeMuseu(item?.museu || item?.equipamento || item?.local),
        titulo: item?.titulo || item?.nome || item?.atividade || 'Programação sem título',
        tipo: item?.tipo || item?.categoria || item?.classificacao || item?.formato || '',
        local: item?.local || item?.espaco || item?.equipamento || '',
        sinopse: item?.sinopse || item?.descricao || item?.resumo || '',
        status: item?.status || '',
      };
    })
    .filter((item) => !museuFiltro || normalizeMuseu(item.museu) === museuFiltro)
    .filter((item) => !item.data || dateInRange(item.data, dateFrom, dateTo))
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
}

function buildRubricasDetalhadas(rubricasRaw) {
  return (Array.isArray(rubricasRaw) ? rubricasRaw : [])
    .filter((r) => r?.ativo !== false)
    .map((rubrica) => {
      const previsto = getRubricaValorPrevisto(rubrica);
      const utilizado = toNumber(
        rubrica?.valor_utilizado ??
        rubrica?.valor_executado ??
        rubrica?.utilizado ??
        0
      );
      const saldo = Number.isFinite(Number(rubrica?.saldo))
        ? toNumber(rubrica?.saldo)
        : previsto - utilizado;

      return {
        id: rubrica?.id || rubrica?._id || rubrica?.codigo || rubrica?.nome,
        codigo: rubrica?.codigo || rubrica?.item || '',
        nome: rubrica?.nome || rubrica?.rubrica || rubrica?.descricao || 'Rubrica',
        grupo: rubrica?.grupo || rubrica?.categoria || rubrica?.eixo || '',
        previsto,
        utilizado,
        saldo,
        percentual: previsto > 0 ? Number(((utilizado / previsto) * 100).toFixed(1)) : 0,
        status: rubrica?.status || '',
      };
    })
    .sort((a, b) => b.previsto - a.previsto);
}

function normalizeRubricaLabel(value) {
  return normalizeText(String(value || ''));
}

function inferMuseuFromText(value) {
  const t = normalizeRubricaLabel(value);
  if (!t) return 'SEM_CENTRO';
  if (t.includes('noturno')) return 'NOTURNO';
  if (t.includes('mhab') || t.includes('abilio')) return 'MHAB';
  if (t.includes('mis')) return 'MIS';
  if (t.includes('mumo') || t.includes('moda')) return 'MUMO';
  if (t.includes('3 museus') || t.includes('tres museus') || t.includes('compartilh')) return 'COMPARTILHADAS';
  if (t.includes('atuacao geral') || t.includes('coordena') || t.includes('geral')) return 'ATUACAO_GERAL';
  return 'SEM_CENTRO';
}

function getImageIdentity(item = {}) {
  return item?.id || item?._id || item?.attachment_id || item?.file_id || item?.url || item?.file_url || item?.arquivo_url || '';
}

function mapImageRecord(item = {}, source = 'Attachment') {
  const url = attachmentUrl(item);
  if (!url || !isImageAttachment(item)) return null;
  return {
    id: String(getImageIdentity(item) || url),
    url,
    source,
    museu: normalizeMuseu(item?.museu || item?.centro_custo || item?.local || item?.equipamento || ''),
    data: item?.data || item?.created_date || item?.updated_date || '',
    legenda: item?.legenda || item?.caption || item?.descricao || '',
    credito: photoCredit(item),
    localizacao: photoLocation(item),
    origem: source,
    raw: item,
  };
}

function diffDays(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 9999;
  return Math.abs(Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24)));
}

function normalizeIdentityText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDateToDay(value = '') {
  const d = parseDate(value);
  return d ? d.toISOString().slice(0, 10) : '';
}

function activityImageSetSignature(atividade = {}) {
  const photos = Array.isArray(atividade?.fotos) ? atividade.fotos : [];
  const keys = photos
    .map((photo) => String(getImageIdentity(photo) || attachmentUrl(photo)))
    .filter(Boolean)
    .sort();
  if (keys.length === 0) return '';
  return keys.join('|');
}

function mergeActivityRecords(base = {}, candidate = {}) {
  const pickLonger = (a, b) => (String(b || '').length > String(a || '').length ? b : a);
  const safeNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

  const basePublico = safeNumber(base?.publico);
  const candidatePublico = safeNumber(candidate?.publico);
  const mergedPublico = basePublico && candidatePublico
    ? (basePublico === candidatePublico ? basePublico : Math.max(basePublico, candidatePublico))
    : (basePublico || candidatePublico || null);

  const fotos = [
    ...(Array.isArray(base?.fotos) ? base.fotos : []),
    ...(Array.isArray(candidate?.fotos) ? candidate.fotos : []),
  ].filter(Boolean);

  const dedupFotos = [];
  const seen = new Set();
  fotos.forEach((photo) => {
    const key = String(getImageIdentity(photo) || attachmentUrl(photo));
    if (!key || seen.has(key)) return;
    seen.add(key);
    dedupFotos.push(photo);
  });

  return {
    ...base,
    nome: pickLonger(base?.nome, candidate?.nome),
    descricao: pickLonger(base?.descricao, candidate?.descricao),
    sinopse_agenda: pickLonger(base?.sinopse_agenda, candidate?.sinopse_agenda),
    local: pickLonger(base?.local, candidate?.local),
    publico: mergedPublico,
    publico_label: mergedPublico ? mergedPublico.toLocaleString('pt-BR') : 'N/A',
    fotos: dedupFotos,
    fotos_destaque: dedupFotos.slice(0, 4),
    fotos_demais: dedupFotos.slice(4),
    merged_from_activity_ids: [
      ...(Array.isArray(base?.merged_from_activity_ids) ? base.merged_from_activity_ids : [base?.id].filter(Boolean)),
      ...(Array.isArray(candidate?.merged_from_activity_ids) ? candidate.merged_from_activity_ids : [candidate?.id].filter(Boolean)),
    ],
  };
}

function mergeDuplicateActivitiesByImages(atividades = []) {
  const groups = new Map();
  (Array.isArray(atividades) ? atividades : []).forEach((atividade) => {
    const signature = activityImageSetSignature(atividade);
    if (!signature) return;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(atividade);
  });

  const mergedActivities = [];
  const alerts = [];
  const output = [];
  const mergedSet = new Set();

  (Array.isArray(atividades) ? atividades : []).forEach((atividade) => {
    if (!atividade?.id || mergedSet.has(atividade.id)) return;
    const signature = activityImageSetSignature(atividade);
    const candidates = signature ? (groups.get(signature) || []) : [];

    if (candidates.length <= 1) {
      output.push(atividade);
      mergedSet.add(atividade.id);
      return;
    }

    const sameMuseumDay = candidates.every((item) =>
      normalizeMuseu(item?.museu) === normalizeMuseu(atividade?.museu) &&
      normalizeDateToDay(item?.data || '') === normalizeDateToDay(atividade?.data || '')
    );
    const sameTitleFamily = candidates.every((item) => {
      const a = normalizeIdentityText(item?.nome || item?.titulo || '');
      const b = normalizeIdentityText(atividade?.nome || atividade?.titulo || '');
      return a === b || a.includes(b) || b.includes(a);
    });

    if (!(sameMuseumDay && sameTitleFamily)) {
      output.push(atividade);
      mergedSet.add(atividade.id);
      candidates.forEach((c) => {
        if (c.id !== atividade.id) {
          alerts.push({
            type: 'imagem_compartilhada_entre_atividades_distintas',
            severity: 'media',
            recommendation: 'Revisar vínculo manualmente; atividades mantidas separadas.',
          });
        }
      });
      return;
    }

    let merged = atividade;
    candidates.forEach((candidate) => {
      if (candidate.id === merged.id) return;
      merged = mergeActivityRecords(merged, candidate);
      mergedSet.add(candidate.id);
    });
    mergedSet.add(atividade.id);
    output.push(merged);
    mergedActivities.push({
      finalActivityId: merged.id,
      originalActivityIds: candidates.map((item) => item.id).filter(Boolean),
      reason: 'Atividades tinham mesmo conjunto de imagens, data e museu.',
      mergedFields: ['titulo', 'descricao', 'publico', 'imagens'],
    });
  });

  return {
    atividades: output,
    mergedActivities,
    alerts,
  };
}

function allocateImagesToActivities(atividades = [], attachmentsRaw = [], galleryRaw = []) {
  const pool = [
    ...(Array.isArray(attachmentsRaw) ? attachmentsRaw : []).map((item) => mapImageRecord(item, 'Attachment')),
    ...(Array.isArray(galleryRaw) ? galleryRaw : []).map((item) => mapImageRecord(item, 'Gallery')),
  ].filter(Boolean);

  const used = new Set();
  const duplicatedImagesAvoided = [];
  const imageAllocation = [];
  const selectedByImage = new Map();
  const mergeResult = mergeDuplicateActivitiesByImages(atividades);
  const atividadesBase = Array.isArray(mergeResult?.atividades) ? mergeResult.atividades : [];

  const byMuseu = pool.reduce((acc, image) => {
    const key = image.museu || 'Atuação Geral';
    if (!acc[key]) acc[key] = [];
    acc[key].push(image);
    return acc;
  }, {});

  const enriched = (Array.isArray(atividadesBase) ? atividadesBase : []).map((atividade) => {
    const existing = Array.isArray(atividade?.fotos) ? atividade.fotos : [];
    const currentPhotos = [];

    existing.forEach((photo) => {
      const id = String(getImageIdentity(photo) || attachmentUrl(photo));
      const url = attachmentUrl(photo);
      if (!id || !url) return;
      if (used.has(id)) {
        duplicatedImagesAvoided.push({ imageId: id, reason: 'Imagem já alocada em atividade anterior.' });
        return;
      }
      used.add(id);
      currentPhotos.push(photo);
      imageAllocation.push({
        imageId: id,
        activityId: atividade.id || '',
        chapterId: 'atividades_museu',
        usage: 'activity',
        confidence: 0.99,
        reason: 'Vínculo direto em atividade.',
      });
    });

    if (currentPhotos.length >= 4) {
      return {
        ...atividade,
        fotos: currentPhotos,
        fotos_destaque: currentPhotos.slice(0, 4),
        fotos_demais: currentPhotos.slice(4),
      };
    }

    const museuKey = normalizeMuseu(atividade.museu);
    const candidates = [
      ...(byMuseu[museuKey] || []),
      ...(byMuseu['Atuação Geral'] || []),
    ].filter((image) => !used.has(image.id));

    candidates
      .sort((a, b) => diffDays(atividade.data, a.data) - diffDays(atividade.data, b.data))
      .slice(0, Math.max(0, 4 - currentPhotos.length))
      .forEach((image) => {
        if (used.has(image.id)) return;
        used.add(image.id);
        currentPhotos.push({
          id: image.id,
          url: image.url,
          legenda: image.legenda,
          credito: image.credito,
          atividade: atividade.nome,
          museu: atividade.museu,
          mes: atividade.mes,
          localizacao: image.localizacao,
          origem: image.origem,
        });
        imageAllocation.push({
          imageId: image.id,
          activityId: atividade.id || '',
          chapterId: 'atividades_museu',
          usage: 'activity',
          confidence: 0.72,
          reason: 'Vínculo por museu e proximidade temporal.',
        });
      });

    return {
      ...atividade,
      fotos: currentPhotos,
      fotos_destaque: currentPhotos.slice(0, 4),
      fotos_demais: currentPhotos.slice(4),
      galeria_links: currentPhotos.slice(4).map((foto) => foto.url).filter(Boolean),
    };
  });

  const unusedImages = pool.filter((image) => !used.has(image.id)).map((image) => ({
    imageId: image.id,
    url: image.url,
    museu: image.museu,
    reason: 'Sem vínculo suficiente com atividade.',
  }));

  return { atividades: enriched, imageAllocation, unusedImages, duplicatedImagesAvoided };
}

function allocateImagesToActivitiesV2(atividades = [], attachmentsRaw = [], galleryRaw = []) {
  const pool = [
    ...(Array.isArray(attachmentsRaw) ? attachmentsRaw : []).map((item) => mapImageRecord(item, 'Attachment')),
    ...(Array.isArray(galleryRaw) ? galleryRaw : []).map((item) => mapImageRecord(item, 'Gallery')),
  ].filter(Boolean);

  const usedImageIds = new Set();
  const selectedByImage = new Map();
  const imageAllocation = [];
  const duplicatedImagesAvoided = [];

  const mergeResult = mergeDuplicateActivitiesByImages(atividades);
  const workingActivities = Array.isArray(mergeResult?.atividades) ? mergeResult.atividades : [];

  const byMuseu = pool.reduce((acc, image) => {
    const key = image.museu || 'Atuação Geral';
    if (!acc[key]) acc[key] = [];
    acc[key].push(image);
    return acc;
  }, {});

  const enriched = workingActivities.map((atividade) => {
    const existing = Array.isArray(atividade?.fotos) ? atividade.fotos : [];
    const currentPhotos = [];

    existing.forEach((photo) => {
      const id = String(getImageIdentity(photo) || attachmentUrl(photo));
      const url = attachmentUrl(photo);
      if (!id || !url) return;
      if (usedImageIds.has(id)) {
        duplicatedImagesAvoided.push({
          imageId: id,
          attemptedActivityIds: [selectedByImage.get(id), atividade.id].filter(Boolean),
          selectedActivityId: selectedByImage.get(id) || '',
          reason: 'Imagem já utilizada na atividade com vínculo mais forte.',
        });
        return;
      }

      usedImageIds.add(id);
      selectedByImage.set(id, atividade.id || '');
      currentPhotos.push(photo);
      imageAllocation.push({
        imageId: id,
        imageUrl: url,
        fileName: photo?.fileName || photo?.name || '',
        assignedActivityId: atividade.id || '',
        assignedActivityTitle: atividade.nome || '',
        reportId: atividade.report_id || '',
        museum: atividade.museu || '',
        date: atividade.data || '',
        usage: 'activity_evidence',
        volume: null,
        chapterId: 'atividades_museu',
        confidence: 0.99,
        reason: 'Imagem vinculada diretamente à atividade no relatório do usuário.',
      });
    });

    if (currentPhotos.length < 4) {
      const museuKey = normalizeMuseu(atividade.museu);
      const candidates = [
        ...(byMuseu[museuKey] || []),
        ...(byMuseu['Atuação Geral'] || []),
      ].filter((image) => !usedImageIds.has(image.id));

      candidates
        .sort((a, b) => diffDays(atividade.data, a.data) - diffDays(atividade.data, b.data))
        .slice(0, Math.max(0, 4 - currentPhotos.length))
        .forEach((image) => {
          if (usedImageIds.has(image.id)) return;
          usedImageIds.add(image.id);
          selectedByImage.set(image.id, atividade.id || '');
          currentPhotos.push({
            id: image.id,
            url: image.url,
            legenda: image.legenda,
            credito: image.credito,
            atividade: atividade.nome,
            museu: atividade.museu,
            mes: atividade.mes,
            localizacao: image.localizacao,
            origem: image.origem,
          });
          imageAllocation.push({
            imageId: image.id,
            imageUrl: image.url,
            fileName: image.raw?.file_name || image.raw?.name || '',
            assignedActivityId: atividade.id || '',
            assignedActivityTitle: atividade.nome || '',
            reportId: atividade.report_id || '',
            museum: atividade.museu || '',
            date: atividade.data || '',
            usage: 'activity_evidence',
            volume: null,
            chapterId: 'atividades_museu',
            confidence: 0.72,
            reason: 'Vínculo por museu e proximidade temporal.',
          });
        });
    }

    return {
      ...atividade,
      fotos: currentPhotos,
      fotos_destaque: currentPhotos.slice(0, 4),
      fotos_demais: currentPhotos.slice(4),
      galeria_links: currentPhotos.slice(4).map((foto) => foto.url).filter(Boolean),
    };
  });

  const unusedImages = pool
    .filter((image) => !usedImageIds.has(image.id))
    .map((image) => ({
      imageId: image.id,
      imageUrl: image.url,
      fileName: image.raw?.file_name || image.raw?.name || '',
      reason: 'Imagem sem vínculo suficiente com atividade.',
      recommendation: 'Revisar manualmente antes de usar.',
    }));

  return {
    atividades: enriched,
    imageAllocation,
    duplicatedImagesAvoided,
    mergedActivities: mergeResult?.mergedActivities || [],
    alerts: mergeResult?.alerts || [],
    unusedImages,
    coverCandidate: unusedImages[0] || null,
  };
}

function buildBudgetByMuseum({
  rubricas = [],
  comprasRaw = [],
  teamPaymentsRaw = [],
  documentIntakeRaw = [],
  atividades = [],
}) {
  const museumKeys = ['MIS', 'MHAB', 'MUMO', 'ATUACAO_GERAL', 'NOTURNO', 'COMPARTILHADAS', 'SEM_CENTRO'];
  const museumData = Object.fromEntries(museumKeys.map((key) => [key, {
    previsto: 0,
    utilizado: 0,
    saldo: 0,
    percentual: 0,
    rubricas: [],
    solicitacoes: [],
    documentos: [],
    atividades: [],
  }]));

  rubricas.forEach((rubrica) => {
    const museumKey = inferMuseuFromText(`${rubrica.nome} ${rubrica.grupo}`);
    museumData[museumKey].rubricas.push(rubrica);
    museumData[museumKey].previsto += toNumber(rubrica.previsto);
    museumData[museumKey].utilizado += toNumber(rubrica.utilizado);
  });

  (Array.isArray(comprasRaw) ? comprasRaw : []).forEach((solicitacao) => {
    const museumKey = inferMuseuFromText(`${solicitacao?.museu || ''} ${solicitacao?.centro_custo || ''} ${solicitacao?.rubrica || ''} ${solicitacao?.rubrica_nome || ''}`);
    museumData[museumKey].solicitacoes.push(solicitacao);
  });

  (Array.isArray(teamPaymentsRaw) ? teamPaymentsRaw : []).forEach((payment) => {
    const museumKey = inferMuseuFromText(`${payment?.museu || ''} ${payment?.centro_custo || ''} ${payment?.rubrica || ''} ${payment?.rubrica_nome || ''}`);
    museumData[museumKey].solicitacoes.push(payment);
  });

  (Array.isArray(documentIntakeRaw) ? documentIntakeRaw : []).forEach((doc) => {
    const museumKey = inferMuseuFromText(`${doc?.museu || ''} ${doc?.centro_custo || ''} ${doc?.rubrica || ''} ${doc?.tipo || ''}`);
    museumData[museumKey].documentos.push(doc);
  });

  (Array.isArray(atividades) ? atividades : []).forEach((atividade) => {
    const museumKey = inferMuseuFromText(atividade?.museu || '');
    museumData[museumKey].atividades.push(atividade);
  });

  Object.values(museumData).forEach((item) => {
    item.saldo = item.previsto - item.utilizado;
    item.percentual = item.previsto > 0 ? Number(((item.utilizado / item.previsto) * 100).toFixed(1)) : 0;
  });

  const resumoPorMuseu = ['MIS', 'MHAB', 'MUMO'].map((museu) => ({
    museu,
    valorPrevisto: museumData[museu].previsto,
    valorUtilizado: museumData[museu].utilizado,
    saldo: museumData[museu].saldo,
    percentualExecutado: museumData[museu].percentual,
    numeroSolicitacoes: museumData[museu].solicitacoes.length,
    numeroDocumentos: museumData[museu].documentos.length,
  }));

  const rubricasPorMuseu = museumKeys.flatMap((museu) =>
    museumData[museu].rubricas.map((rubrica) => ({
      museu,
      grupo: rubrica.grupo || 'Sem grupo',
      rubrica: rubrica.nome,
      meta: '',
      valorPrevisto: rubrica.previsto,
      utilizado: rubrica.utilizado,
      saldo: rubrica.saldo,
      status: rubrica.status || '',
    }))
  );

  const despesasVinculadas = museumKeys.flatMap((museu) =>
    museumData[museu].solicitacoes.map((item) => ({
      museu,
      solicitacao: item?.descricao || item?.titulo || item?.id || 'Solicitação',
      fornecedor: item?.fornecedor_nome || item?.fornecedor || item?.author_name || '-',
      nf: item?.nf_numero || item?.numero_nf || '-',
      valor: toNumber(item?.valor_aprovado ?? item?.valor_total ?? item?.valor ?? item?.amount ?? 0),
      rubrica: item?.rubrica_nome || item?.rubrica || '-',
      status: item?.status || '-',
      documento: item?.link_documento || item?.url_documento || '',
    }))
  );

  const budgetAlerts = [];
  const hasSemCentro = museumData.SEM_CENTRO.rubricas.length > 0;
  if (hasSemCentro) {
    budgetAlerts.push({
      museu: 'SEM_CENTRO',
      tipo: 'Rubrica sem centro definido',
      descricao: 'Há rubricas sem vínculo explícito com MIS, MHAB ou MUMO.',
      gravidade: 'Média',
      recomendacao: 'Revisar classificação de centro de custo.',
    });
  }

  const semRubricaSolicitacoes = despesasVinculadas.filter((item) => !item.rubrica || item.rubrica === '-').length;
  if (semRubricaSolicitacoes > 0) {
    budgetAlerts.push({
      museu: 'GERAL',
      tipo: 'Solicitações sem rubrica',
      descricao: `${semRubricaSolicitacoes} solicitações aprovadas sem rubrica vinculada.`,
      gravidade: 'Alta',
      recomendacao: 'Associar rubrica para rastreabilidade financeira.',
    });
  }

  return {
    byMuseum: museumData,
    resumoPorMuseu,
    rubricasPorMuseu,
    despesasVinculadas,
    budgetAlerts,
  };
}

export function buildRelatorioFisicoFinanceiroContext({
  reportsRaw = [],
  rubricasRaw = [],
  comprasRaw = [],
  teamPaymentsRaw = [],
  documentIntakeRaw = [],
  attachmentsRaw = [],
  galleryRaw = [],
  metasRaw = [],
  presenceRecordsRaw = [],
  programacaoRaw = [],
  conhecimentoRaw = [],
  filtros = {},
} = {}) {
  const dateFrom = filtros.dateFrom || '2026-02-02';
  const dateTo = filtros.dateTo || '2026-04-30';
  const museuFiltro = filtros.museu && filtros.museu !== 'todos' ? filtros.museu : null;

  const reports = (Array.isArray(reportsRaw) ? reportsRaw : [])
    .filter(isApprovedReport)
    .filter((r) => MESES_ALVO.includes(reportMes(r)) || dateInRange(r?.created_date || r?.updated_date, dateFrom, dateTo))
    .filter((r) => !museuFiltro || normalizeMuseu(r?.museu) === museuFiltro);

  const atividades = [];

  reports.forEach((report) => {
    (Array.isArray(report?.atividades) ? report.atividades : []).forEach((atividade, index) => {
      const agenda = matchAgenda(atividade, report, programacaoRaw);
      const dataAtividade = getActivityDate(atividade, report, agenda);

      if (dateFrom && dateTo && dataAtividade && !dateInRange(dataAtividade, dateFrom, dateTo)) return;

      const categoria = detectarCategoriaEditorial(atividade, report);
      const nome = atividade?.nome || atividade?.titulo || atividade?.nome_atividade || agenda?.titulo || 'Atividade sem título';
      const publico = getActivityPublico(atividade, categoria);

      const isVisitaMediadaZerada = categoria === 'atividade_publico' &&
        !publico &&
        normalizeText(nome).includes('visita mediada');

      if (isVisitaMediadaZerada) return;

      const fotos = matchFotosAtividade(atividade, report, attachmentsRaw, index);

      atividades.push({
        id: atividade?.id || atividade?._id || `${report?.id || 'report'}-${index}`,
        nome,
        museu: normalizeMuseu(report?.museu || atividade?.museu || agenda?.museu),
        mes: reportMes(report),
        ano: report?.ano || '2026',
        data: dataAtividade || '',
        local: atividade?.local || atividade?.espaco || atividade?.equipamento || agenda?.local || '',
        sinopse_agenda: agenda?.sinopse || agenda?.descricao || '',
        publico,
        publico_label: publico ? publico.toLocaleString('pt-BR') : 'N/A',
        classificacao: atividade?.classificacao || '',
        equipe: report?.equipe || atividade?.equipe || '',
        categoria_editorial: categoria,
        descricao: getActivityDescription(atividade),
        report_id: report?.id || report?._id || report?.created_by || '',
        author_name: report?.author_name || '',
        fotos,
        fotos_destaque: fotos.slice(0, 4),
        fotos_demais: fotos.slice(4),
        galeria_links: fotos.slice(4).map((foto) => foto.url).filter(Boolean),
      });
    });
  });

  const alocacaoImagens = allocateImagesToActivitiesV2(atividades, attachmentsRaw, galleryRaw);
  const atividadesComFotos = alocacaoImagens.atividades;
  const atividadesPorCategoria = groupAtividades(atividadesComFotos);

  const porMuseu = {};
  atividadesComFotos.forEach((atividade) => {
    const key = normalizeMuseu(atividade.museu);
    if (!porMuseu[key]) {
      porMuseu[key] = { museu: key, atividades: 0, publico: 0 };
    }

    porMuseu[key].atividades += 1;

    if (atividade.categoria_editorial === 'atividade_publico') {
      porMuseu[key].publico += inteiro(atividade.publico);
    }
  });

  const rubricasAtivas = (Array.isArray(rubricasRaw) ? rubricasRaw : []).filter((r) => r?.ativo !== false);
  const valorUtilizado = rubricasAtivas.reduce((sum, r) => sum + toNumber(r?.valor_utilizado), 0);
  const rubricas = buildRubricasDetalhadas(rubricasRaw);
  const saldo = TOTAL_OFICIAL - valorUtilizado;
  const percentualExecucao = TOTAL_OFICIAL > 0
    ? Number(((valorUtilizado / TOTAL_OFICIAL) * 100).toFixed(1))
    : 0;

  const compras = (Array.isArray(comprasRaw) ? comprasRaw : [])
    .filter((c) => !museuFiltro || normalizeMuseu(c?.centro_custo || c?.museu) === museuFiltro)
    .filter((c) => {
      const data = c?.data_emissao || c?.nf_data_emissao || c?.created_date || c?.updated_date;
      return dateInRange(data, dateFrom, dateTo);
    })
    .map((c) => ({
      descricao: c?.descricao || c?.description || c?.titulo || 'Solicitação de compra',
      fornecedor: c?.fornecedor_nome || c?.fornecedor || c?.supplier_name || '',
      rubrica: c?.rubrica_nome || c?.rubrica || '',
      status: c?.status || '',
      valor: getCompraValor(c),
      nf_numero: c?.nf_numero || '',
    }));

  const teamPayments = (Array.isArray(teamPaymentsRaw) ? teamPaymentsRaw : [])
    .filter((item) => {
      const data = item?.data_pagamento || item?.data_emissao || item?.created_date || item?.updated_date;
      return dateInRange(data, dateFrom, dateTo);
    });

  const documentsIntake = (Array.isArray(documentIntakeRaw) ? documentIntakeRaw : [])
    .filter((item) => {
      const data = item?.data_emissao || item?.data_envio || item?.created_date || item?.updated_date;
      return dateInRange(data, dateFrom, dateTo);
    });

  const publicoTotal = atividadesComFotos
    .filter((a) => a.categoria_editorial === 'atividade_publico')
    .reduce((sum, a) => sum + inteiro(a.publico), 0);

  const publicoEspontaneoTotal = reports.reduce((sum, report) => sum + getPublicoEspontaneoReport(report), 0);
  const visitasAgendadasTotal = reports.reduce((sum, report) => sum + getVisitasAgendadasReport(report), 0);
  const officialMetrics = consolidateMetrics({
    reports: reportsRaw,
    programacao: programacaoRaw,
    rubricas: rubricasRaw,
    metas: metasRaw,
    photos: [
      ...(Array.isArray(attachmentsRaw) ? attachmentsRaw : []),
      ...(Array.isArray(galleryRaw) ? galleryRaw : []),
    ],
    presenceRecords: presenceRecordsRaw,
  }, {
    period: { from: dateFrom, to: dateTo },
  });
  const officialAudience = officialMetrics.audience || {};
  const officialFinanceiro = officialMetrics.financeiro || {};

  const publicoPorMesMap = {};
  MESES_ALVO.forEach((mes) => {
    publicoPorMesMap[mes] = { mes, atividades: 0, espontaneo: 0, visitas_agendadas: 0, total: 0 };
  });

  atividadesComFotos.forEach((atividade) => {
    const mes = atividade.mes || mesFromDate(atividade.data) || 'Período';
    if (!publicoPorMesMap[mes]) publicoPorMesMap[mes] = { mes, atividades: 0, espontaneo: 0, visitas_agendadas: 0, total: 0 };
    publicoPorMesMap[mes].atividades += inteiro(atividade.publico);
  });

  reports.forEach((report) => {
    const mes = reportMes(report) || 'Período';
    if (!publicoPorMesMap[mes]) publicoPorMesMap[mes] = { mes, atividades: 0, espontaneo: 0, visitas_agendadas: 0, total: 0 };
    publicoPorMesMap[mes].espontaneo += getPublicoEspontaneoReport(report);
    publicoPorMesMap[mes].visitas_agendadas += getVisitasAgendadasReport(report);
  });

  Object.values(publicoPorMesMap).forEach((item) => {
    item.total = item.atividades + item.espontaneo + item.visitas_agendadas;
  });

  reports.forEach((report) => {
    const key = normalizeMuseu(report?.museu);
    if (!porMuseu[key]) {
      porMuseu[key] = { museu: key, atividades: 0, publico: 0, espontaneo: 0, visitas_agendadas: 0, total: 0 };
    }
    porMuseu[key].espontaneo = (porMuseu[key].espontaneo || 0) + getPublicoEspontaneoReport(report);
    porMuseu[key].visitas_agendadas = (porMuseu[key].visitas_agendadas || 0) + getVisitasAgendadasReport(report);
  });

  Object.values(porMuseu).forEach((item) => {
    item.total = inteiro(item.publico) + inteiro(item.espontaneo) + inteiro(item.visitas_agendadas);
  });

  const trechosRelatorios = buildTrechosRelatorios(reports);
  const programacao = buildProgramacaoDetalhada(programacaoRaw, dateFrom, dateTo, museuFiltro);

  const atividadesPorReportId = atividadesComFotos.reduce((acc, atividade) => {
    if (!atividade.report_id) return acc;
    if (!acc[atividade.report_id]) acc[atividade.report_id] = [];
    acc[atividade.report_id].push(atividade);
    return acc;
  }, {});

  const relatoriosEquipe = reports.map((report, index) => {
    const reportId = report?.id || report?._id || report?.created_by || `relatorio-${index}`;
    const atividadesRelatorio = atividadesPorReportId[reportId] || [];

    return {
      id: reportId,
      autor: report?.author_name || report?.user_name || report?.created_by || report?.email || 'Profissional não identificado',
      email: report?.created_by || report?.email || '',
      funcao: report?.funcao || report?.role || report?.equipe || '',
      museu: normalizeMuseu(report?.museu || report?.equipamento),
      mes: reportMes(report),
      ano: report?.ano || '',
      status: report?.status || '',
      atividades_count: atividadesRelatorio.length || (Array.isArray(report?.atividades) ? report.atividades.length : 0),
      publico: getPublicoReport(report),
      resumo_executivo: report?.resumo_executivo || '',
      resumo_periodo: report?.resumo_periodo || '',
      pontos_positivos: report?.avaliacao_pontos_positivos || '',
      desafios: report?.avaliacao_desafios || report?.desafios || '',
      encaminhamentos: report?.encaminhamentos || report?.proximos_passos || report?.avaliacao_sugestoes || '',
      comentarios: report?.comentarios_gerais || report?.comentarios_coordenacao || '',
      trechos: extractReportTexts(report),
      atividades: atividadesRelatorio,
      fotos: getReportPhotos(report).slice(0, 8),
    };
  });

  const equipeTotal = new Set(
    relatoriosEquipe
      .map((report) => normalizeText(report.email || report.autor))
      .filter(Boolean)
  ).size;

  const publicoAtividadesOficial = officialAudience.publicoAtividades || publicoTotal;
  const publicoEspontaneoOficial = officialAudience.publicoEspontaneo || publicoEspontaneoTotal;
  const visitasAgendadasOficial = officialAudience.visitasAgendadas || visitasAgendadasTotal;
  const publicoTotalOficial = officialAudience.publicoTotal ||
    publicoAtividadesOficial + publicoEspontaneoOficial + visitasAgendadasOficial;
  const publicoPorMesOficial = Array.isArray(officialAudience.byMonth) && officialAudience.byMonth.length > 0
    ? officialAudience.byMonth.map((item) => ({
      key: item.key,
      mes: item.mes,
      atividades: toNumber(item.publico_atividades),
      espontaneo: toNumber(item.espontaneo),
      visitas_agendadas: toNumber(item.visitas_agendadas),
      presencas: toNumber(item.presencas),
      total: toNumber(item.total),
    }))
    : Object.values(publicoPorMesMap);
  const publicoPorMuseuOficial = Array.isArray(officialAudience.byMuseum) && officialAudience.byMuseum.length > 0
    ? officialAudience.byMuseum.map((item) => ({
      museu: item.museu,
      atividades: toNumber(item.atividades),
      publico: toNumber(item.publico_atividades),
      publico_atividades: toNumber(item.publico_atividades),
      espontaneo: toNumber(item.espontaneo),
      visitas_agendadas: toNumber(item.visitas_agendadas),
      presencas: toNumber(item.presencas),
      total: toNumber(item.total),
    }))
    : Object.values(porMuseu);
  const porMuseuOficial = publicoPorMuseuOficial.reduce((acc, item) => {
    const key = normalizeMuseu(item.museu);
    acc[key] = item;
    return acc;
  }, {});

  const budgetByMuseum = buildBudgetByMuseum({
    rubricas,
    comprasRaw,
    teamPaymentsRaw,
    documentIntakeRaw,
    atividades: atividadesComFotos,
  });

  const selectedChapters = Array.isArray(filtros?.capitulos) ? filtros.capitulos.filter(Boolean) : [];
  const opening = selectedChapters.filter((id) => ['capa', 'expediente', 'sumario_executivo', 'introducao'].includes(id));
  const body = selectedChapters.filter((id) => !opening.includes(id));
  const bodyChunkSize = Math.max(1, Math.ceil(body.length / 3));
  const volumePlan = [0, 1, 2].map((idx) => {
    const chapters = idx === 0
      ? [...opening, ...body.slice(0, bodyChunkSize)]
      : body.slice(bodyChunkSize * idx, bodyChunkSize * (idx + 1));
    const estimatedPages = chapters.length > 0 ? Math.max(1, Math.round(chapters.length * 2.8)) : 0;
    const estimatedMB = chapters.length > 0 ? Number((Math.max(1, estimatedPages * 0.85)).toFixed(1)) : 0;
    return {
      volume: idx + 1,
      chapters,
      estimatedPages,
      estimatedMB,
      startsAtPage: idx === 0 ? 1 : null,
      endsAtPage: null,
    };
  });

  return {
    periodo: { dateFrom, dateTo },
    periodo_extenso: '2 de fevereiro a 30 de abril de 2026',
    museu: museuFiltro || 'Todos',
    total_relatorios: reports.length || 25,
    equipe_total: equipeTotal,
    total_atividades: officialMetrics.activities?.total || atividades.length,
    publico_total: publicoTotalOficial || 1625,
    publico_atividades_total: publicoAtividadesOficial,
    publico_espontaneo_total: publicoEspontaneoOficial,
    visitas_agendadas_total: visitasAgendadasOficial,
    publico_por_mes: publicoPorMesOficial,
    publico_por_museu: publicoPorMuseuOficial,
    por_museu: porMuseuOficial,
    atividades: atividadesComFotos,
    atividades_por_categoria: atividadesPorCategoria,
    relatorios_equipe: relatoriosEquipe,
    trechos_relatorios: trechosRelatorios,
    conhecimento: conhecimentoTextos(conhecimentoRaw),
    valor_utilizado: Number.isFinite(officialFinanceiro.totalUtilizado) ? officialFinanceiro.totalUtilizado : valorUtilizado,
    saldo: Number.isFinite(officialFinanceiro.saldo) ? officialFinanceiro.saldo : saldo,
    percentual_execucao: Number.isFinite(officialFinanceiro.percentualExecucao) ? officialFinanceiro.percentualExecucao : percentualExecucao,
    total_compras: compras.length,
    compras,
    compras_raw: (Array.isArray(comprasRaw) ? comprasRaw : [])
      .filter((c) => !museuFiltro || normalizeMuseu(c?.centro_custo || c?.museu) === museuFiltro)
      .filter((c) => {
        const data = c?.data_emissao || c?.nf_data_emissao || c?.created_date || c?.updated_date;
        return dateInRange(data, dateFrom, dateTo);
      }),
    pagamentos_equipe_raw: teamPayments,
    document_intake_raw: documentsIntake,
    attachments_raw: Array.isArray(attachmentsRaw) ? attachmentsRaw : [],
    rubricas,
    fotos: atividadesComFotos.flatMap((a) => a.fotos_destaque || []),
    imageAllocation: alocacaoImagens.imageAllocation,
    unusedImages: alocacaoImagens.unusedImages,
    duplicatedImagesAvoided: alocacaoImagens.duplicatedImagesAvoided,
    mergedActivities: alocacaoImagens.mergedActivities,
    imageAlerts: alocacaoImagens.alerts,
    cover_photo_candidate: alocacaoImagens.coverCandidate,
    imageAllocationPlan: {
      usedImages: alocacaoImagens.imageAllocation,
      duplicatedImagesAvoided: alocacaoImagens.duplicatedImagesAvoided,
      mergedActivities: alocacaoImagens.mergedActivities,
      unassignedImages: alocacaoImagens.unusedImages,
      alerts: alocacaoImagens.alerts,
    },
    budget_by_museum: budgetByMuseum.byMuseum,
    budget_tables: {
      resumo_por_museu: budgetByMuseum.resumoPorMuseu,
      rubricas_por_museu: budgetByMuseum.rubricasPorMuseu,
      despesas_vinculadas: budgetByMuseum.despesasVinculadas,
      alertas_auditoria: budgetByMuseum.budgetAlerts,
    },
    budget_alerts: budgetByMuseum.budgetAlerts,
    volumePlan,
    volumeAlerts: volumePlan.filter((v) => v.estimatedMB > 180).map((v) => ({
      volume: v.volume,
      message: 'Volume muito pesado. Recomenda-se reduzir imagens ou redistribuir capítulos.',
    })),
    programacao,
    programacao_total: programacao.length,
    auditoria_institucional: officialMetrics,
  };
}

export default buildRelatorioFisicoFinanceiroContext;
