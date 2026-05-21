const RAW_REPORT_CHAPTERS = [
  { id: 'capa', title: 'Capa editorial', order: 1, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: false, exportable: true, canBeSplit: true, dataSources: [], requiresData: false, renderTitle: 'RelatÃ³rio Institucional', validatePresence: false, summaryDescription: 'Abertura visual e institucional do relatÃ³rio' },
  { id: 'expediente', title: 'Expediente institucional', order: 2, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'equipe', 'cadastros institucionais'], requiresData: false, renderTitle: 'Expediente', summaryDescription: 'Equipes, instituiÃ§Ãµes e responsabilidades do perÃ­odo' },
  { id: 'sumario_executivo', title: 'SumÃ¡rio executivo editorial', order: 3, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: false, exportable: true, canBeSplit: true, dataSources: ['registry de capÃ­tulos', 'seleÃ§Ã£o atual'], requiresData: false, renderTitle: 'SumÃ¡rio', summaryDescription: 'Mapa de leitura e organizaÃ§Ã£o editorial do relatÃ³rio' },
  { id: 'introducao', title: 'IntroduÃ§Ã£o institucional', order: 4, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'programaÃ§Ã£o', 'dados institucionais do app'], requiresData: false, renderTitle: 'IntroduÃ§Ã£o', summaryDescription: 'Escopo, perÃ­odo, metodologia e leitura institucional' },
  { id: 'territorio', title: 'TerritÃ³rio e contexto cultural', order: 5, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'programaÃ§Ã£o', 'contexto institucional'], requiresData: false, renderTitle: 'CoordenaÃ§Ã£o, planejamento e desenvolvimento institucional', summaryDescription: 'Contexto cultural, planejamento e atuaÃ§Ã£o territorial' },
  { id: 'indicadores_premium', title: 'Indicadores editoriais', order: 6, group: 'Indicadores e metas', type: 'data', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'ProgramaÃ§Ã£o', 'Rubrica', 'PurchaseRequest', 'Attachment'], requiresData: false, renderTitle: 'ExecuÃ§Ã£o fÃ­sica acompanhada por evidÃªncias', summaryDescription: 'Indicadores consolidados, metas e leitura de pÃºblico' },
  { id: 'resumo_geral', title: 'Resumo geral', order: 7, group: 'Indicadores e metas', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'indicadores consolidados'], requiresData: false, renderTitle: 'IntroduÃ§Ã£o', validatePresence: false, summaryDescription: 'SÃ­ntese transversal do perÃ­odo e dos resultados' },
  { id: 'publico', title: 'PÃºblico alcanÃ§ado', order: 8, group: 'Indicadores e metas', type: 'data', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'atividades', 'programaÃ§Ã£o vinculada'], requiresData: true, renderTitle: 'ExecuÃ§Ã£o fÃ­sica acompanhada por evidÃªncias', validatePresence: false, summaryDescription: 'PÃºblico registrado, estimado e critÃ©rios de consolidaÃ§Ã£o' },
  { id: 'metas', title: 'Metas do 3Âº Aditivo', order: 9, group: 'Indicadores e metas', type: 'data', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Rubrica', 'atividades', 'metas vinculadas'], requiresData: false, renderTitle: 'ExecuÃ§Ã£o fÃ­sica acompanhada por evidÃªncias', validatePresence: false, summaryDescription: 'Metas vinculadas e execuÃ§Ã£o associada no perÃ­odo' },
  { id: 'programacao', title: 'ProgramaÃ§Ã£o', order: 10, group: 'ProgramaÃ§Ã£o', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['ProgramacaoEspelho', 'Report'], requiresData: true, renderTitle: 'ProgramaÃ§Ã£o e atividades do perÃ­odo', summaryDescription: 'AÃ§Ãµes planejadas e realizadas no recorte selecionado' },
  { id: 'agenda_programacao', title: 'Agenda de programaÃ§Ã£o', order: 11, group: 'ProgramaÃ§Ã£o', type: 'data', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['ProgramacaoEspelho', 'Report', 'atividades'], requiresData: true, renderTitle: 'Agenda detalhada do perÃ­odo', summaryDescription: 'Cronologia consolidada das aÃ§Ãµes do perÃ­odo' },
  { id: 'timeline_premium', title: 'Linha do tempo editorial', order: 12, group: 'ProgramaÃ§Ã£o', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['ProgramacaoEspelho', 'Report'], requiresData: true, renderTitle: 'ProgramaÃ§Ã£o e atividades do perÃ­odo', validatePresence: false, summaryDescription: 'Linha do tempo e marcos editoriais do perÃ­odo' },
  { id: 'atividades_museu', title: 'Atividades por museu', order: 13, group: 'Atividades', type: 'data', selectable: true, defaultSelected: false, includeInSummary: false, exportable: false, hiddenInExport: true, canBeSplit: true, dataSources: ['atividades', 'Report', 'ProgramacaoEspelho'], requiresData: true, renderTitle: 'CoordenaÃ§Ã£o, planejamento e desenvolvimento institucional', validatePresence: false, summaryDescription: 'Atividades organizadas por museu e por eixo de aÃ§Ã£o' },
  { id: 'museus_premium', title: 'PÃ¡ginas por museu', order: 14, group: 'Atividades', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['atividades', 'programaÃ§Ã£o', 'relatÃ³rios por museu'], requiresData: true, renderTitle: 'MHAB', validatePresence: false, summaryDescription: 'SÃ­ntese editorial individual por equipamento' },
  { id: 'noturno_premium', title: 'SeÃ§Ã£o especial Noturno nos Museus', order: 15, group: 'Atividades', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['atividades', 'programaÃ§Ã£o', 'rubricas vinculadas ao Noturno'], requiresData: false, renderTitle: 'SeÃ§Ã£o especial Noturno nos Museus', validatePresence: false, summaryDescription: 'CapÃ­tulo eventual para aÃ§Ãµes do Noturno nos Museus' },
  { id: 'relatorios_completos', title: 'RelatÃ³rios integrais das equipes', order: 16, group: 'Atividades', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report'], requiresData: true, renderTitle: 'Fontes internas consolidadas', summaryDescription: 'Base narrativa aprovada pelas equipes do projeto' },
  { id: 'galeria_evidencias', title: 'Galeria e evidÃªncias', order: 17, group: 'EvidÃªncias', type: 'gallery', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Attachment', 'fotos vinculadas', 'metadados visuais'], requiresData: true, renderTitle: 'Fotos, crÃ©ditos e localizaÃ§Ã£o', summaryDescription: 'Galeria final organizada por museu, mÃªs e atividade' },
  { id: 'galeria_premium', title: 'Galeria com crÃ©ditos e GPS', order: 18, group: 'EvidÃªncias', type: 'gallery', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Attachment', 'crÃ©ditos', 'GPS', 'localizaÃ§Ã£o'], requiresData: true, renderTitle: 'Fotos, crÃ©ditos e localizaÃ§Ã£o', validatePresence: false, summaryDescription: 'Metadados de crÃ©dito, origem e localizaÃ§Ã£o das imagens' },
  { id: 'comunicacao', title: 'ComunicaÃ§Ã£o', order: 19, group: 'ComunicaÃ§Ã£o', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'Attachment', 'registros internos de comunicaÃ§Ã£o'], requiresData: false, renderTitle: 'ComunicaÃ§Ã£o, registros e evidÃªncias', summaryDescription: 'Frente de comunicaÃ§Ã£o, circulaÃ§Ã£o pÃºblica e documentaÃ§Ã£o' },
  { id: 'comunicacao_premium', title: 'ComunicaÃ§Ã£o editorial', order: 20, group: 'ComunicaÃ§Ã£o', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'Attachment', 'registros internos de comunicaÃ§Ã£o'], requiresData: false, renderTitle: 'ComunicaÃ§Ã£o, registros e evidÃªncias', validatePresence: false, summaryDescription: 'Leitura narrativa institucional da comunicaÃ§Ã£o do perÃ­odo' },
  { id: 'financeiro', title: 'ExecuÃ§Ã£o financeira', order: 21, group: 'Financeiro', type: 'financial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['PurchaseRequest', 'TeamPayment', 'Rubrica'], requiresData: true, renderTitle: 'OrÃ§amento, rubricas e rastreabilidade', summaryDescription: 'Solicitado, aprovado e pago no perÃ­odo consolidado' },
  { id: 'rubricas', title: 'Rubricas e orÃ§amento por grupo', order: 22, group: 'Financeiro', type: 'financial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Rubrica'], requiresData: true, renderTitle: 'OrÃ§amento, rubricas e rastreabilidade', validatePresence: false, summaryDescription: 'Quadro por grupo, saldo e percentual de execuÃ§Ã£o' },
  { id: 'orcamento_museu', title: 'Orçamento por Museu', order: 23, group: 'Financeiro', type: 'financial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Rubrica', 'PurchaseRequest', 'TeamPayment', 'DocumentIntake', 'Attachment', 'Meta', 'ProgramacaoEspelho', 'Report'], requiresData: false, renderTitle: 'Orçamento por Museu', summaryDescription: 'Distribuição e execução orçamentária por MIS, MHAB e MUMO' },
  { id: 'orcamento_geral', title: 'Orçamento geral', order: 24, group: 'Financeiro', type: 'financial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Rubrica', 'PurchaseRequest', 'TeamPayment', 'DocumentIntake', 'Attachment', 'Report', 'Atividades'], requiresData: false, renderTitle: 'Orçamento geral', summaryDescription: 'Consolidação geral de orçamento, relatórios e atividades no período' },
  { id: 'prestacao', title: 'Prestação de contas', order: 25, group: 'Financeiro', type: 'financial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['PurchaseRequest', 'TeamPayment', 'DocumentIntake', 'Attachment'], requiresData: true, renderTitle: 'OrÃ§amento, rubricas e rastreabilidade', validatePresence: false, summaryDescription: 'Documentos fiscais, comprovaÃ§Ãµes e vÃ­nculos financeiros' },
  { id: 'notas-fiscais-contratos', title: 'Notas fiscais e contratos', order: 26, group: 'Financeiro', type: 'documents', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Attachment', 'DocumentIntake', 'PurchaseRequest', 'TeamPayment'], requiresData: false, renderTitle: 'Notas fiscais e contratos', summaryDescription: 'Listagem consolidada de contratos em PDF e documentos fiscais com links de rastreabilidade' },
  { id: 'governanca_documental', title: 'Governança documental e rastreabilidade das evidências', order: 27, group: 'GovernanÃ§a', type: 'governance', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['DocumentIntake', 'Attachment', 'PurchaseRequest', 'TeamPayment'], requiresData: false, renderTitle: 'GovernanÃ§a documental e rastreabilidade das evidÃªncias', summaryDescription: 'Pareamento documental, origem dos arquivos e trilha de evidÃªncias' },
  { id: 'app_museu_centro', title: 'Museu Centro APP', order: 28, group: 'GovernanÃ§a', type: 'governance', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['mÃ³dulos do app', 'estrutura operacional existente'], requiresData: false, renderTitle: 'Museu Centro APP como memÃ³ria operacional', summaryDescription: 'Infraestrutura digital de registro, consolidaÃ§Ã£o e memÃ³ria' },
  { id: 'sistema_governanca', title: 'Sistema, dados e governança', order: 29, group: 'GovernanÃ§a', type: 'governance', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['mÃ³dulos do app', 'vÃ­nculos entre relatÃ³rios, documentos e rubricas'], requiresData: false, renderTitle: 'Museu Centro APP como memÃ³ria operacional', validatePresence: false, summaryDescription: 'Qualidade, consistÃªncia e governanÃ§a dos dados do sistema' },
  { id: 'auditoria_operacional', title: 'Auditoria operacional do período', order: 30, group: 'GovernanÃ§a', type: 'governance', selectable: true, defaultSelected: false, includeInSummary: false, exportable: false, hiddenInExport: true, canBeSplit: true, dataSources: ['Report', 'ProgramacaoEspelho', 'PurchaseRequest', 'TeamPayment', 'Rubrica', 'DocumentIntake', 'Attachment'], requiresData: false, renderTitle: 'Auditoria operacional do perÃ­odo', summaryDescription: 'Cruzamento tÃ©cnico entre atividades, pÃºblico, documentos e financeiro' },
  { id: 'conclusao', title: 'Conclusão', order: 31, group: 'Encerramento', type: 'conclusion', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['sÃ­ntese do relatÃ³rio consolidado'], requiresData: false, renderTitle: 'Encerramento', validatePresence: false, summaryDescription: 'Fechamento editorial e institucional do perÃ­odo' },
];

export const REPORT_CHAPTERS = RAW_REPORT_CHAPTERS.map((chapter) => ({
  ...chapter,
  sectionId: chapter.sectionId || chapter.id,
  contentKey: chapter.contentKey || ({
    expediente: 'expediente_institucional_text',
    introducao: 'introducao_institucional_text',
    sumario_executivo: 'sumario_executivo_editorial_text',
  }[chapter.id] || `${chapter.id}_text`),
  introTemplate: chapter.introTemplate || `chapter:${chapter.id}:intro`,
  methodologyTemplate: chapter.methodologyTemplate || `chapter:${chapter.id}:methodology`,
  emptyStateText: chapter.emptyStateText || 'NÃ£o foram localizados dados suficientes no app para este capÃ­tulo no recorte selecionado.',
  layoutVariant: chapter.layoutVariant || chapter.type || 'editorial',
}));

export const REPORT_CHAPTERS_BY_ID = Object.fromEntries(REPORT_CHAPTERS.map((chapter) => [chapter.id, chapter]));
export const REPORT_CHAPTER_IDS = REPORT_CHAPTERS.map((chapter) => chapter.id);

export function getReportChapterById(chapterId) {
  return REPORT_CHAPTERS_BY_ID[chapterId] || null;
}

export function getSelectableReportChapters() {
  return REPORT_CHAPTERS.filter((chapter) => chapter.selectable);
}

export function buildReportChapterSelectionState(selectedIds = null) {
  const normalizedSelected = Array.isArray(selectedIds) ? new Set(selectedIds) : null;
  return Object.fromEntries(
    getSelectableReportChapters().map((chapter) => [
      chapter.id,
      normalizedSelected ? normalizedSelected.has(chapter.id) : chapter.defaultSelected !== false,
    ])
  );
}

export function normalizeSelectedReportChapterIds(selectedIds = []) {
  const valid = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  return REPORT_CHAPTER_IDS.filter((chapterId) => {
    if (!valid.has(chapterId)) return false;
    const chapter = getReportChapterById(chapterId);
    if (!chapter) return false;
    if (chapter.hiddenInExport === true) return false;
    if (chapter.exportable === false) return false;
    return true;
  });
}

export function getSelectedReportChapterIds(selectionState = {}) {
  return REPORT_CHAPTER_IDS.filter((chapterId) => Boolean(selectionState?.[chapterId]));
}

export function getReportSummaryChapters(selectedIds = REPORT_CHAPTER_IDS) {
  const selected = new Set(normalizeSelectedReportChapterIds(selectedIds));
  return dedupeSectionOptions(REPORT_CHAPTERS.filter((chapter) => chapter.includeInSummary && selected.has(chapter.id)));
}

export function dedupeSectionOptions(options = []) {
  const map = new Map();

  (Array.isArray(options) ? options : []).forEach((option) => {
    if (!option) return;
    const key = option.id || `${option.sectionId || ''}:${option.title || ''}`;
    if (!key || map.has(key)) return;
    map.set(key, option);
  });

  return Array.from(map.values());
}

export function hasRenderableContent(option = {}, producedTexts = {}) {
  const key = option.contentKey;
  const content = key ? producedTexts?.[key] : null;

  if (typeof content === 'string') {
    return content.trim().length > 0;
  }

  return Boolean(option.title || option.summaryDescription || option.renderTitle);
}

export function buildReportSectionOptions(chapters = REPORT_CHAPTERS, producedTexts = {}) {
  const rawOptions = (Array.isArray(chapters) ? chapters : []).map((chapter) => ({
    id: chapter.id,
    sectionId: chapter.sectionId || chapter.id,
    title: chapter.title,
    contentKey: chapter.contentKey || `${chapter.id}_text`,
    selected: chapter.defaultSelected !== false,
    chapter,
  }));

  return dedupeSectionOptions(rawOptions)
    .filter((option) => hasRenderableContent(option, producedTexts));
}

export function shouldRenderSectionItem(item = {}, currentSectionId, producedTexts = {}) {
  const content = producedTexts?.[item.contentKey];

  return (
    item.selected === true &&
    item.sectionId === currentSectionId &&
    typeof content === 'string' &&
    content.trim().length > 0
  );
}

export function getReportChapterValidationTitle(chapterId) {
  const chapter = getReportChapterById(chapterId);
  return chapter?.renderTitle || chapter?.title || chapterId;
}

export function getChapterIntro(chapterId, reportContext = {}) {
  const reportCount = reportContext?.total_relatorios || 0;
  const activityCount = reportContext?.total_atividades || 0;
  const audienceCount = reportContext?.publico_total || 0;

  const intros = {
    sumario_executivo: `SÃ­ntese inicial do perÃ­odo a partir de ${activityCount} atividades, ${audienceCount} pessoas em pÃºblico consolidado quando informado e ${reportCount} relatÃ³rios aprovados.`,
    introducao: 'Este capÃ­tulo explica escopo, perÃ­odo, fontes de dados, critÃ©rios de consolidaÃ§Ã£o e limites de leitura dos registros disponÃ­veis no aplicativo.',
    territorio: 'ContextualizaÃ§Ã£o de MIS, MHAB, MUMO e atuaÃ§Ã£o geral a partir dos registros vinculados aos museus e Ã s equipes no perÃ­odo.',
    indicadores_premium: `Painel visual dos indicadores disponÃ­veis: ${activityCount} atividades, ${audienceCount} pÃºblico consolidado quando informado, relatÃ³rios, fotos/anexos, documentos e financeiro.`,
    resumo_geral: 'Leitura transversal do perÃ­odo, interpretando os registros disponÃ­veis sem repetir tabelas, listas completas ou a metodologia geral.',
    publico: 'CapÃ­tulo exclusivo para pÃºblico, distinguindo atividades datadas, pÃºblico por museu, estimativas e registros sem preenchimento especÃ­fico.',
    metas: 'Leitura de aderÃªncia entre aÃ§Ãµes, despesas, rubricas e metas pactuadas no 3Âº Aditivo, sempre a partir de vÃ­nculos registrados no aplicativo.',
    programacao: 'Apresenta aÃ§Ãµes planejadas e realizadas a partir da programaÃ§Ã£o cadastrada e dos relatÃ³rios vinculados, sem repetir a agenda cronolÃ³gica completa.',
    agenda_programacao: 'Organiza cronologicamente os registros do perÃ­odo, preservando data, museu, tipo, pÃºblico e descriÃ§Ã£o real.',
    timeline_premium: 'Transforma a cronologia em marcos editoriais do perÃ­odo, sem substituir a agenda detalhada.',
    atividades_museu: 'CapÃ­tulo principal de atividades, organizado por MIS, MHAB, MUMO e atuaÃ§Ã£o geral, com texto por padrÃ£o e fotos apenas quando selecionadas.',
    museus_premium: 'Leitura individualizada de cada museu, reunindo sÃ­ntese, atividades, pÃºblico, evidÃªncias e pendÃªncias sem repetir todas as atividades.',
    noturno_premium: 'CapÃ­tulo eventual para registros vinculados ao Noturno nos Museus, sem criaÃ§Ã£o de programaÃ§Ã£o especial quando nÃ£o houver dados.',
    relatorios_completos: `A base narrativa do relatÃ³rio considera ${reportCount} relatÃ³rios aprovados, preservando autoria, museu, mÃªs, funÃ§Ã£o e trechos efetivamente registrados pelas equipes.`,
    galeria_evidencias: 'A galeria final reÃºne apenas fotografias nÃ£o selecionadas para o corpo das atividades e mantÃ©m crÃ©dito, origem, legenda e localizaÃ§Ã£o sempre que esses campos existirem no app.',
    galeria_premium: 'Camada de metadados visuais: crÃ©dito, legenda, origem e GPS/localizaÃ§Ã£o existentes, sem preenchimento artificial.',
    comunicacao: 'Apresenta registros objetivos de comunicaÃ§Ã£o, anexos, publicaÃ§Ãµes, materiais, coberturas e evidÃªncias quando existirem no aplicativo.',
    comunicacao_premium: 'Leitura narrativa da comunicaÃ§Ã£o como circulaÃ§Ã£o pÃºblica, documentaÃ§Ã£o institucional, memÃ³ria visual e visibilidade do projeto.',
    financeiro: 'ExecuÃ§Ã£o financeira organizada por solicitado, aprovado, pago, status, rubrica e centro/museu quando os campos estiverem disponÃ­veis.',
    rubricas: 'Rubricas e orÃ§amento por grupo, usando previsto, utilizado, saldo e percentual como fonte de verdade do capÃ­tulo.',
    orcamento_museu: 'A anÃ¡lise do orÃ§amento por museu organiza a execuÃ§Ã£o financeira por MIS, MHAB e MUMO com rubricas especÃ­ficas, compartilhadas e rastreabilidade documental.',
    orcamento_geral: 'O orçamento geral consolida valores financeiros e apresenta todos os relatórios e atividades do período em bloco único de governança e conferência.',
    prestacao: 'PrestaÃ§Ã£o de contas como cruzamento entre solicitaÃ§Ãµes, pagamentos, documentos fiscais, XMLs, recibos e comprovantes.',
    'notas-fiscais-contratos': 'Este capÃ­tulo organiza contratos em PDF e documentos fiscais localizados no app, com foco em rastreabilidade entre execuÃ§Ã£o financeira, comprovaÃ§Ã£o documental e vÃ­nculos operacionais.',
    governanca_documental: 'A governanÃ§a documental apresenta cadeia de evidÃªncias, documentos pareados e sem par, vÃ­nculos e origem dos arquivos sem repetir a tabela fiscal completa.',
    app_museu_centro: 'O aplicativo Ã© apresentado como infraestrutura de registro, consolidaÃ§Ã£o, memÃ³ria, exportaÃ§Ã£o e acompanhamento institucional.',
    sistema_governanca: 'Qualidade da base: campos completos, vÃ­nculos, pendÃªncias, registros incompletos e consistÃªncia entre mÃ³dulos.',
    auditoria_operacional: 'A auditoria operacional cruza dados de programaÃ§Ã£o, pÃºblico, relatÃ³rios, documentos e financeiro para evidenciar consistÃªncia, pendÃªncias e limites de rastreabilidade.',
    conclusao: 'Fechamento editorial baseado nos dados consolidados, sem promessas futuras nem repetiÃ§Ã£o de indicadores.',
  };

  return intros[chapterId] || '';
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getRenderedChapterIdsFromHtml(html = '') {
  const ids = new Set();
  const source = String(html || '');

  source.replace(/data-report-chapter-id="([^"]+)"/g, (_, id) => {
    if (id) ids.add(id);
    return '';
  });

  source.replace(/data-report-chapter-ids="([^"]+)"/g, (_, value) => {
    String(value || '').split(/\s+/).filter(Boolean).forEach((id) => ids.add(id));
    return '';
  });

  return ids;
}

export function validateReportExportWithRegistry(html = '', selectedIds = []) {
  const text = stripHtml(html);
  const renderedIds = getRenderedChapterIdsFromHtml(html);
  const normalizedIds = normalizeSelectedReportChapterIds(selectedIds);
  const missingSelected = normalizedIds.filter((chapterId) => {
    const chapter = getReportChapterById(chapterId);
    if (!chapter || chapter.validatePresence === false) return false;
    if (renderedIds.has(chapterId)) return false;
    const title = getReportChapterValidationTitle(chapterId);
    return title && !text.includes(title);
  });

  return {
    valid: missingSelected.length === 0,
    missingSelected,
    normalizedIds,
    renderedIds: Array.from(renderedIds),
  };
}


