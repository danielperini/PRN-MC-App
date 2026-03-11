import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Apenas admins podem gerar manual' }, { status: 403 });
    }

    // Páginas a documentar
    const pages = [
      { name: 'Dashboard', desc: 'Painel principal com visão consolidada' },
      { name: 'DashboardProfissional', desc: 'Painel individual do profissional' },
      { name: 'Relatorios', desc: 'Gerenciamento de relatórios mensais' },
      { name: 'ReportEditor', desc: 'Editor de relatório detalhado' },
      { name: 'NovaAtividade', desc: 'Cadastro de novas atividades' },
      { name: 'CalendarioAtividades', desc: 'Calendário de atividades' },
      { name: 'Compras', desc: 'Gestão de compras e suprimentos' },
      { name: 'GestaoPagamentos', desc: 'Gestão de pagamentos de equipe' },
      { name: 'RelatorioMeta', desc: 'Relatório por metas do contrato' },
      { name: 'CoordReview', desc: 'Revisão e aprovação de relatórios' },
      { name: 'UserManagement', desc: 'Gestão de usuários' },
      { name: 'GestorArquivos', desc: 'Gerenciador de arquivos e backup' },
      { name: 'ActivityLog', desc: 'Log de atividades do sistema' },
      { name: 'PlataformaAdmin', desc: 'Configurações da plataforma' },
      { name: 'AssistentePlanejamento', desc: 'Assistente de IA' },
      { name: 'LeitorNoticias', desc: 'Curador de notícias' },
      { name: 'BaseConhecimento', desc: 'Base de conhecimento' },
      { name: 'Perfil', desc: 'Perfil do usuário' },
    ];

    const manualSections = [];

    for (const page of pages) {
      // Analisar página com Claude
      const analysis = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um especialista em documentação técnica. Analise a página "${page.name}" da Plataforma Museu Centro que é usada para "${page.desc}".

Gere uma documentação completa em português Brasil com linguagem acessível e técnica, estruturada assim:

SEÇÃO: ${page.name}
DESCRIÇÃO: Uma explicação de 2-3 linhas sobre o que a página faz

PARA QUEM?: Indique qual tipo de usuário usa (Profissional, Coordenador, Admin)

COMO USAR:
- Listagem clara e numerada de passos principais
- Use linguagem simples e direta
- Máximo 5-7 passos

FUNCIONALIDADES PRINCIPAIS:
- Listagem com pontos-chave da página
- Explique cada funcionalidade brevemente

DICAS:
- 3-4 dicas práticas de uso

ERROS COMUNS:
- 2-3 erros comuns que usuários cometem

Mantenha a resposta concisa mas informativa.`,
        model: 'claude_sonnet_4_6'
      });

      manualSections.push({
        pageName: page.name,
        displayName: page.desc,
        content: analysis
      });
    }

    // Salvar como KnowledgeDocument
    const manualContent = {
      sections: manualSections,
      generatedAt: new Date().toISOString(),
      version: '1.0'
    };

    await base44.asServiceRole.entities.KnowledgeDocument.create({
      titulo: 'Manual Completo - Todas as Páginas',
      categoria: 'Manual de Instrucoes',
      versao: '1.0 - ' + new Date().toLocaleDateString('pt-BR'),
      descricao: 'Documentação gerada automaticamente de todas as páginas da plataforma',
      file_url: 'manual-gerado',
      conteudo_extraido: JSON.stringify(manualContent, null, 2),
      ativo: true,
      created_by_email: user.email
    });

    return Response.json({
      success: true,
      sections: manualSections.length,
      message: `Manual gerado com ${manualSections.length} páginas documentadas`,
      sections: manualSections
    });
  } catch (error) {
    console.error('Erro ao gerar manual:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});