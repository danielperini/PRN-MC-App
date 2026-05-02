/**
 * deleteIntegrado.js
 * Utilitário centralizado para deleção integrada de documentos e solicitações.
 * Estorna rubrica se necessário, cancela PurchaseRequest e oculta documentos vinculados.
 */
import { base44 } from '@/api/base44Client';

const STATUS_APROVADOS = ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'];

async function hardDeleteIntake(id) {
  try {
    await base44.entities.DocumentIntake.delete(id);
  } catch (e) {
    console.warn('Erro ao deletar intake:', e.message);
  }
}

async function hardDeleteAttachment(id) {
  try {
    await base44.entities.Attachment.delete(id);
  } catch (e) {
    console.warn('Erro ao deletar attachment:', e.message);
  }
}

async function estornarRubrica(pr) {
  if (!pr?.rubrica_id) return;
  const valorEstorno =
    parseFloat(pr.rubrica_debitada_valor || pr.valor_solicitado || pr.valor_total || pr.valor || 0);
  if (valorEstorno <= 0) return;

  try {
    const rubrica = await base44.entities.Rubrica.get(pr.rubrica_id).catch(() => null);
    if (!rubrica) return;

    const valorUtilizadoAtual = parseFloat(rubrica.valor_utilizado || 0);
    const valorTotalRubrica = parseFloat(rubrica.valor_total || 0);
    const novoUtilizado = Math.max(0, valorUtilizadoAtual - valorEstorno);
    const novoSaldo = valorTotalRubrica - novoUtilizado;
    const novoPercentual = valorTotalRubrica > 0 ? (novoUtilizado / valorTotalRubrica) * 100 : 0;

    await base44.entities.Rubrica.update(pr.rubrica_id, {
      valor_utilizado: novoUtilizado,
      saldo: novoSaldo,
      saldo_real: novoSaldo,
      percentual_utilizado: novoPercentual,
    });
  } catch (e) {
    console.warn('Erro ao estornar rubrica:', e.message);
  }
}

/**
 * Deleta um DocumentIntake (PDF ou XML) e todos os vínculos associados.
 * @param {object} intake - registro DocumentIntake
 */
export async function deleteIntake(intake) {
  if (!intake?.id) return;

  const isPDF = intake.tipo_detectado === 'NOTA_FISCAL_PDF' ||
    String(intake.file_name_original || '').toLowerCase().endsWith('.pdf');
  const isXML = intake.tipo_detectado === 'NOTA_FISCAL_XML' ||
    String(intake.file_name_original || '').toLowerCase().endsWith('.xml');

  // 1. Se há PurchaseRequest vinculada: estornar rubrica e deletar de fato
  const prId = intake.entidade_destino_id;
  if (prId && intake.entidade_destino === 'PurchaseRequest') {
    try {
      const pr = await base44.entities.PurchaseRequest.get(prId).catch(() => null);
      if (pr) {
        // Estornar rubrica se aprovada
        if (STATUS_APROVADOS.includes(pr.status)) {
          await estornarRubrica(pr);
        }
        // Deletar attachments vinculados à PR
        try {
          const attachments = await base44.entities.Attachment.filter({ report_id: prId }, '-created_date', 50);
          for (const att of attachments || []) {
            await hardDeleteAttachment(att.id);
          }
        } catch (e) {
          console.warn('Erro ao buscar attachments da PR:', e.message);
        }
        // Deletar a solicitação de fato
        await base44.entities.PurchaseRequest.delete(prId);
      }
    } catch (e) {
      console.warn('Erro ao processar PR vinculada:', e.message);
    }
  }

  // 2. Se PDF: deletar XML pareado
  if (isPDF && intake.nf_xml_intake_id) {
    await hardDeleteIntake(intake.nf_xml_intake_id);
  }

  // 3. Se XML: remover vínculo no PDF pareado
  if (isXML && intake.nf_pdf_intake_id) {
    try {
      await base44.entities.DocumentIntake.update(intake.nf_pdf_intake_id, {
        nf_xml_intake_id: null,
        nf_xml_url: null,
        grupo_status: 'INCOMPLETO',
      });
    } catch (e) {
      console.warn('Erro ao desvincular XML do PDF:', e.message);
    }
  }

  // 4. Deletar o intake de fato
  await hardDeleteIntake(intake.id);
}

/**
 * Deleta uma PurchaseRequest e todos os vínculos associados.
 * @param {object} pr - registro PurchaseRequest
 */
export async function deletePurchaseRequest(pr) {
  if (!pr?.id) return;

  // 1. Estornar rubrica se aprovada
  if (STATUS_APROVADOS.includes(pr.status)) {
    await estornarRubrica(pr);
  }

  // 2. Deletar attachments vinculados de fato
  try {
    const attachments = await base44.entities.Attachment.filter({ report_id: pr.id }, '-created_date', 50);
    for (const att of attachments || []) {
      await hardDeleteAttachment(att.id);
    }
  } catch (e) {
    console.warn('Erro ao buscar attachments:', e.message);
  }

  // 3. Localizar e deletar DocumentIntake vinculado
  try {
    const intakes = await base44.entities.DocumentIntake.filter(
      { entidade_destino_id: pr.id },
      '-created_date',
      20
    );
    for (const intake of intakes || []) {
      // Se PDF: também deletar XML pareado
      if (intake.nf_xml_intake_id) {
        await hardDeleteIntake(intake.nf_xml_intake_id);
      }
      await hardDeleteIntake(intake.id);
    }
  } catch (e) {
    console.warn('Erro ao buscar intakes vinculados:', e.message);
  }

  // 4. Deletar a solicitação de fato
  await base44.entities.PurchaseRequest.delete(pr.id);
}