import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { invokeLLM } from '../_shared/gatewayIA.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const { modo = 'auditar', ids } = await req.json().catch(() => ({}));
    
    // Buscar PRs aprovadas
    const query = ids && ids.length > 0 
      ? { id: { $in: ids } } 
      : { status: 'APROVADO_ADMIN' };
    
    const prs = await base44.asServiceRole.entities.PurchaseRequest.filter(query, '-created_date', 300);
    
    const resultados = [];
    let atualizados = 0;
    
    for (const pr of prs) {
      const faltas = [];
      if (!pr.nf_data_emissao) faltas.push('nf_data_emissao');
      if (!pr.nf_emitente_cpf_cnpj && !pr.fornecedor_cnpj) faltas.push('cnpj');
      if (!pr.fornecedor_nome && !pr.nf_emitente_nome) faltas.push('fornecedor');
      
      if (faltas.length === 0) continue;
      
      // Buscar DocumentIntake vinculado
      let intake = null;
      if (pr.intake_id) {
        try { intake = await base44.asServiceRole.entities.DocumentIntake.get(pr.intake_id); } catch(e) {}
      }
      if (!intake && pr.documento_intake_id) {
        try { intake = await base44.asServiceRole.entities.DocumentIntake.get(pr.documento_intake_id); } catch(e) {}
      }
      
      const atualizacao = {};
      
      if (intake) {
        // Copiar CNPJ do intake
        if (!pr.nf_emitente_cpf_cnpj && !pr.fornecedor_cnpj) {
          const cnpj = intake.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj;
          if (cnpj && cnpj !== '—') {
            atualizacao.nf_emitente_cpf_cnpj = cnpj;
            atualizacao.fornecedor_cnpj = cnpj;
          }
        }
        
        // Copiar fornecedor
        if (!pr.fornecedor_nome && !pr.nf_emitente_nome) {
          const fornecedor = intake.fornecedor_nome || intake.nf_emitente_nome;
          if (fornecedor && fornecedor !== '—') {
            atualizacao.fornecedor_nome = fornecedor;
            atualizacao.nf_emitente_nome = fornecedor;
          }
        }
        
        // Copiar valor da NF se zerado
        if ((!pr.nf_valor_total || pr.nf_valor_total === 0) && intake.nf_valor_total && intake.nf_valor_total > 0) {
          atualizacao.nf_valor_total = intake.nf_valor_total;
        }
      }
      
      // Tentar extrair data de emissão via IA se tiver arquivo
      if (!pr.nf_data_emissao && modo === 'preencher') {
        // Tentar pelo XML primeiro (mais preciso)
        let xmlUrl = null;
        if (intake?.nf_xml_url) {
          xmlUrl = intake.nf_xml_url;
        } else if (pr.arquivo_url) {
          xmlUrl = pr.arquivo_url;
        }
        
        if (xmlUrl) {
          try {
            // Fazer fetch do XML e extrair data
            const resp = await fetch(xmlUrl);
            const text = await resp.text();
            const dhEmiMatch = text.match(/<dhEmi>([^<]+)<\/dhEmi>/) || text.match(/<dEmi>([^<]+)<\/dEmi>/);
            if (dhEmiMatch) {
              const data = dhEmiMatch[1].substring(0, 10);
              atualizacao.nf_data_emissao = data;
            } else {
              // Tentar extrair com LLM
              try {
                const llm = await invokeLLM(base44.asServiceRole,{
                  prompt: `Extraia APENAS a data de emissão desta Nota Fiscal em formato YYYY-MM-DD. Retorne SOMENTE a data, nada mais.\n\nXML (trecho inicial):\n${text.substring(0, 3000)}`,
                  response_json_schema: {
                    type: "object",
                    properties: {
                      data_emissao: { type: "string", description: "Data de emissão no formato YYYY-MM-DD" }
                    }
                  }
                });
                if (llm?.data_emissao && /^\d{4}-\d{2}-\d{2}$/.test(llm.data_emissao)) {
                  atualizacao.nf_data_emissao = llm.data_emissao;
                }
              } catch(e) {}
            }
          } catch(e) {}
        }
        
        // Se não conseguiu pelo XML, tentar pelo PDF
        if (!atualizacao.nf_data_emissao) {
          const pdfUrl = intake?.arquivo_original_url || pr.nota_fiscal_url || pr.documento_url || pr.arquivo_url;
          if (pdfUrl) {
            try {
              const llm = await invokeLLM(base44.asServiceRole,{
                prompt: `Extraia APENAS a data de emissão desta Nota Fiscal em formato YYYY-MM-DD.\n\nContexto adicional:\n- Fornecedor: ${pr.fornecedor_nome || atualizacao.fornecedor_nome || 'desconhecido'}\n- Número NF: ${pr.nf_numero || 'desconhecido'}\n- Valor: R$ ${pr.nf_valor_total || pr.valor_solicitado || 0}\n\nRetorne SOMENTE a data.`,
                file_urls: [pdfUrl],
                response_json_schema: {
                  type: "object",
                  properties: {
                    data_emissao: { type: "string", description: "Data de emissão YYYY-MM-DD" }
                  }
                }
              });
              if (llm?.data_emissao && /^\d{4}-\d{2}-\d{2}$/.test(llm.data_emissao)) {
                atualizacao.nf_data_emissao = llm.data_emissao;
              }
            } catch(e) {}
          }
        }
      }
      
      if (Object.keys(atualizacao).length > 0 && modo === 'preencher') {
        await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, atualizacao);
        atualizados++;
      }
      
      resultados.push({
        id: pr.id,
        descricao: (pr.descricao_item || '').substring(0, 60),
        faltas,
        preenchidos: Object.keys(atualizacao),
        tem_intake: !!intake,
        nf_numero: pr.nf_numero
      });
    }
    
    return Response.json({
      modo,
      total_analisados: prs.length,
      total_faltantes: resultados.length,
      total_atualizados: atualizados,
      resultados
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});