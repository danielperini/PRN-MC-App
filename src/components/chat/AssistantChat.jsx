import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageCircle, X, Send, Minimize2, Maximize2, Lightbulb, FileText, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const TERCEIRO_ADITIVO_CONTEXT = `
=== CONTRATO VIGENTE ===
3º Termo Aditivo ao Termo de Colaboração - Chamamento Público FMC nº 001/2024
Vigência: até 29 de novembro de 2026 (28 meses)
Valor Global: R$ 3.891.800,00 (acréscimo 3º Aditivo: R$ 1.320.000,00)
Parceria: FMC + OSC Viaduto das Artes

=== MUSEUS ===
• MUMO - Museu da Moda: Primeiro museu público de moda do Brasil. Foco: moda, design, economia criativa. Exposição atual: "Clara Nunes - eu sou a tal mineira"
• MIS BH - Museu da Imagem e do Som: 90 mil+ itens audiovisuais. Foco: preservação, catalogação. Exposição: "Cinema: coleções e outras sensações"
• MHAB - Museu Histórico Abílio Barreto: Fundado 1941. Foco: história de BH. Exposição: "Belo Horizonte Fora dos Planos"

=== METAS DO 3º ADITIVO ===
Ações Educativas: 60 (fase 1) + 30 (fase 3) = 90 total
Ações Culturais: 36 (fase 1) + incluídas nas 30 da fase 3
Educadores Fixos: 3 (40h/sem, 1 por museu, 28 meses)
Diárias Educadores: 101 (público espontâneo)
Exposições Novas: 3 (Casarão MHAB, MIS, MUMO)
Mostras Curta Duração: 18 (áreas não convencionais)
Noturno nos Museus: 3 edições (2024, 2025, 2026)
Catálogos: 4 (300 exemplares cada: 2 MHAB, 1 MIS, 1 MUMO)
Acessibilidade: 1 maquete tátil + 5 vídeos Libras
Presente de Iemanjá: 1 festejo (4 ações culturais)
Consultorias: 2 temáticas + 1 formação ambiente seguro

=== FASE 3 (Mês 19-28) ===
• 30 ações educativas/culturais
• Nova exposição MUMO + abertura
• 2 consultorias + 1 formação
• Continuidade 3 educadores (10 parcelas)

=== NOTURNO NOS MUSEUS ===
Evento cultural com museus abertos 18h-23h, programação gratuita, vans entre espaços.
Edições realizadas: 2024 (9ª, 24 espaços, dez/2024), 2025 (10ª, 30+ espaços, jun/2025)
Próxima: 2026

=== PRINCÍPIOS ===
✓ TODAS as ações são GRATUITAS
✓ Classificação indicativa LIVRE
✓ Acessibilidade garantida
✓ Proibição de discriminação
✓ Trabalho colaborativo FMC + OSC

=== COMISSÃO DE PROGRAMAÇÃO ===
Coordenações OSC: Geral, Programação, Comunicação, Produção
+ 3 Coordenadores dos museus + Diretoria de Museus (paritária)
`;

const MANUAL_CONTEXT = `
MANUAL COMPLETO - PLATAFORMA MUSEU CENTRO:

=== VISÃO GERAL ===
Sistema centralizado para registro, acompanhamento e aprovação de relatórios mensais.
Públicos: Profissionais (criam relatórios), Coordenadores (revisam), Administradores (configurar).

=== PARA PROFISSIONAIS ===
CRIAR RELATÓRIO:
1. Clique "Novo Relatório" → Editor abrirá
2. Preencha Identificação: Mês, Ano, Museu, Equipe
3. Resumo Executivo: Principais atividades (use "Gerar com IA" para sugestões)
4. Atividades: Clique "+ Adicionar" → Título, Descrição, Data, Público
   - Classificação: META (contrato), ROTINA (habitual), EXTRA (extraordinária)
   - Se META: Selecione código, informe resultado e status
5. Oportunidades: Momentos especiais (histórias) e oportunidades encontradas
6. Avaliação: Pontos positivos, dificuldades, sugestões
7. MARQUE checkbox de responsabilidade
8. Clique "Enviar para Revisão"

SALVAMENTO:
- Auto-save a cada 5 segundos (automático)
- Salvar Rascunho: Mantém como DRAFT
- Status: DRAFT → SUBMITTED → IN_REVIEW → APPROVED/RETURNED

DÚVIDAS COMUNS:
- Perdeu rascunho? Está em "Relatórios" com status DRAFT
- Pode editar após enviar? Só se Coordenador devolver (RETURNED)
- Limite de tempo? Envie até fim do mês (consulte coordenador)

=== PARA COORDENADORES ===
REVISAR RELATÓRIOS:
1. Acesse "Revisão" → Filtre por museu/status
2. Clique "Assumir Revisão" (muda para IN_REVIEW)
3. Leia todas as seções
4. Ações:
   - DEVOLVER: Escreva comentários por seção, profissional edita
   - APROVAR: Marque como APPROVED, pronto para exportação

PAINEL DE COORDENAÇÃO:
- Números consolidados e métricas
- Carousel de Momentos publicados
- Análise de atividades por equipe
- Oportunidades identificadas
- Compliance Panel (quem deveria ter enviado)
- Log completo de aprovações

GESTÃO:
- Delegar revisão a outro coordenador
- Comentários estruturados por seção
- Histórico de versões (quem alterou quando)

=== FUNCIONALIDADES CHAVE ===
TEMPLATES:
- Salvar como Template: Reutilize estrutura
- Carregar de Template: Pré-preenche dados

PDF & EXPORTAÇÃO:
- Gerar PDF: Relatório completo com todas as seções
- Exportar CSV: Dados estruturados para análise
- PDFs Aprovados: Sincronizam para Google Drive automaticamente

BUSCA & FILTROS:
- Busca global por: Nome, museu, mês, protocolo
- Filtros avançados: Status, período, equipe, classificação

IA ASSISTENTE:
- Gerar resumo executivo
- Sugestões de pontos positivos
- Análise de tendências
- Feedback em tempo real

GOOGLE DRIVE:
- Backup automático de relatórios
- Sincronização de PDFs aprovados em pasta estruturada
- Compartilhamento seguro

NOTIFICAÇÕES:
- Ao enviar relatório
- Quando devolvido (com feedback)
- Ao ser aprovado
- Lembretes de prazos (último dia do mês)

=== GLOSSÁRIO ===
- META: Atividade do 3º Aditivo (contrato vigente)
- ROTINA: Atividade habitual e regular
- EXTRA: Atividade adicionais/extraordinárias
- DRAFT: Rascunho em edição
- SUBMITTED: Enviado para revisão
- IN_REVIEW: Coordenador revisando
- RETURNED: Devolvido para ajustes
- APPROVED: Aprovado, exportável
- ARCHIVED: Arquivado, não editável
- Compliance: Conformidade com prazos
- Auto-save: Salvamento automático (5 segundos)
- Template: Modelo reutilizável
- Momento: Histórias/depoimentos para publicação
- Público Estimado: Quantidade aproximada de pessoas impactadas
`;

const systemPrompt = `Você é um assistente especializado da Plataforma Museu Centro.

ESTILO DE RESPOSTA (OBRIGATÓRIO):
- SEM EMOJIS ou símbolos decorativos
- Formatação estruturada com seções claras
- Texto conciso e objetivo
- Listas numeradas para passo-a-passo
- Negrito para destaques
- Respostas bem resumidas (máx 300 palavras)
- Evite repetições
- Cite fontes quando necessário

ÁREAS DE CONHECIMENTO:
1. Criação e gerenciamento de relatórios mensais
2. Workflow de aprovação (DRAFT → SUBMITTED → IN_REVIEW → APPROVED)
3. Classificação de atividades (META, ROTINA, EXTRA)
4. 3º Termo Aditivo (23 metas do contrato vigente)
5. Museus MUMO, MIS e MHAB
6. Funcionalidades: Templates, PDF, Google Drive, IA

INFORMAÇÕES IMPORTANTES:
- Vigência: até 29 de novembro de 2026
- Todas as ações são GRATUITAS
- Classificação indicativa LIVRE
- Acessibilidade garantida

INSTRUÇÕES:
- Respostas diretas e úteis
- Passo-a-passo numerado quando necessário
- Sempre mencione status quando relevante
- Dirija para coordenador quando necessário
- Seja profissional e objetivo`;

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Olá! Sou seu assistente de gestão cultural. Tenho acesso ao 3º Termo Aditivo (contrato vigente) e posso ajudá-lo com relatórios, metas, atividades dos museus e muito mais. Como posso ajudar?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const { data: reportContext } = useQuery({
    queryKey: ['recent-reports'],
    queryFn: () => base44.entities.Report.list('-created_date', 5),
    enabled: open,
  });

  const { data: knowledgeDocs = [] } = useQuery({
    queryKey: ['knowledge-docs-chat'],
    queryFn: () => base44.entities.KnowledgeDocument.filter({ ativo: true }, '-created_date', 20),
    enabled: open,
  });

  const suggestedQuestions = [
    // BÁSICO - CRIAR E ENVIAR
    'Como criar um novo relatório?',
    'Como salvar meu relatório como rascunho?',
    'Como enviar relatório para revisão?',
    'O que significa cada status (DRAFT, SUBMITTED, IN_REVIEW, etc)?',
    
    // ATIVIDADES E CLASSIFICAÇÃO
    'O que é uma atividade META?',
    'Qual a diferença entre META, ROTINA e EXTRA?',
    'Como preencher uma atividade META?',
    'O que é Público Estimado?',
    'Como registrar atividades com múltiplas ocorrências?',
    
    // CAMPOS ESPECÍFICOS
    'Como preencher o Resumo Executivo?',
    'O que colocar em Pontos Positivos?',
    'Como descrever Dificuldades e Desafios?',
    'O que são Sugestões de Melhoria?',
    'Como adicionar Momentos Especiais?',
    
    // TEMPLATES
    'Como salvar um relatório como Template?',
    'Como carregar um Template?',
    'Posso compartilhar Templates com minha equipe?',
    'Como reutilizar um Template salvo?',
    
    // EXPORTAÇÃO E COMPARTILHAMENTO
    'Como exportar relatório em PDF?',
    'Como exportar dados em CSV?',
    'O relatório é sincronizado para Google Drive?',
    'Como compartilhar relatório aprovado?',
    'Posso imprimir meu relatório?',
    
    // BUSCA E FILTROS
    'Como usar a busca de relatórios?',
    'Como filtrar por museu, mês ou status?',
    'Como encontrar relatórios de um profissional específico?',
    'Posso filtrar por classificação de atividade?',
    
    // IA E SUGESTÕES
    'Como usar IA para gerar sugestões?',
    'A IA pode criar resumo executivo?',
    'Posso pedir IA para revisar pontos positivos?',
    'Como usar análise de tendências?',
    
    // PARA COORDENADORES
    'Como coordenador: como revisar relatórios?',
    'Como "Assumir Revisão" de um relatório?',
    'Como devolver relatório com feedback?',
    'Como adicionar comentários por seção?',
    'Como aprovar um relatório?',
    'Como delegar revisão a outro coordenador?',
    'Como visualizar o Painel de Coordenação?',
    'Como ver log de aprovações?',
    
    // PROBLEMAS E DÚVIDAS
    'Perdi meu relatório em rascunho. O que faço?',
    'Posso editar após enviar?',
    'Meu relatório foi devolvido. Como editar novamente?',
    'Qual o limite de tempo para enviar?',
    'Posso deletar um relatório?',
    'Como vejo comentários do coordenador?',
    
    // PLANO DE TRABALHO E METAS
    'Quais são as metas do 3º Aditivo?',
    'Qual o Plano de Trabalho vigente?',
    'Quantas ações educativas devem ser feitas?',
    'Quantas ações culturais devem ser feitas?',
    'Qual é a vigência do contrato?',
    'O que é o Noturno nos Museus?',
    'Quais são os objetivos do MUMO, MIS e MHAB?',
    'Como atividades impactam as metas?',
    'O que são "Diárias de Educadores"?',
    'O que são "Consultorias"?',
    'O que é "Acessibilidade" no contrato?',
    
    // MUSEUS
    'Informações sobre MUMO (Museu da Moda)?',
    'Informações sobre MIS BH (Imagem e Som)?',
    'Informações sobre MHAB (Histórico)?',
    'Qual é a exposição atual de cada museu?',
    
    // PÚBLICO E IMPACTO
    'Como calcular público estimado?',
    'Como registrar público por faixa etária?',
    'Como documentar acessibilidade da atividade?',
    'O que é "Classificação Indicativa LIVRE"?',
    
    // EQUIPES
    'Qual é minha equipe?',
    'Como filtrar atividades por equipe?',
    'Como ver atividades de outras equipes?',
    
    // PRAZOS E COMPLIANCE
    'Qual é o prazo para enviar relatório?',
    'Como funciona Compliance?',
    'Sou obrigado a submeter relatório mensal?',
    'Posso pedir Isenção de Relatório?',
    
    // SEGURANÇA E PRIVACIDADE
    'Quem pode ver meu relatório?',
    'Meu relatório é privado?',
    'Como funciona a sincronização Google Drive?',
    'Meu relatório é seguro?',
    
    // FUNCIONALIDADES AVANÇADAS
    'Como usar Auto-save?',
    'O que é Versionamento de Relatório?',
    'Como ver histórico de alterações?',
    'Como adicionar anexos/arquivos?',
    'Posso fazer backup do meu relatório?',
    
    // NOTIFICAÇÕES
    'Como recebo notificações?',
    'Serei notificado quando relatório for aprovado?',
    'Como funcionam alertas de prazos?',
    'Posso customizar notificações?',
    
    // GERAL
    'Me explique o 3º Termo Aditivo vigente',
    'Qual é a estrutura completa da plataforma?',
    'Como funciona o workflow de relatórios?',
    'Qual é o público-alvo da plataforma?',
    'Preciso de ajuda técnica, para quem falo?'
  ];

  const handleSuggestedQuestion = (question) => {
    setInput(question);
    setTimeout(() => {
      const fakeEvent = { key: 'Enter' };
      handleSend(question);
    }, 0);
  };

  const handleSend = async (questionText = null) => {
    const textToSend = questionText || input;
    if (!textToSend.trim()) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: textToSend }]);
    setLoading(true);
    if (!input.trim()) return;

    try {
      const reportCtx = reportContext?.length > 0
        ? `Relatórios recentes: ${reportContext.map(r => `${r.numero_protocolo} - ${r.author_name}`).join(', ')}`
        : '';

      // Monta contexto dinâmico dos documentos da base de conhecimento
      const docsContext = knowledgeDocs.length > 0
        ? `\n\n=== BASE DE DOCUMENTOS DE REFERÊNCIA ===\n${knowledgeDocs.map(d =>
            `--- ${d.titulo} (${d.categoria}${d.versao ? ', ' + d.versao : ''}) ---\n${d.conteudo_extraido || '(sem conteúdo extraído)'}`
          ).join('\n\n')}`
        : '';

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n${TERCEIRO_ADITIVO_CONTEXT}\n\n${MANUAL_CONTEXT}${docsContext}\n\n${reportCtx}\n\nPergunta do usuário: ${textToSend}`,
        add_context_from_internet: false,
        model: knowledgeDocs.length > 0 ? 'claude_sonnet_4_6' : undefined,
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 w-12 h-12 md:w-14 md:h-14 rounded-full bg-black hover:bg-gray-800 text-white shadow-lg flex items-center justify-center z-50"
        title="Assistente de Ajuda"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>
    );
  }

  return (
    <div className={`fixed bottom-20 md:bottom-6 right-0 md:right-6 ${minimized ? 'w-full md:w-80 h-16 rounded-t-xl' : 'w-full md:w-96 h-[60vh] md:h-96 rounded-t-xl md:rounded-xl'} bg-white border border-gray-200 shadow-xl flex flex-col z-50 transition-all duration-200`}>
      {/* Header */}
       <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100 bg-gray-50 rounded-t-xl flex-shrink-0">
         <div className="flex items-center gap-2">
           <h3 className="font-semibold text-black text-sm">Assistente de Ajuda</h3>
           <TooltipProvider>
             <Tooltip>
               <TooltipTrigger asChild>
                 <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" />
               </TooltipTrigger>
               <TooltipContent side="bottom" className="max-w-xs text-xs bg-gray-900 text-white border-0">
                 <div className="space-y-1.5">
                   <p className="font-semibold">Ajuda sobre Plano de Trabalho</p>
                   <p>O plano de trabalho anual define as metas e atividades esperadas para cada período. Consulte seu coordenador para detalhes específicos do seu museu.</p>
                   <p className="text-gray-300 text-[10px] pt-1">Dica: use "Qual é o plano de trabalho?" para mais informações</p>
                 </div>
               </TooltipContent>
             </Tooltip>
           </TooltipProvider>
         </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMinimized(!minimized)}
          >
            {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setOpen(false)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 1 ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <Lightbulb className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Perguntas frequentes</p>
                </div>
                <div className="space-y-2">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestedQuestion(q)}
                      className="w-full text-left text-xs p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <button
                    onClick={() => handleSuggestedQuestion('Me explique o 3º Termo Aditivo vigente')}
                    className="w-full text-left text-xs p-2 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 transition-colors flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Ver 3º Aditivo (contrato vigente)
                  </button>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                        msg.role === 'user'
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-900 px-3 py-2 rounded-lg text-sm">
                      Digitando...
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="h-16 px-4 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
            <Input
              placeholder="Escreva sua pergunta..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !loading && handleSend()}
              className="text-sm h-10"
              disabled={loading}
            />
            <Button
              size="icon"
              className="h-10 w-10 bg-black hover:bg-gray-800 text-white"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}