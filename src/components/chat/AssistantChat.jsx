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
MANUAL PLATAFORMA MUSEU CENTRO - Referência Rápida:

PARA PROFISSIONAIS:
1. Novo Relatório: Identificação → Resumo → Atividades → Oportunidades → Avaliação
2. Status: DRAFT (rascunho) → SUBMITTED (enviado) → IN_REVIEW → APPROVED/RETURNED
3. Atividades: Título, Descrição, Data, Público, Classificação (META/ROTINA/EXTRA)
4. META: Selecione código, informe resultado e status (Em andamento/Parcial/Cumprida/Superada)
5. Salvar: Auto-save a cada 5 segundos ou clique "Salvar Rascunho"
6. Enviar: Marque declaração de responsabilidade e clique "Enviar para Revisão"

PARA COORDENADORES:
1. Revisão: Acesse "Revisão" → Filtre por museu/status → "Assumir Revisão"
2. Comentários: Detalhados por seção (Identificação/Atividades/Avaliação)
3. Ações: Devolver (com feedback) ou Aprovar
4. Dashboard: Visão consolidada, métricas, compliance, log de aprovações

FUNCIONALIDADES CHAVE:
- Templates: Salvar/Carregar modelos de relatórios
- PDF: Exportar relatório completo
- CSV: Exportar dados para análise
- IA: Gerar sugestões para resumo e pontos positivos
- Filtros: Por mês, museu, equipe, status, classificação
- Momentos: Histórias e depoimentos para carousel

GLOSSÁRIO:
- META: Objetivos do 3º Aditivo (contrato vigente)
- ROTINA: Atividades habituais
- EXTRA: Atividades adicionais
- Draft: Rascunho (editável)
- Compliance: Conformidade de envio
`;

const systemPrompt = `Você é um assistente inteligente da Plataforma Museu Centro. 
Você tem acesso ao 3º Termo Aditivo (contrato vigente) e ajuda com:
- Orientações sobre preenchimento de relatórios mensais
- Dúvidas sobre metas do 3º Aditivo e indicadores culturais
- Informações sobre o plano de trabalho vigente
- Detalhes sobre os 3 museus (MUMO, MIS, MHAB)
- Boas práticas em documentação de atividades culturais
- Explicações sobre processo de aprovação de relatórios
- Noturno nos Museus e eventos especiais
- Instruções sobre como usar a plataforma

IMPORTANTE: 
- Sempre mencione que o 3º Termo Aditivo é o instrumento vigente
- Todas as ações são GRATUITAS e com classificação LIVRE
- Use o contexto do 3º Aditivo para respostas sobre metas e prazos
- Seja amigável, profissional e conciso`;

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
    'Quais são as metas do 3º Aditivo?',
    'O que é uma atividade META?',
    'Como preencher o resumo executivo?',
    'Quantas ações educativas devem ser feitas?',
    'O que é o Noturno nos Museus?',
    'Como enviar meu relatório?'
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
      const context = reportContext?.length > 0
        ? `Contexto: Relatórios recentes: ${reportContext.map(r => `${r.numero_protocolo} - ${r.author_name}`).join(', ')}`
        : '';

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n${TERCEIRO_ADITIVO_CONTEXT}\n\n${MANUAL_CONTEXT}\n\n${context}\n\nPergunta do usuário: ${textToSend}`,
        add_context_from_internet: false,
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
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-black hover:bg-gray-800 text-white shadow-lg flex items-center justify-center z-40"
        title="Assistente de Ajuda"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 ${minimized ? 'w-80 h-16' : 'w-96 h-96'} bg-white border border-gray-200 rounded-xl shadow-xl flex flex-col z-40 transition-all duration-200`}>
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