// Descrições curtas de cada item do sidebar para o tour guiado.
// Chave = path (sem barra inicial) usado no atributo href do Link.
export const TOUR_DESCRICAO = {
  Dashboard: 'Painel principal com resumo das ações, relatórios e indicadores do mês.',
  DashboardPatrocinador: 'Painel do patrocinador com indicadores e visão geral do projeto.',
  MeusDados: 'Seu espaço pessoal: perfil, pagamentos, atividades, documentos e galeria.',
  Perfil: 'Seus dados de perfil e preferências de conta.',
  Manual: 'Manual e ajuda interativa da plataforma.',
  Tutoriais: 'Tutoriais em vídeo para aprender a usar o sistema.',
  Aparencia: 'Personalize o tema visual e acesse ferramentas administrativas.',
  EntradaUnica: '1. Arraste ou selecione o PDF e o XML ao mesmo tempo — o sistema os vincula pelo número da NF. → 2. Após o upload, aguarde alguns minutos enquanto a IA analisa e extrai os dados. → 3. Quando a análise terminar, o documento aparece na fila com status "Aguardando Revisão". → 4. Você que fez o upload revisa os dados extraídos (fornecedor, valor, data, número) e confirma ou corrige. → 5. Após a revisão, clique em "Enviar para Aprovação".',
  AssistantChat: 'Este é o Assistente de IA — clique no ícone de balão para abrir o chat. Ele está conectado à base de conhecimento da plataforma e responde perguntas sobre compras, relatórios, rubricas, equipe, programação e muito mais. Basta digitar sua dúvida e pressionar Enter.',
  Agenda: 'Consulte a programação cultural por museu e mês.',
  AssistentePlanejamento: 'Assistente de IA para planejamento e consultas operacionais.',
  Relatorios: 'Crie, edite e exporte relatórios mensais com atividades e fotos.',
  RelatorioExecucaoObjeto: 'Gere o relatório institucional consolidado de execução do objeto.',
  Compras: 'Registre despesas com fornecedores e acompanhe aprovações e pagamentos.',
  RubricasPorMuseu: 'Controle orçamentário: previsto, utilizado e saldo por museu.',
  Movimentacoes: 'Extratos bancários e movimentações financeiras do projeto.',
  Equipe: 'Gestão de contratos, parcelas e pagamentos da equipe.',
  GaleriaFotos: 'Acervo fotográfico vinculado às atividades e relatórios.',
  ComunicacaoVisibilidade: 'Clipping, visibilidade e métricas de comunicação.',
  LeitorNoticias: 'Notícias curadas sobre cultura, museus e o setor criativo.',
  Mensagens: 'Mensagens institucionais e comunicações internas.',
  UserManagement: 'Gestão de usuários, convites e permissões.',
  AuditoriaInstitucional: 'Auditoria institucional e consistência do sistema.',
  PlataformaAdmin: 'Administração geral e ferramentas da plataforma.',
  MuseusNoMapa: 'Agenda dos museus visualizeada no mapa territorial.',
  ProgramacaoEspelho: 'Programação completa: sinopse, minibios e material de divulgação.',
};

const DEFAULT_DESC = 'Seção do sistema — explore para conhecer suas funções.';

// Lê os itens visíveis do sidebar diretamente do DOM, respeitando o perfil do usuário
// (somente os links de navegação principal dentro do <nav>, excluindo links externos do Drive).
export function gatherTourSteps(asideEl) {
  if (!asideEl) return [];
  const links = Array.from(asideEl.querySelectorAll('nav a[href^="/"]'));
  const seen = new Set();
  const steps = [];
  links.forEach((a) => {
    const path = a.getAttribute('href').replace(/^\//, '');
    if (!path || seen.has(path)) return;
    seen.add(path);
    const label = (a.textContent || '').trim() || path;
    steps.push({ path, label, element: a, descricao: TOUR_DESCRICAO[path] || DEFAULT_DESC });
  });
  return steps;
}

export default TOUR_DESCRICAO;