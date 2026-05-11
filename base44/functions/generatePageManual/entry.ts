import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const PAGES = [
  ['Dashboard', 'Dashboard', 'Painel geral com indicadores, atalhos, notícias e visão consolidada.'],
  ['EntradaUnica', 'Entrada de Documentos', 'Recebimento, triagem, análise IA e envio de documentos para aprovação.'],
  ['Compras', 'Compras e Aprovações', 'Solicitações financeiras, anexos, NF, XML, comprovantes, aprovação e vínculo com rubricas.'],
  ['RubricasPorMuseu', 'Orçamento por Museu', 'Controle orçamentário por museu, rubricas, saldos e valores utilizados.'],
  ['Relatorios', 'Relatórios', 'Criação, acompanhamento e exportação dos relatórios mensais.'],
  ['ReportEditor', 'Editor de Relatórios', 'Preenchimento de relatórios, atividades, público, fotos, anexos e envio para revisão.'],
  ['CoordReview', 'Revisão de relatórios', 'Aprovação, devolução e acompanhamento dos relatórios pela coordenação.'],
  ['Agenda', 'Agenda Museu Centro', 'Consulta da programação cultural por mês, museu, local, público e tipo de ação.'],
  ['ProgramacaoEspelho', 'Programação Completa', 'Espelho detalhado da programação, com sinopse, minibios, links e materiais aprovados.'],
  ['GaleriaFotos', 'Galeria', 'Banco de imagens e registros visuais.'],
  ['ComunicacaoVisibilidade', 'Comunicação', 'Materiais de comunicação, releases, clipping, imagens e redes sociais.'],
  ['LeitorNoticias', 'Notícias', 'Curadoria, publicação, exclusão e sincronização de notícias com o carrossel.'],
  ['AssistentePlanejamento', 'Assistente IA', 'Assistente conectado à base de conhecimento e às regras do projeto.'],
  ['Manual', 'Central de Ajuda', 'Manual completo do sistema.'],
  ['UserManagement', 'Gestão de Usuários', 'Gestão de papéis, permissões e perfis de acesso.'],
  ['MeusDados', 'Meus dados', 'Atualização de dados pessoais, bancários, CPF/CNPJ e PIX.'],
  ['Aparencia', 'Aparência', 'Temas visuais, manutenção e ferramentas administrativas.'],
  ['PlataformaAdmin', 'Administração do Sistema', 'Configurações avançadas da plataforma.'],
  ['Mensagens', 'Mensagens', 'Comunicados internos.'],
  ['GeradorListaPresenca', 'Gerador de lista de presença', 'Geração de listas para atividades.'],
  ['GeradorTermoCompromisso', 'Gerador de termo de compromisso', 'Geração de termos e documentos de apoio.'],
];

const SYSTEM_CONTEXT = `Sistema Museus Centro / Viaduto das Artes. Manual em português do Brasil. Explique uso real da plataforma, preservando capítulos, textos, fluxos e lógica operacional. Regras: Base44 é fonte de dados; rubrica é fonte financeira; despesa aprovada debita rubrica; PDF/XML devem estar vinculados; Entrada de Documentos organiza arquivos; Compras e Aprovações valida financeiramente; notícias excluídas não devem aparecer no carrossel; IA consulta a base de conhecimento e apoia validação, sugestão e orientação.`;

function promptFor(page) {
  const [name, title, desc] = page;
  return `${SYSTEM_CONTEXT}\n\nRefaça o capítulo do manual para a página ${title} (${name}). Função: ${desc}.\n\nEstruture exatamente com estes tópicos:\n1. Para que serve\n2. Quem deve usar\n3. Antes de começar\n4. Passo a passo detalhado\n5. Campos e informações importantes\n6. Boas práticas\n7. Erros comuns e como resolver\n8. Relação com outros módulos\n9. Como a IA/Base44 ajuda neste módulo\n10. Checklist final\n\nUse linguagem clara, técnica, objetiva e didática. Não invente funcionalidades. Quando houver dúvida, dê orientação operacional segura.`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Apenas admins podem gerar manual' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const selected = body?.pageName || body?.page || null;
    const pages = selected ? PAGES.filter(([name, title]) => name === selected || title === selected) : PAGES;

    if (selected && pages.length === 0) {
      return Response.json({ error: `Página não encontrada: ${selected}` }, { status: 404 });
    }

    const sections = [];

    for (const page of pages) {
      const [name, title, desc] = page;
      const content = await base44.integrations.Core.InvokeLLM({
        model: 'claude_sonnet_4_6',
        prompt: promptFor(page),
      });

      sections.push({ pageName: name, displayName: title, description: desc, content });
    }

    const version = `2.0 - ${new Date().toLocaleDateString('pt-BR')}`;
    const manual = {
      title: 'Manual Completo do Sistema Museus Centro',
      version,
      generatedAt: new Date().toISOString(),
      sections,
    };

    await base44.asServiceRole.entities.KnowledgeDocument.create({
      titulo: 'Manual Completo do Sistema Museus Centro',
      categoria: 'Manual de Instruções',
      versao: version,
      descricao: 'Manual completo gerado pela IA/Base44 com capítulos, passo a passo, boas práticas, erros comuns e checklist.',
      file_url: 'manual-completo-gerado-ia-base44',
      conteudo_extraido: JSON.stringify(manual, null, 2),
      ativo: true,
      created_by_email: user.email,
    });

    return Response.json({
      success: true,
      version,
      sections_count: sections.length,
      sections,
      message: `Manual completo gerado com ${sections.length} capítulo(s) e salvo na Base de Conhecimento.`,
    });
  } catch (error) {
    console.error('Erro ao gerar manual:', error);
    return Response.json({ error: error?.message || 'Erro inesperado ao gerar manual' }, { status: 500 });
  }
});
