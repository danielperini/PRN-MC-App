// 🔥 VERSÃO FINAL ESTÁVEL — SEM TRAVAMENTO + IA FORÇADA A USAR MANUAL

import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpCircle, Send, Loader2, FileText, BookOpen } from 'lucide-react';

const DEFAULT_ASSISTANT_PROMPT = `Você é o assistente oficial da plataforma Museus Centro.

REGRAS CRÍTICAS:
- Sempre ler o CONTEXTO antes de responder
- Sempre priorizar o MANUAL e documentos da biblioteca
- Nunca inventar
- Nunca usar internet
- Se não encontrar: responder exatamente "Não encontrei essa informação na base de conhecimento."
- Sempre responder com passo a passo quando for pergunta operacional

FLUXOS DO SISTEMA:
- Equipe → envio de nota → aprovação → pagamento
- Compras → fornecedores e materiais
- Nunca misturar fluxos

Responda em português do Brasil, direto e objetivo.
`;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

function normalize(text) {
  return String(text || '').toLowerCase();
}

function score(chunk, pergunta) {
  const t = normalize(chunk?.texto_chunk);
  const q = normalize(pergunta);
  if (!t) return 0;

  let s = 0;
  if (t.includes(q)) s += 20;

  q.split(' ').forEach((w) => {
    if (t.includes(w)) s += 2;
  });

  if (t.includes('manual')) s += 10;

  return s;
}

function AssistenteInner() {
  const [user, setUser] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => setUser(u)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, loading]);

  async function buscarContexto(pergunta) {
    try {
      const [docs, chunks] = await withTimeout(
        Promise.all([
          base44.entities.KnowledgeDocument.list('-created_date', 100),
          base44.entities.KnowledgeChunk.list('-created_date', 600),
        ]),
        15000
      );

      const ativos = (chunks || []).filter((c) => c?.ativo !== false);

      const ranked = ativos
        .map((c) => ({ ...c, s: score(c, pergunta) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 6);

      if (ranked.length === 0) return '';

      return ranked
        .map(
          (c, i) => `
[Contexto ${i + 1}]
${c.texto_chunk}
`
        )
        .join('\n');
    } catch (e) {
      return '';
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const pergunta = input;

    setConversation((prev) => [
      ...prev,
      { role: 'user', content: pergunta },
    ]);

    setInput('');
    setLoading(true);

    try {
      const contexto = await buscarContexto(pergunta);

      // 🔥 SE NÃO TEM CONTEXTO → RESPONDE SEM TRAVAR
      if (!contexto) {
        setConversation((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Não encontrei essa informação na base de conhecimento.',
          },
        ]);
        setLoading(false);
        return;
      }

      const historico = conversation
        .slice(-6)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const prompt = `
${DEFAULT_ASSISTANT_PROMPT}

HISTÓRICO:
${historico}

CONTEXTO (LEIA ANTES DE RESPONDER):
${contexto}

PERGUNTA:
${pergunta}
`;

      const resposta = await withTimeout(
        base44.integrations.Core.InvokeLLM({
          prompt,
          add_context_from_internet: false,
        }),
        30000
      );

      setConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            resposta ||
            'Não encontrei essa informação na base de conhecimento.',
        },
      ]);
    } catch (e) {
      setConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Erro ao consultar a base.',
        },
      ]);
    }

    // 🔥 GARANTE QUE NUNCA TRAVA
    setLoading(false);
  };

  if (user?.role === 'PATROCINADOR') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Acesso Restrito</h1>
          <p className="text-gray-600">O assistente de IA está disponível apenas para coordenadores e profissionais.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10 h-screen flex flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="w-6 h-6 text-black" />
            <h1 className="text-2xl font-semibold">
              Assistente Inteligente
            </h1>
          </div>
          <p className="text-gray-500 text-sm">
            Consulta manual + base de conhecimento automaticamente
          </p>
        </div>

        <div className="flex-1 flex flex-col border rounded-2xl overflow-hidden">

          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4">
              {conversation.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'text-right' : ''}>
                  <div className="inline-block p-3 bg-gray-100 rounded">
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="text-gray-500">
                  Analisando manual e documentos...
                </div>
              )}

              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="p-4 border-t flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <Button onClick={handleSend} disabled={loading}>
              <Send />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssistentePlanejamento() {
  return (
    <RequireAuth>
      <AssistenteInner />
    </RequireAuth>
  );
}