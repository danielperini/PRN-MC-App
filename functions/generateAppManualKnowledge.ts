import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MANUAL_KNOWLEDGE = {
  'visao-geral': {
    titulo: 'Visão Geral da Plataforma',
    conteudo: `A Plataforma Museu Centro é um sistema centralizado para registro, acompanhamento e aprovação de relatórios mensais dos profissionais dos museus.

Objetivos Principais:
- Facilitar o registro de atividades mensais
- Documentar oportunidades e desafios
- Acompanhar aprovação de relatórios
- Manter histórico centralizado de dados

Usuários do Sistema:
- Profissionais: Criam e editam seus relatórios mensais
- Coordenadores: Revisam e aprovam relatórios
- Administradores: Gerenciam configurações e usuários

A plataforma oferece fluxos de trabalho automatizados, histórico de versões, integração com Google Drive para backups e uma IA assistente para sugestões de conteúdo.`,
    categoria: 'introducao'
  },
  'criando-relatorio': {
    titulo: 'Como Criar um Novo Relatório',
    conteudo: `PASSO A PASSO PARA CRIAR RELATÓRIO:

1. Acessar Editor
   - Clique em "Novo Relatório" no painel principal
   - Sistema abrirá o editor completo

2. Preencher Identificação (obrigatório)
   - Mês de Referência: Selecione o mês do relatório
   - Ano: Ano de referência (padrão: 2026)
   - Nome do Profissional: Seu nome (pré-preenchido)
   - Museu Principal: Selecione seu museu de atuação
   - Equipe: Selecione sua equipe

3. Resumo Executivo
   - Escreva um resumo das principais atividades
   - Pode usar "Gerar com IA" para sugestões automáticas
   - Edite o texto livremente conforme necessário

4. Registrar Atividades
   - Clique na aba "Atividades"
   - Clique em "+ Adicionar Atividade"
   - Preencha: Título, Descrição, Data, Público Estimado
   - Classificação: META, ROTINA ou EXTRA
   - Para META: Selecione código, resultado e status da meta

5. Adicionar Oportunidades
   - Clique em "Oportunidades"
   - Momentos Especiais: Histórias e depoimentos impactantes
   - Oportunidades: Descreva oportunidades encontradas

6. Avaliação do Mês
   - Preencha: Pontos Positivos, Dificuldades, Sugestões
   - MARQUE a checkbox de declaração de responsabilidade
   - Clique em "Enviar para Revisão"

SALVAMENTO:
- Auto-save: Sistema salva a cada 5 segundos automaticamente
- Salvar Rascunho: Relatório fica como DRAFT
- Enviar para Revisão: Notifica o coordenador responsável`,
    categoria: 'profissional'
  },
  'revisando-relatorios': {
    titulo: 'Workflow de Revisão para Coordenadores',
    conteudo: `PROCESSO COMPLETO DE REVISÃO:

1. Acessar Fila de Revisão
   - Clique em "Revisão" no menu principal
   - Filtre por museu ou status conforme necessário
   - Use busca para encontrar relatórios específicos

2. Estados do Relatório
   - DRAFT: Rascunho em progresso (não enviado)
   - SUBMITTED: Enviado, aguardando revisão
   - IN_REVIEW: Coordenador está revisando
   - RETURNED: Devolvido para ajustes
   - APPROVED: Aprovado, pode ser exportado
   - ARCHIVED: Arquivado, não pode ser editado

3. Processo de Revisão

   ASSUMIR REVISÃO:
   - Clique em "Assumir Revisão"
   - Relatório muda para IN_REVIEW
   - Você fica responsável pela análise

   REVISAR CONTEÚDO:
   - Clique em "Ver" para abrir relatório completo
   - Leia todas as seções com atenção
   - Analise dados, consistências e observações

   DEVOLVER PARA AJUSTES:
   - Clique em "Devolver"
   - Escreva comentários específicos por seção
   - Profissional receberá notificação e poderá editar

   APROVAR:
   - Clique em "Aprovar"
   - Opcionalmente adicione observação final
   - Relatório muda para APPROVED
   - Profissional receberá confirmação

4. Painel de Coordenação
   - Visão consolidada de números e métricas
   - Carousel de momentos publicados
   - Análise de atividades por equipe
   - Oportunidades identificadas
   - Compliance Panel para acompanhamento`,
    categoria: 'coordenador'
  },
  'exportar-pdf': {
    titulo: 'Exportando Relatórios em PDF',
    conteudo: `COMO EXPORTAR UM RELATÓRIO:

1. Abrir Relatório
   - Acesse a lista de "Relatórios"
   - Clique no relatório que deseja exportar
   - O relatório deve estar com status APPROVED

2. Gerar PDF
   - Clique no botão "Gerar PDF" ou "Exportar"
   - Sistema processará o documento
   - PDF será baixado automaticamente no seu dispositivo

3. Conteúdo do PDF
   - Capa com identificação do profissional
   - Resumo Executivo
   - Lista de Atividades Realizadas
   - Avaliação do Período
   - Comentários e feedback do coordenador
   - Rodapé com numeração de páginas e data

4. Repositório de PDFs
   - PDFs aprovados são sincronizados automaticamente para Google Drive
   - Pasta: "Relatorios_Aprovados_PDF"
   - Organizados por protocolo e profissional

5. Dicas
   - Revise dados antes de exportar
   - Arquivo fica armazenado em seu computador
   - Para impressão, use o recurso de impressão do PDF`,
    categoria: 'avancado'
  },
  'busca-filtros': {
    titulo: 'Usando Busca e Filtros',
    conteudo: `BUSCA GLOBAL:
- Barra de busca localizada no topo da página
- Busca por: Nome do profissional, museu, mês, ano, protocolo
- Resultados aparecem em tempo real
- Suporta busca parcial (não precisa digitar completo)

FILTROS AVANÇADOS:
1. Clique em "Filtros" para abrir painel avançado
2. Critérios disponíveis:
   - Status: DRAFT, SUBMITTED, IN_REVIEW, RETURNED, APPROVED, ARCHIVED
   - Museu: Selecione um ou múltiplos museus
   - Equipe: Educativo, Produção, Comunicação, Administração
   - Período: Mês e ano específicos
   - Profissional: Nome exato do autor

3. Aplicar Filtros
   - Marque os critérios desejados
   - Clique em "Aplicar"
   - Resultados atualizarão automaticamente

4. Salvar Filtros
   - Você pode salvar filtros frequentemente usados
   - Para futura reutilização rápida

DICAS DE BUSCA:
- Use aspas para busca exata: "João Silva"
- Combine múltiplos filtros para resultados precisos
- Limpar filtros volta à visão completa`,
    categoria: 'funcionalidade'
  },
  'templates': {
    titulo: 'Usando Templates de Relatórios',
    conteudo: `SALVAR COMO TEMPLATE:
1. Abra um relatório já preenchido
2. Clique em "Salvar como Template"
3. Preencha:
   - Nome do Template: Ex. "Educativo Mensal Padrão"
   - Descrição: Resumo do conteúdo
   - Selecione seções a incluir (identificação, atividades, etc)
4. Escolha se será privado ou público
5. Clique em "Salvar"

CARREGAR DE TEMPLATE:
1. Ao criar novo relatório, clique em "Carregar Template"
2. Escolha entre:
   - Seus Templates: Privados, criados por você
   - Templates Públicos: Compartilhados pela organização
3. Selecione o template desejado
4. Dados são pré-preenchidos
5. Edite conforme necessário
6. Salve normalmente

VANTAGENS:
- Economiza tempo em digitação repetitiva
- Garante consistência de estrutura
- Facilita para equipes com padrões similares
- Reutilização de seções bem estruturadas

ORGANIZAÇÃO:
- Templates aparecem listados por data criação
- Você pode renomear ou deletar seus templates
- Compartilhe templates com sua equipe`,
    categoria: 'avancado'
  },
  'duvidas-frequentes': {
    titulo: 'Dúvidas Frequentes',
    conteudo: `P: Perdi meu relatório em rascunho?
R: Não se preocupe! Todos os rascunhos são salvos automaticamente a cada 5 segundos. Acesse "Relatórios", procure por status "DRAFT" e encontrará seu documento. O auto-save garante que nada seja perdido.

P: Posso editar meu relatório após enviar?
R: Após enviar, não é possível editar. Se o coordenador devolver o relatório (status RETURNED), você poderá editá-lo novamente. Para relatórios aprovados, não é permitida edição.

P: O que significa cada status?
- DRAFT: Rascunho em progresso, não enviado
- SUBMITTED: Enviado e aguardando revisão
- IN_REVIEW: Coordenador está revisando ativamente
- RETURNED: Devolvido para ajustes, pode editar
- APPROVED: Aprovado, pronto para exportação
- ARCHIVED: Arquivado, sem possibilidade de edição

P: Como vejo os comentários do coordenador?
R: Quando um relatório é devolvido (status RETURNED), os comentários aparecem em caixa destacada no topo. Por seção, você verá os pontos que precisam de ajuste.

P: Existe limite de tempo para enviar?
R: Recomenda-se enviar até o final do mês, mas o sistema permite envio posterior. Consulte seu coordenador sobre prazos específicos.

P: Posso deletar um relatório?
R: Apenas relatórios em DRAFT podem ser deletados por você. Uma vez enviado, apenas coordenadores podem arquivar.

P: Profissionais podem ver relatórios uns dos outros?
R: Não. Cada profissional vê apenas seus próprios relatórios. Coordenadores veem todos os da sua área.

P: Como funciona a sincronização com Google Drive?
R: Relatórios aprovados são sincronizados automaticamente para uma pasta "Relatorios_Aprovados_PDF" no Google Drive. Backups também são feitos automaticamente.

P: Posso imprimir meu relatório?
R: Sim! Exporte em PDF e use a função de impressão do seu navegador ou leitor PDF.`,
    categoria: 'suporte'
  },
  'glossario': {
    titulo: 'Glossário de Termos',
    conteudo: `META: Atividades que estão vinculadas a objetivos específicos do 3º Aditivo. Requerem código, indicador previsto, resultado alcançado e status.

ROTINA: Atividades habituais e regulares do departamento ou equipe.

EXTRA: Atividades adicionais, extraordinárias ou fora do escopo regular.

PÚBLICO ESTIMADO: Quantidade aproximada de pessoas impactadas ou que participaram da atividade.

TEMPLATE: Modelo reutilizável de relatório que pode ser salvo e usado como base para novos relatórios.

DRAFT: Rascunho de relatório não enviado. Pode ser editado ou deletado livremente.

COMPLIANCE: Conformidade e adequação aos requisitos de envio e estrutura do sistema.

AUTO-SAVE: Salvamento automático de dados a cada 5 segundos, sem necessidade de clique manual.

PROTOCOLO: Número único identificador do relatório no formato MC-MESANO-XXXXX.

MARKDOWN: Formato de texto simples que permite básica formatação (negrito, itálico, listas, etc).

RLS: Row Level Security - Sistema de segurança que controla quem vê quais dados.

WEBHOOK: Integração automática que dispara ações quando algo acontece na plataforma.`,
    categoria: 'referencia'
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Buscar ou criar documentos de conhecimento
    const existingDocs = await base44.asServiceRole.entities.KnowledgeDocument.filter({}, '-updated_date', 100);
    const existingKeys = new Set(existingDocs.map(doc => doc.doc_key || doc.titulo));

    let created = 0;
    let skipped = 0;

    // Processar cada seção do manual
    for (const [key, data] of Object.entries(MANUAL_KNOWLEDGE)) {
      if (!existingKeys.has(data.titulo)) {
        try {
          await base44.asServiceRole.entities.KnowledgeDocument.create({
            doc_key: key,
            titulo: data.titulo,
            conteudo: data.conteudo,
            categoria: data.categoria,
            fonte: 'manual_app',
            publico: true,
            ordem: created
          });
          created++;
        } catch (e) {
          console.error(`Erro ao criar doc ${key}:`, e.message);
        }
      } else {
        skipped++;
      }
    }

    // Gerar resumo para arquivo de treinamento do assistente
    const trainingData = {
      data_geracao: new Date().toISOString(),
      total_secoes: Object.keys(MANUAL_KNOWLEDGE).length,
      secoes: Object.entries(MANUAL_KNOWLEDGE).map(([key, data]) => ({
        id: key,
        titulo: data.titulo,
        categoria: data.categoria,
        resumo: data.conteudo.split('\n')[0]
      })),
      instrucoes_para_ia: `Você é um assistente de ajuda para a Plataforma Museu Centro. Use o conhecimento base fornecido para responder perguntas dos usuários sobre como usar a plataforma. Seja educado, claro e forneça instruções passo a passo quando apropriado. Se não souber responder, sugira contato com coordenador.`
    };

    return Response.json({
      success: true,
      message: 'Manual de instruções gerado e armazenado',
      stats: {
        documentos_criados: created,
        documentos_existentes: skipped,
        total_secoes: Object.keys(MANUAL_KNOWLEDGE).length
      },
      training_data: trainingData,
      categorias: [...new Set(Object.values(MANUAL_KNOWLEDGE).map(d => d.categoria))]
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});