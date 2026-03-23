import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpCircle, Send, Loader2, FileText } from 'lucide-react';

function AssistenteInner() {
  const [conversation, setConversation] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  async function buscarContextoConhecimento(pergunta) {
    try {
      const docs = await base44.entities.KnowledgeDocument.list('-created_date', 50);

      const ativos = docs.filter(d => d.ativo);

      // filtro inteligente por pergunta
      const relevantes = ativos.filter(doc => {
        const texto = (doc.conteudo_extraido || '').toLowerCase();
        const perguntaLower = pergunta.toLowerCase();

        return (
          texto.includes(perguntaLower) ||
          perguntaLower.includes(doc.cargo_relacionado?.toLowerCase()) ||
          doc.tags?.toLowerCase().includes(perguntaLower)
        );
      });

      // fallback se nada encontrado
      const selecionados = relevantes.length > 0 ? relevantes.slice(0, 5) : ativos.slice(0, 3);

      return selecionados.map(d => `
--- DOCUMENTO: ${d.titulo} ---
${d.conteudo_extraido?.slice(0, 4000)}
`).join('\n\n');

    } catch (e) {
      console.error('Erro ao buscar conhecimento:', e);
      return '';
    }
  }

  const handleSend = async () => {
    if (!input.trim()) return;

    const pergunta = input.trim();
    setInput('');
    setConversation(prev => [...prev, { role: 'user', content: pergunta }]);
    setLoading(true);

    const contexto = await buscarContextoConhecimento(pergunta);

    const prompt = `
Você é um assistente da plataforma Museus Centro.

REGRAS:
- Sempre responda com base nos documentos fornecidos.
- Se houver valores, salários ou pagamentos, você DEVE informar com precisão.
- Se a pergunta envolver cargos (coordenador, educador, produtor, designer, administrativo, assistente), priorize esses dados.
- Nunca invente informações.
- Se não encontrar resposta, diga claramente.

BASE DE CONHECIMENTO:
${contexto}

PERGUNTA:
${pergunta}
`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false
    });

    setConversation(prev => [...prev, { role: 'assistant', content: result }]);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10 h-screen flex flex-col">

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="w-6 h-6 text-black" />
            <h1 className="text-2xl font-semibold">Assistente Inteligente do Sistema</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Responde com base nos documentos da plataforma (PDF, Excel, contratos e planos)
          </p>
        </div>

        <div className="flex-1 flex flex-col border border-black rounded-2xl">

          <ScrollArea className="flex-1 p-6 space-y-4">

            {conversation.length === 0 && (
              <div className="text-center text-gray-400 mt-10">
                Faça uma pergunta sobre salários, contratos, metas ou uso da plataforma
              </div>
            )}

            {conversation.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xl px-4 py-3 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-black'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <Loader2 className="animate-spin w-5 h-5 text-gray-400" />
            )}

            <div ref={scrollRef} />

          </ScrollArea>

          <div className="p-4 border-t flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua pergunta..."
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <Button onClick={handleSend} disabled={loading}>
              <Send className="w-4 h-4" />
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function AssistentePlanejamento() {
  return <RequireAuth><AssistenteInner /></RequireAuth>;
}
