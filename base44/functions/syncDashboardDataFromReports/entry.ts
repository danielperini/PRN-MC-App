import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar todos os relatórios aprovados
    const approvedReports = await base44.entities.Report.filter({ status: 'APPROVED' }, '-updated_date', 500);

    if (!approvedReports || approvedReports.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'Nenhum relatório aprovado para sincronizar',
        synced_count: 0
      });
    }

    // Consolidar dados por museu e período
    const consolidatedData = {};
    const seenReports = new Set();

    for (const report of approvedReports) {
      const reportKey = `${report.id}_${report.mes_referencia}_${report.ano}`;
      
      // Evitar duplicação
      if (seenReports.has(reportKey)) continue;
      seenReports.add(reportKey);

      const museu = report.museu || 'Desconhecido';
      const periodo = `${report.ano}-${String(report.mes_referencia ? Object.keys({Janeiro:1,Fevereiro:2,Março:3,Abril:4,Maio:5,Junho:6,Julho:7,Agosto:8,Setembro:9,Outubro:10,Novembro:11,Dezembro:12}).indexOf(report.mes_referencia) + 1 : 0).padStart(2, '0')}`;

      if (!consolidatedData[museu]) {
        consolidatedData[museu] = {};
      }

      if (!consolidatedData[museu][periodo]) {
        consolidatedData[museu][periodo] = {
          atividades_mes: 0,
          publico_mes: 0,
          valor_utilizado: 0,
          valor_previsto: 0,
          saldo: 0,
          reports_count: 0,
          last_updated: new Date().toISOString()
        };
      }

      // Extrair atividades do mês do relatório
      const atividades = report.atividades || [];
      const ativididadesMes = atividades.filter(a => {
        if (!a.data_realizacao) return false;
        const d = new Date(a.data_realizacao);
        return d.getMonth() + 1 === parseInt(periodo.split('-')[1]);
      });

      consolidatedData[museu][periodo].atividades_mes += ativididadesMes.length;
      consolidatedData[museu][periodo].publico_mes += ativididadesMes.reduce((sum, a) => sum + (Number(a.publico_total) || 0), 0);
      consolidatedData[museu][periodo].reports_count += 1;
    }

    // Buscar rubricas para dados orçamentários
    const rubricas = await base44.entities.Rubrica.list('grupo', 200);

    let totalValorOrcado = 0;
    let totalValorUtilizado = 0;
    let totalSaldo = 0;
    const rubricsPerMuseu = {};

    (rubricas || []).forEach(r => {
      const museu = r.museu || 'Consolidado';
      
      if (!rubricsPerMuseu[museu]) {
        rubricsPerMuseu[museu] = { valor_total: 0, valor_utilizado: 0, saldo: 0 };
      }

      const previsto = Number(r.valor_total) || 0;
      const utilizado = Number(r.valor_utilizado_aprovado) || 0;
      const saldo = Number(r.saldo_disponivel) || 0;

      rubricsPerMuseu[museu].valor_total += previsto;
      rubricsPerMuseu[museu].valor_utilizado += utilizado;
      rubricsPerMuseu[museu].saldo += saldo;

      totalValorOrcado += previsto;
      totalValorUtilizado += utilizado;
      totalSaldo += saldo;
    });

    // Atualizar consolidatedData com orçamento
    Object.keys(consolidatedData).forEach(museu => {
      Object.keys(consolidatedData[museu]).forEach(periodo => {
        if (rubricsPerMuseu[museu]) {
          consolidatedData[museu][periodo].valor_previsto = rubricsPerMuseu[museu].valor_total;
          consolidatedData[museu][periodo].valor_utilizado = rubricsPerMuseu[museu].valor_utilizado;
          consolidatedData[museu][periodo].saldo = rubricsPerMuseu[museu].saldo;
        }
      });
    });

    // Registrar auditoria
    await base44.entities.AuditLog.create({
      action: 'SYNC_DASHBOARD_DATA',
      entity_type: 'REPORT',
      entity_id: 'bulk_sync',
      actor_email: user.email,
      actor_name: user.full_name || user.email,
      details: `Sincronizados dados de ${approvedReports.length} relatórios aprovados. Consolidação por ${Object.keys(consolidatedData).length} museus.`
    });

    // Publicar dados consolidados (resposta com dados dedupilcados)
    const publishedMetrics = {
      timestamp: new Date().toISOString(),
      total_approved_reports: approvedReports.length,
      total_unique_reports: seenReports.size,
      museums: Object.keys(consolidatedData).length,
      consolidated_by_museum: consolidatedData,
      budget_summary: {
        total_budget: Number(totalValorOrcado.toFixed(2)),
        total_used: Number(totalValorUtilizado.toFixed(2)),
        total_balance: Number(totalSaldo.toFixed(2)),
        execution_percentage: totalValorOrcado > 0 ? Number((totalValorUtilizado / totalValorOrcado * 100).toFixed(1)) : 0
      },
      synced_by: user.email
    };

    return Response.json({
      success: true,
      message: 'Dados sincronizados com sucesso',
      data: publishedMetrics
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});