import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Apenas admins podem sincronizar' }, { status: 403 });
    }

    // Buscar todos os relatórios aprovados
    const approvedReports = await base44.asServiceRole.entities.Report.filter(
      { status: 'APPROVED' },
      '-updated_date',
      1000
    );

    if (approvedReports.length === 0) {
      return Response.json({
        success: true,
        message: 'Nenhum relatório aprovado para sincronizar'
      });
    }

    // Consolidar conteúdo dos relatórios
    let consolidatedContent = `=== BASE DE CONHECIMENTO: RELATÓRIOS APROVADOS ===
Data de Sincronização: ${new Date().toLocaleString('pt-BR')}
Total de Relatórios: ${approvedReports.length}

`;

    for (const report of approvedReports) {
      consolidatedContent += `
--- RELATÓRIO ---
Protocolo: ${report.numero_protocolo || 'N/A'}
Profissional: ${report.author_name}
Função: ${report.funcao}
Museu: ${report.museu}
Mês/Ano: ${report.mes_referencia}/${report.ano}
Data de Aprovação: ${new Date(report.updated_date).toLocaleDateString('pt-BR')}

RESUMO EXECUTIVO:
${report.resumo_executivo || '(Não informado)'}

AVALIAÇÃO DO MÊS:
Pontos Positivos: ${report.avaliacao_pontos_positivos || '(Não informado)'}
Desafios: ${report.avaliacao_desafios || '(Não informado)'}
Sugestões: ${report.avaliacao_sugestoes || '(Não informado)'}

`;

      // Buscar atividades vinculadas
      const activities = await base44.asServiceRole.entities.Activity.filter(
        { report_id: report.id },
        'titulo',
        100
      );

      if (activities.length > 0) {
        consolidatedContent += `ATIVIDADES REALIZADAS (${activities.length}):
`;
        activities.forEach(act => {
          consolidatedContent += `• ${act.titulo} (${act.classificacao}) - Público: ${act.publico_total || 0}
`;
        });
        consolidatedContent += '\n';
      }
    }

    // Criar ou atualizar documento na base de conhecimento
    const existingDoc = await base44.asServiceRole.entities.KnowledgeDocument.filter(
      { titulo: 'Relatórios Aprovados - Base de Conhecimento' },
      '-created_date',
      1
    );

    let docId;
    if (existingDoc.length > 0) {
      // Atualizar documento existente
      docId = existingDoc[0].id;
      await base44.asServiceRole.entities.KnowledgeDocument.update(docId, {
        conteudo_extraido: consolidatedContent,
        versao: `Sincronizado ${new Date().toLocaleDateString('pt-BR')}`
      });
    } else {
      // Criar novo documento
      const newDoc = await base44.asServiceRole.entities.KnowledgeDocument.create({
        titulo: 'Relatórios Aprovados - Base de Conhecimento',
        categoria: 'Relatórios',
        versao: `v1.0 - ${new Date().toLocaleDateString('pt-BR')}`,
        descricao: `Consolidação de ${approvedReports.length} relatórios aprovados para referência do assistente`,
        file_url: 'relatorios-base-conhecimento',
        conteudo_extraido: consolidatedContent,
        ativo: true,
        created_by_email: user.email
      });
      docId = newDoc.id;
    }

    return Response.json({
      success: true,
      message: `Base de conhecimento sincronizada com ${approvedReports.length} relatórios aprovados`,
      documentId: docId,
      reportsCount: approvedReports.length
    });
  } catch (error) {
    console.error('Erro ao sincronizar relatórios:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});