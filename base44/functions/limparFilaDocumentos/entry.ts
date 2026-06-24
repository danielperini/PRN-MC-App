import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RECIBO_PATTERNS = ['COMP', 'COMPROVANTE', 'BOL', 'BOLETO', 'PIX', 'TED', 'RECIBO', 'TRANSFERENCIA', 'PAGAMENTO'];
const NON_FISCAL_PATTERNS = [
  'ORCAMENTO', 'ORÇAMENTO', 'PLANO DE TRABALHO', 'OFICIO', 'OFÍCIO',
  'RELATORIO', 'RELATÓRIO', 'LISTA DE PRESENCA', 'MAPA DE PALCO',
  'RIDER', 'TERMO DE COMPROMISSO', 'PROPOSTA', 'NECESSIDADES',
  'ASSINATURA', 'PEÇAS GRAFICAS', 'PECAS GRAFICAS', 'ICON.PNG'
];

function isRecibo(nome) {
  const n = (nome || '').toUpperCase();
  return RECIBO_PATTERNS.some(p => n.includes(p));
}

function isNonFiscal(nome) {
  const n = (nome || '').toUpperCase();
  // UUID-named images
  if (/^[A-F0-9-]+\.(PNG|JPG|JPEG)$/i.test(n)) return true;
  // Generic image names
  if (/^(IMAGE|ICON)\./i.test(n)) return true;
  // Known non-fiscal patterns
  return NON_FISCAL_PATTERNS.some(p => n.includes(p));
}

function isXmlFile(nome) {
  return (nome || '').toLowerCase().endsWith('.xml');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const resultados = {
      xml_corrigidos: 0,
      recibos_reclassificados: 0,
      nao_fiscais_ocultados: 0,
      erros: [],
    };

    // Fetch all active documents
    let allDocs = [];
    let skip = 0;
    const limit = 200;

    while (true) {
      const batch = await base44.asServiceRole.entities.DocumentIntake.filter(
        { status_registro: 'ATIVO' },
        '-created_date',
        limit,
        skip
      );
      if (!batch || batch.length === 0) break;
      allDocs = allDocs.concat(batch);
      skip += limit;
      if (batch.length < limit) break;
    }

    for (const doc of allDocs) {
      try {
        const nome = doc.file_name_original || '';
        const tipoAtual = doc.tipo_detectado;
        let novoStatus = null;
        let ocultar = false;

        // 1. XML files misclassified as PDF → fix type
        if (isXmlFile(nome) && (tipoAtual === 'NOTA_FISCAL_PDF' || tipoAtual === 'PENDENTE')) {
          novoStatus = 'NOTA_FISCAL_XML';
        }

        // 2. Non-fiscal items → hide from queue
        if (isNonFiscal(nome)) {
          ocultar = true;
        }

        // 3. COMP/BOL recibo classified as NF PDF → reclassify
        if (isRecibo(nome) && (tipoAtual === 'NOTA_FISCAL_PDF' || tipoAtual === 'PENDENTE')) {
          novoStatus = 'RECIBO_PDF';
        }

        // Apply changes
        const updates = {};
        if (novoStatus && novoStatus !== tipoAtual) {
          updates.tipo_detectado = novoStatus;
        }
        if (ocultar && !doc.ocultar_entrada_unica) {
          updates.ocultar_entrada_unica = true;
        }

        if (Object.keys(updates).length > 0) {
          // Pequeno delay para evitar rate limit
          await new Promise(r => setTimeout(r, 80));
          await base44.asServiceRole.entities.DocumentIntake.update(doc.id, updates);

          if (updates.tipo_detectado === 'NOTA_FISCAL_XML') resultados.xml_corrigidos++;
          if (updates.tipo_detectado === 'RECIBO_PDF') resultados.recibos_reclassificados++;
          if (updates.ocultar_entrada_unica) resultados.nao_fiscais_ocultados++;
        }
      } catch (err) {
        resultados.erros.push({ id: doc.id, nome: doc.file_name_original, erro: err.message });
      }
    }

    return Response.json({
      ok: true,
      total_analisados: allDocs.length,
      ...resultados,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});