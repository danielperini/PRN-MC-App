export const REPORT_EDITORIAL_TEMPLATE = {
  identity: {
    projectName: 'Projeto Museus Centro',
    institution: 'Viaduto das Artes',
    tone: 'institucional, técnico, denso, claro e verificável',
    language: 'pt-BR',
    headerLines: [
      'Viaduto das Artes – Fundado em 16 de junho de 2015',
      'Av. Olinto Meireles, 45 – Barreiro – Belo Horizonte/MG',
      'CEP 30640-010 – E-mail: viadutodasartes@gmail.com',
    ],
  },
  typography: {
    headingFont: 'Georgia, "Times New Roman", serif',
    bodyFont: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    headingWeight: 500,
    bodyLineHeight: 1.65,
  },
  colors: {
    background: '#f7f3eb',
    text: '#171717',
    muted: '#5f5f5f',
    accent: '#9f7f4d',
    dark: '#171717',
    white: '#ffffff',
  },
  editorialRules: {
    neverInventData: true,
    useOnlyAppData: true,
    explainDataSource: true,
    explainConsolidationCriteria: true,
    showLimitationsWhenDataMissing: true,
    avoidGenericPraise: true,
    avoidRepeatedAutomaticPhrases: true,
    keepChapterMethodsOutsideCards: true,
  },
  layoutRules: {
    avoidBlankPages: true,
    avoidOrphanHeadings: true,
    avoidBrokenTables: true,
    keepImageWithCaption: true,
    useMethodologyBoxes: true,
    useSummaryGrid: true,
    allowLongCardsToBreak: true,
  },
};

export const REPORT_INSTITUTIONAL_REALIZATION = [
  'Prefeitura de Belo Horizonte',
  'Fundação Municipal de Cultura',
  'Diretoria de Museus - DEMUS',
  'Viaduto das Artes',
];

export const REPORT_ACTIVITY_NATURES = [
  'PUBLICA_EDUCATIVA',
  'VISITA_MEDIADA',
  'PROGRAMACAO_CULTURAL',
  'PRODUCAO',
  'COMUNICACAO',
  'GESTAO_REUNIAO',
  'MANUTENCAO_INFRA',
  'DOCUMENTACAO_RELATORIO',
  'VISITA_TECNICA_USO_ESPACO',
  'ROTINA_INTERNA',
];
