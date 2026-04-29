import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function parseValor(v: any) {
  if (!v) return 0;

  if (typeof v === 'number') return v;

  const clean = String(v)
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  return Number(clean) || 0;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default async function handler(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { intakeId, form } = body;

    console.log('🚀 enviarNotaParaAprovacao', { intakeId, form });

    if (!intakeId) {
      return json({ success: false, error: 'intakeId obrigatório' }, 400);
    }

    if (!form?.rubrica_id) {
      return json({ success: false, error: 'Rubrica obrigatória' }, 400);
    }

    const valor = parseValor(
      form.nf_valor_total ||
      form.valor ||
      form.valor_total
    );

    if (!valor) {
      return json({ success: false, error: 'Valor inválido' }, 400);
    }

    // 🔎 CARREGA INTAKE (PARA PEGAR ARQUIVO ORIGINAL)
    let intake: any = null;
    try {
      intake = await base44.entities.DocumentIntake.get(intakeId);
    } catch (e) {
      console.warn('⚠️ intake não encontrado');
    }

    const isEquipe =
      form?.tipo_pagamento === 'equipe' ||
      String(form?.tipo_gasto || '').toLowerCase() === 'equipe';

    // 📎 GARANTE QUE O ARQUIVO VAI JUNTO
    const nomePadronizado =
      form.nome_padronizado_arquivo ||
      intake?.nome_padronizado_arquivo ||
      intake?.file_name ||
      intake?.nome_arquivo ||
      '';

    const fileUrl =
      form.file_url ||
      intake?.file_url ||
      intake?.nota_fiscal_url ||
      intake?.arquivo_url ||
      '';

    const xmlUrl =
      form.xml_url ||
      intake?.xml_url ||
      '';

    const basePayload = {
      ...form,

      intake_id: intakeId,
      origem: 'entrada_unica',

      rubrica_id: form.rubrica_id,
      rubrica_nome: form.rubrica_nome,

      centro_custo: form.centro_custo,

      nf_numero: form.nf_numero,
      numero_nf: form.nf_numero,

      valor,
      valor_total: valor,
      nf_valor_total: valor,

      descricao: form.descricao_servico,

      fornecedor_nome: form.nf_emitente_nome,
      fornecedor_cnpj: form.nf_emitente_cpf_cnpj,

      file_url: fileUrl,
      nota_fiscal_url: fileUrl,
      xml_url: xmlUrl,

      nome_padronizado_arquivo: nomePadronizado,
      nome_arquivo_padronizado: nomePadronizado,

      criado_em: new Date().toISOString()
    };

    let created;

    // 👥 PAGAMENTO DE EQUIPE
    if (isEquipe) {
      console.log('👥 criando TeamPayment');

      created = await base44.entities.TeamPayment.create({
        ...basePayload,

        status: 'AGUARDANDO_APROVACAO',

        valor_nf: valor,
        valor: valor,

        member_name:
          form.member_name ||
          form.nf_emitente_nome ||
          '',

        mes_referencia:
          form.mes_referencia ||
          form.nf_competencia ||
          '',

        origem_automatica: true
      });
    }

    // 🧾 SOLICITAÇÃO NORMAL
    else {
      console.log('🧾 criando PurchaseRequest');

      created = await base44.entities.PurchaseRequest.create({
        ...basePayload,

        // 🔴 ESSA LINHA RESOLVE A TELA COMPRAS
        status: 'SOLICITADO',

        valor_solicitado: valor,

        categoria: form.categoria || 'Nota Fiscal',
        tipo_gasto: form.tipo_gasto || 'Serviço',

        solicitante_email:
          form.solicitante_email ||
          form.user_email ||
          ''
      });
    }

    // 🔄 ATUALIZA INTAKE
    await base44.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ENVIADO_APROVACAO',

      valor_processado: valor,
      destino: isEquipe ? 'equipe' : 'solicitacao',

      rubrica_id: form.rubrica_id,
      rubrica_nome: form.rubrica_nome,

      nome_padronizado_arquivo: nomePadronizado,

      revisado_pelo_usuario: true
    });

    console.log('✅ envio finalizado');

    return json({
      success: true,
      destino: isEquipe ? 'equipe' : 'solicitacao',
      data: created
    });

  } catch (err: any) {
    console.error('❌ erro enviarNotaParaAprovacao', err);

    return json({
      success: false,
      error: err?.message || 'Erro interno'
    }, 500);
  }
}
