export const REPORT_STRUCTURE_RULES = {
  introducao: {
    titulo: 'Introdução institucional',
    tipo: 'ia_texto_automatico',
    tamanho: '1_lauda',
    instrucoes: [
      'Comentar a troca da coordenação com a saída de Andréia Matos e entrada de Daniel Perini em 02/02/2026.',
      'Comentar a substituição da coordenação de programação por consultoria de programação com Ana Luíza.',
      'Explicar que fevereiro foi um período de pausa prevista do projeto.',
      'Explicar que março marca o início efetivo das atividades.',
      'Registrar ações estratégicas de fevereiro: contratações, rituais de gestão e planejamento.',
      'Explicar a criação do Museu Centro APP para pagamentos, relatórios, evidências e geração de relatórios.',
      'Explicar que o aplicativo levou cerca de dois meses e meio para ser desenvolvido e já está entregue.',
      'Contextualizar que exposições e planejamentos importantes foram iniciados no período.',
    ],
  },

  comunicacao: {
    titulo: 'Comunicação',
    incluir_relatorio_anexo: true,
    incluir_links: true,
    instrucoes: [
      'Informar que a comunicação produziu relatório próprio em anexo.',
      'Listar links para redes sociais, clipping, imagens, agendas e programações.',
      'Mencionar produção de posts, peças e ações de divulgação.',
    ],
  },

  programacao: {
    titulo: 'Programação',
    periodo_inicio: '2026-02-02',
    periodo_fim: '2026-04-30',
    incluir_agenda: true,
    instrucoes: [
      'Explicar atraso inicial da programação e regularização do planejamento.',
      'Explicar planejamento de três atividades mensais, uma por museu.',
      'Mencionar integração entre Ana Luíza e os museus.',
      'Registrar atividades educativas, culturais e visitas.',
      'Registrar planejamento do Noturno nos Museus.',
      'Registrar entrada de Silvia Góes no MUMO.',
      'Registrar permanência de Daniela Assis no Noturno nos Museus.',
    ],
  },

  galeria: {
    titulo: 'Galeria e Evidências',
    fotos_por_relatorio: 4,
    fotos_principais_por_atividade: 2,
    georreferenciamento: true,
    listar_imagens_relacionadas: true,
    instrucoes: [
      'Cada relatório deve conter no mínimo 4 fotos.',
      'Cada atividade deve conter 2 fotos principais.',
      'Listar imagens relacionadas abaixo das fotos principais.',
      'Associar fotos às respectivas atividades e relatórios.',
      'Manter evidências georreferenciadas.',
    ],
  },

  relatorios: {
    titulo: 'Relatórios completos',
    incluir_texto_integral: true,
    instrucoes: [
      'Transcrever integralmente os relatórios preenchidos pelas equipes.',
      'Preservar textos originais.',
      'Associar fotos e evidências às atividades correspondentes.',
    ],
  },

  compras: {
    titulo: 'Compras e Rubricas',
    incluir_rubricas: true,
    incluir_cards_museu: true,
    museus: ['MIS', 'MHAB', 'MUMO'],
    instrucoes: [
      'Listar rubricas com previsto, utilizado, saldo e percentual.',
      'Exibir cards financeiros por museu.',
      'Mostrar quanto cada museu executou.',
      'Comentar que a execução financeira está dentro do ritmo esperado.',
      'Explicar que há previsão de gastos maiores nas próximas etapas.',
    ],
  },
};

export function buildReportGenerationContext() {
  return {
    version: '2026.05.relatorio-final',
    strategy: 'structured_ai_report_generation',
    sections: REPORT_STRUCTURE_RULES,
  };
}
