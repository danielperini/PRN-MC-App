import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId } = await req.json();
    
    if (!reportId) {
      return Response.json({ error: 'reportId required' }, { status: 400 });
    }

    // Buscar relatório para obter período, museu
    const report = await base44.entities.Report.list();
    const currentReport = report.find(r => r.id === reportId);
    
    if (!currentReport) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    // Buscar TODAS as solicitações aprovadas/pagas do período
    const purchaseRequests = await base44.entities.PurchaseRequest.filter({
      report_id: reportId,
      status: {
        $in: ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']
      }
    });

    // Buscar documentos relacionados (attachments)
    const attachments = await base44.entities.Attachment.filter({
      report_id: reportId
    });

    // Buscar contratos (TeamMember)
    const teamMembers = await base44.entities.TeamMember.filter({
      status: 'ATIVO'
    });

    // Processar cada solicitação com documentos
    const pagamentoDetalhado = purchaseRequests.map(pr => {
      const relatedAttachments = attachments.filter(a => 
        a.report_id === reportId && 
        (a.description?.includes(pr.descricao_item) || a.nf_numero === pr.nf_numero)
      );

      return {
        id: pr.id,
        data_pagamento: pr.data_pagamento || pr.created_date,
        fornecedor_nome: pr.fornecedor_nome || pr.created_by,
        descricao: pr.descricao_item,
        rubrica: pr.rubrica_id || 'Não classificado',
        museu: pr.centro_custo || currentReport.museu,
        valor: pr.valor_solicitado || pr.valor_aprovado || pr.valor_pago || 0,
        status: pr.status,
        nf_numero: pr.nf_numero,
        nf_pdf_url: pr.nf_pdf_url,
        nf_xml_url: pr.arquivo_url,
        comprovante_url: pr.comprovante_pagamento_url,
        documentos: relatedAttachments.map(a => ({
          nome: a.file_name,
          url: a.file_url,
          tipo: a.file_type,
          nf_numero: a.nf_numero
        }))
      };
    });

    // Agrupar por diferentes critérios
    const agrupadoPorMuseu = {};
    const agrupadoPorRubrica = {};
    const agrupadoPorData = {};

    pagamentoDetalhado.forEach(pag => {
      // Por museu
      if (!agrupadoPorMuseu[pag.museu]) agrupadoPorMuseu[pag.museu] = [];
      agrupadoPorMuseu[pag.museu].push(pag);

      // Por rubrica
      if (!agrupadoPorRubrica[pag.rubrica]) agrupadoPorRubrica[pag.rubrica] = [];
      agrupadoPorRubrica[pag.rubrica].push(pag);

      // Por data (agrupa por mês)
      const mes = new Date(pag.data_pagamento).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long' });
      if (!agrupadoPorData[mes]) agrupadoPorData[mes] = [];
      agrupadoPorData[mes].push(pag);
    });

    // Cálculos totalizadores
    const totalPago = pagamentoDetalhado.reduce((sum, p) => sum + (p.valor || 0), 0);
    const totalPagamentos = pagamentoDetalhado.length;

    return Response.json({
      sucesso: true,
      reportId,
      periodo: `${currentReport.mes_referencia}/${currentReport.ano}`,
      museu: currentReport.museu,
      totalPagamentos,
      totalPago,
      pagamentos: pagamentoDetalhado,
      agrupadoPorMuseu,
      agrupadoPorRubrica,
      agrupadoPorData
    });

  } catch (error) {
    console.error('Erro ao gerar tabela de pagamentos:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});