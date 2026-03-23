import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageCircle, X, Send, Minimize2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Assistente ativo. Faça sua pergunta.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function buscarContexto(pergunta) {
    try {
      const chunks = await base44.entities.KnowledgeChunk.list('-created_date', 200);

      const relevantes = chunks
        .map(c => ({
          ...c,
          score: (c.texto_chunk || '').toLowerCase().includes(pergunta.toLowerCase()) ? 10 : 0
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return relevantes.map(c => c.texto_chunk).join('\n\n');
    } catch {
      return '';
    }
  }

  const handleSend = async (questionText = null) => {
    const textToSend = questionText || input;

    if (!textToSend.trim() || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: textToSend }]);
    setLoading(true);

    try {
      const contexto = await buscarContexto(textToSend);

      const prompt = `
Você é o assistente da plataforma Museus Centro.

REGRAS:
- Use SOMENTE a base abaixo
- Nunca invente
- Seja direto e objetivo
- Use passo a passo quando necessário

BASE:
${contexto || 'Sem dados relevantes'}

PERGUNTA:
${textToSend}
`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false
      });

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: response || 'Sem resposta encontrada.' }
      ]);

    } catch (error) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Erro ao responder. Tente novamente.' }
      ]);
    } finally {
      setLoading(false); // ✅ GARANTE QUE NUNCA TRAVA
    }
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-black text-white"
      >
        <MessageCircle />
      </Button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 ${minimized ? 'h-16' : 'h-96'} w-80 bg-white border rounded-xl flex flex-col`}>

      <div className="flex justify-between p-2 border-b">
        <span>Assistente</span>
        <div className="flex gap-1">
          <Button onClick={() => setMinimized(!minimized)}>
            {minimized ? <Maximize2 /> : <Minimize2 />}
          </Button>
          <Button onClick={() => setOpen(false)}>
            <X />
          </Button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div className="inline-block p-2 bg-gray-100 rounded">
                  {m.content}
                </div>
              </div>
            ))}

            {loading && <div>Digitando...</div>}

            <div ref={messagesEndRef} />
          </div>

          <div className="flex p-2 gap-2 border-t">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={loading}
            />
            <Button onClick={handleSend} disabled={loading}>
              <Send />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
