import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Buscar textos de ajuda existentes
    const existingTexts = await base44.entities.HelpText.list();
    const existingKeys = new Set(existingTexts.map(h => h.component_key));

    // Lista de componentes padrão que devem ter ajuda
    const standardComponents = [
      // Sidebar items
      { key: 'sidebar-dashboard', label: 'Dashboard', type: 'sidebar_item', context: 'Painel principal com resumo de atividades e indicadores' },
      { key: 'sidebar-relatorios', label: 'Relatórios', type: 'sidebar_item', context: 'Acesso a relatórios mensais e histórico de atividades' },
      { key: 'sidebar-calendario', label: 'Calendário', type: 'sidebar_item', context: 'Visualize todas as atividades programadas em uma visão mensal' },
      { key: 'sidebar-compras', label: 'Suprimentos', type: 'sidebar_item', context: 'Gestão de compras e orçamento' },
      { key: 'sidebar-usuarios', label: 'Usuários', type: 'sidebar_item', context: 'Administre permissões e acesso de usuários' },
      { key: 'sidebar-arquivos', label: 'Arquivos', type: 'sidebar_item', context: 'Repositório centralizado de documentos e mídias' },
      { key: 'sidebar-auditoria', label: 'Auditoria', type: 'sidebar_item', context: 'Histórico completo de alterações no sistema' },
      { key: 'sidebar-configuracoes', label: 'Configurações', type: 'sidebar_item', context: 'Ajustes gerais da plataforma' },
      
      // Common buttons
      { key: 'btn-salvar', label: 'Salvar', type: 'button', context: 'Salva as alterações realizadas' },
      { key: 'btn-novo', label: 'Novo', type: 'button', context: 'Cria um novo registro' },
      { key: 'btn-editar', label: 'Editar', type: 'button', context: 'Abre o registro para edição' },
      { key: 'btn-excluir', label: 'Excluir', type: 'button', context: 'Remove o registro de forma permanente' },
      { key: 'btn-exportar', label: 'Exportar', type: 'button', context: 'Exporta dados em formato PDF ou Excel' },
      { key: 'btn-submeter', label: 'Submeter', type: 'button', context: 'Envia para revisão ou aprovação' },
      { key: 'btn-aprovar', label: 'Aprovar', type: 'button', context: 'Aprova a solicitação ou relatório' },
      { key: 'btn-rejeitar', label: 'Rejeitar', type: 'button', context: 'Rejeita a solicitação ou relatório' },
      { key: 'btn-buscar', label: 'Buscar', type: 'button', context: 'Realiza uma pesquisa' },
      { key: 'btn-filtrar', label: 'Filtrar', type: 'button', context: 'Aplica filtros aos dados' },

      // Common fields
      { key: 'field-titulo', label: 'Título', type: 'field', context: 'Nome ou identificação do item' },
      { key: 'field-descricao', label: 'Descrição', type: 'field', context: 'Detalhes adicionais sobre o item' },
      { key: 'field-email', label: 'Email', type: 'field', context: 'Endereço de email do usuário' },
      { key: 'field-data', label: 'Data', type: 'field', context: 'Data de referência do evento' },
      { key: 'field-status', label: 'Status', type: 'field', context: 'Situação atual do registro' },
    ];

    // Gerar ajudas para componentes não existentes
    const newTexts = [];
    for (const comp of standardComponents) {
      if (!existingKeys.has(comp.key)) {
        try {
          // Gerar com Claude
          const response = await base44.integrations.Core.InvokeLLM({
            prompt: `Gere um texto breve de ajuda em português do Brasil para este elemento:

Tipo: ${comp.type}
Label: "${comp.label}"
Contexto: ${comp.context}

Padrão: 3 linhas máximo. Primeira frase = o que é. Segunda = para que serve. Terceira = ação/efeito.

Responda APENAS o texto, sem explicações.`,
            model: 'gpt_5_mini',
          });

          newTexts.push({
            component_key: comp.key,
            component_type: comp.type,
            label: comp.label,
            context_description: comp.context,
            help_text_ptbr: response,
            generated_by_model: 'gpt_5_mini',
            last_generated_at: new Date().toISOString(),
            active: true,
            manually_edited: false,
          });
        } catch (error) {
          console.error(`Erro gerando ajuda para ${comp.key}:`, error.message);
        }
      }
    }

    // Salvar no banco
    if (newTexts.length > 0) {
      await base44.entities.HelpText.bulkCreate(newTexts);
    }

    return Response.json({
      success: true,
      generated: newTexts.length,
      existing: existingKeys.size,
      total: existingKeys.size + newTexts.length,
      newKeys: newTexts.map(t => t.component_key),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});