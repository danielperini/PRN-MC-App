import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpCircle, Send, Loader2, FileText, BookOpen } from 'lucide-react';

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

const MANUAL_KEYWORDS = [
  'manual',
  'ajuda',
  'instrução',
  'instrucoes',
  'regras',
  'fluxo',
  'treinamento',
  'tutorial',
  'guia',
];

const DEFAULT_ASSISTANT_PROMPT = `Você é o assistente oficial da plataforma Museus Centro.

REGRAS GERAIS:
- Use sempre a Biblioteca de Conhecimento ativa e o Manual do sistema como base principal.
- Nunca invente informações.
- Nunca use conhecimento externo.
- Se não encontrar informação suficiente na base, diga exatamente: "Não encontrei essa informação na base de conhecimento."
- Priorize regras operacionais, fluxos aprovados, documentos ativos, manuais, contratos, pagamentos, compras, equipe, aprovações e rubricas.
- Equipe é gerida e paga pelos coordenadores.
- Profissional apenas envia nota fiscal.
- Pagamento de equipe acontece via módulo Equipe.
- Compras são usadas para fornecedores, materiais e serviços.
- Nunca misture o fluxo de Compras com o fluxo de Equipe.
- Rubrica só é debitada quando aprovado.
- Responda em português do Brasil, de forma clara, direta e útil.`;

function withTimeout(promise, ms, label = 'Operação') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} demorou mais do que o esperado.`)), ms)
    ),
  ]);
}

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

function isManualDocument(docOrChunk) {
  const text = normalizeText(
    [
      docOrChunk?.titulo,
      docOrChunk?.document_title,
      docOrChunk?.categoria,
      docOrChunk?.tags,
      docOrChunk?.descricao,
    ]
      .filter(Boolean)
      .join(' ')
  );

  return MANUAL_KEYWORDS.some((keyword) => text.includes(keyword));
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

  if (!textoChunk && !tituloChunk && !origemTitulo) return 0;

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

  if (isManualDocument(chunk)) score += 10;

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

function dedupeByKey(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
        const settings = await withTimeout(
          base44.entities.KnowledgeLibrarySettings.list('-created_date', 10),
          10000,
          'Carregamento da configuração'
        );
        const config = Array.isArray(settings) ? settings[0] : null;

        if (!mounted) return;
        setKnowledgeEnabled(config?.usar_no_assistente_ajuda !== false);
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
      const [docs, chunks] = await withTimeout(
        Promise.all([
          base44.entities.KnowledgeDocument.list('-created_date', 150),
          base44.entities.KnowledgeChunk.list('-created_date', 800),
        ]),
        15000,
        'Busca da base de conhecimento'
      );

      const documentosAtivos = (docs || []).filter((doc) => doc?.ativo);
      const docIdsAtivos = new Set(documentosAtivos.map((doc) => doc.id));

      const documentosManuais = documentosAtivos.filter((doc) => isManualDocument(doc));

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

      const manualChunks = chunksAtivos
        .filter((chunk) => isManualDocument(chunk))
        .map((chunk) => ({
          ...chunk,
          _score: scoreChunk(chunk, pergunta) + 15,
        }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 2);

      const melhoresChunks = chunksPontuados.slice(0, maxChunks);
      let selecionados = dedupeByKey(
        [...manualChunks, ...melhoresChunks],
        (item) =>
          `${item?.knowledge_document_id || item?.document_id || 'sem-doc'}-${item?.chunk_index || item?.texto_chunk?.slice(0, 80) || ''}`
      ).slice(0, Math.max(maxChunks, 6));

      if (selecionados.length === 0) {
        const fallbackDocs = dedupeByKey(
          [...documentosManuais, ...documentosAtivos],
          (doc) => doc?.id
        ).slice(0, Math.max(maxChunks, 4));

        selecionados = fallbackDocs.map((doc, index) => ({
          knowledge_document_id: doc.id,
          texto_chunk: (doc?.conteudo_extraido || doc?.resumo_ia || '').slice(0, 4500),
          categoria: doc?.categoria || '',
          cargo_relacionado: doc?.cargo_relacionado || '',
          tags: doc?.tags || '',
          document_title: doc?.titulo || '',
          _score: 100 - index,
        }));
      }

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
        const settings = await withTimeout(
          base44.entities.KnowledgeLibrarySettings.list('-created_date', 5),
          10000,
          'Carregamento da configuração da IA'
        );
        config = settings?.[0] || {};
      } catch (e) {
        console.warn('Erro ao carregar config IA', e);
      }

      const usarBase = config?.usar_no_assistente_ajuda !== false;
      const maxChunks = Number(config?.max_chunks_por_resposta) || 6;
      const promptBase =
        config?.prompt_base_assistente || DEFAULT_ASSISTANT_PROMPT;

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
- Consulte sempre a Biblioteca de Conhecimento e o Manual do sistema presentes no contexto abaixo.
- Analise o contexto documental a cada pergunta antes de responder.
- Use SOMENTE a base de conhecimento abaixo.
- NÃO invente.
- NÃO use conhecimento externo.
- Se não estiver na base, responda exatamente: "Não encontrei essa informação na base de conhecimento."
- Se houver valores, salários, pagamentos, parcelas, contratos ou cargos, informe apenas o que estiver claramente presente no contexto.
- Priorize regras operacionais, fluxo de equipe, fluxo de compras, aprovação, rubricas, documentos, manual e ajuda.
- Responda em português do Brasil.
- Seja claro, direto e útil.

HISTÓRICO:
${historico || 'Sem histórico anterior.'}

BASE DE CONHECIMENTO ATIVA: ${usarBase ? 'SIM' : 'NÃO'}
QUANTIDADE DE CONTEXTOS SELECIONADOS: ${quantidadeContextos}

CONTEXTO DOCUMENTAL:
${contexto || 'Nenhum contexto documental relevante encontrado.'}

PERGUNTA:
${pergunta}
`.trim();

      const result = await withTimeout(
        base44.integrations.Core.InvokeLLM({
          prompt,
          add_context_from_internet: false,
        }),
        30000,
        'Resposta da IA'
      );

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
          content:
            error?.message?.includes('demorou mais do que o esperado')
              ? 'A resposta da IA demorou mais do que o esperado. Tente novamente com uma pergunta mais específica.'
              : 'Erro ao consultar a base de conhecimento.',
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
            Consulta sempre a Biblioteca de Conhecimento e o Manual do sistema antes de responder
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

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <BookOpen className="w-4 h-4" />
              <span>Manual priorizado</span>
            </div>
          </div>

          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4">
              {conversation.length === 0 && (
                <div className="text-center text-gray-400 mt-10">
                  Faça uma pergunta sobre contratos, salários, pagamentos, metas,
                  documentos, manual, compras, equipe ou uso da plataforma
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
                  <div className="bg-gray-100 text-black rounded-2xl px-4 py-3 flex items-center gap-2">
                    <Loader2 className="animate-spin w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      Analisando manual e base de conhecimento...
                    </span>
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
