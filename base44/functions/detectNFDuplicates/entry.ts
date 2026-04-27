import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { nf_numero, nf_emitente_cpf_cnpj, nf_valor_total, nf_data_emissao, exclude_id } = body;

    if (!nf_numero || !nf_emitente_cpf_cnpj || !nf_valor_total) {
      return Response.json({ error: 'Parâmetros obrigatórios faltam' }, { status: 400 });
    }

    // Buscar documentos com mesmo número + fornecedor + valor
    const duplicatas = await base44.asServiceRole.entities.DocumentIntake.filter({});
    
    const duplicatesFound = duplicatas.filter(doc => {
      if (exclude_id && doc.id === exclude_id) return false;
      
      const resultado_ia = doc.resultado_ia || {};
      const docNum = String(resultado_ia.nf_numero || '').trim();
      const docCNPJ = String(resultado_ia.nf_emitente_cpf_cnpj || '').trim();
      const docValor = Number(resultado_ia.nf_valor_total || 0);
      
      const inputNum = String(nf_numero || '').trim();
      const inputCNPJ = String(nf_emitente_cpf_cnpj || '').trim();
      const inputValor = Number(nf_valor_total || 0);
      
      // Exato: número + CNPJ + valor
      const exactMatch = docNum === inputNum && docCNPJ === inputCNPJ && docValor === inputValor;
      
      // Provável: número + CNPJ (mesma NF, mesmo fornecedor - pode ter rateio)
      const likelyMatch = docNum === inputNum && docCNPJ === inputCNPJ && Math.abs(docValor - inputValor) < 0.01;
      
      return exactMatch || likelyMatch;
    });

    // Buscar também em Attachment (para NFs já aprovadas)
    const attachments = await base44.asServiceRole.entities.Attachment.filter({});
    const attachDuplicates = attachments.filter(att => {
      if (!att.nf_numero) return false;
      
      const attNum = String(att.nf_numero || '').trim();
      const attCNPJ = String(att.nf_emitente_cpf_cnpj || '').trim();
      const attValor = Number(att.nf_valor_total || 0);
      
      const inputNum = String(nf_numero || '').trim();
      const inputCNPJ = String(nf_emitente_cpf_cnpj || '').trim();
      const inputValor = Number(nf_valor_total || 0);
      
      return attNum === inputNum && attCNPJ === inputCNPJ && attValor === inputValor;
    });

    // Preparar resultado
    const resultado = {
      duplicates_found: duplicatesFound.length > 0 || attachDuplicates.length > 0,
      intake_duplicates: duplicatesFound.map(d => ({
        id: d.id,
        file_name: d.file_name_original,
        status: d.status,
        created_date: d.created_date,
        nf_numero: d.resultado_ia?.nf_numero,
        nf_valor_total: d.resultado_ia?.nf_valor_total,
        tipo: 'intake'
      })),
      approved_duplicates: attachDuplicates.map(a => ({
        id: a.id,
        file_name: a.file_name,
        status: 'approved',
        created_date: a.created_date,
        nf_numero: a.nf_numero,
        nf_valor_total: a.nf_valor_total,
        report_id: a.report_id,
        tipo: 'approved'
      })),
      confidence: duplicatesFound.length > 0 ? 'HIGH' : 'MEDIUM'
    };

    return Response.json(resultado);
  } catch (error) {
    console.error('Erro ao detectar duplicatas:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});