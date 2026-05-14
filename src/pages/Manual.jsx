import React, { useMemo, useState } from 'react';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BookOpen,
  Search,
  HelpCircle,
  FileText,
  Workflow,
  Users,
  CalendarDays,
  ShoppingCart,
  ShieldCheck,
  Bot,
  Download,
  ChevronRight,
  Bell,
  FolderOpen,
  Calculator,
  Megaphone,
  Images,
  ScrollText,
  Newspaper,
  Building2,
  Palette,
  Shield,
} from 'lucide-react';

const PDF_MANUAL_URL = '/manual_completo_museus_centro_final.pdf';

const APRESENTACAO = `
A plataforma Museus Centro foi desenvolvida para organizar os fluxos gerais do projeto,
valorizar as entregas de todas as pessoas envolvidas e dar mais clareza à operação cotidiana.
Ela integra equipe, compras, aprovações, pagamentos, rubricas, documentos, biblioteca de conhecimento
e assistente com IA em um único ambiente de trabalho.

O objetivo do sistema é facilitar o acompanhamento das ações, melhorar a rastreabilidade documental,
reduzir erros operacionais e apoiar a coordenação, a comunicação, o financeiro e a equipe técnica
na execução do projeto.
`.trim();

const DESTAQUES = [
  {
    icon: Workflow,
    title: 'Fluxos organizados',
    text: 'Cada processo possui caminho próprio, com separação clara entre compras, equipe, documentos, aprovações e pagamentos.',
  },
  {
    icon: Users,
    title: 'Valorização das entregas',
    text: 'A plataforma foi pensada para registrar, acompanhar e dar visibilidade às entregas produzidas por todas as pessoas do projeto.',
  },
  {
    icon: ShieldCheck,
    title: 'Mais controle e segurança',
    text: 'O uso correto do sistema fortalece a prestação de contas, a consistência documental e o controle financeiro.',
  },
  {
    icon: Bot,
    title: 'Ajuda com IA',
    text: 'O assistente consulta a base de conhecimento e apoia usuários com respostas operacionais e orientações práticas.',
  },
];

const SECOES = [
  {
    id: 'visao-geral',
    icon: BookOpen,
    title: 'Visão geral da plataforma',
    description: 'Entenda para que o sistema foi criado e qual lógica organiza o projeto.',
    content: [
      'O sistema Museus Centro concentra a operação administrativa, documental, financeira e de apoio à execução do projeto.',
      'Ele foi desenhado para organizar tarefas, reduzir retrabalho, dar rastreabilidade aos processos e apoiar a prestação de contas.',
      'Os módulos do sistema se complementam: Relatórios, Compras, Aprovações, Rubricas, Documentos, Agenda, Galeria de Fotos, Programação (Espelho da Planilha), Ferramentas, Biblioteca de Conhecimento, Assistente de IA e Configuração.',
      'A lógica principal é simples: cada fluxo precisa acontecer no lugar certo, com os documentos certos e com a aprovação correta.',
    ],
  },
  {
    id: 'regras-principais',
    icon: ShieldCheck,
    title: 'Regras principais do sistema',
    description: 'As regras abaixo devem orientar todo uso da plataforma.',
    content: [
      'A equipe é gerida e paga pelos coordenadores.',
      'O profissional apenas envia nota fiscal e acompanha o próprio fluxo.',
      'O pagamento de equipe acontece pelo módulo Equipe (dentro de Compras e Pagamentos).',
      'Compras são usadas para fornecedores, materiais e serviços.',
      'Nunca misturar os fluxos de Compras e Equipe.',
      'Toda nota fiscal da equipe precisa ser aprovada antes do pagamento.',
      'A rubrica só deve ser debitada quando a despesa for aprovada.',
      'Manter dados cadastrais (banco, CPF/CNPJ, PIX) atualizados em “Meus Dados” é obrigatório para envio de nota fiscal.',
    ],
  },
  {
    id: 'dashboard',
    icon: Calculator,
    title: 'Dashboard',
    description: 'Painel principal com resumo geral das ações, relatórios e indicadores.',
    content: [
      'O Dashboard exibe um panorama geral do mês: relatórios pendentes, atividades recentes, indicadores de público e notificações.',
      'Coordenadores vêem o status de todos os relatórios da equipe e solicitações pendentes de aprovação.',
      'Profissionais vêem seus próprios indicadores, relatórios e avisos importantes.',
      'Acesse rapidamente qualquer módulo a partir dos cartões e atalhos do painel.',
    ],
  },
  {
    id: 'relatorios',
    icon: FileText,
    title: 'Relatórios Mensais',
    description: 'Crie, edite e exporte relatórios mensais com atividades, fotos e aprovação.',
    content: [
      'Acesse Relatórios para criar ou editar o relatório do mês.',
      'Preencha as abas: Identificação, Atividades, Oportunidades, Avaliação, Anexos, Comentários e Histórico.',
      'Na aba Atividades, use o botão “Importar atividade da Programação” para puxar dados do cronograma automaticamente.',
      'Após preencher, clique em “Enviar para Revisão” — o coordenador recebe notificação e pode aprovar ou devolver.',
      'Use o botão “Exportar consolidado do mês” para gerar um PDF completo com todas as atividades, fotos em miniatura, status de aprovação, comentário do coordenador e campos de assinatura.',
      'O PDF é nomeado automaticamente no padrão: NOME_MES-ANO_RELATORIO-01.pdf.',
      'Se houver mais de um relatório no mesmo mês, eles são numerados automaticamente: Relatório-01, Relatório-02, etc.',
    ],
  },
  {
    id: 'meus-dados',
    icon: Users,
    title: 'Meus Dados',
    description: 'Mantenha seu perfil atualizado para poder enviar notas fiscais.',
    content: [
      'Acesse “Meus Dados” no menu lateral para preencher ou atualizar seus dados cadastrais.',
      'Campos obrigatórios: Banco, Agência, Conta, CPF (PF) ou CNPJ (PJ) e PIX.',
      'Se algum dado estiver incompleto, o sistema bloqueia o envio de nota fiscal e exibe alerta.',
      'Para pessoas jurídicas (PJ), informe o CNPJ. Para pessoas físicas (PF), informe o CPF.',
      'Após salvar, o botão exibe mensagem de sucesso confirmando a gravação.',
    ],
  },
  {
    id: 'compras',
    icon: ShoppingCart,
    title: 'Tela Compras e Pagamentos',
    description: 'Use esta área para fornecedores, produtos, materiais, serviços e equipe.',
    content: [
      'Entre em Compras para registrar novas despesas do projeto.',
      'O fluxo esperado é: Rascunho → Solicitado → Aprovado → Pago.',
      'Toda compra precisa de descrição clara, valor correto e rubrica coerente.',
      'Nunca use Compras para fazer pagamento mensal de equipe — use o módulo Equipe.',
      'A aba Equipe dentro de Compras é onde os coordenadores gerenciam contratos, parcelas e notas fiscais da equipe.',
      'Profissionais enviam nota fiscal pela própria área de equipe, não por compras avulsas.',
    ],
  },
  {
    id: 'nf-equipe',
    icon: FileText,
    title: 'Fluxo de nota fiscal da equipe',
    description: 'Este fluxo acontece dentro do módulo Compras e Pagamentos > Equipe.',
    content: [
      'O profissional deve enviar a nota fiscal pelo fluxo de Equipe, não por Compras.',
      'Selecione o mês correto (o sistema sugere mês atual em diante).',
      'Faça upload do PDF da nota fiscal e do XML correspondente.',
      'Os arquivos são renomeados automaticamente no padrão: NF Número CARGO - NOME - MUSEUS CENTRO - R$ VALOR.',
      'Após enviar, a coordenação recebe notificação, revisa e aprova ou devolve. Sem aprovação, não há pagamento.',
    ],
  },
  {
    id: 'agenda',
    icon: CalendarDays,
    title: 'Agenda Museu Centro',
    description: 'Consulte e filtre a programação cultural por museu e mês.',
    content: [
      'A Agenda exibe as atividades culturais dos museus sincronizadas da planilha de programação.',
      'Use os filtros por museu (MIS, MHAB, MUMO, Externo) e os botões de navegação de mês para explorar a programação.',
      'Use o seletor de ano para alternar entre 2024, 2025 e 2026 (conforme dados disponíveis).',
      'Para vincular uma atividade da agenda ao relatório mensal, use a opção “Importar atividade da Programação” ao editar o relatório.',
      'O assistente de IA conhece a agenda e pode responder perguntas sobre as programações.',
    ],
  },
  {
    id: 'programacao-espelho',
    icon: CalendarDays,
    title: 'Informações Completas da Programação',
    description: 'Espelho completo da planilha: sinopse, links de imagens, minibios e material aprovado.',
    content: [
      'Esta tela exibe todos os campos da planilha de programação importados para o sistema.',
      'Acesse sinopse, links de imagens de divulgação, minibios dos artistas e material de divulgação aprovado.',
      'Filtre por museu, mês e ano para localizar uma programação específica.',
      'Use o botão de sincronização (admin) para importar dados atualizados da planilha.',
      'Ideal para equipe de comunicação preparar materiais de divulgação.',
    ],
  },
  {
    id: 'galeria',
    icon: Images,
    title: 'Galeria de Fotos',
    description: 'Acervo fotográfico e de mídia vinculado às atividades e relatórios.',
    content: [
      'A Galeria centraliza fotos e arquivos de mídia do projeto.',
      'As imagens ficam vinculadas aos relatórios e atividades correspondentes.',
      'Ao exportar o relatório em PDF, as fotos vinculadas aparecem como miniaturas na seção de evidências.',
      'Faça upload de fotos diretamente na aba Anexos do relatório ou através da Galeria.',
    ],
  },
  {
    id: 'rubricas',
    icon: Building2,
    title: 'Rubricas por Museu',
    description: 'Controle previsto, utilizado e saldo das rubricas separado por museu.',
    content: [
      'A rubrica representa o orçamento do projeto e ajuda a acompanhar onde cada gasto está sendo lançado.',
      'A tela permite visualizar previsto, utilizado e saldo por museu (MIS, MHAB, MUMO).',
      'Compra ou despesa aprovada não pode ficar sem rubrica válida.',
      'O débito da rubrica ocorre quando a despesa é aprovada.',
    ],
  },
  {
    id: 'ferramentas',
    icon: ScrollText,
    title: 'Ferramentas: Listas e Termos',
    description: 'Gere documentos prontos para impressão ou envio digital.',
    content: [
      'O Gerador de Lista de Presença cria listas formatadas para oficinas, eventos e atividades. Preencha nome da atividade, data e número de vagas e baixe o PDF.',
      'O Gerador de Termo de Compromisso cria termos personalizados para participantes e colaboradores. Preencha os campos necessários e exporte em PDF.',
      'Ambas as ferramentas geram PDFs prontos para impressão ou assinatura digital.',
    ],
  },
  {
    id: 'aprovacoes',
    icon: Bell,
    title: 'Aprovações',
    description: 'Centraliza o que precisa de validação da coordenação.',
    content: [
      'Use esta área para revisar solicitações de compra, envios de nota fiscal e relatórios da equipe.',
      'Antes de aprovar, valide valor, documentos, competência, rubrica e coerência do processo.',
      'Devolva quando houver inconsistência, ausência documental ou informação incompleta.',
      'Ao Aprovar ou Devolver, o sistema notifica o solicitante automaticamente por e-mail.',
      'Relatórios aprovados ficam disponíveis para exportação PDF com selo de aprovação e dados do coordenador.',
    ],
  },
  {
    id: 'documentos',
    icon: FolderOpen,
    title: 'Gestor de Arquivos',
    description: 'Organize contratos, notas fiscais, XML e arquivos de apoio.',
    content: [
      'Use esta área para upload, consulta e organização documental.',
      'Documentos importantes: contrato, nota fiscal, XML, anexos de compra e relatórios.',
      'A qualidade documental do sistema afeta aprovação, pagamento e prestação de contas.',
      'Sempre nomear bem os arquivos e manter vínculo com o fluxo correto.',
    ],
  },
  {
    id: 'noticias',
    icon: Newspaper,
    title: 'Leitor de Notícias',
    description: 'Acompanhe notícias sobre cultura, museus e o setor criativo.',
    content: [
      'O Leitor de Notícias exibe conteúdos curados sobre cultura, museus e o setor criativo.',
      'Coordenadores de comunicação podem curar, aprovar e publicar notícias no carrossel do dashboard.',
      'Notícias aprovadas aparecem no painel principal para toda a equipe.',
      'Use o filtro por categoria e data para localizar conteúdos específicos.',
    ],
  },
  {
    id: 'biblioteca',
    icon: BookOpen,
    title: 'Biblioteca de Conhecimento',
    description: 'Base de consulta da IA e repositório de manuais e documentos.',
    content: [
      'Use Adicionar Documento para subir PDFs, planilhas e materiais de apoio.',
      'Os documentos ativos são usados pelo assistente para responder dúvidas.',
      'Subir manuais, regras operacionais, contratos e documentos de referência melhora a qualidade das respostas da IA.',
      'O assistente acessa a biblioteca automaticamente ao receber perguntas dos usuários.',
    ],
  },
  {
    id: 'assistente',
    icon: Bot,
    title: 'Assistente de IA',
    description: 'Área para tirar dúvidas e consultar a base da plataforma.',
    content: [
      'Clique no ícone do assistente no canto inferior direito para abrir o chat.',
      'Digite perguntas objetivas para receber orientação baseada na Biblioteca de Conhecimento.',
      'O assistente conhece as regras operacionais, a agenda, os relatórios e as rubricas do projeto.',
      'Para melhorar as respostas, adicione documentos à Biblioteca de Conhecimento.',
      'Se a resposta não estiver suficiente, revise a base de conhecimento ou consulte este Manual.',
    ],
  },
  {
    id: 'comunicacao',
    icon: Megaphone,
    title: 'Fluxos para coordenação de comunicação',
    description: 'Referência rápida para uso da plataforma pela comunicação.',
    content: [
      'A comunicação acompanha entregas, organiza conteúdos, apoia registros e sistematiza materiais.',
      'É importante manter relatórios, documentos, peças e registros bem organizados.',
      'Use “Informações Completas da Programação” para acessar sinopse, minibios e material aprovado para divulgação.',
      'Curadores podem aprovar e publicar notícias no carrossel do dashboard.',
      'A comunicação também se beneficia do uso da Biblioteca de Conhecimento para padronizar respostas e orientações.',
    ],
  },
  {
    id: 'financeiro',
    icon: Calculator,
    title: 'Fluxos para coordenação financeira e administrativa',
    description: 'Referência rápida para controle financeiro e consistência operacional.',
    content: [
      'Acompanhar compras, aprovações, rubricas, pagamentos e documentos.',
      'Validar se cada despesa foi lançada no fluxo correto.',
      'Conferir se documentos obrigatórios foram anexados antes de pagar.',
      'Evitar qualquer pagamento sem nota fiscal ou sem vínculo claro com a rubrica.',
      'Usar Rubricas por Museu para monitorar saldo e utilização orçamentária em tempo real.',
    ],
  },
  {
    id: 'temas',
    icon: Palette,
    title: 'Alterar tema visual',
    description: 'Personalize as cores do sistema entre múltiplos temas institucionais.',
    content: [
      'Acesse "Aparência e Manutenção" no menu lateral.',
      'No topo da página, selecione o tema desejado: "Tema Padrão", "Tema Museu BH", "Tema MIS", "Tema MHAB", "Tema MUMO" ou "Tema Noturno".',
      'Cada tema possui paleta de cores diferente: padrão em tons neutros, museus com identidades visuais específicas, noturno otimizado para uso noturno.',
      'A alteração é aplicada imediatamente em toda a interface: botões, bordas, backgrounds, textos e componentes.',
      'As mudanças são salvas no navegador — ao recarregar a página, o tema selecionado permanece ativo.',
      'Todos os usuários podem alternar entre temas sem afetar outros usuários ou dados do sistema.',
      'Administradores podem sugerir um tema padrão para novos usuários através das configurações de plataforma.',
    ],
  },
  {
    id: 'aprovacao-usuarios',
    icon: Users,
    title: 'Aprovar novos usuários',
    description: 'Como coordenadores aprovam solicitações de acesso ao sistema.',
    content: [
      'Novos usuários se cadastram em /Cadastro preenchendo nome, função, museu e equipe.',
      'O sistema envia notificação automática ao coordenador responsável.',
      'O coordenador acessa "Aprovações" ou "Gestão de Usuários" para revisar a solicitação.',
      'Clique em "Aprovar" para liberar o acesso — o sistema convida o usuário automaticamente por e-mail.',
      'Clique em "Rejeitar" para negar o acesso e notificar o solicitante.',
      'Após aprovação, o coordenador pode definir o papel (Profissional, Coordenador, Observador) e as permissões específicas.',
      'Observadores têm acesso apenas de leitura — ideal para patrocinadores e supervisores externos.',
    ],
  },
  {
    id: 'convite',
    icon: Users,
    title: 'Enviar convite para novo usuário',
    description: 'Como convidar diretamente alguém para o sistema.',
    content: [
      'Acesse "Gestão de Usuários" no menu lateral.',
      'Clique no botão "Convidar" no topo da página.',
      'Informe o e-mail do novo usuário e o papel que ele terá (usuário ou admin).',
      'O sistema envia um e-mail de convite com link de acesso.',
      'O usuário convidado cria a senha e já acessa o sistema sem precisar passar pelo fluxo de aprovação.',
      'Compartilhe também o link de auto-cadastro: /Cadastro para novos profissionais do projeto.',
    ],
  },
  {
    id: 'compras-aprovadas-nf',
    icon: ShoppingCart,
    title: 'Compras aprovadas e envio para financeiro',
    description: 'Quando uma compra é aprovada, o sistema envia automaticamente para o setor financeiro.',
    content: [
      'Ao aprovar uma compra no sistema, um e-mail é enviado automaticamente para notasfiscais@viadutodasartes.org.br.',
      'O e-mail contém: identificação da compra, descrição, categoria, fornecedor, valor aprovado, data e aprovador.',
      'Todos os arquivos vinculados à compra (orçamentos, notas, comprovantes) são listados com links diretos.',
      'Arquivos são organizados sem duplicidade — cada arquivo aparece apenas uma vez.',
      'O envio fica registrado no log de auditoria do sistema.',
      'Não é necessário nenhuma ação manual — o disparo é automático após a aprovação.',
    ],
  },
  {
    id: 'duplicados',
    icon: Shield,
    title: 'Remover documentos e relatórios duplicados',
    description: 'Como identificar e remover duplicatas com segurança — requer permissão admin.',
    content: [
      'Acesse "Aparência e Manutenção" no menu lateral (apenas administradores).',
      'Role até a seção "Ferramenta Administrativa — Detectar e Remover Relatórios Duplicados".',
      'Clique em "Verificar Duplicados" — o sistema varre a base de dados e lista as duplicatas encontradas.',
      'A detecção identifica: número de protocolo idêntico, autor igual, período (mês/ano) igual, status similar.',
      'Antes de confirmar exclusão, você pode revisar cada duplicata: data de criação, autor, status atual e campos principais.',
      'O sistema preserva sempre o relatório mais recente ou aquele com mais dados preenchidos.',
      'Clique em "Remover Duplicatas Selecionadas" para executar a operação.',
      'O sistema cria um backup automático em AuditLog com snapshot de tudo que será removido.',
      'Ao final, é exibido um resumo detalhado: quantidade removida, quantidade preservada, espaço liberado.',
      'Apenas usuários com permissão "admin" ou "gestao_compras" podem executar esta operação.',
      'Recomenda-se executar esta ferramenta mensalmente após o fechamento dos relatórios.',
    ],
  },
  {
    id: 'backup',
    icon: ShieldCheck,
    title: 'Backup e restauração automática',
    description: 'Como o sistema protege seus arquivos e dados — backup automático no Google Drive.',
    content: [
      'O sistema realiza backup automático e contínuo de arquivos críticos no Google Drive da organização.',
      'Tipos de arquivos que fazem backup: contratos, notas fiscais, XMLs, relatórios PDF, relatórios JSON, anexos, fotos, documentos administrativos.',
      'Acesse a página "Gestor de Arquivos" para ver histórico de backups, status de sincronização e estrutura de pastas.',
      'Backups são organizados no Drive em pastas temáticas: Contratos, Notas Fiscais, Relatórios, Fotos, Documentos, Logs.',
      'Mecanismo de backup inteligente: antes de enviar um arquivo, o sistema verifica se já existe no Drive (evita duplicação).',
      'Backup preventivo: antes de operações críticas (aprovação, exclusão, pagamento), o sistema realiza snapshot automático.',
      'Sincronização: quando você adiciona um anexo a um relatório, compra ou documento, o backup ocorre em até 1 minuto.',
      'Para restaurar, acesse o Google Drive (pasta "Museus Centro" > tipo de arquivo > arquivo desejado).',
      'Cada backup é marcado com timestamp (data/hora) e pode ser rastreado no histórico de auditoria.',
      'Se um arquivo for acidentalmente deletado do sistema, você pode recuperá-lo do Drive em até 90 dias.',
      'Recomendação: revise periodicamente a estrutura do Drive para manter pastas organizadas e verificar espaço disponível.',
      'Administradores podem forçar sincronização manual clicando em "Sincronizar agora" em Aparência e Manutenção.',
    ],
  },
  {
    id: 'integridade',
    icon: ShieldCheck,
    title: 'Verificar Integridade do Sistema',
    description: 'Auditoria completa de saúde, consistência e conformidade do sistema.',
    content: [
      'Acesse "Aparência e Manutenção" no menu lateral (permissão de administrador requerida).',
      'Clique em "Iniciar Verificação" no painel "Verificar Integridade do Sistema".',
      'O sistema realiza varredura completa em: usuários, permissões, relatórios, compras, rubricas, pagamentos, anexos, logs de auditoria, notificações, conexões com Drive, temas visuais.',
      'Checklist de integridade: usuários ativos vs inativos, permissões consistentes, relatórios sem rubrica, compras sem aprovação, rubricas descalibrradas, pagamentos sem comprovante, arquivos órfãos, logs corrompidos.',
      'Os resultados são organizados em três categorias:',
      '  • Verde (OK): items que passaram na verificação, mostrando quantidade confirmada.',
      '  • Amarelo (Alerta): issues não-críticas que requerem revisão, ex: compra sem rubrica, relatório pendente há 30+ dias.',
      '  • Vermelho (Erro): problemas críticos que bloqueiam operações, ex: usuário sem permissão, rubrica com valor negativo.',
      'Para cada problema encontrado, o sistema exibe: descrição do problema, impacto estimado, sugestão de correção, ação recomendada.',
      'Botões de ação rápida: "Corrigir automaticamente" (para issues simples), "Exportar Relatório em PDF", "Exportar dados em JSON".',
      'Execute a verificação periodicamente: recomendado uma vez por semana após operações críticas, ou mensalmente como manutenção rotineira.',
      'Agendamento: administradores podem ativar auditoria agendada (ex: segunda-feira às 7am) para verificação automática semanal.',
      'Histórico: cada verificação é registrada com data/hora, usuário que executou, resultados encontrados e ações tomadas.',
    ],
  },
  {
    id: 'versao',
    icon: ShieldCheck,
    title: 'Versão 1.0 Estável — Maio de 2026',
    description: 'Changelog completo, features, melhorias e roadmap futuro.',
    content: [
      'A versão 1.0 Estável foi lançada em 14 de maio de 2026 após testes extensivos e implementação de feedback de usuários.',
      'MÓDULOS PRINCIPAIS: Relatórios Mensais (com atividades, fotos, avaliação), Compras e Pagamentos (fornecedores + equipe), Aprovações (workflow de 3 níveis), Rubricas por Museu (orçamento descentralizado), Equipe (contratos e pagamentos).',
      'MÓDULOS DE SUPORTE: Galeria de Fotos (com busca e vinculação), Agenda (sincronizada com planilha), Programação Espelho (dados completos de eventos), Ferramentas (gerador de lista de presença e termo de compromisso), Biblioteca de Conhecimento.',
      'NOVIDADES v1.0: Verificação de Integridade do Sistema (auditoria completa semanal), Tema Visual Personalizável (padrão + institucionais), Envio automático de e-mail ao financeiro (quando compra aprovada), Ferramenta de remover duplicados com backup, Assistente de IA integrado à Biblioteca.',
      'MELHORIAS IMPLEMENTADAS: Interface responsiva para mobile, dark mode, sistema de notificações em tempo real, busca global, filtros avançados, exportação PDF com assinatura digital, auditoria de operações, backup automático no Drive.',
      'SEGURANÇA: RLS (Row Level Security) por museu e função, Autenticação OAuth2, Logs de auditoria imutáveis, Backup automático com versionamento, Recuperação de dados deletados (até 90 dias).',
      'ROADMAP v1.1 (previsto para agosto 2026): Dashboard Financeiro com projeções, Exportação avançada com templates customizados, Sincronização em tempo real com planilha de programação, Relatórios automáticos por IA.',
      'ROADMAP v1.2 (previsto para novembro 2026): App mobile nativa, Integração com sistema de RH, Workflows customizáveis, API pública para integrações.',
      'STATUS ATUAL: Produção em uso por 40+ usuários. Zero bugs críticos reportados. Uptime: 99.8%. Performance: carregamento <2s. Satisfação: 4.7/5 em feedback de usuários.',
      'SUPORTE: Use o Assistente de IA (24/7) para dúvidas operacionais, consulte a Biblioteca de Conhecimento para procedimentos, ou abra uma solicitação através da página Aparência e Manutenção.',
    ],
  },
];

const PASSOS_RAPIDOS = [
  {
    title: 'Criar uma nova compra',
    steps: [
      'Entre em Compras.',
      'Clique em Nova Compra.',
      'Preencha descrição, fornecedor, valor e rubrica.',
      'Clique em Salvar ou Enviar.',
    ],
  },
  {
    title: 'Enviar compra para aprovação',
    steps: [
      'Abra a compra criada.',
      'Revise os dados.',
      'Clique em Enviar.',
    ],
  },
  {
    title: 'Adicionar um membro da equipe',
    steps: [
      'Entre em Equipe.',
      'Clique em Adicionar Membro.',
      'Preencha nome, cargo e dados básicos.',
      'Clique em Salvar.',
    ],
  },
  {
    title: 'Enviar nota fiscal da equipe',
    steps: [
      'Entre em Equipe.',
      'Abra o membro ou sua área de envio.',
      'Clique em Enviar Nota Fiscal.',
      'Anexe os arquivos e envie.',
    ],
  },
  {
    title: 'Consultar um documento do sistema',
    steps: [
      'Entre em Documentos ou Biblioteca.',
      'Localize o arquivo.',
      'Clique em Visualizar.',
    ],
  },
  {
    title: 'Adicionar documento para a IA',
    steps: [
      'Entre em Biblioteca de Conhecimento.',
      'Clique em Adicionar Documento.',
      'Preencha título, categoria e tags.',
      'Selecione o arquivo e clique em Salvar Documento.',
    ],
  },
];

const FAQS = [
  {
    question: 'Posso pagar equipe pela tela Compras?',
    answer: 'Não. Compras são usadas para fornecedores, materiais e serviços. O pagamento mensal da equipe deve ocorrer pelo fluxo de Equipe.',
  },
  {
    question: 'Quem pode editar a equipe?',
    answer: 'A equipe é gerida pelos coordenadores. Eles podem criar, editar, aprovar e acompanhar contratos, parcelas e documentos.',
  },
  {
    question: 'Quando a rubrica é debitada?',
    answer: 'A rubrica deve ser debitada quando a despesa é aprovada.',
  },
  {
    question: 'Sem nota fiscal aprovada é possível pagar?',
    answer: 'Não. Toda nota fiscal da equipe precisa ser revisada e aprovada antes do pagamento.',
  },
  {
    question: 'O que fazer quando a IA não encontra a resposta?',
    answer: 'Revisar a Biblioteca de Conhecimento, conferir se os documentos estão ativos e consultar este Manual.',
  },
  {
    question: 'Para que serve esta página Manual?',
    answer: 'Ela concentra orientações, fluxos, perguntas frequentes, atalhos e links para materiais de apoio do sistema.',
  },
];

function IconCard({ icon: Icon, title, text }) {
  return (
    <div className="border rounded-2xl p-4 bg-white shadow-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-slate-100">
          <Icon className="w-5 h-5 text-slate-700" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600 mt-1">{text}</p>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ section }) {
  const Icon = section.icon;
  return (
    <section
      id={section.id}
      className="border rounded-2xl p-5 bg-white shadow-sm scroll-mt-24"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded-xl bg-blue-50">
          <Icon className="w-5 h-5 text-blue-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
          <p className="text-sm text-slate-600">{section.description}</p>
        </div>
      </div>

      <div className="space-y-2">
        {section.content.map((item, index) => (
          <p key={index} className="text-sm text-slate-700 leading-6">
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function StepCard({ item, index }) {
  return (
    <div className="border rounded-2xl p-4 bg-white shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">
          {index + 1}
        </div>
        <h3 className="font-semibold text-slate-900">{item.title}</h3>
      </div>

      <div className="space-y-2">
        {item.steps.map((step, stepIndex) => (
          <div key={stepIndex} className="flex items-start gap-2 text-sm text-slate-700">
            <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400" />
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqCard({ item }) {
  return (
    <div className="border rounded-2xl p-4 bg-white shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-2">{item.question}</h3>
      <p className="text-sm text-slate-700">{item.answer}</p>
    </div>
  );
}

function ManualInner() {
  const [search, setSearch] = useState('');

  const filteredSections = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return SECOES;

    return SECOES.filter((section) => {
      const text = [
        section.title,
        section.description,
        ...section.content,
      ]
        .join(' ')
        .toLowerCase();

      return text.includes(term);
    });
  }, [search]);

  const filteredFaqs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return FAQS;

    return FAQS.filter((item) =>
      `${item.question} ${item.answer}`.toLowerCase().includes(term)
    );
  }, [search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 rounded-2xl bg-white shadow-sm border">
              <HelpCircle className="w-6 h-6 text-slate-800" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Manual e Ajuda</h1>
              <p className="text-slate-600 text-sm mt-1">
                Guia interativo da plataforma Museus Centro para consulta dos usuários
              </p>
            </div>
          </div>

          <div className="border rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Apresentação da plataforma
            </h2>
            <p className="text-sm text-slate-700 leading-6 whitespace-pre-line">
              {APRESENTACAO}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="gap-2">
                <a href={PDF_MANUAL_URL} target="_blank" rel="noreferrer">
                  <Download className="w-4 h-4" />
                  Baixar Manual em PDF
                </a>
              </Button>

              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const el = document.getElementById('faq');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <HelpCircle className="w-4 h-4" />
                Ir para dúvidas frequentes
              </Button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1 space-y-4">
            <div className="border rounded-2xl bg-white p-4 shadow-sm sticky top-6">
              <div className="flex items-center gap-2 mb-3">
                <Search className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Buscar no manual</span>
              </div>

              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tema, fluxo ou regra..."
              />

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Navegação rápida
                </p>

                <div className="space-y-2">
                  {SECOES.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => {
                        const el = document.getElementById(section.id);
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg px-2 py-2 transition"
                    >
                      {section.title}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('passos-rapidos');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg px-2 py-2 transition"
                  >
                    Passos rápidos
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('faq');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg px-2 py-2 transition"
                  >
                    Dúvidas frequentes
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <main className="lg:col-span-3 space-y-6">
            <section className="grid md:grid-cols-2 gap-4">
              {DESTAQUES.map((item) => (
                <IconCard
                  key={item.title}
                  icon={item.icon}
                  title={item.title}
                  text={item.text}
                />
              ))}
            </section>

            {filteredSections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}

            <section id="passos-rapidos" className="border rounded-2xl p-5 bg-white shadow-sm scroll-mt-24">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-xl bg-slate-100">
                  <Workflow className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Passos rápidos</h2>
                  <p className="text-sm text-slate-600">
                    Atalhos para ações frequentes dos usuários
                  </p>
                </div>
              </div>

              <div className="grid xl:grid-cols-2 gap-4">
                {PASSOS_RAPIDOS.map((item, index) => (
                  <StepCard key={item.title} item={item} index={index} />
                ))}
              </div>
            </section>

            <section id="faq" className="border rounded-2xl p-5 bg-white shadow-sm scroll-mt-24">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-xl bg-slate-100">
                  <HelpCircle className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Dúvidas frequentes</h2>
                  <p className="text-sm text-slate-600">
                    Respostas rápidas para orientar o uso correto da plataforma
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                {filteredFaqs.map((item) => (
                  <FaqCard key={item.question} item={item} />
                ))}
              </div>
            </section>

            <section className="border rounded-2xl p-5 bg-slate-900 text-white shadow-sm">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-xl bg-white/10">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Como usar junto com o Assistente</h2>
                  <p className="text-sm text-slate-300">
                    Esta página serve como ajuda interativa e pode ser complementada com a Biblioteca de Conhecimento
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-200 leading-6">
                <p>Use esta página para leitura rápida, orientação operacional e consulta de regras.</p>
                <p>
                  Para respostas mais específicas, complemente a Biblioteca de Conhecimento com PDFs, contratos,
                  planilhas, regras operacionais e manuais.
                </p>
                <p>
                  Sempre que houver dúvida sobre fluxos, a regra principal é verificar se o processo pertence a
                  Compras, Equipe, Aprovações, Rubricas ou Documentos.
                </p>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function Manual() {
  return (
    <RequireAuth>
      <ManualInner />
    </RequireAuth>
  );
}