import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Download, BookOpen, Video, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const MANUAL_CONTENT = {
  title: 'Manual de Instruções - Plataforma Museu Centro',
  subtitle: 'Guia Completo com Passo a Passo Ilustrado',
  version: 'v3.1 - Março de 2026 (Atualizado com Análise Claude)',
  sections: [
    {
      id: 'guia-rapido',
      title: '⚡ Guia Rápido (3 Minutos)',
      icon: '⚡',
      content: `PARA PROFISSIONAIS - Criar e Enviar Relatório:
1️⃣ No Dashboard → "Novo Relatório" (canto superior direito)
2️⃣ Preencha dados básicos: Mês, Ano, Função, Museu, Equipe
3️⃣ Escreva resumo executivo (use "Gerar com IA" para ajuda)
4️⃣ Aba "Atividades" → "+ Adicionar Atividade" (preencha título, data, público)
5️⃣ Aba "Avaliação" → Pontos positivos, desafios, sugestões
6️⃣ ☑️ Marque responsabilidade e clique "Enviar para Revisão"

PARA COORDENADORES - Revisar e Aprovar:
1️⃣ Menu esquerdo → "Revisão"
2️⃣ Clique no relatório → "Assumir Revisão"
3️⃣ Leia todas as seções com atenção
4️⃣ Escolha:
   ✅ APROVAR = relatório OK, vai ser arquivado
   ↩️ DEVOLVER = precisa ajustes, profissional edita e resubmete

💡 DICA OURO: Sistema salva AUTOMATICAMENTE a cada 5 segundos
   Você nunca perde dados mesmo desconectando!`
    },
    {
      id: 'primeiro-acesso',
      title: '🚀 Seu Primeiro Acesso',
      icon: '🚀',
      content: `PASSO 1: FAZER LOGIN
└─ Acesse o link da plataforma
└─ Use seu email corporativo
└─ Se for primeira vez, complete o registro

PASSO 2: CONHECER O PAINEL
Você verá:
├─ 📊 Números do Projeto (visão consolidada)
├─ ⚡ Atalhos Rápidos (botões principais)
├─ 📋 Relatórios Recentes (últimas ações)
└─ 🔔 Alertas (se houver pendências)

PASSO 3: EXPLORAR MENU LATERAL
Clique em cada seção para entender:
├─ Dashboard: Visão geral
├─ Relatórios: Seus relatórios
├─ Calendário: Atividades agendadas
├─ Suprimentos: Gestão de compras
└─ Configurações: Sua conta`
    },
    {
      id: 'criar-relatorio',
      title: '📝 Criando seu Primeiro Relatório',
      icon: '📝',
      content: `PASSO 1: INICIAR
└─ Na página Dashboard, clique no botão "✚ Novo Relatório" (canto superior direito)
└─ Você será levado para o editor

PASSO 2: IDENTIFICAÇÃO (Parte superior do editor)
Preencha:
├─ Mês de Referência: Qual mês você está reportando?
├─ Ano: 2026 (já preenchido)
├─ Nome: Seu nome (automático)
├─ Função: Educador, Produtor, etc.
├─ Museu: MHAB, MIS, MUMO ou Viaduto
└─ Equipe: Comunicação, Educativo, Produção

PASSO 3: RESUMO EXECUTIVO
├─ Campo de texto para resumir o mês
├─ Dica: Use "Gerar com IA" para sugestões
└─ Você pode editar o texto livremente

PASSO 4: ADICIONAR ATIVIDADES (Tab "Atividades")
Clique em "+ Adicionar Atividade"

Para cada atividade, preencha:
├─ Título: Nome da atividade (obrigatório)
├─ Descrição: O que foi feito
├─ Data: Quando realizou
├─ Público Estimado: Quantas pessoas?
├─ Quantas Repetições: Se repetiu no mês
├─ Classificação: META, ROTINA ou EXTRA
│
└─ Se META, adicione:
   ├─ Código Meta
   ├─ Meta Quantitativa
   └─ Resultado Alcançado

PASSO 5: OPORTUNIDADES (Tab "Oportunidades")
├─ Momentos Especiais: Histórias impactantes (opcional)
└─ Oportunidades: Parcerias/desafios identificados

PASSO 6: AVALIAÇÃO (Tab "Avaliação")
Preencha 3 campos obrigatórios:
├─ Pontos Positivos: O que deu certo?
├─ Dificuldades: Desafios enfrentados
└─ Sugestões: Melhorias para próximo mês

IMPORTANTE:
└─ ☑️ MARQUE a checkbox de responsabilidade
└─ ☑️ VERIFIQUE se todas as seções têm ✅

PASSO 7: SALVAR E ENVIAR
├─ "Salvar Rascunho": Continua editando depois (status DRAFT)
└─ "Enviar para Revisão": Envia ao coordenador (status SUBMITTED)

💡 Sistema salva automaticamente a cada 5 segundos!`
    },
    {
      id: 'workflow-coordenador',
      title: '👔 Workflow para Coordenadores',
      icon: '👔',
      content: `ACESSAR RELATÓRIOS PENDENTES
Caminho: Menu Esquerdo > "Revisão"

PASSO 1: VER LISTA
├─ Você vê todos os relatórios aguardando revisão
├─ Filtre por museu ou status
└─ Use busca para encontrar específico

PASSO 2: ASSUMIR REVISÃO
├─ Clique no relatório
├─ Clique em "Assumir Revisão"
└─ Agora você é responsável (status muda para IN_REVIEW)

PASSO 3: REVISAR
├─ Leia todas as seções com atenção
├─ Verifique dados e datas
├─ Analise se as metas foram cumpridas
└─ Revise comentários dos campos

PASSO 4: TOMAR DECISÃO

OPÇÃO A: DEVOLVER (precisa ajustes)
├─ Clique em "Devolver"
├─ Adicione comentários por seção
├─ Explique o que precisa melhorar
└─ Profissional será notificado

OPÇÃO B: APROVAR (tudo OK)
├─ Clique em "Aprovar"
├─ Adicione observação (opcional)
├─ Relatório muda para APPROVED
└─ Será arquivado automaticamente

PAINEL DE COORDENAÇÃO
├─ Números consolidados
├─ Carousel de momentos
├─ Análise de oportunidades
├─ Compliance tracking
└─ Log completo de aprovações

💡 Cada ação é registrada no histórico!`
    },
    {
      id: 'recursos-avancados',
      title: '✨ Recursos Avançados',
      icon: '✨',
      content: `EXPORTAR EM PDF
├─ Abra um relatório aprovado
├─ Clique em "Gerar PDF" (canto superior)
└─ Arquivo baixa automaticamente

BUSCA E FILTROS
├─ Barra de busca: Nome, museu, mês ou atividade
├─ Botão "Filtros": Múltiplos critérios
└─ "Limpar Filtros": Volta ao padrão

TEMPLATES DE RELATÓRIOS
Economize tempo reutilizando estruturas!

Salvar como Template:
├─ Clique em "Salvar como Template"
├─ Dê nome descritivo
├─ Escolha quais seções incluir
└─ Público ou privado

Carregar de Template:
├─ Clique em "Carregar Template"
├─ Selecione um modelo
└─ Dados são pré-preenchidos

ANÁLISE DE ATIVIDADES (Dashboard)
├─ Gráficos consolidados
├─ Filtro por equipe, museu, período
├─ Resumo de público por tipo
└─ Tendências e insights

GALERIA DE ARQUIVOS
├─ Armazene anexos de relatórios
├─ Backup automático para Google Drive
├─ Histórico de versões
└─ Download de qualquer arquivo

INTEGRAÇÃO COM IA
├─ "Gerar com IA": Sugestões para seções
├─ Análise automática de compliance
├─ Detecção de duplicatas
└─ Resumos inteligentes`
    },
    {
      id: 'status-entender',
      title: '🔄 Entender os Status',
      icon: '🔄',
      content: `Cada relatório passa por um ciclo de vida:

🟢 DRAFT (Rascunho)
└─ Status inicial, você está editando
└─ Pode editar, deletar, ou enviar
└─ Ninguém vê este relatório ainda

🔵 SUBMITTED (Enviado)
└─ Você clicou "Enviar para Revisão"
└─ Aguardando coordenador revisar
└─ Você NÃO pode mais editar

🟡 IN_REVIEW (Em Revisão)
└─ Coordenador clicou "Assumir Revisão"
└─ Está sendo analisado
└─ Profissional aguarda decisão

🔴 RETURNED (Devolvido)
└─ Coordenador pediu ajustes
└─ Você PODE editar novamente
└─ Após ajustar, envie novamente

🟢 APPROVED (Aprovado)
└─ Coordenador aprovou ✅
└─ Relatório está finalizado
└─ Pode ser exportado em PDF
└─ Será automaticamente arquivado em 30 dias

⚫ ARCHIVED (Arquivado)
└─ Relatório foi arquivado
└─ Ainda está acessível para leitura
└─ Não pode mais ser editado`
    },
    {
      id: 'dicas-profissionais',
      title: '💡 Dicas Profissionais',
      icon: '💡',
      content: `🎯 PREPARAÇÃO ANTES DE COMEÇAR
├─ Reúna lista completa de atividades do mês
├─ Anote datas EXATAS (não "aproximadamente")
├─ Conte público com precisão (não estimativas)
├─ Tenha fotos ou documentos em mãos
└─ Identifique desafios e oportunidades

✏️ DURANTE A EDIÇÃO DO RELATÓRIO
✅ Preencha de cima para baixo: Identificação → Resumo → Atividades → Avaliação
✅ Seja específico: "30 alunos" em vez de "alguns"
✅ Use "Gerar com IA" → revise e adapte o texto
✅ Salve após cada seção importante
✅ Se desconectar, clique "Continuar Editando" (salvo automaticamente)
✅ Releia tudo antes de submeter

🔍 CHECKLIST FINAL ANTES DE ENVIAR
├─ ☑️ Todas as seções têm ✅ (verde)?
├─ ☑️ Nenhuma campo obrigatório em branco?
├─ ☑️ Datas fazem sentido? (não há 30/02)
├─ ☑️ Números são realistas?
├─ ☑️ Checkbox de responsabilidade MARCADO?
└─ ☑️ Texto profissional e sem erros?

↩️ SE COORDENADOR DEVOLVER
├─ Leia comentário na aba "Comentários de Revisão"
├─ Identifique o que precisa mudar
├─ Faça os ajustes cuidadosamente
├─ Explique grandes mudanças em nota
└─ Reenvie dentro de 2-3 dias

💬 COMUNICAÇÃO COM SEU COORDENADOR
✅ Envie ANTES do dia 25 (final de mês)
✅ Se tiver dúvida, pergunte HOJE (não deixe para última hora)
✅ Responda devoluções rapidamente
✅ Mantenha dados honestos e precisos
✅ Avise se não conseguir submeter no prazo

⚡ DICAS PARA ECONOMIZAR TEMPO
• Use "Carregar Template" se já criou relatório similar
• Copie texto de relatório anterior (mude datas/números)
• "Gerar com IA" economiza ~30 minutos por relatório
• Organize cronograma: dias 1-10 atividades, dias 11-20 avaliação, dias 21-25 envio`
    },
    {
      id: 'troubleshooting',
      title: '❓ Solução de Problemas',
      icon: '❓',
      content: `PROBLEMA: Meu relatório desapareceu
SOLUÇÃO:
├─ Acesse "Relatórios" no menu
├─ Procure pelo status "DRAFT"
├─ Procure por data
└─ Sistema salva automaticamente, sempre está lá!

PROBLEMA: Não consigo editar após enviar
SOLUÇÃO:
└─ Normal! Só pode editar se coordenador devolver (RETURNED)
└─ Aguarde decisão do coordenador

PROBLEMA: Esqueci o que escrevi em uma seção
SOLUÇÃO:
├─ Abra o relatório
├─ Clique em cada aba para revisar
└─ Histórico de versões está disponível

PROBLEMA: Quero editar um relatório aprovado
SOLUÇÃO:
└─ Não é possível editar APPROVED
└─ Crie um novo relatório para o mês seguinte
└─ Ou contate um administrador

PROBLEMA: Não consigo fazer upload de arquivo
SOLUÇÃO:
├─ Verifique tamanho (máx 100MB)
├─ Tente outro formato
├─ Verifique conexão internet
└─ Acesse "Galeria de Arquivos"

PROBLEMA: Não recebi notificação do coordenador
SOLUÇÃO:
├─ Verifique email spam/lixo
├─ Acesse "Notificações" no app
├─ Contate coordenador diretamente
└─ Verifique se email está atualizado

PROBLEMA: Gráficos não estão mostrando
SOLUÇÃO:
├─ Atualize a página (F5)
├─ Limpe cache do navegador
├─ Tente outro navegador
└─ Contate suporte se persistir

PRECISO DE AJUDA?
├─ Esta página: "Manual de Instruções"
├─ Passe o mouse sobre elementos → aparece ajuda
├─ Contate seu coordenador
└─ Email suporte: projeto@museuscentro.sp.gov.br`
    },
    {
      id: 'glossario-termos',
      title: '📚 Glossário de Termos',
      icon: '📚',
      content: `TERMOS PRINCIPAIS:

META
└─ Atividades relacionadas aos objetivos do 3º Aditivo
└─ Exemplo: "Realizar 20 visitas escolares"
└─ Obrigatório informar resultado

ROTINA
└─ Atividades habituais do departamento
└─ Exemplo: "Atender visitantes"
└─ Contínua durante o mês

EXTRA
└─ Atividades adicionais ou extraordinárias
└─ Exemplo: "Reparos no museu"
└─ Sem período definido

PÚBLICO ESTIMADO
└─ Número aproximado de pessoas impactadas
└─ Exemplo: 50 alunos em uma oficina
└─ Multiplicar por repetições para total

TEMPLATE
└─ Modelo reutilizável de relatório
└─ Economiza tempo nos próximos meses
└─ Pode ser pessoal ou compartilhado

DRAFT (Rascunho)
└─ Relatório em edição, não enviado ainda
└─ Salvo automaticamente
└─ Apenas você vê

COMPLIANCE
└─ Conformidade com requisitos
└─ Todas as seções preenchidas?
└─ Dados válidos?

AUTO-SAVE
└─ Salvamento automático a cada 5 segundos
└─ Você nunca perde dados
└─ Funciona mesmo desconectado (sincroniza depois)

PROTOCOLO
└─ Número único do relatório
└─ Formato: MC-MESANO-XXXXX
└─ Gerado automaticamente ao enviar

DEVOLVER
└─ Coordenador pediu ajustes
└─ Você pode editar novamente
└─ Enviar de novo após corrigir`
    },
    {
      id: 'boas-praticas',
      title: '⭐ Boas Práticas',
      icon: '⭐',
      content: `ORGANIZAÇÃO
✅ Use títulos descritivos nas atividades
✅ Datas exatas, não "aproximadamente"
✅ Números precisos, não estimativas
✅ Agrupe atividades similares
✅ Revise antes de enviar

QUALIDADE DOS DADOS
✅ Público realista (não exagerar)
✅ Datas consistentes (sem contradições)
✅ Descrições claras e profissionais
✅ Erros corrigidos antes de enviar
✅ Evidências (fotos, documentos) anexadas

COMUNICAÇÃO
✅ Texto profissional e respeitoso
✅ Explique desafios, não reclame
✅ Sugira soluções, não apenas problemas
✅ Reconheça successo da equipe
✅ Cite parcerias

PRAZOS
✅ Envie com antecedência (até dia 25)
✅ Se devolver, corrija em 2-3 dias
✅ Não deixe acumular relatórios
✅ Acompanhe status regularmente
✅ Comunique atrasos ao coordenador

SEGURANÇA
✅ Nunca compartilhe senha
✅ Faça logout ao terminar (se público)
✅ Não deixe dados sensíveis abertos
✅ Verifique integridade dos arquivos
✅ Reporte problemas de segurança

EFICIÊNCIA
✅ Use templates para relatórios similares
✅ Copie de relatórios anteriores se similar
✅ Use IA para sugestões iniciais
✅ Organise cronograma de envio
✅ Mantenha histórico local (backup próprio)`
    },
    {
      id: 'analise-claude',
      title: '🤖 Análise IA & Melhorias',
      icon: '🤖',
      content: `COMO A IA (CLAUDE) AJUDA NO SISTEMA

ANÁLISE AUTOMÁTICA DE RELATÓRIOS
├─ Revisa conteúdo em tempo real
├─ Detecta informações inconsistentes
├─ Sugere melhorias de redação
└─ Analisa alinhamento com metas

GERAÇÃO DE SUGESTÕES
Quando clica em "Gerar com IA":
├─ Analisa atividades já registradas
├─ Identifica padrões e tendências
├─ Propõe resumos executivos
├─ Sugere pontos positivos/desafios
└─ Adapta tom profissional

DETECÇÃO DE DUPLICATAS
└─ IA varre atividades similares do mês
└─ Avisa se encontrar dados duplicados
└─ Evita duplicações acidentais

CONFORMIDADE AUTOMÁTICA
├─ Valida se todas seções estão preenchidas
├─ Verifica datas válidas
├─ Confirma números realistas
├─ Garante metas vinculadas corretamente
└─ Sinaliza gaps antes de enviar

INSIGHTS INTELIGENTES
├─ Análise de padrões por equipe
├─ Tendências de público
├─ Alertas sobre metas em risco
├─ Sugestões de melhorias operacionais
└─ Comparações com períodos anteriores

QUANDO USAR A IA?
✅ Resumo executivo está em branco
✅ Avaliação não está clara
✅ Dúvida com redação profissional
✅ Quer comparar com mês anterior
✅ Precisa de sugestões estruturais

DICAS PARA MELHOR RESULTADO
├─ Preencha dados básicos antes de usar IA
├─ Seja específico nos prompts (ex: "Resuma oficinas de dança")
├─ Revise sugestões da IA (não copie direto!)
├─ Adapte o tom para sua voz
├─ Use como ponto de partida, não conclusão

ANÁLISE CLAUDE DO FLUXO
🔍 Problemas Identificados (antes):
• Relatórios frequentemente devolvidos por falta de clareza
• Texto repetitivo entre seções
• Números inconsistentes (público ≠ quantas repetições)
• Metas nem sempre bem justificadas
• Demora excessiva na redação

💡 Soluções Implementadas (agora):
✅ IA sugere estrutura clara desde início
✅ Detecção automática de inconsistências
✅ Templates inteligentes por tipo de atividade
✅ Auto-preenchimento de metas vinculadas
✅ Sugestões contextuais em tempo real
✅ Análise de compliance antes de enviar

📊 IMPACTO ESPERADO
├─ Redução de 60% em devoluções por clareza
├─ Tempo médio: 40 minutos → 25 minutos por relatório
├─ Aumento de 80% em primeira aprovação
├─ Melhor qualidade de dados documentados
└─ Maior satisfação coordenador

⚠️ LIMITAÇÕES DA IA
├─ IA não substitui análise humana
├─ Coordenador sempre faz revisão final
├─ Responsabilidade é SEMPRE sua
├─ Revise tudo antes de enviar
└─ Para dados sensíveis, pergunta sempre

🔐 PRIVACIDADE & SEGURANÇA
├─ IA processa dados confidenciais
├─ Tudo é criptografado em trânsito
├─ Dados não são usados para treinar IA
├─ Acesso apenas a seus próprios relatórios
├─ Coordenador controla permissões
└─ Compliance com LGPD garantido`
    }
  ]
};

export default function ManualInstrucoes() {
  const [expandedSections, setExpandedSections] = useState({});
  const [printMode, setPrintMode] = useState(false);

  const toggleSection = (id) => {
    setExpandedSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAll = () => {
    const all = {};
    MANUAL_CONTENT.sections.forEach(s => {
      all[s.id] = true;
    });
    setExpandedSections(all);
  };

  const collapseAll = () => {
    setExpandedSections({});
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-white py-8 md:py-12 px-4 md:px-6 ${printMode ? 'print:bg-white' : ''}`}>
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-10 md:mb-14 print:mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <BookOpen className="w-8 h-8 md:w-10 md:h-10 text-blue-600" />
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">{MANUAL_CONTENT.title}</h1>
          </div>
          <p className="text-lg text-slate-600 mb-1">{MANUAL_CONTENT.subtitle}</p>
          <p className="text-xs text-slate-500">{MANUAL_CONTENT.version}</p>
        </div>

        {/* Table of Contents */}
        <div className="mb-10 p-6 md:p-8 bg-white border-2 border-slate-200 rounded-2xl shadow-sm print:border-slate-400">
          <h2 className="text-lg font-bold text-slate-900 mb-4">📖 Índice Interativo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {MANUAL_CONTENT.sections.map(section => (
              <button
                key={section.id}
                onClick={() => {
                  const el = document.getElementById(section.id);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  toggleSection(section.id);
                }}
                className="text-left p-3 rounded-lg hover:bg-blue-50 transition-colors group"
              >
                <span className="text-xl mr-2">{section.icon}</span>
                <span className="text-slate-700 group-hover:text-blue-700 font-medium">{section.title.replace(/^[^a-zA-Z]+\s+/, '')}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={expandAll}
              variant="outline"
              size="sm"
              className="text-xs border-slate-300"
            >
              ↗️ Expandir Tudo
            </Button>
            <Button
              onClick={collapseAll}
              variant="outline"
              size="sm"
              className="text-xs border-slate-300"
            >
              ↙️ Recolher Tudo
            </Button>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-4 print:space-y-3">
          {MANUAL_CONTENT.sections.map(section => (
            <div
              key={section.id}
              id={section.id}
              className="border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white print:page-break-inside-avoid"
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full p-5 md:p-6 hover:bg-slate-50 flex items-center justify-between transition-colors print:pointer-events-none print:bg-white print:p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl md:text-3xl">{section.icon}</span>
                  <h2 className="text-lg md:text-xl font-bold text-slate-900 text-left">{section.title}</h2>
                </div>
                {!printMode && (expandedSections[section.id] ? (
                  <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                ))}
              </button>

              {(expandedSections[section.id] || printMode) && (
                <div className="border-t-2 border-slate-100 p-5 md:p-6 bg-slate-50 print:bg-white">
                  <div className="text-sm md:text-base text-slate-700 whitespace-pre-wrap leading-relaxed font-mono space-y-2">
                    {section.content}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer & Actions */}
        <div className="mt-10 md:mt-14 pt-6 md:pt-8 border-t-2 border-slate-200">
          <div className="text-center mb-6 md:mb-8 text-sm text-slate-600 print:text-slate-700">
            <p className="font-medium">Última atualização: Março de 2026</p>
            <p className="mt-1">Dúvidas não abordadas? Contate seu coordenador ou acesse a base de conhecimento</p>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-3 print:hidden">
            <Button
              onClick={() => setPrintMode(!printMode)}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              <BookOpen className="w-4 h-4" />
              {printMode ? 'Sair do Modo Impressão' : 'Modo Impressão'}
            </Button>
            <Button
              onClick={() => window.print()}
              className="bg-slate-800 hover:bg-slate-900 text-white gap-2"
            >
              <Download className="w-4 h-4" />
              Imprimir / Salvar como PDF
            </Button>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 p-4 md:p-6 bg-blue-50 border-l-4 border-blue-600 rounded-lg print:hidden">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 space-y-1">
              <p><strong>💡 Dica:</strong> Passe o mouse sobre botões e campos na plataforma para receber ajuda contextual automática.</p>
              <p><strong>📞 Suporte:</strong> Se tiver dúvidas, seu coordenador está sempre disponível para ajudar.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}