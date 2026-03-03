import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { BookOpen, Send, Loader2, X, ChevronDown, ChevronUp, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// Contexto do Plano de Trabalho (sem valores financeiros para uso geral)
const PLANO_CONTEXTO = `
PROJETO MUSEUS CENTRO — 6º PLANO DE TRABALHO (3º TERMO ADITIVO)
Chamamento Público FMC nº 001/2024 | OSC Parceira: Viaduto das Artes | Janeiro/2026
Vigência: até 29 de novembro de 2026 | Prazo total: 28 meses

ATENÇÃO: Este é o 3º Termo Aditivo (documento atual e vigente).

OS MUSEUS:
- MUMO (Museu da Moda de BH): R. da Bahia, 1149 - Centro. Primeiro museu público de moda do Brasil. Edifício "Castelinho da Bahia" (arquitetura neogótica, tombado IEPHA-MG e CDPCM-BH).
- MIS (Museu da Imagem e do Som BH): Av. Álvares Cabral, 560 - Lourdes. Missão: salvaguardar acervos audiovisuais. Realiza exposições, oficinas, cineclube, Cine Empena.
- MHAB (Museu Histórico Abílio Barreto): Av. Prudente de Morais, 202 - Cidade Jardim. Fundado em 1941. Casarão da Fazenda do Leitão (tombado IPHAN desde 1951). Museu da cidade de BH.

COMISSÃO DE PROGRAMAÇÃO:
- Coordenação Geral: coordena todas as etapas, relatórios, interlocução com museus e FMC
- Coordenação de Programação: elabora programações focadas nas vocações de cada museu
- Coordenação de Comunicação: plano de comunicação, redes sociais, imprensa
- Coordenação de Produção: logística, parcerias, acompanhamento de montagens

QUADRO DE METAS (3º ADITIVO — DOCUMENTO ATUAL E VIGENTE):

META 01 (Mês 1–28) — Contratação da equipe principal, incluindo coordenadores da Comissão de Programação
Seleção conjunta FMC e OSC por currículo e entrevistas. 4 coordenações: Geral, Produção, Programação, Comunicação.
Documentos: E-mail de ciência e aprovação da FMC.

META 02 (Mês 1–28) — Elaborar e executar plano de comunicação de abrangência nacional (ASCOM/SUCOM)
Comunicar à sociedade as ações da parceria. Relatórios trimestrais com links, fotos, vídeos e peças gráficas.
Documentos: Plano aprovado, identidade visual, peças gráficas, releases.

META 03 (Mês 2–28) — Manutenção de rotina nas 4 exposições dos três museus (MUMO, MIS e MHAB)
Reuniões periódicas para mapear necessidades de manutenção preventiva ou corretiva.
Documentos: Manutenções realizadas.

META 04 (Mês 6–15) — Alteração de dois núcleos (salas) das exposições do MUMO e MIS
Retirar acervos e incluir novos na exposição "Clara Nunes - eu sou a tal mineira" (MUMO) e "Cinema: coleções e outras sensações" (MIS).
Documentos: Núcleos prontos.

META 05 (Mês 2–18) — Realizar no mínimo 60 ações educativas
Oficinas, palestras, mesas redondas, seminários, exibição de filmes. Formato híbrido possível.
Documentos: Peças gráficas, registros foto/vídeo, clippings, atividades realizadas.

META 06 (Mês 2–18) — Realizar no mínimo 36 ações culturais
Apresentações teatrais, shows, palestras, contação de histórias nos três museus. Formato híbrido possível.
Documentos: Peças gráficas, registros foto/vídeo, clippings, atividades realizadas.

META 07 (Mês 1–28) — Contratar educador para MIS-BH, MUMO e MHAB
3 educadores (1 por museu), 40h semanais, terça a sábado incluindo feriados. Atribuições: mediação, visitas, oficinas, agenda educativa, Circuito de Museus (SME/PBH).
Documentos: Efetivar contratação.

META 08 (Mês 1–18, abertura a partir do mês 11) — Exposição e evento de abertura no Casarão secular do MHAB
Espaço: 280m². Desmobilização da exposição atual, montagem, divulgação. Projeto curatorial fornecido pela Diretoria de Museus/MHAB.
Documentos: Fotos/vídeos, peças gráficas da exposição montada e do evento de abertura.

META 09 (Mês 11–18) — Exposição e evento de abertura no Museu da Imagem e do Som (MIS)
Espaço: 96,77m². Abertura prevista dezembro 2025. Curadoria conjunta (equipe museu + curador contratado).
Documentos: Fotos/vídeos, peças gráficas da exposição montada e do evento de abertura.

META 10 (Mês 3–28) — Realizar 18 mostras de baixa e/ou média complexidade nos museus
Mostras em áreas não convencionais (foyer, jardins, mezanino, hall). Temas definidos com coordenação dos museus.
Documentos: Peças gráficas das mostras realizadas.

META 11 (Mês 3–28) — Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus
Projeto regulamentado pelo Decreto 15.622/2014. OSC responsável por: grade de programação, comunicação, vans, monitores, fotografia, iluminação monumental dos 6 museus da PBH (MUMO, MIS, MHAB, MCK, MAP, Casa do Baile), segurança e limpeza.
Documentos: Peças gráficas aprovadas, vídeo relatório.

META 12 (Mês 6–18) — Contratação dos serviços de pesquisa, identidade visual, projeto curatorial e expográfico para a exposição da galeria da sede do MHAB
A montagem ocorrerá em período posterior à vigência do MROSC. Entregar projeto curatorial, identidade visual e expográfico.
Documentos: Projetos entregues e aprovados.

META 13 (Mês 6–18) — Contratação dos serviços de pesquisa, identidade visual, projeto curatorial e expográfico para a exposição do MUMO
Idem META 12, para o Museu da Moda.
Documentos: Projetos entregues e aprovados.

META 14 (Mês 1–18) — Inscrição do projeto em Leis de Incentivo e outros editais
Busca ativa de recursos: Lei Federal de Incentivo à Cultura, editais diversos, apresentação a empresas.
Documentos: Projetos inscritos, aprovados e executados.

META 15 (Mês 2–18) — Entregar dispositivos acessíveis
Mínimo: 1 maquete tátil e 5 vídeos em Libras. Produzidos em diálogo com pessoas com deficiência.
Documentos: Entrega dos dispositivos acessíveis.

META 16 (Mês 2–28) — Contratação de 101 diárias de educador para mediação ao público espontâneo
Educadores para acolhimento e visitas mediadas, maior foco fins de semana. Calendário definido semestralmente. 3 treinamentos prévios pela equipe educativa do MHAB, MUMO e MIS.
Documentos: Educadores contratados.

META 17 (Mês 2–28) — Produção de 4 publicações (catálogos)
2 catálogos para MHAB, 1 para MIS-BH, 1 para MUMO. 300 exemplares cada. Inclui: projeto gráfico, pesquisa, textos, revisão, fotos, impressão.
Especificações: miolo papel couché 125gr 4x4 cores 60-80p 20x24,5; capa couché 210gr 4x0 cores 40x24,5 (aberto).
Documentos: Publicações impressas.

META 18 (Mês 1–28) — Custeios para atividades educativas contínuas
Insumos, lanches, materiais, confecção de conteúdos educativos e consultorias para os três museus.
Documentos: Compras realizadas mensalmente.

META 19 (Mês 6–15) — Realizar a atividade "Presente de Iemanjá"
Festejo de cultura de matriz africana na orla da Lagoa da Pampulha. Inclui: produção, 4 ações culturais, infraestrutura, divulgação.
Documentos: Relatório sobre o projeto.

META 20 (Mês 19–28) — Realizar 30 ações educativas e/ou culturais adicionais
Ao longo dos 10 meses finais, distribuídas entre os três museus. Formato híbrido possível.
Documentos: Peças gráficas, registros foto/vídeo, clippings, atividades realizadas.

META 21 (Mês 19–28) — Exposição e evento de abertura no Museu da Moda (MUMO)
Baseada na Meta 13. Curadoria conjunta (equipe museu + curador contratado).
Documentos: Fotos/vídeos, peças gráficas, exposição realizada.

META 22 (Mês 19–28) — Contratar serviços de consultoria para execução do projeto
2 consultorias de temas transversais + 1 formação em ambiente seguro e acessibilidade.
Documentos: Escopo da ação, parecer da consultoria, registro fotográfico.

PÚBLICO-ALVO: Crianças, PCDs, neurodivergentes, jovens, adultos, idosos, professores, artistas, pesquisadores, profissionais do turismo, arte-educadores, agentes culturais e público em geral. Aproximadamente 100 mil pessoas.

ATIVIDADES EDUCATIVAS E CULTURAIS:
- Entende-se como educativas: palestras, mesas redondas, rodas de conversa, oficinas, seminários, exibição de filmes.
- Entende-se como culturais: apresentações teatrais, shows, contação de histórias.
- Incluem produções selecionadas em editais como "Descentra" e "Lei Municipal de Incentivo à Cultura".
- Todas as ações são GRATUITAS ao público, indicação livre, sem cunho doutrinário religioso ou discriminatório.

NOTURNO NOS MUSEUS:
Projeto da Diretoria de Museus (Decreto 15.622/2014). Fomenta visitas noturnas com ampliação de horário. Em 2022: 30 instituições, 63 atividades, 6.520 pessoas. Em 2023: 32 espaços, mais de 8 mil pessoas, 80 atividades. Transporte gratuito por vans.

MONITORAMENTO E AVALIAÇÃO:
- Relatórios semestrais pelo Gestor da Parceria
- Reuniões semanais de alinhamento
- Relatórios trimestrais de comunicação enviados pela OSC
- Comissão de Monitoramento avalia relatórios semestrais e acompanha execução
`;

const CONTEXTO_COORDENADOR = `
INFORMAÇÕES FINANCEIRAS (APENAS PARA COORDENADORES):
- Valor total do Termo de Colaboração: R$ 3.891.800,00
- Repasse original: R$ 2.307.200,00
- 1º Aditivo: R$ 82.800,00
- Saldo aplicação financeira: R$ 131.800,00
- Emenda Impositiva: R$ 50.000,00
- 3º Termo Aditivo (atual): R$ 1.320.000,00

Natureza das despesas:
- 339030 Material de consumo: R$ 93.013,21
- 339035 Serviços de Consultoria: R$ 37.500,00
- 339037 Locação de Mão de Obra: R$ 7.800,00
- 339039 Outros serviços de terceiros PJ: R$ 3.621.686,79 + R$ 131.800,00 (Aplicação Financeira)

Principais itens de remuneração da equipe:
- Coordenador Geral: R$ 6.000/mês (meses 1-18), R$ 7.000/mês (meses 19-28)
- Coordenador de Produção: R$ 5.500/mês (18 meses)
- Coordenador de Programação: R$ 4.500/mês (17 meses)
- Coordenador de Comunicação: R$ 5.000/mês (17 meses), R$ 6.000/mês (10 meses)
- Analista Administrativo Financeiro: R$ 4.900/mês (18 meses), R$ 5.000/mês (10 meses)
- Educadores (3): R$ 4.000/mês (17 meses), R$ 4.600/mês (10 meses)
- Assessoria de Imprensa: R$ 3.000/mês (24 meses)
- Designer: R$ 5.000/mês (17 meses), R$ 5.200/mês (10 meses)
- Assistente Administrativo: R$ 3.000/mês (13 meses), R$ 4.000/mês (10 meses)
- Mobilizador: R$ 3.000/mês (16 meses)
- Fotógrafo: R$ 500/serviço, 6 registros/mês (26 meses)
- Rede Social/Marketing Cultural: R$ 2.000/mês (16 meses), R$ 2.500/mês (10 meses)

Principais itens por meta:
- Exposição MHAB Casarão: R$ 230.000,00 (repasse) + R$ 30.000,00 (saldo aplicação)
- Exposição MIS: R$ 140.000,00 + R$ 17.800,00 + R$ 55.000,00
- Exposição MUMO (Meta 21): R$ 210.000,00 (3º Aditivo)
- 60 Ações Educativas: R$ 1.300,00 por evento
- 36 Ações Culturais: R$ 2.500,00 por evento
- 101 Diárias educador: R$ 300,00/diária
- Maquete tátil: R$ 10.000,00
- 5 Vídeos Libras: aprox. R$ 1.049,80/vídeo
- Noturno nos Museus Ed. 2026 - Vans: R$ 950,00/van × 32 = R$ 30.400,00
`;

export default function PlanoTrabalhoChat({ isCoordenador }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Olá! Sou o assistente do **Plano de Trabalho do Projeto Museus Centro** (3º Termo Aditivo — documento atual e vigente).\n\nPosso responder perguntas sobre as **22 metas**, museus, atividades, prazos, equipe e metodologia do projeto. Como posso ajudar?`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    const contextoCompleto = isCoordenador
      ? PLANO_CONTEXTO + '\n\n' + CONTEXTO_COORDENADOR
      : PLANO_CONTEXTO;

    const instrucoes = isCoordenador
      ? 'Você pode compartilhar todas as informações, incluindo valores financeiros.'
      : 'IMPORTANTE: NÃO mencione nenhum valor financeiro (R$, reais, orçamento, custo, verba, rubrica, repasse). Apenas informações sobre metas, prazos, atividades, museus e equipe.';

    const prompt = `Você é um assistente especializado no Plano de Trabalho do Projeto Museus Centro (3º Termo Aditivo — DOCUMENTO ATUAL E VIGENTE, janeiro/2026).
Sempre reforce que as informações se referem ao 3º Termo Aditivo, que é o plano vigente.
Responda em português, de forma clara, objetiva e bem estruturada. Use markdown quando útil.
${instrucoes}

CONTEXTO DO PLANO DE TRABALHO:
${contextoCompleto}

PERGUNTA DO USUÁRIO: ${question}`;

    const reply = await base44.integrations.Core.InvokeLLM({ prompt });
    setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Toggle button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-black text-white px-4 py-3 rounded-full shadow-lg hover:bg-gray-800 transition-all"
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-sm font-medium">Consultar Plano de Trabalho</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="w-[380px] max-w-[95vw] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col" style={{ height: '520px' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-black rounded-t-2xl">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Plano de Trabalho</p>
                <p className="text-xs text-gray-300">3º Termo Aditivo (vigente)</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-black text-white'
                    : 'bg-gray-50 border border-gray-100 text-gray-800'
                }`}>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                      components={{
                        p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                        ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="my-0.5">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3 h-3 text-gray-600" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-100">
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Pergunte sobre metas, prazos, museus..."
                className="text-sm resize-none min-h-[36px] max-h-[100px]"
                rows={1}
              />
              <Button
                size="icon"
                className="bg-black hover:bg-gray-800 h-9 w-9 flex-shrink-0"
                onClick={handleSend}
                disabled={loading || !input.trim()}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              Baseado no 3º Termo Aditivo • Plano de Trabalho Vigente
            </p>
          </div>
        </div>
      )}
    </div>
  );
}