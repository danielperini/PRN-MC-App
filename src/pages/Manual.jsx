import React, { useMemo, useState, useRef } from 'react';
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
  Link,
  Moon,
  ChevronDown,
  ChevronUp,
  Inbox,
  Loader2,
} from 'lucide-react';

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
      'Manter dados cadastrais (banco, CPF/CNPJ, PIX) atualizados em "Meus Dados" é obrigatório para envio de nota fiscal.',
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
      'Na aba Atividades, use o botão "Importar atividade da Programação" para puxar dados do cronograma automaticamente.',
      'Após preencher, clique em "Enviar para Revisão" — o coordenador recebe notificação e pode aprovar ou devolver.',
      'Use o botão "Exportar consolidado do mês" para gerar um PDF completo com todas as atividades, fotos em miniatura, status de aprovação, comentário do coordenador e campos de assinatura.',
      'O PDF é nomeado automaticamente no padrão: NOME_MES-ANO_RELATORIO-01.pdf.',
      'Se houver mais de um relatório no mesmo mês, eles são numerados automaticamente: Relatório-01, Relatório-02, etc.',
    ],
  },
  {
    id: 'meus-dados',
    icon: Users,
    title: 'Espaço do Usuário (Meus Dados)',
    description: 'Gerencie perfil, pagamentos, atividades, documentos e galeria pessoal.',
    content: [
      'Acesse "Meus Dados" no menu lateral para visualizar e editar todas as informações pessoais do seu vínculo com o projeto.',
      'Aba Perfil: dados cadastrais (Banco, Agência, Conta, CPF/CNPJ, PIX). Campos obrigatórios para envio de nota fiscal.',
      'Aba Pagamentos: acompanhe o cronograma de parcelas, status (pago/pendente) e comprovantes.',
      'Aba Atividades e Metas: veja o histórico das atividades registradas nos seus relatórios e o cumprimento de metas.',
      'Aba Documentos: acesse contratos, termos e documentos vinculados ao seu perfil.',
      'Aba Minha Galeria: visualize e edite legendas de todas as fotos enviadas nos seus relatórios.',
      'Se algum dado cadastral estiver incompleto, o sistema bloqueia o envio de nota fiscal e exibe alerta.',
    ],
  },
  {
    id: 'minha-galeria',
    icon: Images,
    title: 'Minha Galeria (Espaço do Usuário)',
    description: 'Acesse e gerencie as fotos postadas nos seus relatórios mensais.',
    content: [
      'A aba "Minha Galeria" dentro de Meus Dados exibe todas as fotos que você enviou nos seus relatórios.',
      'As fotos são organizadas com metadados: museu e mês de referência do relatório.',
      'Clique na legenda de qualquer foto para editá-la diretamente — pressione Enter para salvar ou Escape para cancelar.',
      'As legendas são salvas automaticamente e refletem no relatório vinculado.',
      'Fotos aparecem em grade responsiva (2 colunas no mobile, 3 no desktop).',
      'Para adicionar novas fotos, acesse o Relatório correspondente → aba Anexos ou Atividades.',
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
    id: 'entrada-documentos',
    icon: Inbox,
    title: 'Entrada de Documentos',
    description: 'Fluxo unificado de upload de NFs, fotos e contratos com análise automática por IA.',
    content: [
      'Acesse "Entrada de Documentos" no menu lateral para enviar qualquer documento ao sistema.',
      'Arraste ou selecione arquivos — o sistema aceita PDF, XML, imagens (JPG, PNG) e documentos administrativos.',
      'A IA detecta automaticamente o tipo de documento: Nota Fiscal PDF, Nota Fiscal XML, Foto de Atividade, Contrato, Recibo ou Documento Administrativo.',
      'Após a análise, o sistema exibe os campos extraídos (fornecedor, valor, data, número NF) para revisão antes de salvar.',
      'Para NFs: envie o PDF e o XML em par — o sistema os vincula automaticamente pelo número da nota.',
      'Para fotos: informe a atividade correspondente e a legenda sugerida pela IA pode ser ajustada antes de salvar.',
      'Para contratos: a IA extrai dados do contrato (valor, parcelas, vigência) e vincula ao membro da equipe correto.',
      'Documentos processados ficam na fila com status: ENVIADO → ANALISANDO IA → AGUARDANDO REVISÃO → APROVADO.',
      'Coordenadores têm acesso ao painel de revisão para validar e aprovar documentos em lote.',
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
      'Para vincular uma atividade da agenda ao relatório mensal, use a opção "Importar atividade da Programação" ao editar o relatório.',
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
    id: 'noturno',
    icon: Moon,
    title: 'Noturno nos Museus 2026',
    description: 'Módulo dedicado ao projeto Noturno: galeria, importação de fotos e relatórios.',
    content: [
      'Acesse "Galeria Noturno" no menu lateral para visualizar o acervo fotográfico do projeto Noturno nos Museus 2026.',
      'As fotos são importadas das pastas do Google Drive vinculadas ao projeto Noturno e organizadas por edição.',
      'Use o filtro por museu (MUMO, MIS, MHAB, Casa Kubitschek) para navegar no acervo.',
      'Coordenadores podem importar novas fotos usando o botão "Importar do Drive" — o sistema busca arquivos nas pastas configuradas.',
      'Cada foto pode ter legenda editada diretamente na galeria.',
      'O módulo de importação "Importar Noturno 2026" permite processar lotes de fotos das 6 pastas principais do projeto.',
      'Após importar, as fotos ficam disponíveis para vinculação a atividades e relatórios do projeto Noturno.',
    ],
  },
  {
    id: 'relatorio-execucao',
    icon: ScrollText,
    title: 'Relatório de Execução do Objeto',
    description: 'Gere o relatório institucional consolidado para prestação de contas.',
    content: [
      'Acesse "Execução do Objeto" no menu lateral (disponível para coordenadores e admin).',
      'O relatório consolida dados de atividades, público, metas, financeiro e equipe de todos os relatórios mensais aprovados.',
      'Clique em "Novo Relatório" para iniciar — defina tipo (parcial ou final), período e filtros por museu.',
      'O sistema gera automaticamente cada seção usando IA: endereço de execução, descrição das ações, público-alvo, pesquisa de satisfação, cronograma de metas, equipe, impactos econômicos e sustentabilidade.',
      'Cada seção pode ser editada manualmente antes de finalizar — modo híbrido (IA + edição manual).',
      'Na aba Cronograma de Metas, selecione as metas cumpridas, informe percentual de execução e justificativa.',
      'Exporte o relatório em PDF, DOCX ou HTML usando os botões na parte superior.',
      'Relatórios aprovados podem ser publicados no Banco de Relatórios para acesso por observadores.',
    ],
  },
  {
    id: 'notificacoes',
    icon: Bell,
    title: 'Notificações e Sino',
    description: 'Como funcionam alertas de aprovação, devolução e mensagens no sistema.',
    content: [
      'O sino no canto superior direito exibe notificações em tempo real para o usuário logado.',
      'Tipos de notificações: Relatório Aprovado, Relatório Devolvido, NF Devolvida, Pagamento Aprovado, Nova Solicitação, Mensagem do Sistema.',
      'Notificações de aprovação e devolução são enviadas também por e-mail automaticamente.',
      'Clique em uma notificação para navegar diretamente para o item relacionado.',
      'Notificações não lidas aparecem com badge numérico no sino.',
      'Clique em "Marcar todas como lidas" no painel de notificações para limpar o contador.',
      'Para configurar preferências de notificação, acesse Configurações de Notificação no menu do usuário.',
      'Notificações de compras são enviadas em lotes diários (manhã e tarde) para coordenadores e financeiro.',
    ],
  },
  {
    id: 'acervo-links',
    icon: Link,
    title: 'Acervo de Links',
    description: 'Repositório central de links do Google Drive com verificação de acesso.',
    content: [
      'Acesse "Acervo de Links" no menu lateral para visualizar o repositório de links do Google Drive.',
      'O acervo concentra links de pastas e arquivos relevantes: relatórios, notas fiscais, fotos, contratos e documentos institucionais.',
      'Cada link exibe: nome, tipo de recurso, situação de acesso (OK, pendente, erro) e páginas de referência.',
      'O sistema verifica automaticamente se os links estão acessíveis com as permissões corretas.',
      'Links com situação "erro" ou "pendente" precisam ter suas permissões de compartilhamento ajustadas no Google Drive.',
      'Coordenadores podem adicionar novos links clicando em "Adicionar Link" — informe URL, nome e tipo.',
      'Use o filtro por tipo (pasta, arquivo, PDF, foto, planilha) para localizar recursos específicos.',
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
      'Para verificar o saldo de uma rubrica específica: acesse Rubricas por Museu → selecione o museu → localize a rubrica na lista → veja previsto, utilizado e saldo disponível.',
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
      'Use "Informações Completas da Programação" para acessar sinopse, minibios e material aprovado para divulgação.',
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
    ],
  },
  {
    id: 'compras-aprovadas-nf',
    icon: ShoppingCart,
    title: 'Compras aprovadas e envio para financeiro',
    description: 'Quando uma compra é aprovada, o sistema envia automaticamente para o setor financeiro.',
    content: [
      'Ao aprovar uma compra no sistema, um e-mail é enviado automaticamente para o setor financeiro.',
      'O e-mail contém: identificação da compra, descrição, categoria, fornecedor, valor aprovado, data e aprovador.',
      'Todos os arquivos vinculados à compra (orçamentos, notas, comprovantes) são listados com links diretos.',
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
      'O sistema preserva sempre o relatório mais recente ou aquele com mais dados preenchidos.',
      'O sistema cria um backup automático em AuditLog com snapshot de tudo que será removido.',
      'Apenas usuários com permissão "admin" podem executar esta operação.',
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
      'Backups são organizados no Drive em pastas temáticas: Contratos, Notas Fiscais, Relatórios, Fotos, Documentos, Logs.',
      'Sincronização: quando você adiciona um anexo a um relatório, compra ou documento, o backup ocorre em até 1 minuto.',
      'Para restaurar, acesse o Google Drive (pasta "Museus Centro" > tipo de arquivo > arquivo desejado).',
      'Se um arquivo for acidentalmente deletado do sistema, você pode recuperá-lo do Drive em até 90 dias.',
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
      'O sistema realiza varredura completa em: usuários, permissões, relatórios, compras, rubricas, pagamentos, anexos, logs de auditoria, notificações, conexões com Drive.',
      'Os resultados são organizados em: Verde (OK), Amarelo (Alerta) e Vermelho (Erro crítico).',
      'Execute a verificação periodicamente: recomendado uma vez por semana após operações críticas.',
    ],
  },
  {
    id: 'versao',
    icon: ShieldCheck,
    title: 'Versão atual — 2026',
    description: 'Changelog, features implementadas e roadmap futuro.',
    content: [
      'MÓDULOS PRINCIPAIS: Relatórios Mensais, Compras e Pagamentos, Aprovações, Rubricas por Museu, Equipe, Entrada de Documentos, Noturno nos Museus, Relatório de Execução do Objeto.',
      'MÓDULOS DE SUPORTE: Galeria de Fotos, Minha Galeria, Acervo de Links, Agenda, Programação Espelho, Ferramentas, Biblioteca de Conhecimento, Assistente de IA, Notificações.',
      'SEGURANÇA: RLS por museu e função, Autenticação OAuth2, Logs de auditoria imutáveis, Backup automático com versionamento.',
      'SUPORTE: Use o Assistente de IA (24/7) para dúvidas operacionais, consulte a Biblioteca de Conhecimento para procedimentos, ou abra uma solicitação através da página Aparência e Manutenção.',
    ],
  },
];

const PASSOS_RAPIDOS = [
  {
    title: 'Criar uma nova compra',
    steps: ['Entre em Compras.', 'Clique em Nova Compra.', 'Preencha descrição, fornecedor, valor e rubrica.', 'Clique em Salvar ou Enviar.'],
  },
  {
    title: 'Enviar compra para aprovação',
    steps: ['Abra a compra criada.', 'Revise os dados.', 'Clique em Enviar.'],
  },
  {
    title: 'Adicionar um membro da equipe',
    steps: ['Entre em Equipe.', 'Clique em Adicionar Membro.', 'Preencha nome, cargo e dados básicos.', 'Clique em Salvar.'],
  },
  {
    title: 'Enviar nota fiscal da equipe',
    steps: ['Entre em Equipe.', 'Abra o membro ou sua área de envio.', 'Clique em Enviar Nota Fiscal.', 'Anexe os arquivos e envie.'],
  },
  {
    title: 'Consultar um documento do sistema',
    steps: ['Entre em Documentos ou Biblioteca.', 'Localize o arquivo.', 'Clique em Visualizar.'],
  },
  {
    title: 'Adicionar documento para a IA',
    steps: ['Entre em Biblioteca de Conhecimento.', 'Clique em Adicionar Documento.', 'Preencha título, categoria e tags.', 'Selecione o arquivo e clique em Salvar Documento.'],
  },
  {
    title: 'Acessar Minha Galeria',
    steps: ['Entre em Meus Dados no menu lateral.', 'Clique na aba "Minha Galeria".', 'Visualize as fotos dos seus relatórios.', 'Clique em uma legenda para editá-la.'],
  },
  {
    title: 'Enviar documento pela Entrada Única',
    steps: ['Acesse "Entrada de Documentos" no menu.', 'Arraste o arquivo ou clique para selecionar.', 'Aguarde a análise automática da IA.', 'Revise os campos extraídos e confirme.'],
  },
  {
    title: 'Verificar saldo de rubrica',
    steps: ['Acesse "Rubricas por Museu" no menu.', 'Selecione o museu desejado.', 'Localize a rubrica na lista.', 'Veja previsto, utilizado e saldo disponível.'],
  },
  {
    title: 'Exportar relatório de execução do objeto',
    steps: ['Acesse "Execução do Objeto" no menu.', 'Abra ou crie o relatório desejado.', 'Revise todas as seções geradas pela IA.', 'Clique em "Exportar PDF" ou "Exportar DOCX".'],
  },
  {
    title: 'Configurar notificações',
    steps: ['Clique no seu nome/avatar no canto superior.', 'Acesse Configurações de Notificação.', 'Ative ou desative tipos de alerta.', 'Salve as preferências.'],
  },
  {
    title: 'Consultar agenda do museu',
    steps: ['Acesse "Agenda" no menu lateral.', 'Selecione o museu e o mês desejado.', 'Clique em um evento para ver os detalhes completos.', 'Use "Importar para Relatório" para vincular ao seu relatório mensal.'],
  },
];

// 50 FAQs agrupadas por categoria
const FAQ_GRUPOS = [
  {
    categoria: 'Relatórios',
    icon: FileText,
    faqs: [
      { q: 'Posso ter mais de um relatório no mesmo mês?', a: 'Sim. O sistema numera automaticamente: Relatório-01, Relatório-02, etc. Cada um cobre um escopo diferente dentro do mesmo período.' },
      { q: 'O que acontece quando envio o relatório para revisão?', a: 'O coordenador recebe notificação por e-mail e no sino. Ele pode aprovar, devolver com comentário ou delegar a revisão.' },
      { q: 'Como adicionar uma atividade ao relatório?', a: 'Na aba Atividades do relatório, clique em "Nova Atividade" ou use "Importar da Programação" para puxar dados da agenda automaticamente.' },
      { q: 'O PDF do relatório sai com foto?', a: 'Sim. As fotos vinculadas às atividades aparecem como miniaturas na seção de evidências do PDF exportado.' },
      { q: 'Posso editar um relatório já enviado para revisão?', a: 'Não enquanto está em revisão. Se precisar editar, peça ao coordenador para devolver o relatório — então você poderá editar e reenviar.' },
      { q: 'O que é o "público geral declarado"?', a: 'É o total de visitantes do museu no período (circulação geral), diferente do público das atividades específicas. É preenchido separadamente e não entra na soma das atividades.' },
      { q: 'Como exportar o relatório em PDF?', a: 'Abra o relatório → clique em "Exportar consolidado do mês". O PDF é gerado automaticamente com todas as atividades, fotos e dados de aprovação.' },
    ],
  },
  {
    categoria: 'Compras',
    icon: ShoppingCart,
    faqs: [
      { q: 'Posso pagar equipe pela tela Compras?', a: 'Não. Compras são usadas para fornecedores, materiais e serviços. O pagamento mensal da equipe deve ocorrer pelo fluxo de Equipe.' },
      { q: 'Qual é o fluxo de uma compra?', a: 'Rascunho → Solicitado → Aprovado pela Coordenação → Aprovado pelo Admin → Pago. Cada etapa tem notificação automática.' },
      { q: 'O que é rubrica e como escolher a correta?', a: 'Rubrica é a linha orçamentária que financia a despesa. Escolha a que melhor descreve o tipo de gasto (serviço, material, evento). Em caso de dúvida, consulte o coordenador financeiro.' },
      { q: 'Como anexar nota fiscal a uma compra?', a: 'Abra a compra → role até "Documentos" → clique em "Anexar NF" → faça upload do PDF e do XML. O sistema renomeia automaticamente.' },
      { q: 'Posso cancelar uma compra já enviada?', a: 'Sim, desde que ainda não tenha sido aprovada. Abra a compra e clique em "Cancelar Solicitação". Após aprovação, é necessário contato com a coordenação.' },
    ],
  },
  {
    categoria: 'Equipe e Pagamentos',
    icon: Users,
    faqs: [
      { q: 'Quem pode editar a equipe?', a: 'A equipe é gerida pelos coordenadores. Eles podem criar, editar, aprovar e acompanhar contratos, parcelas e documentos.' },
      { q: 'Sem nota fiscal aprovada é possível pagar?', a: 'Não. Toda nota fiscal da equipe precisa ser revisada e aprovada antes do pagamento.' },
      { q: 'Como acompanhar o status do meu pagamento?', a: 'Acesse Meus Dados → aba Pagamentos. Você verá o cronograma de parcelas com status: Pendente, Aguardando Comprovante, Pago.' },
      { q: 'Meus dados bancários estão incorretos. O que fazer?', a: 'Acesse Meus Dados → aba Perfil → atualize os dados bancários e clique em Salvar. A alteração tem efeito imediato para o próximo envio.' },
      { q: 'Como enviar nota fiscal mensal?', a: 'Entre em Compras e Pagamentos → aba Equipe → localize seu nome → clique em "Enviar Nota Fiscal" → anexe PDF e XML → confirme o envio.' },
    ],
  },
  {
    categoria: 'Rubricas',
    icon: Building2,
    faqs: [
      { q: 'Quando a rubrica é debitada?', a: 'A rubrica é debitada quando a despesa é aprovada pelo admin. Aprovação apenas pela coordenação ainda não debita.' },
      { q: 'Como verificar o saldo de uma rubrica?', a: 'Acesse Rubricas por Museu → selecione o museu → veja a coluna "Saldo" na lista de rubricas. O saldo atualiza em tempo real após cada aprovação.' },
      { q: 'O que significa rubrica com saldo negativo?', a: 'Indica que o valor gasto já ultrapassou o previsto. Isso requer atenção imediata da coordenação financeira para remanejamento orçamentário.' },
      { q: 'Posso lançar um gasto em mais de uma rubrica?', a: 'Não diretamente. Cada solicitação de compra é vinculada a uma única rubrica. Para divisão, crie solicitações separadas para cada rubrica.' },
      { q: 'O que é natureza de despesa?', a: 'É o código contábil da despesa (ex: 339030, 339035). É espelhado da rubrica vinculada e aparece automaticamente ao selecionar a rubrica na compra.' },
    ],
  },
  {
    categoria: 'Galeria e Fotos',
    icon: Images,
    faqs: [
      { q: 'Como adicionar fotos ao relatório?', a: 'Abra o relatório → aba Atividades → selecione uma atividade → clique em "Adicionar Fotos". Ou acesse diretamente a aba Anexos do relatório.' },
      { q: 'Como editar a legenda de uma foto?', a: 'Em Meus Dados → aba Minha Galeria, clique diretamente na legenda da foto para editá-la. Pressione Enter para salvar.' },
      { q: 'As fotos aparecem no PDF?', a: 'Sim. Fotos vinculadas a atividades aparecem como miniaturas no relatório PDF. Fotos com legenda são priorizadas.' },
      { q: 'Como importar fotos do Drive para o Noturno?', a: 'Acesse "Importar Noturno 2026" no menu → selecione a pasta ou edição → clique em "Importar" → aguarde o processamento (pode levar alguns minutos para lotes grandes).' },
      { q: 'Posso deletar uma foto da galeria?', a: 'Fotos vinculadas a relatórios aprovados não devem ser deletadas (impacta auditoria). Para relatórios em rascunho, o coordenador pode remover fotos incorretas.' },
    ],
  },
  {
    categoria: 'Aprovações',
    icon: Bell,
    faqs: [
      { q: 'Quem pode aprovar compras?', a: 'Coordenadores aprovam na primeira etapa, administradores aprovam na etapa final. Ambos recebem notificação quando há itens pendentes.' },
      { q: 'O que fazer quando meu relatório é devolvido?', a: 'Você recebe notificação com o motivo da devolução. Acesse o relatório, corrija os pontos indicados e reenvie para revisão.' },
      { q: 'Como saber se minha NF foi aprovada?', a: 'Você recebe notificação por e-mail e no sino. Em Meus Dados → Pagamentos, o status da parcela muda para "Aprovado" ou "Pago".' },
      { q: 'Posso delegar uma revisão para outro coordenador?', a: 'Sim. Na tela de revisão do relatório, use a opção "Delegar Revisão" e selecione o coordenador responsável.' },
      { q: 'O que acontece com NFs devolvidas?', a: 'O profissional recebe notificação com o motivo. Ele pode corrigir e reenviar. A devolução fica registrada no histórico para auditoria.' },
    ],
  },
  {
    categoria: 'Sistema e Acesso',
    icon: Shield,
    faqs: [
      { q: 'O que fazer quando a IA não encontra a resposta?', a: 'Revisar a Biblioteca de Conhecimento, conferir se os documentos estão ativos e consultar este Manual.' },
      { q: 'Para que serve esta página Manual?', a: 'Ela concentra orientações, fluxos, perguntas frequentes, atalhos e links para materiais de apoio do sistema.' },
      { q: 'Como mudar o tema visual do sistema?', a: 'Acesse "Aparência e Manutenção" → selecione o tema no topo da página. A mudança é imediata e salva no navegador.' },
      { q: 'Como recuperar um arquivo deletado?', a: 'O sistema mantém backup no Google Drive por até 90 dias. Contate o administrador para restaurar o arquivo da pasta de backup.' },
      { q: 'O sistema funciona no celular?', a: 'Sim. A interface é totalmente responsiva. No mobile, a navegação ocorre pela barra inferior. Algumas funcionalidades avançadas são mais fáceis no desktop.' },
      { q: 'Como convidar um novo membro para o sistema?', a: 'Acesse "Gestão de Usuários" → clique em "Convidar" → informe o e-mail e o papel → confirme. O usuário recebe o convite por e-mail.' },
    ],
  },
  {
    categoria: 'Agenda e Programação',
    icon: CalendarDays,
    faqs: [
      { q: 'Como consultar a programação cultural de um museu?', a: 'Acesse "Agenda" no menu → selecione o museu e o mês. Os eventos aparecem em ordem cronológica com horário e local.' },
      { q: 'Como vincular uma programação ao relatório?', a: 'No relatório → aba Atividades → clique em "Importar da Programação" → selecione o evento desejado. Os dados são preenchidos automaticamente.' },
      { q: 'A agenda está desatualizada. O que fazer?', a: 'Coordenadores admin podem forçar sincronização em "Informações Completas da Programação" → botão "Sincronizar". O processo importa dados da planilha oficial.' },
    ],
  },
  {
    categoria: 'Documentos e Entrada Única',
    icon: Inbox,
    faqs: [
      { q: 'Qual é a diferença entre Entrada de Documentos e Gestor de Arquivos?', a: 'Entrada de Documentos é o fluxo de processamento automático por IA de novos arquivos. Gestor de Arquivos é o repositório de documentos já processados e organizados.' },
      { q: 'A IA errou ao classificar meu documento. O que fazer?', a: 'Na fila de Entrada de Documentos, você pode corrigir manualmente o tipo detectado antes de confirmar. A IA aprende com as correções ao longo do tempo.' },
      { q: 'Posso enviar XML e PDF separadamente?', a: 'Sim. O sistema aguarda o par PDF+XML para vincular automaticamente. Você pode enviar um de cada vez — eles serão agrupados pelo número da NF.' },
      { q: 'Onde ficam os documentos após processamento na Entrada Única?', a: 'Dependendo do tipo: NFs vão para Compras, fotos vão para a Galeria/Relatório, contratos vão para o perfil do TeamMember em Equipe.' },
    ],
  },
  {
    categoria: 'IA e Assistente',
    icon: Bot,
    faqs: [
      { q: 'O assistente de IA tem acesso a dados sigilosos?', a: 'O assistente acessa apenas a Biblioteca de Conhecimento — documentos que você ou a coordenação adicionaram explicitamente. Dados financeiros individuais não são expostos.' },
      { q: 'Como melhorar as respostas do assistente?', a: 'Adicione mais documentos à Biblioteca de Conhecimento: manuais, regras operacionais, planilhas e contratos relevantes. Quanto mais contexto, melhores as respostas.' },
      { q: 'O assistente pode gerar seções do relatório de execução automaticamente?', a: 'Sim. No Relatório de Execução do Objeto, cada seção tem um botão "Gerar com IA" que produz texto baseado nas atividades e dados registrados no sistema.' },
      { q: 'A IA analisa as notas fiscais enviadas?', a: 'Sim. Via Entrada de Documentos, a IA extrai dados da NF (fornecedor, valor, data, número) e sugere a rubrica correta com base no histórico e na descrição do serviço.' },
    ],
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
    <section id={section.id} className="border rounded-2xl p-5 bg-white shadow-sm scroll-mt-24">
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
          <p key={index} className="text-sm text-slate-700 leading-6">{item}</p>
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

function FaqGrupo({ grupo, searchTerm }) {
  const [open, setOpen] = useState(true);
  const Icon = grupo.icon;

  const faqs = useMemo(() => {
    if (!searchTerm) return grupo.faqs;
    const term = searchTerm.toLowerCase();
    return grupo.faqs.filter(f => `${f.q} ${f.a}`.toLowerCase().includes(term));
  }, [grupo.faqs, searchTerm]);

  if (faqs.length === 0) return null;

  return (
    <div className="border rounded-2xl bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-slate-100">
            <Icon className="w-4 h-4 text-slate-700" />
          </div>
          <span className="font-semibold text-slate-900">{grupo.categoria}</span>
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{faqs.length}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="divide-y border-t">
          {faqs.map((item, i) => (
            <div key={i} className="px-5 py-3">
              <p className="font-medium text-slate-900 text-sm mb-1">{item.q}</p>
              <p className="text-sm text-slate-600">{item.a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualInner() {
  const [search, setSearch] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const contentRef = useRef(null);

  const filteredSections = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return SECOES;
    return SECOES.filter((section) =>
      [section.title, section.description, ...section.content].join(' ').toLowerCase().includes(term)
    );
  }, [search]);

  const hasAnyFaq = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return FAQ_GRUPOS.some(g => g.faqs.some(f => `${f.q} ${f.a}`.toLowerCase().includes(term)));
  }, [search]);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Build printable content
      const printDiv = document.createElement('div');
      printDiv.style.cssText = 'width:800px;padding:32px;font-family:sans-serif;background:#fff;color:#111;';
      printDiv.innerHTML = `
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px;">Manual da Plataforma Museus Centro</h1>
        <p style="color:#555;margin-bottom:24px;">${APRESENTACAO.replace(/\n/g, '<br/>')}</p>
        ${SECOES.map(s => `
          <div style="margin-bottom:20px;">
            <h2 style="font-size:16px;font-weight:700;color:#1e40af;margin-bottom:4px;">${s.title}</h2>
            <p style="color:#555;font-size:13px;margin-bottom:8px;">${s.description}</p>
            ${s.content.map(c => `<p style="font-size:13px;margin-bottom:4px;line-height:1.6;">• ${c}</p>`).join('')}
          </div>
        `).join('')}
        <div style="margin-top:32px;">
          <h2 style="font-size:18px;font-weight:700;margin-bottom:12px;">Dúvidas Frequentes</h2>
          ${FAQ_GRUPOS.map(g => `
            <div style="margin-bottom:16px;">
              <h3 style="font-size:15px;font-weight:700;color:#1e40af;margin-bottom:8px;">${g.categoria}</h3>
              ${g.faqs.map(f => `
                <div style="margin-bottom:8px;">
                  <p style="font-weight:600;font-size:13px;">${f.q}</p>
                  <p style="font-size:13px;color:#555;">${f.a}</p>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      `;

      document.body.appendChild(printDiv);
      const canvas = await html2canvas(printDiv, { scale: 1.5, useCORS: true, logging: false });
      document.body.removeChild(printDiv);

      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const imgProps = doc.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pageWidth) / imgProps.width;
      let heightLeft = imgHeight;
      let position = 0;

      doc.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        doc.addPage();
        doc.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      doc.save('Manual_Museus_Centro.pdf');
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setPdfLoading(false);
    }
  };

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
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Apresentação da plataforma</h2>
            <p className="text-sm text-slate-700 leading-6 whitespace-pre-line">{APRESENTACAO}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button className="gap-2" onClick={handleDownloadPdf} disabled={pdfLoading}>
                {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {pdfLoading ? 'Gerando PDF...' : 'Baixar Manual em PDF'}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => {
                const el = document.getElementById('faq');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}>
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
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tema, fluxo ou regra..." />
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Navegação rápida</p>
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {SECOES.map((section) => (
                    <button key={section.id} type="button"
                      onClick={() => { const el = document.getElementById(section.id); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}
                      className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg px-2 py-1.5 transition"
                    >
                      {section.title}
                    </button>
                  ))}
                  <button type="button"
                    onClick={() => { const el = document.getElementById('passos-rapidos'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}
                    className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg px-2 py-1.5 transition"
                  >
                    Passos rápidos
                  </button>
                  <button type="button"
                    onClick={() => { const el = document.getElementById('faq'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}
                    className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg px-2 py-1.5 transition"
                  >
                    Dúvidas frequentes
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <main ref={contentRef} className="lg:col-span-3 space-y-6">
            <section className="grid md:grid-cols-2 gap-4">
              {DESTAQUES.map((item) => (
                <IconCard key={item.title} icon={item.icon} title={item.title} text={item.text} />
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
                  <p className="text-sm text-slate-600">Atalhos para ações frequentes dos usuários</p>
                </div>
              </div>
              <div className="grid xl:grid-cols-2 gap-4">
                {PASSOS_RAPIDOS.map((item, index) => (
                  <StepCard key={item.title} item={item} index={index} />
                ))}
              </div>
            </section>

            <section id="faq" className="space-y-3 scroll-mt-24">
              <div className="flex items-start gap-3 mb-2">
                <div className="p-2 rounded-xl bg-slate-100">
                  <HelpCircle className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Dúvidas frequentes</h2>
                  <p className="text-sm text-slate-600">50 perguntas organizadas por categoria — clique na categoria para expandir</p>
                </div>
              </div>
              {hasAnyFaq ? (
                FAQ_GRUPOS.map((grupo) => (
                  <FaqGrupo key={grupo.categoria} grupo={grupo} searchTerm={search.trim()} />
                ))
              ) : (
                <div className="text-sm text-slate-500 px-2">Nenhuma dúvida encontrada para "{search}".</div>
              )}
            </section>

            <section className="border rounded-2xl p-5 bg-slate-900 text-white shadow-sm">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-xl bg-white/10">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Como usar junto com o Assistente</h2>
                  <p className="text-sm text-slate-300">Esta página serve como ajuda interativa e pode ser complementada com a Biblioteca de Conhecimento</p>
                </div>
              </div>
              <div className="space-y-2 text-sm text-slate-200 leading-6">
                <p>Use esta página para leitura rápida, orientação operacional e consulta de regras.</p>
                <p>Para respostas mais específicas, complemente a Biblioteca de Conhecimento com PDFs, contratos, planilhas, regras operacionais e manuais.</p>
                <p>Sempre que houver dúvida sobre fluxos, a regra principal é verificar se o processo pertence a Compras, Equipe, Aprovações, Rubricas ou Documentos.</p>
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