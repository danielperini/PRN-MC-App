import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageCircle, X, Send, Minimize2, Maximize2, BookOpen, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MANUAL_KEYWORDS = [
  'manual',
  'ajuda',
  'tutorial',
  'guia',
  'fluxo',
  'como',
  'passo a passo',
  'sistema',
  'plataforma',
  'relatório',
  'relatorio',
  'compras',
  'equipe',
  'rubrica',
  'aprovação',
  'aprovacao',
  'documento',
  'biblioteca',
  'assistente',
];

const PROGRAMACAO_KEYWORDS = [
  'atividade',
  'atividades',
  'programacao',
  'programação',
  'agenda',
  'evento',
  'eventos',
  'quando',
  'data',
  'datas',
  'horario',
  'horário',
  'acontece',
  'mis',
  'mhab',
  'mumo',
  'janeiro',
  'fevereiro',
  'marco',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
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

function isManualLike(item) {
  const text = normalizeText(
    [
      item?.titulo,
      item?.document_title,
      item?.categoria,
      item?.tags,
      item?.descricao,
      item?.resumo_ia,
    ]
      .filter(Boolean)
      .join(' ')
  );

  return MANUAL_KEYWORDS.some((keyword) => text.includes(normalizeText(keyword)));
}

function scoreText(text, question) {
  const source = normalizeText(text);
  const q = normalizeText(question);
  const terms = uniqueStrings(splitTerms(question));

  let score = 0;

  if (!source) return 0;
  if (source.includes(q)) score += 40;

  for (const term of terms) {
    if (source.includes(term)) score += 4;
  }

  return score;
}

function scoreChunk(chunk, question) {
  const joined = [
    chunk?.texto_chunk,
    chunk?.titulo,
    chunk?.document_title,
    chunk?.categoria,
    chunk?.tags,
    chunk?.cargo_relacionado,
  ]
    .filter(Boolean)
    .join(' ');

  let score = scoreText(joined, question);

  if (isManualLike(chunk)) score += 18;

  const q = normalizeText(question);
  const text = normalizeText(joined);

  if (q.includes('relatorio') && text.includes('relatorio')) score += 14;
  if (q.includes('revis') && text.includes('revis')) score += 10;
  if (q.includes('nota fiscal') && text.includes('nota fiscal')) score += 12;
  if (q.includes('compra') && text.includes('compr')) score += 10;
  if (q.includes('equipe') && text.includes('equip')) score += 10;
  if (q.includes('rubrica') && text.includes('rubrica')) score += 12;
  if (q.includes('manual') && isManualLike(chunk)) score += 15;
  if ((q.includes('como') || q.includes('passo')) && isManualLike(chunk)) score += 8;

  return score;
}

function isProgramacaoLike(item) {
  const text = normalizeText(
    [item?.titulo, item?.nome_acao, item?.sinopse, item?.local, item?.museu]
      .filter(Boolean)
      .join(' ')
  );
  return PROGRAMACAO_KEYWORDS.some((keyword) => text.includes(normalizeText(keyword)));
}

function scoreProgramacao(programacao, question) {
  const q = normalizeText(question);
  const titulo = normalizeText(programacao?.titulo || programacao?.nome_acao || '');
  const sinopse = normalizeText(programacao?.sinopse || programacao?.descricao || '');
  const museu = normalizeText(programacao?.museu || '');
  const local = normalizeText(programacao?.local || '');
  const data = normalizeText(programacao?.data || '');
  
  let score = 0;
  
  if (titulo.includes(q)) score += 35;
  if (sinopse.includes(q)) score += 20;
  if (local.includes(q)) score += 15;
  if (museu.includes(q)) score += 25;
  if (data.includes(q)) score += 25; // aumentado para priorizar match de data
  
  if ((q.includes('atividade') || q.includes('atividades')) && isProgramacaoLike(programacao)) score += 12;
  if ((q.includes('programacao') || q.includes('programação')) && isProgramacaoLike(programacao)) score += 15;
  if ((q.includes('quando') || q.includes('data') || q.includes('mes')) && (data || titulo)) score += 10;
  if ((q.includes('mis') || q.includes('mhab') || q.includes('mumo')) && museu) score += 20;
  
  // Boost para buscas por mês específico
  const meses = ['janeiro', 'fevereiro', 'marco', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  for (const mes of meses) {
    if (q.includes(mes) && data.includes(mes)) {
      score += 30; // match de mês = alta prioridade
      break;
    }
  }
  
  return score;
}

function withTimeout(promise, ms, label = 'Operação') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} demorou mais do que o esperado.`)), ms)
    ),
  ]);
}

function dedupe(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Assistente ativo. Posso buscar respostas na Biblioteca de Conhecimento, Programação, Compras, Rubricas e Equipe. Faça sua pergunta.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function buscarContexto(pergunta) {
    try {
      const [docs, programacoes, compras, rubricas, teamPayments] = await withTimeout(
        Promise.all([
          base44.entities.KnowledgeDocument.list('-created_date', 120).catch(() => []),
          base44.entities.Programacao.list('-data_inicio', 500).catch(() => []),
          base44.entities.PurchaseRequest.list('-created_date', 300).catch(() => []),
          base44.entities.Rubrica.list('ordem_exibicao', 150).catch(() => []),
          base44.entities.TeamPayment.list('-created_date', 150).catch(() => []),
        ]),
        20000,
        'Busca da base de conhecimento'
      );

      const docsAtivos = (docs || []).filter((doc) => doc?.ativo);
      const docsById = docsAtivos.reduce((acc, doc) => {
        if (doc?.id) acc[doc.id] = doc;
        return acc;
      }, {});

      // Buscar contexto em documentos
      const rankedDocs = docsAtivos
        .map((doc) => ({
          ...doc,
          _score: scoreText(
            [doc?.titulo, doc?.categoria, doc?.tags, doc?.resumo_ia, doc?.conteudo_extraido]
              .filter(Boolean)
              .join(' '),
            pergunta
          ) + (isManualLike(doc) ? 15 : 0),
        }))
        .filter((doc) => doc._score > 0)
        .sort((a, b) => b._score - a._score);

      // Buscar contexto em programações
      const rankedProgramacoes = (programacoes || [])
        .map((prog) => ({
          ...prog,
          _score: scoreProgramacao(prog, pergunta),
          _type: 'programacao',
        }))
        .filter((prog) => prog._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 4);

      // Buscar em Compras
      const q = normalizeText(pergunta);
      const hasCompraKeywords = ['compra', 'compr', 'nota fiscal', 'fornecedor', 'valor', 'pago', 'aprovado'].some(kw => q.includes(kw));
      const rankedCompras = hasCompraKeywords
        ? (compras || [])
            .map((comp) => ({
              ...comp,
              _score: scoreText(
                [comp?.descricao, comp?.fornecedor, comp?.status, String(comp?.valor_solicitado || ''), comp?.museu]
                  .filter(Boolean)
                  .join(' '),
                pergunta
              ),
              _type: 'compra',
            }))
            .filter((comp) => comp._score > 0)
            .sort((a, b) => b._score - a._score)
            .slice(0, 2)
        : [];

      // Buscar em Rubricas
      const hasRubricaKeywords = ['rubrica', 'orcamento', 'orçamento', 'saldo', 'valor', 'gasto'].some(kw => q.includes(kw));
      const rankedRubricas = hasRubricaKeywords
        ? (rubricas || [])
            .map((rub) => ({
              ...rub,
              _score: scoreText(
                [rub?.rubrica, rub?.grupo, rub?.centro_custo, rub?.museu, String(rub?.valor_rubrica || ''), String(rub?.saldo || '')]
                  .filter(Boolean)
                  .join(' '),
                pergunta
              ),
              _type: 'rubrica',
            }))
            .filter((rub) => rub._score > 0)
            .sort((a, b) => b._score - a._score)
            .slice(0, 2)
        : [];

      // Buscar em TeamPayment (Equipe)
      const hasEquipeKeywords = ['equipe', 'profissional', 'membro', 'contrato', 'pagamento', 'pago'].some(kw => q.includes(kw));
      const rankedTeamPayments = hasEquipeKeywords
        ? (teamPayments || [])
            .map((tp) => ({
              ...tp,
              _score: scoreText(
                [tp?.user_email, tp?.mes_referencia, tp?.status, String(tp?.valor_nf || ''), tp?.observacoes]
                  .filter(Boolean)
                  .join(' '),
                pergunta
              ),
              _type: 'equipe',
            }))
            .filter((tp) => tp._score > 0)
            .sort((a, b) => b._score - a._score)
            .slice(0, 2)
        : [];

      const topDocs = rankedDocs.slice(0, 2);
      const selectedItems = [
        ...topDocs,
        ...rankedProgramacoes,
        ...rankedCompras,
        ...rankedRubricas,
        ...rankedTeamPayments,
      ].slice(0, 8);

      if (selectedItems.length > 0) {
        return selectedItems
          .map((item, index) => {
            if (item._type === 'programacao') {
              return `
[Programação ${index + 1}]
Ação: ${item?.titulo || item?.nome_acao || 'Sem título'}
Data: ${item?.data || 'Data não especificada'}
Horário: ${item?.horario || 'Horário não especificado'}
Local: ${item?.local || 'Local não especificado'}
Museu: ${item?.museu || 'Não especificado'}
Sinopse: ${item?.sinopse || item?.descricao || ''}
`.trim();
            }
            if (item._type === 'compra') {
              return `
[Compra ${index + 1}]
Descrição: ${item?.descricao || 'Sem descrição'}
Fornecedor: ${item?.fornecedor || 'Não especificado'}
Valor: R$ ${(item?.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Status: ${item?.status || 'Sem status'}
Museu: ${item?.museu || 'Não especificado'}
`.trim();
            }
            if (item._type === 'rubrica') {
              return `
[Rúbrica ${index + 1}]
Nome: ${item?.rubrica || 'Sem nome'}
Grupo: ${item?.grupo || 'Não especificado'}
Museu/Centro: ${item?.centro_custo || item?.museu || 'Não especificado'}
Valor Previsto: R$ ${(item?.valor_rubrica || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Saldo: R$ ${(item?.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Percentual Utilizado: ${item?.percentual_utilizado || 0}%
`.trim();
            }
            if (item._type === 'equipe') {
              return `
[Pagamento de Equipe ${index + 1}]
Membro: ${item?.user_email || 'Não especificado'}
Mês: ${item?.mes_referencia || 'Não especificado'}
Ano: ${item?.ano || ''}
Valor NF: R$ ${(item?.valor_nf || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Status: ${item?.status || 'Sem status'}
`.trim();
            }
            return `
[Documento ${index + 1}]
Título: ${item?.titulo || 'Documento sem título'}
Categoria: ${item?.categoria || 'Sem categoria'}
${item?.tags ? `Tags: ${item.tags}` : ''}
${item?.resumo_ia ? `Resumo: ${item.resumo_ia}` : ''}
Conteúdo:
${(item?.conteudo_extraido || '').slice(0, 2000)}
`.trim();
          })
          .join('\n\n');
      }

      // Fallback: todas as entidades
      const fallbackAll = [
        ...rankedDocs.slice(0, 2),
        ...rankedProgramacoes.slice(0, 2),
        ...rankedCompras.slice(0, 1),
        ...rankedRubricas.slice(0, 1),
        ...rankedTeamPayments.slice(0, 1),
      ];

      if (fallbackAll.length === 0) return '';

      return fallbackAll
        .map((item, index) => {
          if (item._type === 'programacao') {
            return `
[Programação ${index + 1}]
Ação: ${item?.titulo || item?.nome_acao || 'Sem título'}
Data: ${item?.data || 'Data não especificada'}
Horário: ${item?.horario || 'Horário não especificado'}
Local: ${item?.local || 'Local não especificado'}
Museu: ${item?.museu || 'Não especificado'}
Sinópse: ${item?.sinopse || item?.descricao || ''}
`.trim();
          }
          if (item._type === 'compra') {
            return `
[Compra ${index + 1}]
Descrição: ${item?.descricao || 'Sem descrição'}
Fornecedor: ${item?.fornecedor || 'Não especificado'}
Valor: R$ ${(item?.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Status: ${item?.status || 'Sem status'}
Museu: ${item?.museu || 'Não especificado'}
`.trim();
          }
          if (item._type === 'rubrica') {
            return `
[Rúbrica ${index + 1}]
Nome: ${item?.rubrica || 'Sem nome'}
Grupo: ${item?.grupo || 'Não especificado'}
Museu/Centro: ${item?.centro_custo || item?.museu || 'Não especificado'}
Valor Previsto: R$ ${(item?.valor_rubrica || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Saldo: R$ ${(item?.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Percentual Utilizado: ${item?.percentual_utilizado || 0}%
`.trim();
          }
          if (item._type === 'equipe') {
            return `
[Pagamento de Equipe ${index + 1}]
Membro: ${item?.user_email || 'Não especificado'}
Mês: ${item?.mes_referencia || 'Não especificado'}
Ano: ${item?.ano || ''}
Valor NF: R$ ${(item?.valor_nf || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Status: ${item?.status || 'Sem status'}
`.trim();
          }
          return `
[Documento ${index + 1}]
Título: ${item?.titulo || 'Documento sem título'}
Categoria: ${item?.categoria || 'Sem categoria'}
${item?.tags ? `Tags: ${item.tags}` : ''}
${item?.resumo_ia ? `Resumo: ${item.resumo_ia}` : ''}
Conteúdo:
${(item?.conteudo_extraido || '').slice(0, 2000)}
`.trim();
        })
        .join('\n\n');
    } catch (error) {
      console.error('Erro ao buscar contexto:', error);
      return '';
    }
  }

  const handleSend = async (questionText = null) => {
    const textToSend = questionText || input;

    if (!textToSend.trim() || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: textToSend }]);
    setLoading(true);

    try {
      const contexto = await buscarContexto(textToSend);

      const recentHistory = messages
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
        .join('\n');

      const prompt = `
Você é o assistente da plataforma Museus Centro.

REGRAS:
- Consulte sempre a Biblioteca de Conhecimento, Programação, Compras, Rubricas e Equipe.
- Para perguntas sobre funcionamento do sistema, priorize o Manual e documentos de ajuda.
- Leia os documentos do contexto antes de responder.
- Use SOMENTE a base abaixo.
- Nunca invente.
- Não use internet.
- Se não houver base suficiente, responda exatamente: "Não encontrei essa informação na base de conhecimento."
- Quando a pergunta for operacional, responda com:
  1. tela/caminho
  2. botão principal
  3. passo a passo
  4. atenção
- Seja direto, claro e útil.
- Responda em português do Brasil.

REGRAS DO SISTEMA:
- Equipe é gerida e paga pelos coordenadores.
- Profissional apenas envia nota fiscal.
- Pagamento de equipe acontece via módulo Equipe.
- Compras são usadas para fornecedores, materiais e serviços.
- Nunca misturar os fluxos de Compras e Equipe.
- Toda nota fiscal da equipe precisa ser aprovada antes do pagamento.
- Rubrica só é debitada quando aprovado.

HISTÓRICO RECENTE:
${recentHistory || 'Sem histórico anterior.'}

BASE DE CONHECIMENTO:
${contexto || 'Não encontrei essa informação na base de conhecimento.'}

PERGUNTA:
${textToSend}
`.trim();

      const response = await withTimeout(
        base44.integrations.Core.InvokeLLM({
          prompt,
          add_context_from_internet: false,
        }),
        30000,
        'Resposta da IA'
      );

      const finalResponse =
        typeof response === 'string'
          ? response
          : String(response || 'Não encontrei essa informação na base de conhecimento.');

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            finalResponse.trim() ||
            'Não encontrei essa informação na base de conhecimento.',
        },
      ]);
    } catch (error) {
      console.error('Erro ao responder no chat:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error?.message?.includes('demorou mais do que o esperado')
            ? 'A resposta demorou mais do que o esperado. Tente novamente com uma pergunta mais específica.'
            : 'Erro ao responder. Tente novamente.',
        },
      ]);
    } finally {
      setLoading(false);
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
    <div
      className={`fixed bottom-6 right-6 ${minimized ? 'h-16' : 'h-96'} w-80 md:w-96 bg-white border rounded-xl flex flex-col shadow-xl z-50`}
    >
      <div className="flex justify-between items-center p-2 border-b bg-gray-50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Assistente</span>
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <BookOpen className="w-3 h-3" />
            <span>Biblioteca</span>
            <FileText className="w-3 h-3 ml-1" />
            <span>+5 fontes</span>
          </div>
        </div>

        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMinimized(!minimized)}>
            {minimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div
                  className={`inline-block p-2 rounded max-w-[88%] text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="text-sm text-gray-500 bg-gray-100 rounded inline-block p-2">
                Buscando em programação, compras, rubricas, equipe e biblioteca...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="flex p-2 gap-2 border-t">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={loading}
              placeholder="Pergunte sobre programação, compras, rubricas, equipe, etc"
            />
            <Button onClick={() => handleSend()} disabled={loading || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}