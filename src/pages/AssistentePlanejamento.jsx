import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpCircle, Send, Loader2, FileText } from 'lucide-react';

const CARGOS_PRIORITARIOS = [
  'coordenador',
  'educador',
  'produtor',
  'designer',
  'administrativo',
  'assistente',
  'comunicador',
  'administrador',
  'produtor cultural',
  'consultoria programação',
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function splitTerms(text) {
  return normalizeText(text)
    .split(/[\s,;:.!?()\/\\\-_"'`]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function scoreChunk(chunk, pergunta) {
  const perguntaNormalizada = normalizeText(pergunta);
  const termosPergunta = uniqueStrings(splitTerms(pergunta));
  const textoChunk = normalizeText(chunk?.texto_chunk || '');
  const tituloChunk = normalizeText(chunk?.titulo || '');
  const categoria = normalizeText(chunk?.categoria || '');
  const cargoRelacionado = normalizeText(chunk?.cargo_relacionado || '');
  const tags = normalizeText(chunk?.tags || '');
  const salarios = normalizeText(chunk?.salarios_e_pagamentos || '');
  const temas = normalizeText(chunk?.temas_identificados || '');
  const origemTitulo = normalizeText(chunk?.document_title || '');

  let score = 0;

  if (!textoChunk && !tituloChunk) return 0;

  if (textoChunk.includes(perguntaNormalizada)) score += 30;
  if (tituloChunk.includes(perguntaNormalizada)) score += 18;
  if (origemTitulo.includes(perguntaNormalizada)) score += 12;

  for (const termo of termosPergunta) {
    if (textoChunk.includes(termo)) score += 3;
    if (tituloChunk.includes(termo)) score += 4;
    if (categoria.includes(termo)) score += 2;
    if (tags.includes(termo)) score += 3;
    if (temas.includes(termo)) score += 2;
    if (salarios.includes(termo)) score += 4;
    if (cargoRelacionado.includes(termo)) score += 5;
  }

  const perguntaTemCargo = CARGOS_PRIORITARIOS.some((cargo) =>
    perguntaNormalizada.includes(cargo)
  );

  if (perguntaTemCargo && cargoRelacionado) {
    for (const cargo of CARGOS_PRIORITARIOS) {
      if (perguntaNormalizada.includes(cargo) && cargoRelacionado.includes(cargo)) {
        score += 20;
      }
    }
  }

  const perguntaSobreValores =
    perguntaNormalizada.includes('salario') ||
    perguntaNormalizada.includes('pagamento') ||
    perguntaNormalizada.includes('valor') ||
    perguntaNormalizada.includes('remuneracao') ||
    perguntaNormalizada.includes('parcela') ||
    perguntaNormalizada.includes('contrato');

  if (perguntaSobreValores && salarios) score += 12;
  if (perguntaSobreValores && textoChunk.includes('r$')) score += 8;

  return score;
}

function buildKnowledgeContext(chunks = [], documents = []) {
  const docsById = {};
  documents.forEach((doc) => {
    if (doc?.id) docsById[doc.id] = doc;
  });

  return chunks
    .map((chunk, index) => {
      const doc =
        docsById[chunk?.knowledge_document_id] ||
        docsById[chunk?.document_id] ||
        null;

      const tituloDocumento =
        doc?.titulo ||
        chunk?.document_title ||
        chunk?.titulo_documento ||
        'Documento sem título';

      const categoria = doc?.categoria || chunk?.categoria || 'Sem categoria';
      const cargo = chunk?.cargo_relacionado || doc?.cargo_relacionado || '';
      const tags = chunk?.tags || doc?.tags || '';

      return `
[Contexto ${index + 1}]
Documento: ${tituloDocumento}
Categoria: ${categoria}
${cargo ? `Cargo relacionado: ${cargo}` : ''}
${tags ? `Tags: ${tags}` : ''}
Trecho:
${chunk?.texto_chunk || chunk?.conteudo_extraido || ''}
`.trim();
    })
    .join('\n\n');
}

function AssistenteInner() {
  const [conversation, setConversation] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, loading]);

  useEffect(() => {
    let mounted = true;

    async function loadKnowledgeConfig() {
      try {
        const settings = await base44.entities.KnowledgeLibrarySettings.list(
          '-created_date',
          10
        );
        const config = Array.isArray(settings) ? settings[0] : null;

        if (!mounted) return;

        if (config?.usar_no_assistente_ajuda === false) {
          setKnowledgeEnabled(false);
        } else {
          setKnowledgeEnabled(true);
        }
      } catch (error) {
        console.error('Erro ao carregar configuração da biblioteca:', error);
        if (mounted) setKnowledgeEnabled(true);
      }
    }

    loadKnowledgeConfig();

    return () => {
      mounted = false;
    };
  }, []);

  async function buscarContextoConhecimento(pergunta, maxChunks = 5) {
    try {
      const [docs, chunks] = await Promise.all([
        base44.entities.KnowledgeDocument.list('-created_date', 100),
        base44.entities.KnowledgeChunk.list('-created_date', 500),
      ]);

      const documentosAtivos = (docs || []).filter((doc) => doc?.ativo);
      const docIdsAtivos = new Set(documentosAtivos.map((doc) => doc.id));

      const chunksAtivos = (chunks || []).filter((chunk) => {
        const ativoNoChunk = chunk?.ativo !== false;
        const docAtivo =
          !chunk?.knowledge_document_id ||
          docIdsAtivos.has(chunk.knowledge_document_id);
        return ativoNoChunk && docAtivo;
      });

      const chunksPontuados = chunksAtivos
        .map((chunk) => ({
          ...chunk,
          _score: scoreChunk(chunk, pergunta),
        }))
        .filter((chunk) => chunk._score > 0)
        .sort((a, b) => b._score - a._score);

      const selecionados =
        chunksPontuados.length > 0
          ? chunksPontuados.slice(0, maxChunks)
          : documentosAtivos.slice(0, maxChunks).map((doc, index) => ({
              knowledge_document_id: doc.id,
              texto_chunk: (doc?.conteudo_extraido || '').slice(0, 3500),
              categoria: doc?.categoria || '',
              cargo_relacionado: doc?.cargo_relacionado || '',
              tags: doc?.tags || '',
              document_title: doc?.titulo || '',
              _score: 1 - index * 0.01,
            }));

      return {
        contexto: buildKnowledgeContext(selecionados, documentosAtivos),
        quantidade: selecionados.length,
        vazio: selecionados.length === 0,
      };
    } catch (error) {
      console.error('Erro ao buscar conhecimento:', error);
      return {
        contexto: '',
        quantidade: 0,
        vazio: true,
      };
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const pergunta = input.trim();
    const updatedConversation = [
      ...conversation,
      { role: 'user', content: pergunta },
    ];

    setInput('');
    setConversation(updatedConversation);
    setLoading(true);

    try {
      let config = {};

      try {
        const settings = await base44.entities.KnowledgeLibrarySettings.list(
          '-created_date',
          5
        );
        config = settings?.[0] || {};
      } catch (e) {
        console.warn('Erro ao carregar config IA', e);
      }

      const usarBase = config?.usar_no_assistente_ajuda !== false;
      const maxChunks = config?.max_chunks_por_resposta || 5;
      const promptBase =
        config?.prompt_base_assistente ||
        `Você é o assistente oficial da plataforma Museus Centro.
Use somente a Biblioteca de Conhecimento ativa.
Nunca invente informações.
Se não encontrar a resposta na base, responda exatamente: "Não encontrei essa informação na base de conhecimento."`;

      let contexto = '';
      let quantidadeContextos = 0;
      let contextoVazio = false;

      setKnowledgeEnabled(usarBase);

      if (usarBase) {
        const result = await buscarContextoConhecimento(pergunta, maxChunks);
        contexto = result.contexto;
        quantidadeContextos = result.quantidade;
        contextoVazio = result.vazio;
      }

      if (usarBase && contextoVazio) {
        setConversation((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Não encontrei essa informação na base de conhecimento.',
          },
        ]);
        setLoading(false);
        return;
      }

      const historico = updatedConversation
        .slice(-8)
        .map(
          (msg) => `${msg.role === 'user' ? 'Usuário' : 'Assistente'}: ${msg.content}`
        )
        .join('\n');

      const prompt = `
${promptBase}

REGRAS OBRIGATÓRIAS:
- Use SOMENTE a base de conhecimento abaixo
- NÃO invente
- NÃO use conhecimento externo
- Se não estiver na base, responda exatamente: "Não encontrei essa informação na base de conhecimento."
- Se houver valores, salários, pagamentos, parcelas, contratos ou cargos, informe apenas o que estiver claramente presente no contexto
- Priorize salários, contratos, pagamentos e cargos
- Responda em português do Brasil
- Seja claro, direto e útil

HISTÓRICO:
${historico || 'Sem histórico anterior.'}

BASE DE CONHECIMENTO ATIVA: ${usarBase ? 'SIM' : 'NÃO'}
QUANTIDADE DE CONTEXTOS SELECIONADOS: ${quantidadeContextos}

CONTEXTO:
${contexto || 'Nenhum contexto documental relevante encontrado.'}

PERGUNTA:
${pergunta}
`.trim();

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false,
      });

      const resposta = typeof result === 'string' ? result : String(result || '');

      setConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            resposta?.trim() ||
            'Não encontrei essa informação na base de conhecimento.',
        },
      ]);
    } catch (error) {
      console.error('Erro no assistente:', error);
      setConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Erro ao consultar a base de conhecimento.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10 h-screen flex flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="w-6 h-6 text-black" />
            <h1 className="text-2xl font-semibold">
              Assistente Inteligente do Sistema
            </h1>
          </div>
          <p className="text-gray-500 text-sm">
            Responde com base nos documentos ativos da Biblioteca de Conhecimento
          </p>
        </div>

        <div className="flex-1 flex flex-col border border-black rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <FileText className="w-4 h-4" />
              <span>
                {knowledgeEnabled
                  ? 'Base de conhecimento ativa'
                  : 'Base de conhecimento desativada na configuração'}
              </span>
            </div>
          </div>

          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4">
              {conversation.length === 0 && (
                <div className="text-center text-gray-400 mt-10">
                  Faça uma pergunta sobre contratos, salários, pagamentos, metas,
                  documentos ou uso da plataforma
                </div>
              )}

              {conversation.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-xl px-4 py-3 rounded-2xl whitespace-pre-wrap text-sm ${
                      msg.role === 'user'
                        ? 'bg-black text-white'
                        : 'bg-gray-100 text-black'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-black rounded-2xl px-4 py-3">
                    <Loader2 className="animate-spin w-5 h-5 text-gray-400" />
                  </div>
                </div>
              )}

              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="p-4 border-t flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua pergunta..."
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={loading}
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()}>
              <Send className="w-4 h-4" />
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
