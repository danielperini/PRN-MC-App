import React, { useMemo, useState } from 'react';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BookOpen,
  Search,
  HelpCircle,
  FileText,
  Workflow,
  Users,
  ShoppingCart,
  ShieldCheck,
  Bot,
  Download,
  ChevronRight,
  Bell,
  FolderOpen,
  Calculator,
  Megaphone,
} from 'lucide-react';

const PDF_MANUAL_URL = '/manual_completo_museus_centro_final.pdf';

const APRESENTACAO = `
A plataforma Museus Centro foi desenvolvida para organizar os fluxos gerais do projeto,
valorizar as entregas de todas as pessoas envolvidas e dar mais clareza à operação cotidiana.
Ela integra equipe, compras, aprovações, pagamentos, rubricas, documentos, biblioteca de conhecimento
e assistente com IA em um único ambiente de trabalho.

O objetivo do sistema é facilitar o acompanhamento das ações, melhorar a rastreabilidade documental,
reduzir erros operacionais e apoiar a coordenação, a comunicação, o financeiro e a equipe técnica
na execução do projeto.
`.trim();

const DESTAQUES = [
  {
    icon: Workflow,
    title: 'Fluxos organizados',
    text: 'Cada processo possui caminho próprio, com separação clara entre compras, equipe, documentos, aprovações e pagamentos.',
  },
  {
    icon: Users,
    title: 'Valorização das entregas',
    text: 'A plataforma foi pensada para registrar, acompanhar e dar visibilidade às entregas produzidas por todas as pessoas do projeto.',
  },
  {
    icon: ShieldCheck,
    title: 'Mais controle e segurança',
    text: 'O uso correto do sistema fortalece a prestação de contas, a consistência documental e o controle financeiro.',
  },
  {
    icon: Bot,
    title: 'Ajuda com IA',
    text: 'O assistente consulta a base de conhecimento e apoia usuários com respostas operacionais e orientações práticas.',
  },
];

const SECOES = [
  {
    id: 'visao-geral',
    icon: BookOpen,
    title: 'Visão geral da plataforma',
    description: 'Entenda para que o sistema foi criado e qual lógica organiza o projeto.',
    content: [
      'O sistema Museus Centro concentra a operação administrativa, documental, financeira e de apoio à execução do projeto.',
      'Ele foi desenhado para organizar tarefas, reduzir retrabalho, dar rastreabilidade aos processos e apoiar a prestação de contas.',
      'Os módulos do sistema se complementam: Compras, Equipe, Aprovações, Rubricas, Documentos, Biblioteca de Conhecimento, Assistente e Configuração.',
      'A lógica principal é simples: cada fluxo precisa acontecer no lugar certo, com os documentos certos e com a aprovação correta.',
    ],
  },
  {
    id: 'regras-principais',
    icon: ShieldCheck,
    title: 'Regras principais do sistema',
    description: 'As regras abaixo devem orientar todo uso da plataforma.',
    content: [
      'A equipe é gerida e paga pelos coordenadores.',
      'O profissional apenas envia nota fiscal e acompanha o próprio fluxo.',
      'O pagamento de equipe acontece pelo módulo Equipe.',
      'Compras são usadas para fornecedores, materiais e serviços.',
      'Nunca misturar os fluxos de Compras e Equipe.',
      'Toda nota fiscal da equipe precisa ser aprovada antes do pagamento.',
      'A rubrica só deve ser debitada quando a despesa for aprovada.',
    ],
  },
  {
    id: 'compras',
    icon: ShoppingCart,
    title: 'Tela Compras',
    description: 'Use esta área para fornecedores, produtos, materiais e serviços.',
    content: [
      'Entre em Compras para registrar novas despesas do projeto.',
      'Os botões mais comuns são: Nova Compra, Editar, Enviar, Aprovar, Pagar e Excluir.',
      'O fluxo esperado é: Rascunho → Solicitado → Aprovado → Pago.',
      'Toda compra precisa de descrição clara, valor correto e rubrica coerente.',
      'Nunca use Compras para fazer pagamento mensal de equipe.',
    ],
  },
  {
    id: 'equipe',
    icon: Users,
    title: 'Tela Equipe',
    description: 'Use esta área para contratos, parcelas, documentos e pagamentos da equipe.',
    content: [
      'Os coordenadores podem criar, editar e acompanhar membros da equipe.',
      'Cada membro pode ter contrato, número de parcelas, valor por parcela, parcelas pagas, saldo e documentos.',
      'Os botões mais comuns são: Adicionar Membro, Editar, Ver, Documentos e Enviar Nota Fiscal.',
      'A visão do profissional deve mostrar seus dados, saldo, parcelas e histórico de envio.',
      'A equipe não deve editar estrutura contratual nem realizar pagamentos.',
    ],
  },
  {
    id: 'nf-equipe',
    icon: FileText,
    title: 'Fluxo de nota fiscal da equipe',
    description: 'Este fluxo acontece dentro do módulo Equipe.',
    content: [
      'O profissional deve enviar a nota fiscal pelo fluxo de Equipe, não por Compras.',
      'O envio precisa estar associado ao mês e à parcela correta.',
      'Depois do envio, a coordenação revisa os documentos e aprova ou devolve.',
      'Sem aprovação, não há pagamento.',
      'Sempre que possível, manter PDF da nota fiscal e XML associados ao envio.',
    ],
  },
  {
    id: 'aprovacoes',
    icon: Bell,
    title: 'Tela Aprovações',
    description: 'Centraliza o que precisa de validação da coordenação.',
    content: [
      'Use esta área para revisar solicitações de compra e, conforme o fluxo, envios da equipe.',
      'Antes de aprovar, valide valor, documentos, competência, rubrica e coerência do processo.',
      'Devolva quando houver inconsistência, ausência documental ou informação incompleta.',
      'Aprovação incorreta pode gerar erro financeiro, documental e de prestação de contas.',
    ],
  },
  {
    id: 'rubricas',
    icon: Calculator,
    title: 'Tela Rubricas',
    description: 'Controle previsto, utilizado e saldo das rubricas.',
    content: [
      'A rubrica representa o orçamento do projeto e ajuda a acompanhar onde cada gasto está sendo lançado.',
      'A tela deve permitir visualizar previsto, utilizado e saldo.',
      'Compra ou despesa aprovada não pode ficar sem rubrica válida.',
      'O débito da rubrica deve ocorrer quando a despesa é aprovada.',
    ],
  },
  {
    id: 'documentos',
    icon: FolderOpen,
    title: 'Tela Documentos',
    description: 'Organize contratos, notas fiscais, XML e arquivos de apoio.',
    content: [
      'Use esta área para upload, consulta e organização documental.',
      'Documentos importantes: contrato, nota fiscal, XML, anexos de compra e relatórios.',
      'A qualidade documental do sistema afeta aprovação, pagamento e prestação de contas.',
      'Sempre nomear bem os arquivos e manter vínculo com o fluxo correto.',
    ],
  },
  {
    id: 'biblioteca',
    icon: BookOpen,
    title: 'Biblioteca de Conhecimento',
    description: 'Base de consulta da IA e repositório de manuais e documentos.',
    content: [
      'Use Adicionar Documento para subir PDFs, planilhas e materiais de apoio.',
      'Salvar Documento confirma a inclusão do arquivo na base.',
      'Os documentos ativos podem ser usados pelo assistente para responder dúvidas.',
      'Subir manuais, regras operacionais, contratos e documentos de referência melhora a IA.',
    ],
  },
  {
    id: 'assistente',
    icon: Bot,
    title: 'Assistente e Ajuda',
    description: 'Área para tirar dúvidas e consultar a base da plataforma.',
    content: [
      'Digite perguntas objetivas para receber orientação baseada na Biblioteca de Conhecimento.',
      'O assistente deve priorizar documentos ativos e regras operacionais.',
      'Se a resposta não estiver suficiente, revise a base de conhecimento ou consulte o manual.',
      'O assistente serve como apoio operacional, não substitui decisão de coordenação.',
    ],
  },
  {
    id: 'comunicacao',
    icon: Megaphone,
    title: 'Fluxos para coordenação de comunicação',
    description: 'Referência rápida para uso da plataforma pela comunicação.',
    content: [
      'A comunicação acompanha entregas, organiza conteúdos, apoia registros e sistematiza materiais.',
      'É importante manter relatórios, documentos, peças e registros bem organizados.',
      'Sempre que necessário, registrar evidências, materiais de divulgação e conteúdos relevantes do projeto.',
      'A comunicação também se beneficia do uso da Biblioteca de Conhecimento para padronizar respostas e orientações.',
    ],
  },
  {
    id: 'financeiro',
    icon: Calculator,
    title: 'Fluxos para coordenação financeira e administrativa',
    description: 'Referência rápida para controle financeiro e consistência operacional.',
    content: [
      'Acompanhar compras, aprovações, rubricas, pagamentos e documentos.',
      'Validar se cada despesa foi lançada no fluxo correto.',
      'Conferir se documentos obrigatórios foram anexados antes de pagar.',
      'Evitar qualquer pagamento sem nota fiscal ou sem vínculo claro com a rubrica.',
    ],
  },
];

const PASSOS_RAPIDOS = [
  {
    title: 'Criar uma nova compra',
    steps: [
      'Entre em Compras.',
      'Clique em Nova Compra.',
      'Preencha descrição, fornecedor, valor e rubrica.',
      'Clique em Salvar ou Enviar.',
    ],
  },
  {
    title: 'Enviar compra para aprovação',
    steps: [
      'Abra a compra criada.',
      'Revise os dados.',
      'Clique em Enviar.',
    ],
  },
  {
    title: 'Adicionar um membro da equipe',
    steps: [
      'Entre em Equipe.',
      'Clique em Adicionar Membro.',
      'Preencha nome, cargo e dados básicos.',
      'Clique em Salvar.',
    ],
  },
  {
    title: 'Enviar nota fiscal da equipe',
    steps: [
      'Entre em Equipe.',
      'Abra o membro ou sua área de envio.',
      'Clique em Enviar Nota Fiscal.',
      'Anexe os arquivos e envie.',
    ],
  },
  {
    title: 'Consultar um documento do sistema',
    steps: [
      'Entre em Documentos ou Biblioteca.',
      'Localize o arquivo.',
      'Clique em Visualizar.',
    ],
  },
  {
    title: 'Adicionar documento para a IA',
    steps: [
      'Entre em Biblioteca de Conhecimento.',
      'Clique em Adicionar Documento.',
      'Preencha título, categoria e tags.',
      'Selecione o arquivo e clique em Salvar Documento.',
    ],
  },
];

const FAQS = [
  {
    question: 'Posso pagar equipe pela tela Compras?',
    answer: 'Não. Compras são usadas para fornecedores, materiais e serviços. O pagamento mensal da equipe deve ocorrer pelo fluxo de Equipe.',
  },
  {
    question: 'Quem pode editar a equipe?',
    answer: 'A equipe é gerida pelos coordenadores. Eles podem criar, editar, aprovar e acompanhar contratos, parcelas e documentos.',
  },
  {
    question: 'Quando a rubrica é debitada?',
    answer: 'A rubrica deve ser debitada quando a despesa é aprovada.',
  },
  {
    question: 'Sem nota fiscal aprovada é possível pagar?',
    answer: 'Não. Toda nota fiscal da equipe precisa ser revisada e aprovada antes do pagamento.',
  },
  {
    question: 'O que fazer quando a IA não encontra a resposta?',
    answer: 'Revisar a Biblioteca de Conhecimento, conferir se os documentos estão ativos e consultar este Manual.',
  },
  {
    question: 'Para que serve esta página Manual?',
    answer: 'Ela concentra orientações, fluxos, perguntas frequentes, atalhos e links para materiais de apoio do sistema.',
  },
];

function IconCard({ icon: Icon, title, text }) {
  return (
    <div className="border rounded-2xl p-4 bg-white shadow-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-slate-100">
          <Icon className="w-5 h-5 text-slate-700" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600 mt-1">{text}</p>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ section }) {
  const Icon = section.icon;
  return (
    <section
      id={section.id}
      className="border rounded-2xl p-5 bg-white shadow-sm scroll-mt-24"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded-xl bg-blue-50">
          <Icon className="w-5 h-5 text-blue-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
          <p className="text-sm text-slate-600">{section.description}</p>
        </div>
      </div>

      <div className="space-y-2">
        {section.content.map((item, index) => (
          <p key={index} className="text-sm text-slate-700 leading-6">
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function StepCard({ item, index }) {
  return (
    <div className="border rounded-2xl p-4 bg-white shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">
          {index + 1}
        </div>
        <h3 className="font-semibold text-slate-900">{item.title}</h3>
      </div>

      <div className="space-y-2">
        {item.steps.map((step, stepIndex) => (
          <div key={stepIndex} className="flex items-start gap-2 text-sm text-slate-700">
            <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400" />
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqCard({ item }) {
  return (
    <div className="border rounded-2xl p-4 bg-white shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-2">{item.question}</h3>
      <p className="text-sm text-slate-700">{item.answer}</p>
    </div>
  );
}

function ManualInner() {
  const [search, setSearch] = useState('');

  const filteredSections = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return SECOES;

    return SECOES.filter((section) => {
      const text = [
        section.title,
        section.description,
        ...section.content,
      ]
        .join(' ')
        .toLowerCase();

      return text.includes(term);
    });
  }, [search]);

  const filteredFaqs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return FAQS;

    return FAQS.filter((item) =>
      `${item.question} ${item.answer}`.toLowerCase().includes(term)
    );
  }, [search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 rounded-2xl bg-white shadow-sm border">
              <HelpCircle className="w-6 h-6 text-slate-800" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Manual e Ajuda</h1>
              <p className="text-slate-600 text-sm mt-1">
                Guia interativo da plataforma Museus Centro para consulta dos usuários
              </p>
            </div>
          </div>

          <div className="border rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Apresentação da plataforma
            </h2>
            <p className="text-sm text-slate-700 leading-6 whitespace-pre-line">
              {APRESENTACAO}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild className="gap-2">
                <a href={PDF_MANUAL_URL} target="_blank" rel="noreferrer">
                  <Download className="w-4 h-4" />
                  Baixar Manual em PDF
                </a>
              </Button>

              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const el = document.getElementById('faq');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <HelpCircle className="w-4 h-4" />
                Ir para dúvidas frequentes
              </Button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1 space-y-4">
            <div className="border rounded-2xl bg-white p-4 shadow-sm sticky top-6">
              <div className="flex items-center gap-2 mb-3">
                <Search className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Buscar no manual</span>
              </div>

              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tema, fluxo ou regra..."
              />

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Navegação rápida
                </p>

                <div className="space-y-2">
                  {SECOES.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => {
                        const el = document.getElementById(section.id);
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg px-2 py-2 transition"
                    >
                      {section.title}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('passos-rapidos');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg px-2 py-2 transition"
                  >
                    Passos rápidos
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('faq');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg px-2 py-2 transition"
                  >
                    Dúvidas frequentes
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <main className="lg:col-span-3 space-y-6">
            <section className="grid md:grid-cols-2 gap-4">
              {DESTAQUES.map((item) => (
                <IconCard
                  key={item.title}
                  icon={item.icon}
                  title={item.title}
                  text={item.text}
                />
              ))}
            </section>

            {filteredSections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}

            <section id="passos-rapidos" className="border rounded-2xl p-5 bg-white shadow-sm scroll-mt-24">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-xl bg-slate-100">
                  <Workflow className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Passos rápidos</h2>
                  <p className="text-sm text-slate-600">
                    Atalhos para ações frequentes dos usuários
                  </p>
                </div>
              </div>

              <div className="grid xl:grid-cols-2 gap-4">
                {PASSOS_RAPIDOS.map((item, index) => (
                  <StepCard key={item.title} item={item} index={index} />
                ))}
              </div>
            </section>

            <section id="faq" className="border rounded-2xl p-5 bg-white shadow-sm scroll-mt-24">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-xl bg-slate-100">
                  <HelpCircle className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Dúvidas frequentes</h2>
                  <p className="text-sm text-slate-600">
                    Respostas rápidas para orientar o uso correto da plataforma
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                {filteredFaqs.map((item) => (
                  <FaqCard key={item.question} item={item} />
                ))}
              </div>
            </section>

            <section className="border rounded-2xl p-5 bg-slate-900 text-white shadow-sm">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-xl bg-white/10">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Como usar junto com o Assistente</h2>
                  <p className="text-sm text-slate-300">
                    Esta página serve como ajuda interativa e pode ser complementada com a Biblioteca de Conhecimento
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-200 leading-6">
                <p>Use esta página para leitura rápida, orientação operacional e consulta de regras.</p>
                <p>
                  Para respostas mais específicas, complemente a Biblioteca de Conhecimento com PDFs, contratos,
                  planilhas, regras operacionais e manuais.
                </p>
                <p>
                  Sempre que houver dúvida sobre fluxos, a regra principal é verificar se o processo pertence a
                  Compras, Equipe, Aprovações, Rubricas ou Documentos.
                </p>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function Manual() {
  return (
    <RequireAuth>
      <ManualInner />
    </RequireAuth>
  );
}
