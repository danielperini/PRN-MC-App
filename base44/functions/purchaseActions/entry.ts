import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(v: any) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalize(value: any) {
  return String(value || '').trim().toLowerCase();
}

function sanitize(value: any) {
  return String(value || '').replace(/[<>:"/\\|?*\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function computeSaldo(rubrica: any) {
  const total =
    toNumber(rubrica?.valor_total) ||
    toNumber(rubrica?.valor_rubrica) ||
    toNumber(rubrica?.valor);

  const utilizado = toNumber(rubrica?.valor_utilizado);
  const comprometido = toNumber(rubrica?.saldo_comprometido);

  return total - utilizado - comprometido;
}

function getPurchaseValue(p: any) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_final) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_solicitado)
  );
}

function buildAiScore(analysis: any) {
  const data = analysis?.data || analysis || {};
  const extracted = data?.extracted_data || data?.dados_extraidos || {};
  const checks = data?.checks || data?.validacoes || {};
  const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  const criticalIssues = Array.isArray(data?.critical_issues) ? data.critical_issues : [];

  let score = 10;

  if (!extracted?.invoice_number && !extracted?.numero_nota) score -= 1;
  if (!extracted?.total_amount && !extracted?.valor_total) score -= 1;
  if (!extracted?.supplier_name && !extracted?.fornecedor_nome) score -= 1;
  if (!extracted?.supplier_document && !extracted?.fornecedor_cnpj) score -= 1;

  if (checks?.amount_match === false || checks?.valor_confere === false) score -= 2;
  if (checks?.supplier_match === false || checks?.fornecedor_confere === false) score -= 2;
  if (checks?.project_linked === false || checks?.projeto_confere === false) score -= 2;
  if (checks?.rubrica_match === false || checks?.rubrica_confere === false) score -= 2;

  score -= Math.min(2, warnings.length);
  score -= Math.min(3, issues.length);
  score -= Math.min(4, criticalIssues.length);

  if (score < 1) score = 1;
  if (score > 10) score = 10;

  return Math.round(score);
}

function buildAiResumo(analysis: any, rubrica: any) {
  const data = analysis?.data || analysis || {};
  const extracted = data?.extracted_data || data?.dados_extraidos || {};
  const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  const criticalIssues = Array.isArray(data?.critical_issues) ? data.critical_issues : [];

  const partes = [];

  if (extracted?.invoice_number || extracted?.numero_nota) {
    partes.push(`NF ${extracted?.invoice_number || extracted?.numero_nota}`);
  }

  if (extracted?.supplier_name || extracted?.fornecedor_nome) {
    partes.push(`emitente ${extracted?.supplier_name || extracted?.fornecedor_nome}`);
  }

  if (rubrica?.rubrica || rubrica?.nome) {
    partes.push(`rubrica ${rubrica?.rubrica || rubrica?.nome}`);
  }

  if (criticalIssues.length) {
    partes.push(`críticas: ${criticalIssues.join('; ')}`);
  } else if (issues.length) {
    partes.push(`pendências: ${issues.join('; ')}`);
  } else if (warnings.length) {
    partes.push(`alertas: ${warnings.join('; ')}`);
  } else {
    partes.push('documentação consistente');
  }

  return partes.join(' | ');
}

async function analisarNotaFiscal(base44: any, purchase: any, rubrica: any, pdfUrl: string, xmlUrl: string | null) {
  try {
    const payload = {
      pdfFileUrl: pdfUrl,
      xmlFileUrl: xmlUrl,
      aiExtracted: {
        valor_total: getPurchaseValue(purchase),
        fornecedor_nome: purchase?.fornecedor_nome || '',
        fornecedor_cnpj: purchase?.fornecedor_cnpj || '',
        descricao_item: purchase?.descricao_item || '',
        projeto_nome: 'Museus Centro',
        rubrica_nome: rubrica?.rubrica || rubrica?.nome || '',
        centro_custo: purchase?.centro_custo || '',
      },
    };

    const response = await base44.functions.invoke('analyzeInvoiceFull', payload).catch(() => null);
    const data = response?.data || response || null;

    if (!data) {
      return {
        ok: false,
        score: 5,
        resumo: 'IA não retornou análise estruturada.',
        bruto: null,
      };
    }

    return {
      ok: true,
      score: buildAiScore(data),
      resumo: buildAiResumo(data, rubrica),
      bruto: data,
    };
  } catch (e: any) {
    return {
      ok: false,
      score: 5,
      resumo: `Falha na análise por IA: ${e?.message || 'erro interno'}`,
      bruto: null,
    };
  }
}

async function backupNotasFiscais(base44: any, purchase: any, pdfUrl: string, xmlUrl: string | null) {
  const numero = sanitize(
    purchase?.numero_nota_fiscal ||
    purchase?.numero_documento ||
    purchase?.numero_nf ||
    purchase?.id
  );

  const fornecedor = sanitize(
    purchase?.fornecedor_nome ||
    purchase?.nome_fornecedor ||
    'Fornecedor'
  );

  const valor = getPurchaseValue(purchase);
  const valorNome = Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const pdfName = `NF ${numero} - ${fornecedor} - R$ ${valorNome}.pdf`;
  const xmlName = `NF ${numero} - ${fornecedor} - R$ ${valorNome}.xml`;

  try {
    const backup = await base44.functions.invoke('backupNotasFiscaisToDrive', {
      file_url: pdfUrl,
      file_name: pdfName,
      xml_url: xmlUrl,
      xml_file_name: xmlUrl ? xmlName : null,
      purchase_id: purchase.id,
    });

    return backup?.data || backup || { success: false };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || 'Falha no backup do Drive',
    };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      action,
      purchaseId,
      comentario,
      pdf_url,
      xml_url,
      numero_nota_fiscal,
    } = await req.json();

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    const valor = getPurchaseValue(purchase);

    if (valor <= 0) {
      return Response.json({
        error: 'Valor inválido',
        debug: { valor },
      }, { status: 400 });
    }

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id)
      : null;

    if (!rubrica) {
      return Response.json({
        error: 'Compra sem rubrica vinculada',
        debug: {
          purchase_id: purchaseId,
          rubrica_id: purchase?.rubrica_id,
        },
      }, { status: 400 });
    }

    const saldo = computeSaldo(rubrica);

    if (action === 'attach_invoice') {
      const finalPdfUrl =
        pdf_url ||
        purchase?.nota_fiscal_pdf_url ||
        purchase?.nota_fiscal_url ||
        purchase?.pdf_url ||
        null;

      const finalXmlUrl =
        xml_url ||
        purchase?.nota_fiscal_xml_url ||
        purchase?.xml_url ||
        null;

      if (!finalPdfUrl) {
        return Response.json({
          error: 'PDF da nota fiscal é obrigatório',
        }, { status: 400 });
      }

      const analiseIa = await analisarNotaFiscal(base44, purchase, rubrica, finalPdfUrl, finalXmlUrl);
      const backup = await backupNotasFiscais(base44, purchase, finalPdfUrl, finalXmlUrl);

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        nota_fiscal_pdf_url: finalPdfUrl,
        nota_fiscal_url: finalPdfUrl,
        nota_fiscal_xml_url: finalXmlUrl,
        xml_url: finalXmlUrl,
        numero_nota_fiscal: numero_nota_fiscal || purchase?.numero_nota_fiscal || null,
        analise_ia_nf_score: analiseIa.score,
        analise_ia_nf_resumo: analiseIa.resumo,
        analise_ia_nf_json: analiseIa.bruto ? JSON.stringify(analiseIa.bruto) : null,
        drive_backup_nf_json: backup ? JSON.stringify(backup) : null,
        drive_backup_nf_ok: !!backup?.success,
        drive_backup_nf_pdf_link: backup?.pdf?.drive_link || null,
        drive_backup_nf_xml_link: backup?.xml?.drive_link || null,
        nf_vinculada_em: new Date().toISOString(),
        nf_vinculada_por: user.email,
      });

      return Response.json({
        success: true,
        message: 'Nota fiscal vinculada com sucesso',
        ai_score: analiseIa.score,
        ai_resumo: analiseIa.resumo,
        backup,
      });
    }

    if (action === 'approve_coord' || action === 'aprovar') {
      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({
          error: 'Status inválido',
          debug: { status: purchase.status },
        }, { status: 400 });
      }

      const finalPdfUrl =
        purchase?.nota_fiscal_pdf_url ||
        purchase?.nota_fiscal_url ||
        purchase?.pdf_url ||
        null;

      const finalXmlUrl =
        purchase?.nota_fiscal_xml_url ||
        purchase?.xml_url ||
        null;

      if (!finalPdfUrl) {
        return Response.json({
          error: 'Compra sem nota fiscal PDF vinculada',
          debug: {
            purchase_id: purchaseId,
            nota_fiscal_pdf_url: purchase?.nota_fiscal_pdf_url || null,
          },
        }, { status: 400 });
      }

      if (saldo < valor) {
        return Response.json({
          error: 'Saldo insuficiente',
          debug: {
            rubrica: rubrica?.rubrica || rubrica?.nome,
            saldo,
            valor,
          },
        }, { status: 400 });
      }

      let analiseIa = {
        ok: false,
        score: toNumber(purchase?.analise_ia_nf_score) || 5,
        resumo: purchase?.analise_ia_nf_resumo || 'Análise não executada.',
        bruto: null,
      };

      if (!purchase?.analise_ia_nf_score) {
        analiseIa = await analisarNotaFiscal(base44, purchase, rubrica, finalPdfUrl, finalXmlUrl);
      }

      let backup = null;
      if (!purchase?.drive_backup_nf_ok) {
        backup = await backupNotasFiscais(base44, purchase, finalPdfUrl, finalXmlUrl);
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: toNumber(rubrica?.valor_utilizado) + valor,
      });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_COORD',
        valor_aprovado: valor,
        valor_pago: valor,
        comentario_aprovacao: comentario || null,
        approved_by: user.email,
        approved_at: new Date().toISOString(),
        aprovado_coord_em: new Date().toISOString(),
        aprovado_coord_por: user.email,
        nota_fiscal_pdf_url: finalPdfUrl,
        nota_fiscal_url: finalPdfUrl,
        nota_fiscal_xml_url: finalXmlUrl,
        xml_url: finalXmlUrl,
        analise_ia_nf_score: analiseIa.score,
        analise_ia_nf_resumo: analiseIa.resumo,
        analise_ia_nf_json: analiseIa.bruto ? JSON.stringify(analiseIa.bruto) : purchase?.analise_ia_nf_json || null,
        drive_backup_nf_json: backup ? JSON.stringify(backup) : purchase?.drive_backup_nf_json || null,
        drive_backup_nf_ok: backup ? !!backup?.success : !!purchase?.drive_backup_nf_ok,
        drive_backup_nf_pdf_link: backup?.pdf?.drive_link || purchase?.drive_backup_nf_pdf_link || null,
        drive_backup_nf_xml_link: backup?.xml?.drive_link || purchase?.drive_backup_nf_xml_link || null,
      });

      return Response.json({
        success: true,
        message: 'Compra aprovada e valor abatido em realizado da rubrica',
        ai_score: analiseIa.score,
        ai_resumo: analiseIa.resumo,
        backup: backup || null,
      });
    }

    if (action === 'mark_paid') {
      if (normalize(purchase.status) !== 'aprovado_coord') {
        return Response.json({
          error: 'Compra precisa estar aprovada',
          debug: { status: purchase.status },
        }, { status: 400 });
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        valor_pago: valor,
        pago_por: user.email,
        pago_em: new Date().toISOString(),
      });

      return Response.json({
        success: true,
        message: 'Pagamento marcado com sucesso sem novo abatimento na rubrica',
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (e: any) {
    return Response.json({
      error: e?.message,
      stack: e?.stack,
    }, { status: 500 });
  }
});
