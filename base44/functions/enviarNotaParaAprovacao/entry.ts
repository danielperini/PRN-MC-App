import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

export default async function handler(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { intakeId, form } = body;

    console.log('🚀 enviarNotaParaAprovacao', { intakeId });

    const isEquipe = form?.tipo_pagamento === 'equipe';

    let created;

    if (isEquipe) {
      created = await base44.entities.TeamPayment.create({
        ...form,
        intake_id: intakeId,
        status: 'AGUARDANDO_APROVACAO',
        valor: form.nf_valor_total,
      });
    } else {
      created = await base44.entities.PurchaseRequest.create({
        ...form,
        intake_id: intakeId,
        status: 'AGUARDANDO_APROVACAO',
        valor_total: form.nf_valor_total,
      });
    }

    await base44.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ENVIADO_APROVACAO',
    });

    return new Response(JSON.stringify({ success: true, data: created }));
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ success: false, error: err.message }));
  }
}
