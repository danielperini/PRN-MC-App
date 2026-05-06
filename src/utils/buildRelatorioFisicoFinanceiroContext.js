
const CATEGORIAS = {
  governanca: ['reunião', 'alinhamento', 'demus', 'dipc', 'planejamento', 'gestão'],
  producao: ['produção', 'montagem', 'logística', 'som', 'luz'],
  comunicacao: ['card', 'release', 'comunicação', 'instagram'],
  formacao_publico: ['oficina', 'mediação', 'visita', 'simpósio', 'samba aula', 'espetáculo'],
};

function detectarCategoria(texto = '') {
  const lower = texto.toLowerCase();

  for (const [categoria, termos] of Object.entries(CATEGORIAS)) {
    if (termos.some((t) => lower.includes(t))) {
      return categoria;
    }
  }

  return 'institucional';
}

export function buildRelatorioFisicoFinanceiroContext({
  reportsRaw = [],
  attachmentsRaw = [],
}) {
  const atividades = [];

  reportsRaw.forEach((report) => {
    (report?.atividades || []).forEach((atividade) => {
      const textoBase = [
        atividade?.nome,
        atividade?.descricao,
        atividade?.classificacao,
      ].join(' ');

      const categoria_editorial = detectarCategoria(textoBase);

      atividades.push({
        nome: atividade?.nome || 'Atividade',
        descricao: atividade?.descricao || '',
        museu: report?.museu || '',
        data: atividade?.data || report?.created_date || '',
        local: atividade?.local || '',
        publico:
          categoria_editorial === 'formacao_publico'
            ? Number(atividade?.publico || 0)
            : 'N/A',
        categoria_editorial,
        fotos: (attachmentsRaw || []).filter((a) =>
          String(a?.atividade_nome || '').includes(atividade?.nome || '')
        ),
      });
    });
  });

  return {
    total_atividades: atividades.length,
    atividades,
  };
}

export default buildRelatorioFisicoFinanceiroContext;
  const status = String(report?.status || '').trim().toUpperCase();
  return ['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN'].includes(status);
}

function getActivityDate(activity, report) {
  return (
    activity?.data_inicio ||
    activity?.data_realizacao ||
    activity?.data_programacao ||
    activity?.data ||
    report?.data_inicio ||
    report?.created_date ||
    report?.updated_date
  );
}

function getActivityPublico(activity) {
  return inteiro(
    activity?.publico_total ??
    activity?.publico_estimado ??
    activity?.publico ??
    0
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
    ''
  );
}

function getActivityKey(activity, report, index) {
  const parts = [
    activity?.id,
    activity?.nome,
    activity?.titulo,
    activity?.nome_atividade,
    report?.id,
    report?.mes_referencia,
    report?.ano,
    index,
  ];

  return normalizeText(parts.filter(Boolean).join(' '));
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

function isImageAttachment(attachment) {
  const mime = String(attachment?.mime_type || attachment?.type || '').toLowerCase();
  const name = String(
    attachment?.file_name ||
    attachment?.name ||
    attachment?.url ||
    attachment?.file_url ||
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
  const key = getActivityKey(activity, report, activityIndex);
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

  const anexos = Array.isArray(attachmentsRaw) ? attachmentsRaw : [];

  anexos.forEach((att) => {
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
    const matchesKey = key && text.includes(key);

    if (!matchesActivityId && !matchesName && !matchesKey && !matchesReport) return;

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

export function buildRelatorioFisicoFinanceiroContext({
  reportsRaw = [],
  rubricasRaw = [],
  comprasRaw = [],
  attachmentsRaw = [],
  programacaoRaw = [],
  filtros = {},
} = {}) {
  const dateFrom = filtros.dateFrom;
  const dateTo = filtros.dateTo;
  const museuFiltro = filtros.museu && filtros.museu !== 'todos' ? filtros.museu : null;

  const reports = (Array.isArray(reportsRaw) ? reportsRaw : [])
    .filter(isApprovedReport)
    .filter((r) => !museuFiltro || normalizeMuseu(r?.museu) === museuFiltro);

  const atividades = [];

  reports.forEach((report) => {
    (Array.isArray(report?.atividades) ? report.atividades : []).forEach((atividade, index) => {
      const dataAtividade = getActivityDate(atividade, report);

      if (dateFrom && dateTo && !dateInRange(dataAtividade, dateFrom, dateTo)) return;

      const nome = atividade?.nome || atividade?.titulo || atividade?.nome_atividade || 'Atividade sem título';
      const fotos = matchFotosAtividade(atividade, report, attachmentsRaw, index);
      const fotosDestaque = fotos.slice(0, 4);
      const fotosDemais = fotos.slice(4);

      atividades.push({
        id: atividade?.id || atividade?._id || `${report?.id || 'report'}-${index}`,
        nome,
        museu: normalizeMuseu(report?.museu || atividade?.museu),
        mes: report?.mes_referencia || '',
        ano: report?.ano || '',
        data: dataAtividade || '',
        publico: getActivityPublico(atividade),
        publico_label: getActivityPublico(atividade) > 0 ? inteiro(getActivityPublico(atividade)).toLocaleString('pt-BR') : 'N/A',
        classificacao: atividade?.classificacao || '',
        equipe: report?.equipe || atividade?.equipe || '',
        descricao: getActivityDescription(atividade),
        report_id: report?.id || '',
        author_name: report?.author_name || '',
        fotos,
        fotos_destaque: fotosDestaque,
        fotos_demais: fotosDemais,
        galeria_links: fotosDemais.map((foto) => foto.url).filter(Boolean),
      });
    });
  });

  const porMuseu = {};
  atividades.forEach((atividade) => {
    const key = normalizeMuseu(atividade.museu);
    if (!porMuseu[key]) {
      porMuseu[key] = { museu: key, atividades: 0, publico: 0 };
    }

    porMuseu[key].atividades += 1;
    porMuseu[key].publico += inteiro(atividade.publico);
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
      if (!dateFrom || !dateTo) return true;
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

  const fotos = atividades.flatMap((a) => a.fotos_destaque || []);

  return {
    periodo: { dateFrom, dateTo },
    museu: museuFiltro || 'Todos',
    total_relatorios: reports.length,
    total_atividades: atividades.length,
    publico_total: atividades.reduce((sum, a) => sum + inteiro(a.publico), 0),
    por_museu: porMuseu,
    atividades,
    valor_utilizado: valorUtilizado,
    saldo,
    percentual_execucao: percentualExecucao,
    total_nf: compras.length,
    total_compras: compras.length,
    compras,
    fotos,
    programacao_total: Array.isArray(programacaoRaw) ? programacaoRaw.length : 0,
  };
}

export default buildRelatorioFisicoFinanceiroContext;
