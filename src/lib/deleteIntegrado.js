/**
 * deleteIntegrado.js
 * Utilitário centralizado para deleção integrada de documentos e solicitações.
 * Estorna rubrica corretamente (sem duplicidade), cancela PurchaseRequest e remove vínculos.
 */

import { base44 } from '@/api/base44Client';

const STATUS_APROVADOS = ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'];

// 🔒 proteção contra estorno duplicado
async function jaEstornado(pr) {
  return pr?.estorno_realizado === true;
}

function getValorCorreto(pr) {
  return parseFloat(
    pr?.valor_total ||
    pr?.valor_solicitado ||
    pr?.valor ||
    pr?.nf_valor_total ||
    0
  );
}

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

  // 🔒 evita estorno duplicado
  if (await jaEstornado(pr)) return;

  const valorEstorno = getValorCorreto(pr);
  if (valorEstorno <= 0) return;

  try {
    const rubrica = await base44.entities.Rubrica.get(pr.rubrica_id).catch(() => null);
    if (!rubrica) return;

    const valorUtilizadoAtual = parseFloat(rubrica.valor_utilizado || 0);
    const valorTotalRubrica = parseFloat(rubrica.valor_total || 0);

    const novoUtilizado = Math.max(0, valorUtilizadoAtual - valorEstorno);
    const novoSaldo = valorTotalRubrica - novoUtilizado;
    const novoPercentual =
      valorTotalRubrica > 0 ? (novoUtilizado / valorTotalRubrica) * 100 : 0;

    await base44.entities.Rubrica.update(pr.rubrica_id, {
      valor_utilizado: novoUtilizado,
      saldo: novoSaldo,
      saldo_real: novoSaldo,
      percentual_utilizado: novoPercentual,
    });

    // 🔒 marca como estornado
    await base44.entities.PurchaseRequest.update(pr.id, {
      estorno_realizado: true,
    });

  } catch (e) {
    console.warn('Erro ao estornar rubrica:', e.message);
  }
}

/**
 * Deleta um DocumentIntake (PDF/XML) e vínculos
 */
export async function deleteIntake(intake) {
  if (!intake?.id) return;

  const isPDF =
    intake.tipo_detectado === 'NOTA_FISCAL_PDF' ||
    String(intake.file_name_original || '').toLowerCase().endsWith('.pdf');

  const isXML =
    intake.tipo_detectado === 'NOTA_FISCAL_XML' ||
    String(intake.file_name_original || '').toLowerCase().endsWith('.xml');

  const prId = intake.entidade_destino_id;

  // 🔴 PROCESSO PRINCIPAL
  if (prId && intake.entidade_destino === 'PurchaseRequest') {
    try {
      const pr = await base44.entities.PurchaseRequest.get(prId).catch(() => null);

      if (pr) {
        if (STATUS_APROVADOS.includes(pr.status)) {
          await estornarRubrica(pr);
        }

        // deletar anexos
        try {
          const attachments = await base44.entities.Attachment.filter(
            { purchase_request_id: prId },
            '-created_date',
            50
          );

          for (const att of attachments || []) {
            await hardDeleteAttachment(att.id);
          }
        } catch (e) {
          console.warn('Erro ao buscar attachments:', e.message);
        }

        await base44.entities.PurchaseRequest.delete(prId);
      }
    } catch (e) {
      console.warn('Erro ao processar PR:', e.message);
    }
  }

  // XML ↔ PDF vínculo
  if (isPDF && intake.nf_xml_intake_id) {
    await hardDeleteIntake(intake.nf_xml_intake_id);
  }

  if (isXML && intake.nf_pdf_intake_id) {
    try {
      await base44.entities.DocumentIntake.update(intake.nf_pdf_intake_id, {
        nf_xml_intake_id: null,
        nf_xml_url: null,
        grupo_status: 'INCOMPLETO',
      });
    } catch (e) {
      console.warn('Erro ao desvincular XML:', e.message);
    }
  }

  await hardDeleteIntake(intake.id);
}

/**
 * Deleta PurchaseRequest diretamente
 */
export async function deletePurchaseRequest(pr) {
  if (!pr?.id) return;

  if (STATUS_APROVADOS.includes(pr.status)) {
    await estornarRubrica(pr);
  }

  try {
    const attachments = await base44.entities.Attachment.filter(
      { purchase_request_id: pr.id },
      '-created_date',
      50
    );

    for (const att of attachments || []) {
      await hardDeleteAttachment(att.id);
    }
  } catch (e) {
    console.warn('Erro ao buscar attachments:', e.message);
  }

  try {
    const intakes = await base44.entities.DocumentIntake.filter(
      { entidade_destino_id: pr.id },
      '-created_date',
      20
    );

    for (const intake of intakes || []) {
      if (intake.nf_xml_intake_id) {
        await hardDeleteIntake(intake.nf_xml_intake_id);
      }
      await hardDeleteIntake(intake.id);
    }
  } catch (e) {
    console.warn('Erro ao buscar intakes:', e.message);
  }

  await base44.entities.PurchaseRequest.delete(pr.id);
}
