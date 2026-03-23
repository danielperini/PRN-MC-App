import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar todas as rubricas
    const budgetLines = await base44.asServiceRole.entities.BudgetLine.list('-codigo', 1000);
    
    if (!budgetLines || budgetLines.length === 0) {
      return Response.json({ error: 'Nenhuma rubrica encontrada' }, { status: 404 });
    }

    // Buscar gastos para cada rubrica
    const gastos = await base44.asServiceRole.entities.GastoRubrica.list('-data_gasto', 5000);

    // Preparar dados da planilha de rubricas
    const rubricasData = budgetLines.map(line => {
      const rubricaGastos = gastos.filter(g => g.rubrica_id === line.id);
      const totalGastos = rubricaGastos.reduce((s, g) => s + (g.valor || 0), 0);
      const gastosPagos = rubricaGastos.filter(g => g.status === 'pago').reduce((s, g) => s + (g.valor || 0), 0);
      const saldoFinal = (line.saldo_inicial || 0) - totalGastos;

      return {
        'Código': line.codigo,
        'Descrição': line.descricao,
        'Natureza': line.natureza_nome || line.natureza_codigo || '',
        'Saldo Inicial': line.saldo_inicial || 0,
        'Total Previsto': line.valor_total_previsto || 0,
        'Total Gastos': totalGastos,
        'Gastos Pagos': gastosPagos,
        'Saldo Final': saldoFinal,
        'Status': line.ativo ? 'Ativa' : 'Inativa',
        'Qtd Gastos': rubricaGastos.length,
        'Criado em': line.created_date ? new Date(line.created_date).toLocaleDateString('pt-BR') : '',
      };
    });

    // Preparar dados de gastos detalhados
    const gastosData = gastos.map(g => ({
      'Data': g.data_gasto ? new Date(g.data_gasto).toLocaleDateString('pt-BR') : '',
      'Mês Ref': g.mes_referencia || '',
      'Fornecedor': g.fornecedor_nome || '',
      'Categoria': g.categoria || '',
      'Descrição': g.descricao || '',
      'Valor': g.valor || 0,
      'Tipo Pagamento': g.tipo_pagamento || '',
      'Status': g.status || 'pendente',
      'Observações': g.observacoes || '',
    }));

    // Criar workbook
    const wb = XLSX.utils.book_new();
    
    // Adicionar abas
    const wsRubricas = XLSX.utils.json_to_sheet(rubricasData);
    const wsGastos = XLSX.utils.json_to_sheet(gastosData);
    
    // Ajustar largura das colunas
    wsRubricas['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 10 }, { wch: 12 }, { wch: 12 }
    ];
    
    wsGastos['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 15 },
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
      { wch: 25 }
    ];

    XLSX.utils.book_append_sheet(wb, wsRubricas, 'Rubricas');
    XLSX.utils.book_append_sheet(wb, wsGastos, 'Detalhes Gastos');

    // Gerar buffer
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    // Fazer upload para backup
    try {
      const fileName = `Rubricas_${new Date().toISOString().split('T')[0]}.xlsx`;
      const { file_url } = await base44.integrations.Core.UploadFile({
        file: Buffer.from(excelBuffer),
      });

      return Response.json({
        success: true,
        message: 'Planilha de rubricas gerada com sucesso',
        file_url,
        arquivo: fileName,
        data: {
          total_rubricas: budgetLines.length,
          total_gastos_registrados: gastos.length,
        }
      });
    } catch (e) {
      console.error('Erro ao fazer upload:', e.message);
      // Retornar o buffer mesmo se falhar o upload
      return new Response(excelBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Rubricas_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      });
    }
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});