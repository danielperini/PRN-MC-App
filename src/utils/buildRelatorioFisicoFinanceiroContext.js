const TOTAL_OFICIAL = 1320000;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(value) {
  return Math.round(toNumber(value));
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

function normalizeMuseu(value) {
  const raw = String(value || '').toUpperCase();

  if (raw.includes('MHAB') || raw.includes('ABILIO') || raw.includes('ABÍLIO')) return 'MHAB';
  if (raw.includes('MIS') || raw.includes('IMAGEM E SOM')) return 'MIS';
  if (raw.includes('MUMO') || raw.includes('MODA')) return 'MUMO';

  return value || 'Atuação Geral';
}

function isApprovedReport(report) {
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
    (Array.isArray(report?.atividades) ? report.atividades : []).forEach((atividade) => {
      const dataAtividade = getActivityDate(atividade, report);

      if (dateFrom && dateTo && !dateInRange(dataAtividade, dateFrom, dateTo)) return;

      atividades.push({
        nome: atividade?.nome || atividade?.titulo || atividade?.nome_atividade || 'Atividade sem título',
        museu: normalizeMuseu(report?.museu || atividade?.museu),
        mes: report?.mes_referencia || '',
        ano: report?.ano || '',
        publico: getActivityPublico(atividade),
        classificacao: atividade?.classificacao || '',
        equipe: report?.equipe || atividade?.equipe || '',
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

  const fotos = (Array.isArray(attachmentsRaw) ? attachmentsRaw : [])
    .filter(isImageAttachment)
    .slice(0, 80)
    .map((a) => ({
      url: a?.url || a?.file_url || a?.arquivo_url || '',
      caption: a?.caption || a?.legenda || '',
      fileName: a?.file_name || a?.name || 'Foto',
    }))
    .filter((a) => a.url);

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

