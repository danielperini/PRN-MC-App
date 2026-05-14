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

  if (raw.includes('NOTURNO')) return 'NOTURNO';
  if (raw.includes('MHAB') || raw.includes('ABILIO') || raw.includes('ABÍLIO')) return 'MHAB';
  if (raw.includes('MIS') || raw.includes('IMAGEM E SOM')) return 'MIS';
  if (raw.includes('MUMO') || raw.includes('MODA')) return 'MUMO';

  return value || 'Atuação Geral';
}

function isNoturnoMuseus(value) {
  return normalizeText(value).includes('noturno');
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

  const repeticoes = Math.max(inteiro(activity?.quantas_repeticoes ?? activity?.repeticoes ?? 1), 1);
  const publicoTotal = inteiro(activity?.publico_total);
  const publicoEstimado = inteiro(activity?.publico_estimado ?? activity?.publico);

  if (publicoTotal > 0) return publicoTotal;
  if (publicoEstimado > 0) return publicoEstimado * repeticoes;

  return null;
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

function normalizedUrlKey(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return raw
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/\/preview$/, '')
    .replace(/\/view$/, '')
    .replace(/=w\d+.*$/i, '')
    .toLowerCase();
}

function tokensFrom(value) {
  return normalizeText(value)
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !['museus', 'centro', 'projeto', 'atividade', 'producao', 'produção'].includes(w));
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

function scoreFotoParaAtividade(foto, { activityName = '', activityId = '', reportId = '', museu = '', data = '', categoria = '' } = {}) {
  const url = attachmentUrl(foto) || foto?.url || foto?.file_url || '';
  const text = attachmentText(foto);
  const activityTokens = tokensFrom(activityName);
  const museuNorm = normalizeMuseu(museu);
  let score = 0;

  if (!url) return -999;
  if (foto?.origem === 'activity.fotos') score += 90;
  if (foto?.origem === 'activity.attachments') score += 80;
  if (String(foto?.activity_id || foto?.atividade_id || '') && activityId && String(foto?.activity_id || foto?.atividade_id) === String(activityId)) score += 120;
  if (String(foto?.report_id || '') && reportId && String(foto.report_id) === String(reportId)) score += 18;

  activityTokens.forEach((token) => {
    if (text.includes(token)) score += 16;
  });

  if (museuNorm && normalizeMuseu(text) === museuNorm) score += 12;
  if (data && text.includes(String(data).slice(0, 10))) score += 10;
  if (categoria && text.includes(normalizeText(categoria))) score += 6;

  if (text.includes('whatsapp') || text.includes('screenshot') || text.includes('print')) score -= 30;
  if (text.includes('logo') || text.includes('assinatura') || text.includes('nota fiscal')) score -= 60;

  return score;
}

function getReportPhotos(report) {
  const fotos = [];

  (Array.isArray(report?.fotos) ? report.fotos : []).forEach((foto) => {
    const url = foto?.url || foto?.file_url || foto?.arquivo_url || '';
    if (!url) return;

    fotos.push({
      url,
      caption: foto?.caption || foto?.legenda || foto?.descricao || '',
      fileName: foto?.fileName || foto?.file_name || foto?.name || 'Foto',
      report_id: report?.id || '',
      origem: 'report.fotos',
    });
  });

  (Array.isArray(report?.attachments) ? report.attachments : []).forEach((att) => {
    if (!isImageAttachment(att)) return;

    const url = attachmentUrl(att);
    if (!url) return;

    fotos.push({
      ...att,
      url,
      caption: att?.caption || att?.legenda || att?.descricao || '',
      fileName: att?.file_name || att?.name || 'Foto',
      report_id: report?.id || '',
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

function matchFotosAtividade(activity, report, attachmentsRaw, usedGlobalPhotoKeys) {
  const activityName = activity?.nome || activity?.titulo || activity?.nome_atividade || '';
  const activityId = activity?.id || activity?._id || activity?.activity_id || '';
  const reportId = report?.id || '';
  const activityNameNorm = normalizeText(activityName);
  const museu = normalizeMuseu(report?.museu || activity?.museu);
  const data = getActivityDate(activity, report, null);
  const categoria = activity?.classificacao || activity?.categoria || '';
  const candidates = [];

  (Array.isArray(activity?.fotos) ? activity.fotos : []).forEach((foto) => {
    const url = foto?.url || foto?.file_url || foto?.arquivo_url || '';
    if (!url) return;
    candidates.push({
      ...foto,
      url,
      caption: foto?.caption || foto?.legenda || foto?.descricao || activityName,
      fileName: foto?.fileName || foto?.file_name || foto?.name || 'Foto',
      origem: 'activity.fotos',
    });
  });

  (Array.isArray(activity?.attachments) ? activity.attachments : []).forEach((att) => {
    if (!isImageAttachment(att)) return;
    const url = attachmentUrl(att);
    if (!url) return;
    candidates.push({
      ...att,
      url,
      caption: att?.caption || att?.legenda || att?.descricao || activityName,
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
    const partialNameMatch = tokensFrom(activityName).some((token) => text.includes(token));
    const matchesReport = reportId && String(att?.report_id || '') === String(reportId);

    if (!matchesActivityId && !matchesName && !partialNameMatch && !matchesReport) return;

    candidates.push({
      ...att,
      url,
      caption: att?.caption || att?.legenda || att?.descricao || activityName,
      fileName: att?.file_name || att?.name || 'Foto',
      origem: 'Attachment',
    });
  });

  getReportPhotos(report).forEach((foto) => candidates.push(foto));

  const scored = candidates
    .map((foto) => ({
      ...foto,
      _score: scoreFotoParaAtividade(foto, { activityName, activityId, reportId, museu, data, categoria }),
    }))
    .filter((foto) => foto._score >= 18)
    .sort((a, b) => b._score - a._score);

  const seenLocal = new Set();
  const selected = [];

  scored.forEach((foto) => {
    const key = normalizedUrlKey(foto?.url || foto?.file_url || attachmentUrl(foto));
    if (!key) return;
    if (seenLocal.has(key)) return;
    if (usedGlobalPhotoKeys?.has(key)) return;

    seenLocal.add(key);
    usedGlobalPhotoKeys?.add(key);
    selected.push(foto);
  });

  return selected.slice(0, 8);
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

function buildEvidenciasOperacionais(activity, agenda, fotos) {
  const evidencias = [];
  const descricao = getActivityDescription(activity);

  if (descricao) evidencias.push(descricao);
  if (agenda?.sinopse || agenda?.descricao) evidencias.push(agenda.sinopse || agenda.descricao);
  if (agenda?.publico_alvo) evidencias.push(`Público-alvo previsto na programação: ${agenda.publico_alvo}.`);
  if (agenda?.vagas) evidencias.push(`Vagas informadas na programação: ${agenda.vagas}.`);
  if (Array.isArray(fotos) && fotos.length > 0) {
    const legendas = fotos
      .map((f) => f.caption || f.legenda || f.fileName || '')
      .filter(Boolean)
      .slice(0, 4)
      .join('; ');
    if (legendas) evidencias.push(`Registros visuais vinculados: ${legendas}.`);
  }

  return evidencias.join(' ').replace(/\s+/g, ' ').trim();
}

export function buildRelatorioFisicoFinanceiroContext({
  reportsRaw = [],
  rubricasRaw = [],
  comprasRaw = [],
  attachmentsRaw = [],
  programacaoRaw = [],
  conhecimentoRaw = [],
  filtros = {},
} = {}) {
  const dateFrom = filtros.dateFrom || '2026-02-02';
  const dateTo = filtros.dateTo || '2026-04-30';
  const museuFiltro = filtros.museu && filtros.museu !== 'todos' ? filtros.museu : null;
  const usedGlobalPhotoKeys = new Set();

  const reports = (Array.isArray(reportsRaw) ? reportsRaw : [])
    .filter(isApprovedReport)
    .filter((r) => normalizeMuseu(r?.museu) !== 'NOTURNO')
    .filter((r) => !isNoturnoMuseus([r?.museu, r?.titulo, r?.nome, r?.descricao].filter(Boolean).join(' ')))
    .filter((r) => MESES_ALVO.includes(reportMes(r)) || dateInRange(r?.created_date || r?.updated_date, dateFrom, dateTo))
    .filter((r) => !museuFiltro || normalizeMuseu(r?.museu) === museuFiltro);

  const atividades = [];

  reports.forEach((report) => {
    (Array.isArray(report?.atividades) ? report.atividades : []).forEach((atividade, index) => {
      const atividadeTexto = [
        atividade?.nome,
        atividade?.titulo,
        atividade?.nome_atividade,
        atividade?.descricao,
        atividade?.classificacao,
        atividade?.categoria,
        atividade?.local,
      ].filter(Boolean).join(' ');

      if (isNoturnoMuseus(atividadeTexto)) return;

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

      const fotos = matchFotosAtividade(atividade, report, attachmentsRaw, usedGlobalPhotoKeys);
      const descricaoOriginal = getActivityDescription(atividade);
      const evidenciaOperacional = buildEvidenciasOperacionais(atividade, agenda, fotos);

      atividades.push({
        id: atividade?.id || atividade?._id || `${report?.id || 'report'}-${index}`,
        nome,
        museu: normalizeMuseu(report?.museu || atividade?.museu || agenda?.museu),
        mes: reportMes(report),
        ano: report?.ano || '2026',
        data: dataAtividade || '',
        local: atividade?.local || atividade?.espaco || atividade?.equipamento || agenda?.local || '',
        sinopse_agenda: agenda?.sinopse || agenda?.descricao || '',
        programacao_vinculada: agenda ? {
          titulo: agenda?.titulo || agenda?.nome || agenda?.atividade || '',
          sinopse: agenda?.sinopse || agenda?.descricao || '',
          publico_alvo: agenda?.publico_alvo || '',
          vagas: agenda?.vagas || '',
          inscricao: agenda?.inscricao || agenda?.link_inscricao || '',
        } : null,
        publico,
        publico_label: publico ? publico.toLocaleString('pt-BR') : 'N/A',
        classificacao: atividade?.classificacao || '',
        equipe: report?.equipe || atividade?.equipe || '',
        categoria_editorial: categoria,
        descricao: descricaoOriginal,
        descricao_original: descricaoOriginal,
        evidencia_operacional: evidenciaOperacional,
        report_id: report?.id || '',
        author_name: report?.author_name || '',
        fotos,
        fotos_destaque: fotos.slice(0, 4),
        fotos_demais: fotos.slice(4),
        galeria_links: fotos.slice(4).map((foto) => foto.url).filter(Boolean),
      });
    });
  });

  const atividadesPorCategoria = groupAtividades(atividades);

  const porMuseu = {};
  atividades.forEach((atividade) => {
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
  const saldo = TOTAL_OFICIAL - valorUtilizado;
  const percentualExecucao = TOTAL_OFICIAL > 0
    ? Number(((valorUtilizado / TOTAL_OFICIAL) * 100).toFixed(1))
    : 0;

  const compras = (Array.isArray(comprasRaw) ? comprasRaw : [])
    .filter((c) => !isNoturnoMuseus([c?.centro_custo, c?.museu, c?.descricao, c?.rubrica_nome, c?.rubrica].filter(Boolean).join(' ')))
    .filter((c) => !museuFiltro || normalizeMuseu(c?.centro_custo || c?.museu) === museuFiltro)
    .filter((c) => {
      const data = c?.data_emissao || c?.nf_data_emissao || c?.created_date || c?.updated_date;
      return dateInRange(data, dateFrom, dateTo);
    })
    .map((c) => ({
      descricao: c?.descricao || c?.description || c?.titulo || c?.descricao_item || 'Solicitação de compra',
      fornecedor: c?.fornecedor_nome || c?.fornecedor || c?.supplier_name || '',
      rubrica: c?.rubrica_nome || c?.rubrica || c?.categoria || '',
      centro_custo: normalizeMuseu(c?.centro_custo || c?.museu || ''),
      status: c?.status || '',
      valor: getCompraValor(c),
      nf_numero: c?.nf_numero || '',
    }));

  const publicoTotal = atividades
    .filter((a) => a.categoria_editorial === 'atividade_publico')
    .reduce((sum, a) => sum + inteiro(a.publico), 0);

  const trechosRelatorios = buildTrechosRelatorios(reports);
  const periodoExtenso = dateFrom === '2026-02-02' && dateTo === '2026-04-30'
    ? '2 de fevereiro a 30 de abril de 2026'
    : `${dateFrom} a ${dateTo}`;

  return {
    periodo: { dateFrom, dateTo },
    periodo_extenso: periodoExtenso,
    museu: museuFiltro || 'Todos',
    total_relatorios: reports.length,
    total_atividades: atividades.length,
    publico_total: publicoTotal,
    por_museu: porMuseu,
    atividades,
    atividades_por_categoria: atividadesPorCategoria,
    trechos_relatorios: trechosRelatorios,
    conhecimento: conhecimentoTextos(conhecimentoRaw),
    valor_utilizado: valorUtilizado,
    saldo,
    percentual_execucao: percentualExecucao,
    total_compras: compras.length,
    compras,
    fotos: atividades.flatMap((a) => a.fotos_destaque || []),
    programacao_total: Array.isArray(programacaoRaw) ? programacaoRaw.filter((p) => !isNoturnoMuseus([p?.titulo, p?.nome, p?.museu, p?.descricao].filter(Boolean).join(' '))).length : 0,
    auditoria_visual: {
      fotos_unicas_utilizadas: usedGlobalPhotoKeys.size,
      criterio: 'deduplicacao global por URL normalizada, priorizando fotos vinculadas à atividade, ao relatório, ao museu e à programação',
    },
  };
}

export default buildRelatorioFisicoFinanceiroContext;
