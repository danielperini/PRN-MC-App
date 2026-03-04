import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpCircle, Send, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

const MANUAL_PT_BR = `
# 📚 MANUAL DO ASSISTENTE - Plano de Trabalho e Relatório

## 1. O QUE É ESTE ASSISTENTE?
O Assistente Plano de Trabalho e Relatório é seu colega digital que ajuda com:
- ✅ Dúvidas sobre preenchimento de relatórios mensais
- ✅ Como usar a plataforma Museus Centro
- ✅ Informações sobre as metas do projeto
- ✅ Respostas sobre ações educativas, culturais e acessibilidade

## 2. COMO USAR?
**Passo 1:** Digite sua dúvida no campo de mensagem
**Passo 2:** Pressione ENTER ou clique em ENVIAR
**Passo 3:** Aguarde a resposta do assistente
**Passo 4:** Continue a conversa conforme necessário

## 3. EXEMPLOS DE PERGUNTAS

### Sobre Relatórios:
- "Como classifico uma atividade como META?"
- "Qual a diferença entre ROTINA e EXTRA?"
- "Como adiciono equipe envolvida?"
- "Como envio um relatório?"

### Sobre a Plataforma:
- "Como crio um novo relatório?"
- "Como vejo meus relatórios anteriores?"
- "Posso editar um relatório já enviado?"

### Sobre o Projeto:
- "Qual a vigência do projeto?"
- "Quais museus participam?"
- "Quantas ações educativas são previstas?"
- "O que é a META 5?"

### Sobre Acessibilidade:
- "Quais dispositivos acessíveis serão entregues?"
- "Tem tradução em Libras?"

## 4. TÓPICOS PRINCIPAIS DO PROJETO

### Museus Envolvidos:
- **MUMO** (Museu da Moda): moda, pesquisa, economia criativa
- **MIS** (Museu da Imagem e do Som): audiovisual, preservação
- **MHAB** (Museu Histórico Abílio Barreto): história, memória urbana

### Vigência:
- Terceiro Termo Aditivo (3º TA)
- Válido até: **29 de novembro de 2026**
- Chamamento Público: FMC nº 001/2024

### Características das Ações:
✨ **Todas as ações são GRATUITAS**
✨ **Classificação indicativa: LIVRE**
✨ **Foco em ACESSIBILIDADE e INCLUSÃO**
✨ Nenhuma ação é discriminatória

## 5. CLASSIFICAÇÃO DE ATIVIDADES

### META
Atividades vinculadas ao Plano de Trabalho do 3º Aditivo
- Exemplo: 60 ações educativas previstas
- Requer código da meta (ex: META_01)

### ROTINA
Atividades regulares dos museus (operacionais)
- Exemplo: manutenção de exposições
- Não vinculadas a metas específicas

### EXTRA
Atividades não previstas ou adicionais
- Exemplo: parcerias surpresa, eventos especiais
- Deve ter justificativa técnica

## 6. O QUE INCLUIR NUM RELATÓRIO?

✅ **OBRIGATÓRIO:**
- Classificação da atividade (META/ROTINA/EXTRA)
- Título da atividade
- Descrição do que foi executado
- Data(s) da realização

✅ **ALTAMENTE RECOMENDADO:**
- Equipe envolvida (emails dos participantes)
- Público estimado/total
- Produtos entregues
- Resultados e impactos
- Depoimentos de participantes

✅ **IMPORTANTE (quando aplicável):**
- Se é META: código e status da meta
- Documentação: fotos, vídeos, peças gráficas
- Links e evidências de divulgação

## 7. PRODUTOS ENTREGUES - EXEMPLOS

Selecione os que sua atividade gerou:
- Cobertura Fotográfica
- Cobertura de Vídeo
- Texto (artigos, releases)
- Identidade Visual
- Logomarca
- Posts (redes sociais)
- Catálogo
- Cartaz
- Expografia
- Tradu ção (Libras, etc)
- Relatório
- Apresentação de Contas
- Planejamento

## 8. QUANDO USAR CADA MUSEU?

Selecione o museu conforme onde a atividade foi realizada:
- **MHAB**: Atividades no Museu Histórico Abílio Barreto ou Casarão
- **MIS**: Atividades no Museu da Imagem e do Som
- **MUMO**: Atividades no Museu da Moda
- **Atuação Geral**: Atividades coordenativas ou que abrangem todos

## 9. COMO ADICIONAR EQUIPE ENVOLVIDA?

1. No campo "Equipe envolvida", clique para abrir o seletor
2. Busque pelo nome ou email do colega
3. Clique no nome para adicionar
4. Repita para todos os envolvidos
5. Os emails aparecerão como badges

**POR QUE?** Assim cada membro vê a atividade em seu próprio relatório também.

## 10. DÚVIDAS FREQUENTES

**P: Posso salvar um relatório sem submeter?**
R: Sim! Use "Salvar como Rascunho". Você pode editar depois.

**P: Depois de submeter, posso editar?**
R: Se devolvido pelo coordenador, sim. Se aprovado, não.

**P: Como adiciono fotos?**
R: Use o botão "Anexar" em cada atividade. Suportados: JPG, PNG, PDF.

**P: Qual é o tamanho máximo de arquivo?**
R: 5MB por arquivo.

**P: Múltiplas pessoas trabalham na mesma atividade. Como registro?**
R: No campo "Equipe envolvida", adicione todos os emails. Cada um verá no seu relatório.

**P: E se a atividade se repetiram (ex: 4 oficinas)?**
R: Preencha "Quantas vezes se repetiu?" e o público total será calculado automaticamente.

**P: Como sei se meu relatório foi aprovado?**
R: Você recebe notificação por email e pode ver o status na plataforma.

## 11. CONTATOS E SUPORTE

Se o assistente não conseguir responder:
- 📧 Fale com o **Coordenador** responsável
- 📞 Consulte a documentação do **Plano de Trabalho do 3º Aditivo**
- 💬 Retorne aqui com mais detalhes de sua dúvida

## 12. INFORMAÇÕES IMPORTANTES

❌ **NUNCA mencionamos:**
- Valores financeiros
- Salários ou contratações específicas

✅ **SEMPRE reforçamos:**
- Gratuidade das ações
- Acessibilidade e inclusão
- Documentação de atividades
- Trabalho colaborativo

---

**Última atualização:** 2026
**Versão:** 1.0
**Projeto:** Museus Centro - FMC nº 001/2024
`;

function AssistenteInner() {
  const [conversation, setConversation] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showManual, setShowManual] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setConversation(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    const systemPrompt = `${MANUAL_PT_BR}

Use este manual como contexto base para responder perguntas sobre a plataforma Museus Centro.
Sempre seja prestativo, didático e use exemplos práticos quando possível.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\nPergunta do usuário: ${userMessage}`,
      add_context_from_internet: false
    });

    setConversation(prev => [...prev, { role: 'assistant', content: result }]);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10 h-screen flex flex-col">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="w-6 h-6 text-black" />
            <h1 className="text-3xl font-semibold text-black">Assistente Plano de Trabalho e Relatório</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Sua assistente para dúvidas sobre preenchimento de relatórios e uso da plataforma Museus Centro
          </p>
        </div>

        {/* Manual Toggle */}
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManual(!showManual)}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {showManual ? 'Ocultar' : 'Mostrar'} Manual de Instruções
          </Button>
        </div>

        {/* Main Content Area */}
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Manual Section */}
          {showManual && (
            <div className="hidden lg:block w-72 bg-white border border-black rounded-2xl p-4 overflow-auto">
              <div className="prose prose-sm max-w-none text-xs">
                {MANUAL_PT_BR.split('\n').map((line, i) => {
                  if (line.startsWith('# ')) {
                    return <h1 key={i} className="text-lg font-bold mt-4 mb-2 text-black">{line.replace('# ', '')}</h1>;
                  }
                  if (line.startsWith('## ')) {
                    return <h2 key={i} className="text-base font-semibold mt-3 mb-1 text-black">{line.replace('## ', '')}</h2>;
                  }
                  if (line.startsWith('### ')) {
                    return <h3 key={i} className="text-sm font-semibold mt-2 mb-1 text-black">{line.replace('### ', '')}</h3>;
                  }
                  if (line.startsWith('- ')) {
                    return <li key={i} className="ml-4 text-gray-700">{line.replace('- ', '')}</li>;
                  }
                  if (line.startsWith('✅ ') || line.startsWith('❌ ')) {
                    return <p key={i} className="text-gray-700 font-medium">{line}</p>;
                  }
                  if (line.trim()) {
                    return <p key={i} className="text-gray-700 mb-1">{line}</p>;
                  }
                  return <br key={i} />;
                })}
              </div>
            </div>
          )}

          {/* Chat Section */}
          <div className="flex-1 flex flex-col border border-black rounded-2xl bg-white">
            {/* Messages */}
            <ScrollArea className="flex-1 p-6 space-y-4">
              {conversation.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <HelpCircle className="w-12 h-12 text-gray-300 mb-4" />
                  <p className="text-gray-500 font-medium">Comece a conversa!</p>
                  <p className="text-sm text-gray-400 mt-1">Faça uma pergunta sobre relatórios, uso da plataforma ou metas do projeto</p>
                </div>
              )}
              {conversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-xl rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-black text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </ScrollArea>

            {/* Input */}
            <div className="border-t border-gray-200 p-4 bg-white rounded-b-2xl">
              <div className="flex gap-2">
                <Input
                  placeholder="Faça uma pergunta..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  disabled={loading}
                  className="flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="bg-black hover:bg-gray-800 text-white gap-2"
                >
                  <Send className="w-4 h-4" />
                  Enviar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssistentePlanejamento() {
  return <RequireAuth><AssistenteInner /></RequireAuth>;
}