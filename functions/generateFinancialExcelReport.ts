import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const payload = await req.json();
    const {
      dateFrom,
      dateTo,
      activityIds = [],
      columns = [],
      filterByStatus,
      filterByActivity,
    } = payload;

    // Buscar compras no período
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter({});

    // Buscar atividades
    const activities = await base44.asServiceRole.entities.Activity.filter({});

    // Buscar orçamento
    const budgetLines = await base44.asServiceRole.entities.BudgetLine.filter({});

    // Filtrar dados conforme critérios
    let filteredPurchases = purchases.filter(p => {
      if (dateFrom && p.created_date < dateFrom) return false;
      if (dateTo && p.created_date > dateTo) return false;
      if (filterByStatus && p.status !== filterByStatus) return false;
      if (activityIds.length > 0 && !activityIds.includes(p.activity_id)) return false;
      return true;
    });

    // Preparar dados para Excel
    const reportData = filteredPurchases.map(purchase => {
      const activity = activities.find(a => a.id === purchase.activity_id);
      const budgetLine = budgetLines.find(b => b.id === purchase.rubrica_id);

      return {
        id: purchase.id,
        data: new Date(purchase.created_date).toLocaleDateString('pt-BR'),
        descricao: purchase.descricao,
        valor: parseFloat(purchase.valor || 0),
        status: purchase.status,
        atividade: activity?.titulo || 'N/A',
        rubrica: budgetLine?.nome || 'N/A',
        percentual_orcamento: budgetLine ? ((purchase.valor / budgetLine.saldo_total) * 100).toFixed(2) : 0,
        data_pagamento: purchase.data_pagamento ? new Date(purchase.data_pagamento).toLocaleDateString('pt-BR') : '',
        responsavel: purchase.responsavel_email || '',
      };
    });

    // Definir colunas a exportar (ou usar todas se não especificado)
    const defaultColumns = [
      'data',
      'descricao',
      'valor',
      'atividade',
      'rubrica',
      'status',
      'percentual_orcamento',
      'responsavel',
    ];

    const columnsToExport = columns.length > 0 ? columns : defaultColumns;

    // Criar workbook
    const wb = XLSX.utils.book_new();

    // SHEET 1: Detalhado
    const detailedData = reportData.map(row => {
      const result = {};
      columnsToExport.forEach(col => {
        if (col === 'data') result['Data'] = row.data;
        if (col === 'descricao') result['Descrição'] = row.descricao;
        if (col === 'valor') result['Valor'] = row.valor;
        if (col === 'atividade') result['Atividade'] = row.atividade;
        if (col === 'rubrica') result['Rubrica'] = row.rubrica;
        if (col === 'status') result['Status'] = row.status;
        if (col === 'percentual_orcamento') result['% Orçamento'] = parseFloat(row.percentual_orcamento);
        if (col === 'responsavel') result['Responsável'] = row.responsavel;
      });
      return result;
    });

    // Adicionar totais
    const totalValor = reportData.reduce((sum, r) => sum + r.valor, 0);
    detailedData.push({});
    detailedData.push({
      Data: 'TOTAL',
      Valor: totalValor,
    });

    const ws1 = XLSX.utils.json_to_sheet(detailedData);
    
    // Formatar coluna de valores
    if (columnsToExport.includes('valor')) {
      const range = XLSX.utils.decode_range(ws1['!ref']);
      for (let i = range.s.r + 1; i <= range.e.r; i++) {
        const cell = XLSX.utils.encode_cell({ r: i, c: 2 });
        if (ws1[cell]) ws1[cell].z = '#,##0.00';
      }
    }

    XLSX.utils.book_append_sheet(wb, ws1, 'Detalhado');

    // SHEET 2: Resumo por Atividade
    const summaryByActivity = {};
    reportData.forEach(row => {
      if (!summaryByActivity[row.atividade]) {
        summaryByActivity[row.atividade] = {
          atividade: row.atividade,
          total: 0,
          quantidade: 0,
          media: 0,
        };
      }
      summaryByActivity[row.atividade].total += row.valor;
      summaryByActivity[row.atividade].quantidade += 1;
    });

    Object.values(summaryByActivity).forEach(item => {
      item.media = (item.total / item.quantidade).toFixed(2);
      item.total = item.total.toFixed(2);
    });

    const activitySummary = Object.values(summaryByActivity);
    activitySummary.push({
      atividade: 'TOTAL GERAL',
      total: totalValor.toFixed(2),
      quantidade: reportData.length,
      media: (totalValor / reportData.length).toFixed(2),
    });

    const ws2 = XLSX.utils.json_to_sheet(activitySummary);
    XLSX.utils.book_append_sheet(wb, ws2, 'Por Atividade');

    // SHEET 3: Resumo por Status
    const summaryByStatus = {};
    reportData.forEach(row => {
      if (!summaryByStatus[row.status]) {
        summaryByStatus[row.status] = {
          status: row.status,
          total: 0,
          quantidade: 0,
        };
      }
      summaryByStatus[row.status].total += row.valor;
      summaryByStatus[row.status].quantidade += 1;
    });

    const statusSummary = Object.values(summaryByStatus).map(item => ({
      ...item,
      total: item.total.toFixed(2),
      percentual: ((item.total / totalValor) * 100).toFixed(2) + '%',
    }));

    const ws3 = XLSX.utils.json_to_sheet(statusSummary);
    XLSX.utils.book_append_sheet(wb, ws3, 'Por Status');

    // SHEET 4: Resumo por Rubrica
    const summaryByRubrica = {};
    reportData.forEach(row => {
      if (!summaryByRubrica[row.rubrica]) {
        summaryByRubrica[row.rubrica] = {
          rubrica: row.rubrica,
          total: 0,
          quantidade: 0,
        };
      }
      summaryByRubrica[row.rubrica].total += row.valor;
      summaryByRubrica[row.rubrica].quantidade += 1;
    });

    const rubricaSummary = Object.values(summaryByRubrica).map(item => ({
      ...item,
      total: item.total.toFixed(2),
      percentual: ((item.total / totalValor) * 100).toFixed(2) + '%',
    }));

    const ws4 = XLSX.utils.json_to_sheet(rubricaSummary);
    XLSX.utils.book_append_sheet(wb, ws4, 'Por Rubrica');

    // Gerar arquivo
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=relatorio_financeiro_${new Date().getTime()}.xlsx`,
      },
    });
  } catch (error) {
    console.error('Erro ao gerar Excel:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});