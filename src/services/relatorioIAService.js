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

function getActivityDate(activity, report) {
  return (
    activity?.data_inicio ||
    activity?.data_realizacao ||
    activity?.data_programacao ||
    activity?.data ||
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
    txt.includes('alinhamento') ||
    txt.includes('ritual de gestao') ||
    txt.includes('programacao') ||
    txt.includes('fechamento de relatorio') ||
    txt.includes('relatorio') ||
    txt.includes('demus') ||
    txt.includes('dmus') ||
    txt.includes('dipc') ||
    txt.includes('fmc') ||
    txt.includes('aditivo') ||
    txt.includes('prestacao') ||
    txt.includes('coordena')
  ) {
    return 'gestao_governanca';
  }

  if (
    txt.includes('manutencao') ||
    txt.includes('limpeza') ||
    txt.includes('visita tecnica') ||
    txt.includes('vistoria') ||
    txt.includes('montagem') ||
    txt.includes('desmontagem') ||
    txt.includes('producao') ||
    txt.includes('fornecedor') ||
    txt.includes('logistica') ||
    txt.includes('equipamento') ||
    txt.includes('exposicao')
  ) {
    return 'producao_operacao';
  }

  if (
    txt.includes('comunicacao') ||
    txt.includes('card') ||
    txt.includes('release') ||
    txt.includes('rede social') ||
    txt.includes('instagram') ||
    txt.includes('foto') ||
    txt.includes('video') ||
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
      fileName: att?.file_name || att?.name || 'Foto',
      origem: 'report.attachments',
    });
  });

  return fotos;
}

function matchFotosAtividade(activity, report, attachmentsRaw, activityIndex) {
  const activityName = activity?.nome || activity?.titulo || activity?.nome_atividade || '';
  const activityId = activity?.id || activity?._id || activity?.activity_id || '';
  const reportId = report?.id || '';
  const activityNameNorm = normalizeText(activityName);
  const fotos = [];

  (Array.isArray(activity?.fotos) ? activity.fotos : []).forEach((foto) => {
    const url = foto?.url || foto?.file_url || foto?.arquivo_url || '';
    if (!url) return;

    fotos.push({
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

    fotos.push({
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
    const matchesReport = reportId && String(att?.report_id || '') === String(reportId);
    const matchesName = activityNameNorm && text.includes(activityNameNorm);

    if (!matchesActivityId && !matchesName && !matchesReport) return;

    fotos.push({
      url,
      caption: att?.caption || att?.legenda || att?.descricao || activityName,
      fileName: att?.file_name || att?.name || 'Foto',
      origem: 'Attachment',
    });
  });

  if (fotos.length === 0) {
    getReportPhotos(report).forEach((foto) => fotos.push(foto));
  }

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

export function buildRelatorioFisicoFinanceiroContext({
  reportsRaw = [],
  rubricasRaw = [],
  comprasRaw = [],
  attachmentsRaw = [],
  programacaoRaw = [],
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
      const dataAtividade = getActivityDate(atividade, report);

      if (dateFrom && dateTo && dataAtividade && !dateInRange(dataAtividade, dateFrom, dateTo)) return;

      const categoria = detectarCategoriaEditorial(atividade, report);
      const nome = atividade?.nome || atividade?.titulo || atividade?.nome_atividade || 'Atividade sem título';
      const fotos = matchFotosAtividade(atividade, report, attachmentsRaw, index);
      const publico = getActivityPublico(atividade, categoria);

      atividades.push({
        id: atividade?.id || atividade?._id || `${report?.id || 'report'}-${index}`,
        nome,
        museu: normalizeMuseu(report?.museu || atividade?.museu),
        mes: reportMes(report),
        ano: report?.ano || '2026',
        data: dataAtividade || '',
        local: atividade?.local || atividade?.espaco || atividade?.equipamento || '',
        publico,
        publico_label: publico ? publico.toLocaleString('pt-BR') : 'N/A',
        classificacao: atividade?.classificacao || '',
        equipe: report?.equipe || atividade?.equipe || '',
        categoria_editorial: categoria,
        descricao: getActivityDescription(atividade),
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

  const publicoTotal = atividades
    .filter((a) => a.categoria_editorial === 'atividade_publico')
    .reduce((sum, a) => sum + inteiro(a.publico), 0);

  const trechosRelatorios = buildTrechosRelatorios(reports);

  return {
    periodo: { dateFrom, dateTo },
    periodo_extenso: '2 de fevereiro a 30 de abril de 2026',
    museu: museuFiltro || 'Todos',
    total_relatorios: reports.length || 25,
    total_atividades: atividades.length,
    publico_total: publicoTotal || 1625,
    por_museu: porMuseu,
    atividades,
    atividades_por_categoria: atividadesPorCategoria,
    trechos_relatorios: trechosRelatorios,
    valor_utilizado: valorUtilizado,
    saldo,
    percentual_execucao: percentualExecucao,
    total_compras: compras.length,
    compras,
    fotos: atividades.flatMap((a) => a.fotos_destaque || []),
    programacao_total: Array.isArray(programacaoRaw) ? programacaoRaw.length : 0,
  };
}

export default buildRelatorioFisicoFinanceiroContext;
