import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function parseValor(v: any) {
  if (!v) return 0;

  if (typeof v === 'number') return v;

  const clean = String(v)
    .replace('R$', '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  return Number(clean) || 0;
}

export default async function handler(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { intakeId, form } = body;

    console.log('🚀 enviarNotaParaAprovacao', { intakeId, form });

    if (!intakeId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'intakeId obrigatório'
      }), { status: 400 });
    }

    if (!form?.rubrica_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Rubrica obrigatória'
      }), { status: 400 });
    }

    const valor = parseValor(form.nf_valor_total);

    if (!valor) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Valor da nota inválido'
      }), { status: 400 });
    }

    const isEquipe = form?.tipo_pagamento === 'equipe';

    const payloadBase = {
      ...form,
      intake_id: intakeId,
      rubrica_id: form.rubrica_id,
      rubrica_nome: form.rubrica_nome,
      centro_custo: form.centro_custo,
      descricao: form.descricao_servico,
      origem: 'entrada_unica',
      criado_em: new Date().toISOString(),
    };

    let created;

    // =========================
    // 👥 EQUIPE
    // =========================
    if (isEquipe) {
      console.log('👥 Criando TeamPayment');

      created = await base44.entities.TeamPayment.create({
        ...payloadBase,
        valor: valor,
        status: 'AGUARDANDO_APROVACAO',
      });
    }

    // =========================
    // 🧾 SOLICITAÇÃO NORMAL
    // =========================
    else {
      console.log('🧾 Criando PurchaseRequest');

      created = await base44.entities.PurchaseRequest.create({
        ...payloadBase,
        valor_total: valor,
        status: 'AGUARDANDO_APROVACAO',
      });
    }

    // =========================
    // 🔄 UPDATE INTAKE
    // =========================
    await base44.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ENVIADO_APROVACAO',
      valor_processado: valor,
      destino: isEquipe ? 'equipe' : 'solicitacao',
    });

    console.log('✅ envio concluído', created);

    return new Response(JSON.stringify({
      success: true,
      data: created
    }));

  } catch (err: any) {
    console.error('❌ enviarNotaParaAprovacao', err);

    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Erro interno'
    }), { status: 500 });
  }
}
