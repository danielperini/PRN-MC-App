import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageCircle, X, Send, Minimize2, Maximize2, Lightbulb, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';

const systemPrompt = `Você é um assistente inteligente para gestão de museus e relatórios culturais. 
Você ajuda usuários com:
- Orientações sobre preenchimento de relatórios mensais
- Dúvidas sobre metas e indicadores culturais
- Informações sobre o plano de trabalho anual
- Boas práticas em documentação de atividades culturais
- Explicações sobre processo de aprovação de relatórios
- Dicas para melhorar a coleta de dados de públicos

Sempre seja amigável, profissional e conciso nas respostas.`;

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Olá! Sou seu assistente de gestão cultural. Como posso ajudar?' }
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

  const suggestedQuestions = [
    'Como preencher o resumo executivo?',
    'Qual é o plano de trabalho para este período?',
    'Como classificar minhas atividades?',
    'Dúvidas sobre aprovação de relatórios?'
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
        prompt: `${systemPrompt}\n\n${context}\n\nPergunta do usuário: ${textToSend}`,
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
        <h3 className="font-semibold text-black text-sm">Assistente de Ajuda</h3>
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
                    onClick={() => handleSuggestedQuestion('Qual é o plano de trabalho anual?')}
                    className="w-full text-left text-xs p-2 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 transition-colors flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Ver plano de trabalho
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