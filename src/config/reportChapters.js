const RAW_REPORT_CHAPTERS = [
  { id: 'capa', title: 'Capa editorial', order: 1, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: false, exportable: true, canBeSplit: true, dataSources: [], requiresData: false, renderTitle: 'Relatório Institucional', validatePresence: false, summaryDescription: 'Abertura visual e institucional do relatório' },
  { id: 'expediente', title: 'Expediente institucional', order: 2, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'equipe', 'cadastros institucionais'], requiresData: false, renderTitle: 'Expediente', summaryDescription: 'Equipes, instituições e responsabilidades do período' },
  { id: 'sumario_executivo', title: 'Sumário executivo editorial', order: 3, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: false, exportable: true, canBeSplit: true, dataSources: ['registry de capítulos', 'seleção atual'], requiresData: false, renderTitle: 'Sumário', summaryDescription: 'Mapa de leitura e organização editorial do relatório' },
  { id: 'introducao', title: 'Introdução institucional', order: 4, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'programação', 'dados institucionais do app'], requiresData: false, renderTitle: 'Introdução', summaryDescription: 'Escopo, período, metodologia e leitura institucional' },
  { id: 'territorio', title: 'Território e contexto cultural', order: 5, group: 'Abertura institucional', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'programação', 'contexto institucional'], requiresData: false, renderTitle: 'Coordenação, planejamento e desenvolvimento institucional', summaryDescription: 'Contexto cultural, planejamento e atuação territorial' },
  { id: 'indicadores_premium', title: 'Indicadores editoriais', order: 6, group: 'Indicadores e metas', type: 'data', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'Programação', 'Rubrica', 'PurchaseRequest', 'Attachment'], requiresData: false, renderTitle: 'Execução física acompanhada por evidências', summaryDescription: 'Indicadores consolidados, metas e leitura de público' },
  { id: 'resumo_geral', title: 'Resumo geral', order: 7, group: 'Indicadores e metas', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'indicadores consolidados'], requiresData: false, renderTitle: 'Introdução', validatePresence: false, summaryDescription: 'Síntese transversal do período e dos resultados' },
  { id: 'publico', title: 'Público alcançado', order: 8, group: 'Indicadores e metas', type: 'data', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'atividades', 'programação vinculada'], requiresData: true, renderTitle: 'Execução física acompanhada por evidências', validatePresence: false, summaryDescription: 'Público registrado, estimado e critérios de consolidação' },
  { id: 'metas', title: 'Metas do 3º Aditivo', order: 9, group: 'Indicadores e metas', type: 'data', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Rubrica', 'atividades', 'metas vinculadas'], requiresData: false, renderTitle: 'Execução física acompanhada por evidências', validatePresence: false, summaryDescription: 'Metas vinculadas e execução associada no período' },
  { id: 'programacao', title: 'Programação', order: 10, group: 'Programação', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['ProgramacaoEspelho', 'Report'], requiresData: true, renderTitle: 'Programação e atividades do período', summaryDescription: 'Ações planejadas e realizadas no recorte selecionado' },
  { id: 'agenda_programacao', title: 'Agenda de programação', order: 11, group: 'Programação', type: 'data', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['ProgramacaoEspelho', 'Report', 'atividades'], requiresData: true, renderTitle: 'Agenda detalhada do período', summaryDescription: 'Cronologia consolidada das ações do período' },
  { id: 'timeline_premium', title: 'Linha do tempo editorial', order: 12, group: 'Programação', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['ProgramacaoEspelho', 'Report'], requiresData: true, renderTitle: 'Programação e atividades do período', validatePresence: false, summaryDescription: 'Linha do tempo e marcos editoriais do período' },
  { id: 'atividades_museu', title: 'Atividades por museu', order: 13, group: 'Atividades', type: 'data', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['atividades', 'Report', 'ProgramacaoEspelho'], requiresData: true, renderTitle: 'Coordenação, planejamento e desenvolvimento institucional', validatePresence: false, summaryDescription: 'Atividades organizadas por museu e por eixo de ação' },
  { id: 'museus_premium', title: 'Páginas por museu', order: 14, group: 'Atividades', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['atividades', 'programação', 'relatórios por museu'], requiresData: true, renderTitle: 'MHAB', validatePresence: false, summaryDescription: 'Síntese editorial individual por equipamento' },
  { id: 'noturno_premium', title: 'Seção especial Noturno nos Museus', order: 15, group: 'Atividades', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['atividades', 'programação', 'rubricas vinculadas ao Noturno'], requiresData: false, renderTitle: 'Seção especial Noturno nos Museus', validatePresence: false, summaryDescription: 'Capítulo eventual para ações do Noturno nos Museus' },
  { id: 'relatorios_completos', title: 'Relatórios integrais das equipes', order: 16, group: 'Atividades', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report'], requiresData: true, renderTitle: 'Fontes internas consolidadas', summaryDescription: 'Base narrativa aprovada pelas equipes do projeto' },
  { id: 'galeria_evidencias', title: 'Galeria e evidências', order: 17, group: 'Evidências', type: 'gallery', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Attachment', 'fotos vinculadas', 'metadados visuais'], requiresData: true, renderTitle: 'Fotos, créditos e localização', summaryDescription: 'Galeria final organizada por museu, mês e atividade' },
  { id: 'galeria_premium', title: 'Galeria com créditos e GPS', order: 18, group: 'Evidências', type: 'gallery', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Attachment', 'créditos', 'GPS', 'localização'], requiresData: true, renderTitle: 'Fotos, créditos e localização', validatePresence: false, summaryDescription: 'Metadados de crédito, origem e localização das imagens' },
  { id: 'comunicacao', title: 'Comunicação', order: 19, group: 'Comunicação', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'Attachment', 'registros internos de comunicação'], requiresData: false, renderTitle: 'Comunicação, registros e evidências', summaryDescription: 'Frente de comunicação, circulação pública e documentação' },
  { id: 'comunicacao_premium', title: 'Comunicação editorial', order: 20, group: 'Comunicação', type: 'editorial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'Attachment', 'registros internos de comunicação'], requiresData: false, renderTitle: 'Comunicação, registros e evidências', validatePresence: false, summaryDescription: 'Leitura narrativa institucional da comunicação do período' },
  { id: 'financeiro', title: 'Execução financeira', order: 21, group: 'Financeiro', type: 'financial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['PurchaseRequest', 'TeamPayment', 'Rubrica'], requiresData: true, renderTitle: 'Orçamento, rubricas e rastreabilidade', summaryDescription: 'Solicitado, aprovado e pago no período consolidado' },
  { id: 'rubricas', title: 'Rubricas e orçamento por grupo', order: 22, group: 'Financeiro', type: 'financial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Rubrica'], requiresData: true, renderTitle: 'Orçamento, rubricas e rastreabilidade', validatePresence: false, summaryDescription: 'Quadro por grupo, saldo e percentual de execução' },
  { id: 'prestacao', title: 'Prestação de contas', order: 23, group: 'Financeiro', type: 'financial', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['PurchaseRequest', 'TeamPayment', 'DocumentIntake', 'Attachment'], requiresData: true, renderTitle: 'Orçamento, rubricas e rastreabilidade', validatePresence: false, summaryDescription: 'Documentos fiscais, comprovações e vínculos financeiros' },
  { id: 'notas-fiscais-contratos', title: 'Notas fiscais e contratos', order: 24, group: 'Financeiro', type: 'documents', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Attachment', 'DocumentIntake', 'PurchaseRequest', 'TeamPayment'], requiresData: false, renderTitle: 'Notas fiscais e contratos', summaryDescription: 'Listagem consolidada de contratos em PDF e documentos fiscais com links de rastreabilidade' },
  { id: 'governanca_documental', title: 'Governança documental e rastreabilidade das evidências', order: 25, group: 'Governança', type: 'governance', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['DocumentIntake', 'Attachment', 'PurchaseRequest', 'TeamPayment'], requiresData: false, renderTitle: 'Governança documental e rastreabilidade das evidências', summaryDescription: 'Pareamento documental, origem dos arquivos e trilha de evidências' },
  { id: 'app_museu_centro', title: 'Museu Centro APP', order: 26, group: 'Governança', type: 'governance', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['módulos do app', 'estrutura operacional existente'], requiresData: false, renderTitle: 'Museu Centro APP como memória operacional', summaryDescription: 'Infraestrutura digital de registro, consolidação e memória' },
  { id: 'sistema_governanca', title: 'Sistema, dados e governança', order: 27, group: 'Governança', type: 'governance', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['módulos do app', 'vínculos entre relatórios, documentos e rubricas'], requiresData: false, renderTitle: 'Museu Centro APP como memória operacional', validatePresence: false, summaryDescription: 'Qualidade, consistência e governança dos dados do sistema' },
  { id: 'auditoria_operacional', title: 'Auditoria operacional do período', order: 28, group: 'Governança', type: 'governance', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['Report', 'ProgramacaoEspelho', 'PurchaseRequest', 'TeamPayment', 'Rubrica', 'DocumentIntake', 'Attachment'], requiresData: false, renderTitle: 'Auditoria operacional do período', summaryDescription: 'Cruzamento técnico entre atividades, público, documentos e financeiro' },
  { id: 'conclusao', title: 'Conclusão', order: 29, group: 'Encerramento', type: 'conclusion', selectable: true, defaultSelected: true, includeInSummary: true, exportable: true, canBeSplit: true, dataSources: ['síntese do relatório consolidado'], requiresData: false, renderTitle: 'Encerramento', validatePresence: false, summaryDescription: 'Fechamento editorial e institucional do período' },
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
  emptyStateText: chapter.emptyStateText || 'Não foram localizados dados suficientes no app para este capítulo no recorte selecionado.',
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
  return REPORT_CHAPTER_IDS.filter((chapterId) => valid.has(chapterId));
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
    sumario_executivo: `Síntese inicial do período a partir de ${activityCount} atividades, ${audienceCount} pessoas em público consolidado quando informado e ${reportCount} relatórios aprovados.`,
    introducao: 'Este capítulo explica escopo, período, fontes de dados, critérios de consolidação e limites de leitura dos registros disponíveis no aplicativo.',
    territorio: 'Contextualização de MIS, MHAB, MUMO e atuação geral a partir dos registros vinculados aos museus e às equipes no período.',
    indicadores_premium: `Painel visual dos indicadores disponíveis: ${activityCount} atividades, ${audienceCount} público consolidado quando informado, relatórios, fotos/anexos, documentos e financeiro.`,
    resumo_geral: 'Leitura transversal do período, interpretando os registros disponíveis sem repetir tabelas, listas completas ou a metodologia geral.',
    publico: 'Capítulo exclusivo para público, distinguindo atividades datadas, público por museu, estimativas e registros sem preenchimento específico.',
    metas: 'Leitura de aderência entre ações, despesas, rubricas e metas pactuadas no 3º Aditivo, sempre a partir de vínculos registrados no aplicativo.',
    programacao: 'Apresenta ações planejadas e realizadas a partir da programação cadastrada e dos relatórios vinculados, sem repetir a agenda cronológica completa.',
    agenda_programacao: 'Organiza cronologicamente os registros do período, preservando data, museu, tipo, público e descrição real.',
    timeline_premium: 'Transforma a cronologia em marcos editoriais do período, sem substituir a agenda detalhada.',
    atividades_museu: 'Capítulo principal de atividades, organizado por MIS, MHAB, MUMO e atuação geral, com texto por padrão e fotos apenas quando selecionadas.',
    museus_premium: 'Leitura individualizada de cada museu, reunindo síntese, atividades, público, evidências e pendências sem repetir todas as atividades.',
    noturno_premium: 'Capítulo eventual para registros vinculados ao Noturno nos Museus, sem criação de programação especial quando não houver dados.',
    relatorios_completos: `A base narrativa do relatório considera ${reportCount} relatórios aprovados, preservando autoria, museu, mês, função e trechos efetivamente registrados pelas equipes.`,
    galeria_evidencias: 'A galeria final reúne apenas fotografias não selecionadas para o corpo das atividades e mantém crédito, origem, legenda e localização sempre que esses campos existirem no app.',
    galeria_premium: 'Camada de metadados visuais: crédito, legenda, origem e GPS/localização existentes, sem preenchimento artificial.',
    comunicacao: 'Apresenta registros objetivos de comunicação, anexos, publicações, materiais, coberturas e evidências quando existirem no aplicativo.',
    comunicacao_premium: 'Leitura narrativa da comunicação como circulação pública, documentação institucional, memória visual e visibilidade do projeto.',
    financeiro: 'Execução financeira organizada por solicitado, aprovado, pago, status, rubrica e centro/museu quando os campos estiverem disponíveis.',
    rubricas: 'Rubricas e orçamento por grupo, usando previsto, utilizado, saldo e percentual como fonte de verdade do capítulo.',
    prestacao: 'Prestação de contas como cruzamento entre solicitações, pagamentos, documentos fiscais, XMLs, recibos e comprovantes.',
    'notas-fiscais-contratos': 'Este capítulo organiza contratos em PDF e documentos fiscais localizados no app, com foco em rastreabilidade entre execução financeira, comprovação documental e vínculos operacionais.',
    governanca_documental: 'A governança documental apresenta cadeia de evidências, documentos pareados e sem par, vínculos e origem dos arquivos sem repetir a tabela fiscal completa.',
    app_museu_centro: 'O aplicativo é apresentado como infraestrutura de registro, consolidação, memória, exportação e acompanhamento institucional.',
    sistema_governanca: 'Qualidade da base: campos completos, vínculos, pendências, registros incompletos e consistência entre módulos.',
    auditoria_operacional: 'A auditoria operacional cruza dados de programação, público, relatórios, documentos e financeiro para evidenciar consistência, pendências e limites de rastreabilidade.',
    conclusao: 'Fechamento editorial baseado nos dados consolidados, sem promessas futuras nem repetição de indicadores.',
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
