import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const resultado = {
      verificado_por: user.email,
      data_verificacao: new Date().toISOString(),
      versao: '1.0',
      itens_ok: [],
      itens_alerta: [],
      itens_erro: [],
      sugestoes: [],
      resumo: {
        total_ok: 0,
        total_alerta: 0,
        total_erro: 0,
        status_geral: 'Verificação iniciada',
      },
    };

    // Verificar usuários
    try {
      const users = await base44.asServiceRole.entities.User.list('', 100);
      resultado.itens_ok.push(`✓ ${users.length || 0} usuários encontrados`);
      resultado.resumo.total_ok++;
    } catch (e) {
      resultado.itens_erro.push(`✗ Erro ao listar usuários: ${e.message}`);
      resultado.resumo.total_erro++;
    }

    // Verificar relatórios
    try {
      const reports = await base44.asServiceRole.entities.Report.list('', 100);
      if (reports.length > 0) {
        resultado.itens_ok.push(`✓ ${reports.length} relatórios encontrados`);
        resultado.resumo.total_ok++;
      } else {
        resultado.itens_alerta.push('⚠ Nenhum relatório encontrado');
        resultado.resumo.total_alerta++;
      }
    } catch (e) {
      resultado.itens_erro.push(`✗ Erro ao listar relatórios: ${e.message}`);
      resultado.resumo.total_erro++;
    }

    // Verificar compras
    try {
      const purchases = await base44.asServiceRole.entities.PurchaseRequest.list('', 100);
      resultado.itens_ok.push(`✓ ${purchases.length || 0} compras encontradas`);
      resultado.resumo.total_ok++;
    } catch (e) {
      resultado.itens_alerta.push(`⚠ Erro ao listar compras: ${e.message}`);
      resultado.resumo.total_alerta++;
    }

    // Verificar rubricas
    try {
      const rubricas = await base44.asServiceRole.entities.Rubrica.list('', 100);
      resultado.itens_ok.push(`✓ ${rubricas.length || 0} rubricas encontradas`);
      resultado.resumo.total_ok++;
    } catch (e) {
      resultado.itens_alerta.push(`⚠ Erro ao listar rubricas: ${e.message}`);
      resultado.resumo.total_alerta++;
    }

    // Verificar atividades
    try {
      const activities = await base44.asServiceRole.entities.Activity.list('', 100);
      resultado.itens_ok.push(`✓ ${activities.length || 0} atividades encontradas`);
      resultado.resumo.total_ok++;
    } catch (e) {
      resultado.itens_alerta.push(`⚠ Erro ao listar atividades: ${e.message}`);
      resultado.resumo.total_alerta++;
    }

    // Verificar arquivos/anexos
    try {
      const attachments = await base44.asServiceRole.entities.Attachment.list('', 100);
      resultado.itens_ok.push(`✓ ${attachments.length || 0} arquivos encontrados`);
      resultado.resumo.total_ok++;
    } catch (e) {
      resultado.itens_alerta.push(`⚠ Erro ao listar arquivos: ${e.message}`);
      resultado.resumo.total_alerta++;
    }

    // Calcular status geral
    if (resultado.resumo.total_erro > 0) {
      resultado.resumo.status_geral = '❌ CRÍTICO: Erros detectados';
    } else if (resultado.resumo.total_alerta > 0) {
      resultado.resumo.status_geral = '⚠️ ALERTA: Verifique os itens assinalados';
    } else {
      resultado.resumo.status_geral = '✅ Sistema íntegro';
    }

    return Response.json(resultado);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});