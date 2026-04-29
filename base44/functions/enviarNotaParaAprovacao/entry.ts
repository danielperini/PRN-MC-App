import { base44 } from '../../_shared/base44Client';

export default async function handler(req: any) {
  try {
    const { intakeId, form } = req.body;

    console.log('📥 enviarNotaParaAprovacao - START', { intakeId, form });

    if (!intakeId) {
      return { success: false, error: 'intakeId obrigatório' };
    }

    if (!form?.rubrica_id) {
      return { success: false, error: 'Rubrica obrigatória' };
    }

    const isEquipe = form?.tipo_pagamento === 'equipe';

    let created;

    // =========================
    // 👥 PAGAMENTO DE EQUIPE
    // =========================
    if (isEquipe) {
      console.log('👥 Criando TeamPayment');

      created = await base44.entities.TeamPayment.create({
        ...form,
        intake_id: intakeId,
        status: 'AGUARDANDO_APROVACAO',
        rubrica_id: form.rubrica_id,
        rubrica_nome: form.rubrica_nome,
        valor: form.nf_valor_total,
      });
    }

    // =========================
    // 🧾 PURCHASE REQUEST
    // =========================
    else {
      console.log('🧾 Criando PurchaseRequest');

      created = await base44.entities.PurchaseRequest.create({
        ...form,
        intake_id: intakeId,
        status: 'AGUARDANDO_APROVACAO',
        rubrica_id: form.rubrica_id,
        rubrica_nome: form.rubrica_nome,
        valor_total: form.nf_valor_total,
      });
    }

    // =========================
    // 🔄 UPDATE INTAKE
    // =========================
    await base44.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ENVIADO_APROVACAO',
    });

    console.log('✅ enviarNotaParaAprovacao - OK', created);

    return {
      success: true,
      data: created,
    };
  } catch (err: any) {
    console.error('❌ enviarNotaParaAprovacao', err);
    return {
      success: false,
      error: err.message || 'Erro ao enviar nota',
    };
  }
}
