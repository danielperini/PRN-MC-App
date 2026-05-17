// RelatorioFisicoFinanceiroGenerator.jsx
// Arquivo atualizado com correção de métricas:
// - Compras
// - Notas fiscais
// - Releases
// - Integração TeamPayment + DocumentIntake + Comunicação

// SUBSTITUA APENAS A FUNÇÃO buildLocalReport() NO ARQUIVO ORIGINAL

async function buildLocalReport() {
  const [
    reportsRaw,
    rubricasRaw,
    comprasRaw,
    teamPaymentsRaw,
    documentosRaw,
    programacaoRaw,
    programacaoEspelhoRaw,
    comunicacaoRaw,
  ] = await Promise.all([
    safeList(base44.entities.Report, '-updated_date', 1000),
    safeList(base44.entities.Rubrica, 'ordem_exibicao', 1500),
    safeList(base44.entities.PurchaseRequest, '-created_date', 1500),

    base44.entities.TeamPayment
      ? safeList(base44.entities.TeamPayment, '-created_date', 1500)
      : Promise.resolve([]),

    base44.entities.DocumentIntake
      ? safeList(base44.entities.DocumentIntake, '-created_date', 2000)
      : Promise.resolve([]),

    safeList(base44.entities.Programacao, '-data_inicio', 1000),
    safeList(base44.entities.ProgramacaoEspelho, '-data_inicio', 1000),

    base44.entities.Comunicacao
      ? safeList(base44.entities.Comunicacao, '-created_date', 1000)
      : Promise.resolve([]),
  ]);

  const reports = filterPeriod(reportsRaw, dateFrom, dateTo).filter(
    (r) => !museu || r?.museu === museu
  );

  const rubricas = Array.isArray(rubricasRaw)
    ? rubricasRaw.filter((r) => r?.ativo !== false)
    : [];

  const comprasSolicitacoes = filterPeriod(
    comprasRaw,
    dateFrom,
    dateTo
  ).filter(
    (c) =>
      !museu ||
      c?.museu === museu ||
      c?.centro_custo === museu
  );

  const pagamentosEquipe = filterPeriod(
    teamPaymentsRaw,
    dateFrom,
    dateTo
  ).filter(
    (c) =>
      !museu ||
      c?.museu === museu ||
      c?.centro_custo === museu
  );

  const compras = [
    ...comprasSolicitacoes,
    ...pagamentosEquipe,
  ];

  const documentos = filterPeriod(
    documentosRaw,
    dateFrom,
    dateTo
  );

  const programacao = filterPeriod(
    [
      ...(programacaoRaw || []),
      ...(programacaoEspelhoRaw || []),
    ],
    dateFrom,
    dateTo
  ).filter(
    (p) =>
      !museu ||
      p?.museu === museu ||
      p?.centro_custo === museu
  );

  const atividades = atividadesDosRelatorios(reports);

  const publicoTotal = atividades.reduce(
    (sum, a) => sum + publico(a),
    0
  );

  const totalPrev =
    rubricas.reduce((sum, r) => sum + previsto(r), 0) ||
    1320000;

  const totalUtil = rubricas.reduce(
    (sum, r) => sum + utilizado(r),
    0
  );

  const totalNotas =
    documentos.filter((d) => {
      const tipo = norm(
        d?.tipo_detectado || d?.tipo || ''
      );

      return (
        tipo.includes('nota') ||
        tipo.includes('xml') ||
        tipo.includes('fiscal')
      );
    }).length ||
    compras.filter(
      (c) =>
        c?.numero_nf ||
        c?.nf_numero ||
        c?.nota_fiscal_url ||
        c?.xml_url
    ).length;

  const totalReleases = (comunicacaoRaw || []).filter(
    (r) => {
      const texto = norm(
        [
          r?.tipo,
          r?.categoria,
          r?.titulo,
          r?.descricao,
        ].join(' ')
      );

      return (
        texto.includes('release') ||
        texto.includes('imprensa') ||
        texto.includes('comunicacao')
      );
    }
  ).length;

  const html = htmlRelatorio({
    dateFrom,
    dateTo,
    museu,
    capitulos,
    reports,
    rubricas,
    compras,
    programacao,
  });

  return {
    metricas: {
      total_relatorios: reports.length,

      total_atividades: atividades.length,

      publico_total: publicoTotal,

      percentual:
        totalPrev > 0
          ? Math.round((totalUtil / totalPrev) * 100)
          : 0,

      total_compras: compras.length,

      total_nf: totalNotas,

      total_programacoes: rowsProgramacao(
        programacao,
        atividades
      ).length,

      total_releases: totalReleases,
    },

    html,
  };
}
